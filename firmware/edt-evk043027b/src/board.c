#include "board.h"

#include "hmi_usb_cdc.h"
#include "mx25lm51245g.h"

#include <stddef.h>

UART_HandleTypeDef huart1;
I2C_HandleTypeDef hi2c2;
TIM_HandleTypeDef htim3;
OSPI_HandleTypeDef hospi1;

static DCACHE_HandleTypeDef hdcache1;

volatile board_stage_t board_init_stage = BOARD_STAGE_RESET;
volatile bool board_external_flash_ready = false;
volatile bool board_touch_ready = false;
volatile bool board_usb_ready = false;

/*
 * Nothing on the start-up path may wait forever. A board stuck in an early spin
 * loop draws nothing, answers nothing, and — because the debugger has to fight
 * the running core for the bus — is far harder to inspect than one that reached
 * the main loop in a degraded state. board_init() reports what failed rather
 * than parking the CPU.
 */

/*
 * Called by HAL_Init, before anything else in board_init runs.
 *
 * The PWR peripheral is clock gated on this part (RCC_AHB3ENR_PWREN). With that
 * clock off every PWR register write is discarded and every read returns zero,
 * so HAL_PWREx_ConfigSupply below polls PWR->SVMSR for a bit that can never
 * change and returns HAL_TIMEOUT. board_init then stops at its very first step
 * — before the clock tree, before the OctoSPI, before the display is even
 * reached — and the only symptom is a dark panel.
 *
 * The HAL's own HAL_MspInit is weak and empty, so nothing supplies this unless
 * the board does. The vendor package puts exactly this in
 * stm32u5xx_hal_msp.c, which is the file this template did not port.
 */
void HAL_MspInit(void)
{
    __HAL_RCC_PWR_CLK_ENABLE();

    /*
     * The analog and USB IO supply domains are isolated after reset. Neither is
     * used by this runtime, and both are enabled here anyway because they are
     * what the vendor enables and because the failure mode of leaving them off
     * is a peripheral that reads as dead rather than one that reports an error.
     */
    HAL_PWREx_EnableVddA();
    HAL_PWREx_EnableVddUSB();
}

/*
 * The UCPD dead-battery pull-ups are on after reset and hold the Type-C
 * connector's CC lines down, which is the vendor package's first act too. Left
 * alone they make the USB-C port advertise a sink it is not, and on some hosts
 * that is enough to stop the board being powered at all.
 *
 * The SMPS is what feeds the core on this board. Unlike the H747I, PWR_CR3 here
 * is not write-once, so getting it wrong is recoverable — but the part will run
 * hot and the 160 MHz clock below is out of spec on the LDO alone.
 */
static bool system_power_config(void)
{
    HAL_PWREx_DisableUCPDDeadBattery();
    return HAL_PWREx_ConfigSupply(PWR_SMPS_SUPPLY) == HAL_OK;
}

/*
 * 25 MHz HSE oscillator -> 160 MHz SYSCLK, which is the STM32U599's maximum and
 * what the AHB and all three APB buses run at undivided. The PLL1 dividers match
 * the vendor package's SystemClock_Config; PLLM = 5 puts 5 MHz into the PLL,
 * inside the 4-8 MHz window RCC_PLLVCIRANGE_0 selects.
 *
 * HSE is RCC_HSE_BYPASS, not RCC_HSE_ON: the board fits a powered oscillator
 * rather than a bare crystal, and asking the MCU to drive it as a crystal means
 * HSE never starts.
 *
 * FLASH_LATENCY_4 is what 160 MHz at voltage scale 1 requires. Too few wait
 * states means instruction fetches return corrupted data, which produces
 * failures that look like anything but a clock problem.
 *
 * PLL3 drives the LTDC and is configured in board_display.c, next to the panel
 * timings that fix its rate.
 */
static bool system_clock_config(void)
{
    RCC_OscInitTypeDef oscillator = {0};
    RCC_ClkInitTypeDef clock = {0};

    if (HAL_PWREx_ControlVoltageScaling(PWR_REGULATOR_VOLTAGE_SCALE1) != HAL_OK) {
        return false;
    }

    /* HSI48 alongside HSE, as the vendor's SystemClock_Config does. The USB
       stack needs it available; leaving it off is the kind of omission that
       shows up only as a device that never enumerates. */
    oscillator.OscillatorType = RCC_OSCILLATORTYPE_HSE | RCC_OSCILLATORTYPE_HSI48;
    oscillator.HSEState = RCC_HSE_BYPASS;
    oscillator.HSI48State = RCC_HSI48_ON;
    oscillator.PLL.PLLState = RCC_PLL_ON;
    oscillator.PLL.PLLSource = RCC_PLLSOURCE_HSE;
    /* The EPOD booster runs off HSE/PLLMBOOST and has to land under 16 MHz
       before the core may be clocked above 55 MHz. 25/2 does. */
    oscillator.PLL.PLLMBOOST = RCC_PLLMBOOST_DIV2;
    oscillator.PLL.PLLM = 5U;
    oscillator.PLL.PLLN = 64U;
    oscillator.PLL.PLLP = 10U;
    oscillator.PLL.PLLQ = 2U;
    oscillator.PLL.PLLR = 2U;
    oscillator.PLL.PLLRGE = RCC_PLLVCIRANGE_0;
    oscillator.PLL.PLLFRACN = 0U;

    if (HAL_RCC_OscConfig(&oscillator) != HAL_OK) {
        return false;
    }

    clock.ClockType =
        RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_HCLK |
        RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2 | RCC_CLOCKTYPE_PCLK3;
    clock.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
    clock.AHBCLKDivider = RCC_SYSCLK_DIV1;
    clock.APB1CLKDivider = RCC_HCLK_DIV1;
    clock.APB2CLKDivider = RCC_HCLK_DIV1;
    clock.APB3CLKDivider = RCC_HCLK_DIV1;

    return HAL_RCC_ClockConfig(&clock, FLASH_LATENCY_4) == HAL_OK;
}

/*
 * The Cortex-M33 in this part has no cache of its own; ICACHE and DCACHE1 are
 * separate peripherals sitting on the bus.
 *
 * ICACHE covers instruction fetches from internal Flash, and the HAL enables it
 * in its default 2-way configuration.
 *
 * DCACHE1 is the one that matters here: it caches reads of the external
 * memories, which on this board means every image byte LVGL pulls out of the
 * OctoSPI NOR at 0x90000000. Without it each one is a separate transaction over
 * an 8-bit bus. Nothing writes that window at run time — the contents are put
 * there by the flasher — so there is no coherency work to do afterwards, and
 * equally no cache maintenance is needed around the frame buffer, which the
 * LTDC reads straight out of SRAM.
 */
static bool board_cache_init(void)
{
    if (HAL_ICACHE_ConfigAssociativityMode(ICACHE_2WAYS) != HAL_OK) {
        return false;
    }
    if (HAL_ICACHE_Enable() != HAL_OK) {
        return false;
    }

    hdcache1.Instance = DCACHE1;
    hdcache1.Init.ReadBurstType = DCACHE_READ_BURST_INCR;
    if (HAL_DCACHE_Init(&hdcache1) != HAL_OK) {
        return false;
    }
    return HAL_DCACHE_Enable(&hdcache1) == HAL_OK;
}

/*
 * The maXTouch controller's I2C bus. Brought up here rather than in
 * board_display.c because the vendored driver wants the handle handed to it by
 * value, and board_display_init is what does that.
 *
 * Timing is the vendor package's value for a 160 MHz PCLK1, ~100 kHz.
 */
static bool board_touch_bus_init(void)
{
    hi2c2.Instance = I2C2;
    hi2c2.Init.Timing = 0x30909DECU;
    hi2c2.Init.OwnAddress1 = 0U;
    hi2c2.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;
    hi2c2.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;
    hi2c2.Init.OwnAddress2 = 0U;
    hi2c2.Init.OwnAddress2Masks = I2C_OA2_NOMASK;
    hi2c2.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;
    hi2c2.Init.NoStretchMode = I2C_NOSTRETCH_DISABLE;

    if (HAL_I2C_Init(&hi2c2) != HAL_OK) {
        return false;
    }
    if (HAL_I2CEx_ConfigAnalogFilter(&hi2c2, I2C_ANALOGFILTER_ENABLE) != HAL_OK) {
        return false;
    }
    return HAL_I2CEx_ConfigDigitalFilter(&hi2c2, 0U) == HAL_OK;
}

/*
 * Modbus RTU over RS-485.
 *
 * HAL_RS485Ex_Init rather than HAL_UART_Init: PD4 is the transceiver's
 * driver-enable, and the USART's own DE output raises it around each transmitted
 * frame. Doing it in software instead means releasing the line either too early
 * (truncating the last character on the wire) or too late (holding the bus while
 * the server tries to answer), and neither shows up as anything but intermittent
 * timeouts.
 *
 * The assertion and de-assertion times are left at 0, so DE tracks the frame as
 * closely as the hardware allows; at 9600 baud the transceiver's own turnaround
 * is far shorter than a character time.
 */
bool board_uart1_apply(
    uint32_t baud_rate,
    uint32_t parity,
    uint32_t stop_bits)
{
    huart1.Instance = USART2;
    huart1.Init.BaudRate = baud_rate;
    huart1.Init.WordLength =
        (parity == UART_PARITY_NONE)
            ? UART_WORDLENGTH_8B
            : UART_WORDLENGTH_9B;
    huart1.Init.StopBits = stop_bits;
    huart1.Init.Parity = parity;
    huart1.Init.Mode = UART_MODE_TX_RX;
    huart1.Init.HwFlowCtl = UART_HWCONTROL_NONE;
    huart1.Init.OverSampling = UART_OVERSAMPLING_16;
    huart1.Init.OneBitSampling = UART_ONE_BIT_SAMPLE_DISABLE;
    huart1.Init.ClockPrescaler = UART_PRESCALER_DIV1;
    huart1.AdvancedInit.AdvFeatureInit = UART_ADVFEATURE_NO_INIT;

    if (HAL_RS485Ex_Init(
            &huart1, UART_DE_POLARITY_HIGH, 0U, 0U) != HAL_OK) {
        return false;
    }

    /* The FIFOs are on after reset on this part. The Modbus client reads
       character by character and measures inter-frame gaps from when a byte
       reaches it, so a FIFO holding bytes back distorts every gap it sees. */
    return HAL_UARTEx_DisableFifoMode(&huart1) == HAL_OK;
}

bool board_init(void)
{
    HAL_Init();
    board_init_stage = BOARD_STAGE_HAL;

    /* Before anything that can fail, so board_error_handler always has an
       output to blink on. Runs at the reset MSI clock, which is fine — nothing
       here is timing critical. */
    board_status_led_init();

    if (!system_power_config()) {
        return false;
    }
    board_init_stage = BOARD_STAGE_POWER;

    if (!system_clock_config()) {
        return false;
    }
    board_init_stage = BOARD_STAGE_CLOCK;

    /* After the clock change, so HAL_Delay in the OctoSPI reset sequence
       measures real milliseconds. */
    if (!board_cache_init()) {
        return false;
    }
    board_init_stage = BOARD_STAGE_CACHE;

    /*
     * Image resources are linked at 0x90000000 and are dereferenced by ui_init,
     * so the OctoSPI has to be mapped before main() gets that far.
     *
     * Deliberately not fatal. A project that uses no images does not touch that
     * window at all and runs perfectly well without it, and stopping here would
     * trade a working HMI for a black panel that says nothing about why. One
     * that does use images faults on its first pixel fetch instead, which lands
     * in HardFault_Handler with board_init_stage still reading
     * BOARD_STAGE_CACHE -- a far more specific signal than a board that never
     * draws anything.
     */
    board_external_flash_ready = board_external_flash_init();
    board_init_stage = BOARD_STAGE_EXTERNAL_FLASH;

    if (!board_touch_bus_init()) {
        return false;
    }
    board_init_stage = BOARD_STAGE_TOUCH_BUS;

    /*
     * The Type-C virtual COM port, which is the Modbus transport on this board.
     * Not fatal: a panel with no host attached still has to run the HMI, and a
     * USB stack that failed to start is reported through board_usb_ready rather
     * than by refusing to boot.
     */
    board_usb_ready = hmi_usb_cdc_init();

    if (!board_uart1_apply(
            115200U,
            UART_PARITY_NONE,
            UART_STOPBITS_1)) {
        return false;
    }
    board_init_stage = BOARD_STAGE_UART;
    return true;
}

/*
 * MX25LM51245G bring-up, following the vendor package's MX_OCTOSPI1_Init.
 *
 * The part powers up in plain 1-1-1 SPI and has to be walked into octal STR
 * mode ("SOPI") before memory-mapped reads are worth anything. The reset dance
 * below is issued three times, once in each protocol the device might already
 * be in, because a warm reset leaves it in whatever mode the last run chose and
 * a reset command sent in the wrong protocol is simply not understood.
 *
 * DeviceSize 32 is log2 of the 512 Mbit part's byte count. ClockPrescaler 2
 * gives an 80 MHz OctoSPI clock from the 160 MHz PLL1 output.
 */
bool board_external_flash_init(void)
{
    OSPIM_CfgTypeDef manager = {0};
    uint8_t register_value[2];

    hospi1.Instance = OCTOSPI1;
    hospi1.Init.FifoThreshold = 4U;
    hospi1.Init.DualQuad = HAL_OSPI_DUALQUAD_DISABLE;
    hospi1.Init.MemoryType = HAL_OSPI_MEMTYPE_MACRONIX;
    hospi1.Init.DeviceSize = 32U;
    hospi1.Init.ChipSelectHighTime = 2U;
    hospi1.Init.FreeRunningClock = HAL_OSPI_FREERUNCLK_DISABLE;
    hospi1.Init.ClockMode = HAL_OSPI_CLOCK_MODE_0;
    hospi1.Init.WrapSize = HAL_OSPI_WRAP_NOT_SUPPORTED;
    hospi1.Init.ClockPrescaler = 2U;
    hospi1.Init.SampleShifting = HAL_OSPI_SAMPLE_SHIFTING_NONE;
    hospi1.Init.DelayHoldQuarterCycle = HAL_OSPI_DHQC_ENABLE;
    hospi1.Init.ChipSelectBoundary = 0U;
    hospi1.Init.DelayBlockBypass = HAL_OSPI_DELAY_BLOCK_BYPASSED;
    hospi1.Init.MaxTran = 0U;
    hospi1.Init.Refresh = 0U;

    if (HAL_OSPI_Init(&hospi1) != HAL_OK) {
        return false;
    }

    manager.ClkPort = 1U;
    manager.DQSPort = 1U;
    manager.NCSPort = 1U;
    manager.IOLowPort = HAL_OSPIM_IOPORT_1_LOW;
    manager.IOHighPort = HAL_OSPIM_IOPORT_1_HIGH;
    if (HAL_OSPIM_Config(
            &hospi1, &manager, HAL_OSPI_TIMEOUT_DEFAULT_VALUE) != HAL_OK) {
        return false;
    }

    static const struct {
        MX25LM51245G_Interface_t mode;
        MX25LM51245G_Transfer_t rate;
    } reset_protocols[] = {
        {MX25LM51245G_SPI_MODE, MX25LM51245G_STR_TRANSFER},
        {MX25LM51245G_OPI_MODE, MX25LM51245G_STR_TRANSFER},
        {MX25LM51245G_OPI_MODE, MX25LM51245G_DTR_TRANSFER},
    };
    for (size_t i = 0U;
         i < (sizeof(reset_protocols) / sizeof(reset_protocols[0]));
         i++) {
        if (MX25LM51245G_ResetEnable(
                &hospi1,
                reset_protocols[i].mode,
                reset_protocols[i].rate) != MX25LM51245G_OK) {
            return false;
        }
        if (MX25LM51245G_ResetMemory(
                &hospi1,
                reset_protocols[i].mode,
                reset_protocols[i].rate) != MX25LM51245G_OK) {
            return false;
        }
    }
    /* A software reset that lands mid-erase is only honoured once the erase
       finishes, so wait out the datasheet's worst case before talking again. */
    HAL_Delay(MX25LM51245G_RESET_MAX_TIME);

    if (MX25LM51245G_AutoPollingMemReady(
            &hospi1,
            MX25LM51245G_SPI_MODE,
            MX25LM51245G_STR_TRANSFER) != MX25LM51245G_OK) {
        return false;
    }

    /* Dummy cycles first, then the protocol switch: the dummy-cycle field lives
       in the same configuration register set and has to be right *before* the
       first octal read, not after. Six is what CR2_DC_6_CYCLES selects and what
       MX25LM51245G_EnableMemoryMappedModeSTR issues its reads with. */
    if (MX25LM51245G_WriteEnable(
            &hospi1,
            MX25LM51245G_SPI_MODE,
            MX25LM51245G_STR_TRANSFER) != MX25LM51245G_OK) {
        return false;
    }
    if (MX25LM51245G_WriteCfg2Register(
            &hospi1,
            MX25LM51245G_SPI_MODE,
            MX25LM51245G_STR_TRANSFER,
            MX25LM51245G_CR2_REG3_ADDR,
            MX25LM51245G_CR2_DC_6_CYCLES) != MX25LM51245G_OK) {
        return false;
    }
    if (MX25LM51245G_WriteEnable(
            &hospi1,
            MX25LM51245G_SPI_MODE,
            MX25LM51245G_STR_TRANSFER) != MX25LM51245G_OK) {
        return false;
    }
    if (MX25LM51245G_WriteCfg2Register(
            &hospi1,
            MX25LM51245G_SPI_MODE,
            MX25LM51245G_STR_TRANSFER,
            MX25LM51245G_CR2_REG1_ADDR,
            MX25LM51245G_CR2_SOPI) != MX25LM51245G_OK) {
        return false;
    }
    HAL_Delay(MX25LM51245G_WRITE_REG_MAX_TIME);

    if (MX25LM51245G_AutoPollingMemReady(
            &hospi1,
            MX25LM51245G_OPI_MODE,
            MX25LM51245G_STR_TRANSFER) != MX25LM51245G_OK) {
        return false;
    }
    /* Read the mode back. The write above is the only thing standing between a
       working image window and a window that returns plausible-looking rubbish,
       and it is answered in the protocol it just selected. */
    if (MX25LM51245G_ReadCfg2Register(
            &hospi1,
            MX25LM51245G_OPI_MODE,
            MX25LM51245G_STR_TRANSFER,
            MX25LM51245G_CR2_REG1_ADDR,
            register_value) != MX25LM51245G_OK) {
        return false;
    }
    if (register_value[0] != MX25LM51245G_CR2_SOPI) {
        return false;
    }

    /* Until this succeeds the window reads as bus faults rather than data. */
    return MX25LM51245G_EnableMemoryMappedModeSTR(
        &hospi1,
        MX25LM51245G_OPI_MODE,
        MX25LM51245G_4BYTES_SIZE) == MX25LM51245G_OK;
}

void HAL_UART_MspInit(UART_HandleTypeDef *uart)
{
    GPIO_InitTypeDef gpio = {0};
    RCC_PeriphCLKInitTypeDef periph_clock = {0};

    if ((uart == NULL) || (uart->Instance != USART2)) {
        return;
    }

    periph_clock.PeriphClockSelection = RCC_PERIPHCLK_USART2;
    periph_clock.Usart2ClockSelection = RCC_USART2CLKSOURCE_PCLK1;
    (void)HAL_RCCEx_PeriphCLKConfig(&periph_clock);

    __HAL_RCC_USART2_CLK_ENABLE();
    __HAL_RCC_GPIOD_CLK_ENABLE();

    /* RS-485 on this board: PD5 = TX, PD6 = RX, PD4 = DE to the transceiver. */
    gpio.Pin = GPIO_PIN_4 | GPIO_PIN_5 | GPIO_PIN_6;
    gpio.Mode = GPIO_MODE_AF_PP;
    gpio.Pull = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
    gpio.Alternate = GPIO_AF7_USART2;
    HAL_GPIO_Init(GPIOD, &gpio);

    HAL_NVIC_SetPriority(USART2_IRQn, 5U, 0U);
    HAL_NVIC_EnableIRQ(USART2_IRQn);
}

void HAL_UART_MspDeInit(UART_HandleTypeDef *uart)
{
    if ((uart == NULL) || (uart->Instance != USART2)) {
        return;
    }

    __HAL_RCC_USART2_CLK_DISABLE();
    HAL_NVIC_DisableIRQ(USART2_IRQn);
}

void HAL_I2C_MspInit(I2C_HandleTypeDef *i2c)
{
    GPIO_InitTypeDef gpio = {0};
    RCC_PeriphCLKInitTypeDef periph_clock = {0};

    if ((i2c == NULL) || (i2c->Instance != I2C2)) {
        return;
    }

    periph_clock.PeriphClockSelection = RCC_PERIPHCLK_I2C2;
    periph_clock.I2c2ClockSelection = RCC_I2C2CLKSOURCE_PCLK1;
    (void)HAL_RCCEx_PeriphCLKConfig(&periph_clock);

    __HAL_RCC_GPIOH_CLK_ENABLE();

    /* PH4 = SCL, PH5 = SDA, to the maXTouch controller. Open drain, and the
       pull-ups are on the board. */
    gpio.Pin = GPIO_PIN_4 | GPIO_PIN_5;
    gpio.Mode = GPIO_MODE_AF_OD;
    gpio.Pull = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_LOW;
    gpio.Alternate = GPIO_AF4_I2C2;
    HAL_GPIO_Init(GPIOH, &gpio);

    __HAL_RCC_I2C2_CLK_ENABLE();
}

void HAL_I2C_MspDeInit(I2C_HandleTypeDef *i2c)
{
    if ((i2c == NULL) || (i2c->Instance != I2C2)) {
        return;
    }

    __HAL_RCC_I2C2_CLK_DISABLE();
    HAL_GPIO_DeInit(GPIOH, GPIO_PIN_4 | GPIO_PIN_5);
}

void HAL_OSPI_MspInit(OSPI_HandleTypeDef *ospi)
{
    GPIO_InitTypeDef gpio = {0};
    RCC_PeriphCLKInitTypeDef periph_clock = {0};

    if ((ospi == NULL) || (ospi->Instance != OCTOSPI1)) {
        return;
    }

    periph_clock.PeriphClockSelection = RCC_PERIPHCLK_OSPI;
    periph_clock.OspiClockSelection = RCC_OSPICLKSOURCE_PLL1;
    (void)HAL_RCCEx_PeriphCLKConfig(&periph_clock);

    __HAL_RCC_OSPIM_CLK_ENABLE();
    __HAL_RCC_OSPI1_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_GPIOC_CLK_ENABLE();
    __HAL_RCC_GPIOF_CLK_ENABLE();

    /* CLK on PF10 and IO7 on PC0 take AF3; every other OctoSPI pin takes AF10.
       Splitting the calls is not cosmetic — one HAL_GPIO_Init writes one
       alternate function to every pin in its mask. */
    gpio.Mode = GPIO_MODE_AF_PP;
    gpio.Pull = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_VERY_HIGH;

    gpio.Alternate = GPIO_AF3_OCTOSPI1;
    gpio.Pin = GPIO_PIN_10; /* OCTOSPIM_P1_CLK */
    HAL_GPIO_Init(GPIOF, &gpio);

    gpio.Alternate = GPIO_AF10_OCTOSPI1;
    /* IO0..IO3 on PF8, PF9, PF7, PF6 */
    gpio.Pin = GPIO_PIN_6 | GPIO_PIN_7 | GPIO_PIN_8 | GPIO_PIN_9;
    HAL_GPIO_Init(GPIOF, &gpio);

    /* IO4..IO6 on PC1, PC2, PC3 */
    gpio.Pin = GPIO_PIN_1 | GPIO_PIN_2 | GPIO_PIN_3;
    HAL_GPIO_Init(GPIOC, &gpio);

    /* DQS on PA1, NCS on PA2 */
    gpio.Pin = GPIO_PIN_1 | GPIO_PIN_2;
    HAL_GPIO_Init(GPIOA, &gpio);

    gpio.Alternate = GPIO_AF3_OCTOSPI1;
    gpio.Pin = GPIO_PIN_0; /* OCTOSPIM_P1_IO7 */
    HAL_GPIO_Init(GPIOC, &gpio);
}

void HAL_OSPI_MspDeInit(OSPI_HandleTypeDef *ospi)
{
    if ((ospi == NULL) || (ospi->Instance != OCTOSPI1)) {
        return;
    }

    __HAL_RCC_OSPIM_CLK_DISABLE();
    __HAL_RCC_OSPI1_CLK_DISABLE();
}

void board_status_led_init(void)
{
    GPIO_InitTypeDef gpio = {0};

    __HAL_RCC_GPIOB_CLK_ENABLE();

    /* Open drain, as the vendor's MX_GPIO_Init configures it: the pin sinks the
       LED rather than sourcing it, so low is lit. */
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_14, GPIO_PIN_SET);
    gpio.Pin = GPIO_PIN_14;
    gpio.Mode = GPIO_MODE_OUTPUT_OD;
    gpio.Pull = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(GPIOB, &gpio);
}

void board_status_led(bool on)
{
    HAL_GPIO_WritePin(
        GPIOB, GPIO_PIN_14, on ? GPIO_PIN_RESET : GPIO_PIN_SET);
}

/*
 * Deliberately a spin loop rather than HAL_Delay. The error handler is reached
 * from HardFault_Handler as well as from a failed board_init, and a fault
 * handler runs at a higher priority than SysTick — so the tick never advances
 * and HAL_Delay would hang instead of blinking. The constant is approximate;
 * this only has to be slow enough to count by eye.
 */
static void board_blink_delay(uint32_t milliseconds)
{
    /*
     * The loop body is a volatile load, decrement and store plus the compare
     * and branch — call it eight cycles at 160 MHz, so 20000 iterations per
     * millisecond. Only roughly right, and it does not need to be better: the
     * flashes have to be countable by eye, which the previous constant was not
     * — it ran about eight times too fast and turned a twelve-flash code into
     * an unreadable flicker.
     */
    volatile uint32_t spins = milliseconds * 20000U;

    while (spins > 0U) {
        spins--;
    }
}

void board_error_handler(void)
{
    /* Not __disable_irq(): a pending interrupt cannot make things worse here,
       and leaving them on keeps the debugger's view of the part intact. */
    for (;;) {
        for (uint32_t flash = 0U; flash <= (uint32_t)board_init_stage; flash++) {
            board_status_led(true);
            board_blink_delay(200U);
            board_status_led(false);
            board_blink_delay(200U);
        }
        board_blink_delay(1500U);
    }
}
