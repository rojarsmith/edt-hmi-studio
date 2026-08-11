#include "board.h"

#include "stm32h747i_discovery_qspi.h"

UART_HandleTypeDef huart1;

/*
 * The STM32H747 boots both cores from the factory. This image is a Cortex-M7
 * application only, so the Cortex-M4 has no firmware of its own and must be
 * kept out of the way — see docs/stm32h747i-disco-dual-core.md.
 *
 * With the standard option bytes (BCM7 and BCM4 both set) the M4 starts from
 * Flash bank 2 and, on a board that only ever receives this image, immediately
 * faults on erased Flash. A faulted M4 still holds domain D2 clocked, which is
 * where USART1 lives, so Modbus keeps working — but the state is undefined and
 * makes the board hard to reason about. Waiting for D2 to become ready first,
 * exactly as ST's dual-core templates do, gives a defined starting point
 * whichever way the option bytes are set.
 */
#define BOARD_D2_READY_TIMEOUT 0xFFFFU

/*
 * Nothing on the start-up path may wait forever. A board stuck in an early
 * spin loop draws nothing, answers nothing, and — because the debugger has to
 * fight the running core for the bus — is far harder to inspect than one that
 * reached the main loop in a degraded state. Every wait here is bounded, and
 * board_init() reports what failed rather than parking the CPU.
 */
#define BOARD_FLAG_TIMEOUT 0x00100000U

static bool is_voltage_scaling_ready(void)
{
    return __HAL_PWR_GET_FLAG(PWR_FLAG_VOSRDY) != 0U;
}

static bool board_wait_flag(bool (*is_ready)(void))
{
    uint32_t spins = BOARD_FLAG_TIMEOUT;

    while (!is_ready()) {
        if (spins-- == 0U) {
            return false;
        }
    }
    return true;
}

static bool wait_for_domain_d2(void)
{
    uint32_t timeout = BOARD_D2_READY_TIMEOUT;

    /* D2 reports ready once the M4 has either booted or been left unclocked;
       either outcome is fine, we only need it to settle before touching the
       clock tree. */
    while ((__HAL_RCC_GET_FLAG(RCC_FLAG_D2CKRDY) == RESET) && (timeout-- > 0U)) {
    }

    if (timeout == 0U) {
        /* D2 never came up: peripherals in that domain, USART1 included, would
           not respond. Force it on so the HMI still runs without Modbus rather
           than hanging here. */
        __HAL_RCC_D2SRAM1_CLK_ENABLE();
        return false;
    }

    return true;
}

/*
 * The Cortex-M7 default memory map types the FMC SDRAM window (0xD0000000) as
 * Device memory: uncacheable, and writes may not be merged. Streaming a frame
 * buffer through it costs far more FMC bandwidth than it should, starving the
 * LTDC and letting its FIFO underrun — which shows on the panel as tearing and
 * warped lines while anything redraws continuously. Re-type it as Normal
 * write-back memory; board_display.c cleans the cache before the LTDC reads a
 * frame.
 */
static void mpu_config(void)
{
    MPU_Region_InitTypeDef region = {0};

    HAL_MPU_Disable();

    region.Enable = MPU_REGION_ENABLE;
    region.Number = MPU_REGION_NUMBER0;
    region.BaseAddress = 0xD0000000U; /* FMC SDRAM bank 2, 32 MB on this board */
    region.Size = MPU_REGION_SIZE_32MB;
    region.AccessPermission = MPU_REGION_FULL_ACCESS;
    region.IsBufferable = MPU_ACCESS_BUFFERABLE;
    region.IsCacheable = MPU_ACCESS_CACHEABLE;
    region.IsShareable = MPU_ACCESS_NOT_SHAREABLE;
    region.TypeExtField = MPU_TEX_LEVEL0;
    region.SubRegionDisable = 0x00U;
    region.DisableExec = MPU_INSTRUCTION_ACCESS_DISABLE;
    HAL_MPU_ConfigRegion(&region);

    /*
     * The QSPI window (0x90000000) is Device memory by default, same trap as
     * the SDRAM above: every image byte LVGL reads would be an unbuffered,
     * unmergeable single access straight down the QSPI bus. Re-type it as
     * Normal cacheable read-only so the D-Cache can hold image data and the
     * controller can burst. Read-only because nothing writes it at run time --
     * the contents are programmed by the flasher, not by the firmware.
     */
    region.Number = MPU_REGION_NUMBER1;
    region.BaseAddress = 0x90000000U;
    region.Size = MPU_REGION_SIZE_128MB;
    region.AccessPermission = MPU_REGION_PRIV_RO_URO;
    region.IsBufferable = MPU_ACCESS_NOT_BUFFERABLE;
    region.IsCacheable = MPU_ACCESS_CACHEABLE;
    region.IsShareable = MPU_ACCESS_NOT_SHAREABLE;
    region.TypeExtField = MPU_TEX_LEVEL0;
    region.SubRegionDisable = 0x00U;
    region.DisableExec = MPU_INSTRUCTION_ACCESS_DISABLE;
    HAL_MPU_ConfigRegion(&region);

    HAL_MPU_Enable(MPU_PRIVILEGED_DEFAULT);
}

/*
 * 25 MHz HSE crystal -> 400 MHz SYSCLK for the M7, 200 MHz for the AXI/AHB bus
 * matrix and the M4, 100 MHz on the APB buses. The PLL settings and bus
 * dividers match ST's own STM32H747I-DISCO examples.
 *
 * The supply must be selected before voltage scaling can complete. The part
 * comes out of reset in "Run*" mode with neither regulator committed, and
 * VOSRDY stays clear until something writes PWR->CR3 — so skipping this step
 * hangs the wait below forever, and the board simply never draws anything.
 *
 * It must be the supply the board is actually wired for. This one is hardwired
 * for the SMPS (UM2411: SB2/SB11/SB19/SB46/SB48 mounted, SB1/SB12/SB49
 * removed), so the SMPS is what feeds VCAP. Selecting PWR_LDO_SUPPLY disables
 * it and the core loses its supply as the write lands — and since PWR->CR3 is
 * write-once per power-on reset, no reset undoes it. The board then answers
 * "Unable to get core ID" to every connection attempt, forever, and only the
 * BOOT0 recovery in docs/stm32h747i-disco-dual-core.md brings it back.
 *
 * USE_PWR_DIRECT_SMPS_SUPPLY in CMakeLists.txt makes the CMSIS ExitRun0Mode()
 * commit the same choice from the reset handler, before the C runtime writes
 * to RAM. This call re-states it where it can be read, and finds it already
 * applied.
 *
 * FLASH_LATENCY_4 is what ST uses here, not the 2 wait states the VOS1 table
 * suggests for a 200 MHz AXI clock. Too few wait states means instruction
 * fetches return corrupted data, which produces failures that look like
 * anything but a clock problem.
 */
static bool system_clock_config(void)
{
    RCC_OscInitTypeDef oscillator = {0};
    RCC_ClkInitTypeDef clock = {0};

    /*
     * PWR->CR3 can only be written once per power-on reset, and the programmer
     * finishes a flash with a *software* reset — so on every run after the
     * first the supply is already committed and this call reports an error it
     * would be wrong to act on. Apply it for the power-on case and move on.
     */
    (void)HAL_PWREx_ConfigSupply(PWR_DIRECT_SMPS_SUPPLY);

    __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);
    board_wait_flag(&is_voltage_scaling_ready);

    oscillator.OscillatorType = RCC_OSCILLATORTYPE_HSE;
    oscillator.HSEState = RCC_HSE_ON;
    oscillator.PLL.PLLState = RCC_PLL_ON;
    oscillator.PLL.PLLSource = RCC_PLLSOURCE_HSE;
    oscillator.PLL.PLLM = 5U;
    oscillator.PLL.PLLN = 160U;
    oscillator.PLL.PLLP = 2U;
    oscillator.PLL.PLLQ = 4U;
    oscillator.PLL.PLLR = 2U;
    oscillator.PLL.PLLRGE = RCC_PLL1VCIRANGE_2;
    oscillator.PLL.PLLVCOSEL = RCC_PLL1VCOWIDE;
    oscillator.PLL.PLLFRACN = 0U;

    if (HAL_RCC_OscConfig(&oscillator) != HAL_OK) {
        return false;
    }

    clock.ClockType =
        RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_D1PCLK1 |
        RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2 | RCC_CLOCKTYPE_D3PCLK1;
    clock.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
    clock.SYSCLKDivider = RCC_SYSCLK_DIV1;
    clock.AHBCLKDivider = RCC_HCLK_DIV2;
    clock.APB3CLKDivider = RCC_APB3_DIV2;
    clock.APB1CLKDivider = RCC_APB1_DIV2;
    clock.APB2CLKDivider = RCC_APB2_DIV2;
    clock.APB4CLKDivider = RCC_APB4_DIV2;

    return HAL_RCC_ClockConfig(&clock, FLASH_LATENCY_4) == HAL_OK;
}

bool board_uart1_apply(
    uint32_t baud_rate,
    uint32_t parity,
    uint32_t stop_bits)
{
    huart1.Instance = USART1;
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

    return HAL_UART_Init(&huart1) == HAL_OK;
}

bool board_init(void)
{
    /* Must precede the cache enables so the SDRAM attributes are already in
       force the first time anything touches the frame buffer. */
    mpu_config();

    SCB_EnableICache();
    SCB_EnableDCache();

    HAL_Init();

    (void)wait_for_domain_d2();

    if (!system_clock_config()) {
        return false;
    }

    /*
     * Image resources are linked at 0x90000000 and are dereferenced by ui_init,
     * so the QSPI has to be mapped before main() gets that far. Failing here is
     * fatal for a project that uses images and harmless for one that does not,
     * but there is no way to tell the two apart from here -- board_init reports
     * the failure and main stops, which is the safer of the two.
     */
    if (!board_external_flash_init()) {
        return false;
    }

    return board_uart1_apply(
        115200U,
        UART_PARITY_NONE,
        UART_STOPBITS_1);
}

bool board_external_flash_init(void)
{
    BSP_QSPI_Init_t init;

    init.InterfaceMode = BSP_QSPI_QPI_MODE;
    init.TransferRate = BSP_QSPI_STR_TRANSFER;
    /* The board wires two dies as one device. stm32h747i_discovery_qspi.h only
       exposes BSP_QSPI_DUALFLASH_DISABLE — and labels it "Dual flash mode
       enabled", which it is not — so take the value from the component driver.
       BSP_QSPI_Init forces dual mode for this board regardless. */
    init.DualFlashMode = (BSP_QSPI_DualFlash_t)MT25TL01G_DUALFLASH_ENABLE;

    if (BSP_QSPI_Init(0U, &init) != BSP_ERROR_NONE) {
        return false;
    }

    /* Until this succeeds the window reads as bus faults rather than data. */
    return BSP_QSPI_EnableMemoryMappedMode(0U) == BSP_ERROR_NONE;
}

void HAL_UART_MspInit(UART_HandleTypeDef *uart)
{
    GPIO_InitTypeDef gpio = {0};

    if ((uart == NULL) || (uart->Instance != USART1)) {
        return;
    }

    __HAL_RCC_USART1_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();

    /* COM1 on this board: PA9 = TX, PA10 = RX, routed to the ST-LINK VCP. */
    gpio.Pin = GPIO_PIN_9 | GPIO_PIN_10;
    gpio.Mode = GPIO_MODE_AF_PP;
    gpio.Pull = GPIO_PULLUP;
    gpio.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
    gpio.Alternate = GPIO_AF7_USART1;
    HAL_GPIO_Init(GPIOA, &gpio);

    HAL_NVIC_SetPriority(USART1_IRQn, 5U, 0U);
    HAL_NVIC_EnableIRQ(USART1_IRQn);
}

void HAL_UART_MspDeInit(UART_HandleTypeDef *uart)
{
    if ((uart == NULL) || (uart->Instance != USART1)) {
        return;
    }

    __HAL_RCC_USART1_CLK_DISABLE();
    HAL_NVIC_DisableIRQ(USART1_IRQn);
}

void board_error_handler(void)
{
    __disable_irq();
    for (;;) {
    }
}
