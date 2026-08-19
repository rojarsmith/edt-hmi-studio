#include "board.h"

#include "stm32746g_discovery_sdram.h"

UART_HandleTypeDef huart1;

static bool system_clock_config(void)
{
    RCC_OscInitTypeDef oscillator = {0};
    RCC_ClkInitTypeDef clock = {0};

    __HAL_RCC_PWR_CLK_ENABLE();
    __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);

    oscillator.OscillatorType = RCC_OSCILLATORTYPE_HSE;
    oscillator.HSEState = RCC_HSE_ON;
    oscillator.PLL.PLLState = RCC_PLL_ON;
    oscillator.PLL.PLLSource = RCC_PLLSOURCE_HSE;
    oscillator.PLL.PLLM = 25U;
    oscillator.PLL.PLLN = 432U;
    oscillator.PLL.PLLP = RCC_PLLP_DIV2;
    oscillator.PLL.PLLQ = 9U;

    if (HAL_RCC_OscConfig(&oscillator) != HAL_OK) {
        return false;
    }
    if (HAL_PWREx_EnableOverDrive() != HAL_OK) {
        return false;
    }

    clock.ClockType =
        RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_HCLK |
        RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
    clock.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
    clock.AHBCLKDivider = RCC_SYSCLK_DIV1;
    clock.APB1CLKDivider = RCC_HCLK_DIV4;
    clock.APB2CLKDivider = RCC_HCLK_DIV2;

    return HAL_RCC_ClockConfig(&clock, FLASH_LATENCY_7) == HAL_OK;
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
    huart1.AdvancedInit.AdvFeatureInit = UART_ADVFEATURE_NO_INIT;

    return HAL_UART_Init(&huart1) == HAL_OK;
}

/*
 * The Cortex-M7 default memory map types the FMC SDRAM window (0xC0000000) as
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
    region.BaseAddress = 0xC0000000U; /* FMC SDRAM bank 1, 8 MB on this board */
    region.Size = MPU_REGION_SIZE_8MB;
    region.AccessPermission = MPU_REGION_FULL_ACCESS;
    region.IsBufferable = MPU_ACCESS_BUFFERABLE;
    region.IsCacheable = MPU_ACCESS_CACHEABLE;
    region.IsShareable = MPU_ACCESS_NOT_SHAREABLE;
    region.TypeExtField = MPU_TEX_LEVEL0;
    region.SubRegionDisable = 0x00U;
    region.DisableExec = MPU_INSTRUCTION_ACCESS_DISABLE;
    HAL_MPU_ConfigRegion(&region);

    HAL_MPU_Enable(MPU_PRIVILEGED_DEFAULT);
}

bool board_init(void)
{
    /* Must precede the cache enables so the SDRAM attributes are already in
       force the first time anything touches the frame buffer. */
    mpu_config();

    SCB_EnableICache();
    SCB_EnableDCache();

    HAL_Init();
    if (!system_clock_config()) {
        return false;
    }

    /*
     * LVGL's heap lives in this SDRAM (see include/lv_conf.h), and main() calls
     * lv_init() before the display comes up, so the controller has to be
     * running before anything LVGL does. The BSP would otherwise bring it up
     * inside BSP_LCD_Init, far too late; DATA_IN_ExtSDRAM tells the BSP that
     * the application has already done it, so it does not repeat the
     * initialisation sequence underneath a heap that is by then in use.
     */
    if (BSP_SDRAM_Init() != SDRAM_OK) {
        return false;
    }

    return board_uart1_apply(
        115200U,
        UART_PARITY_NONE,
        UART_STOPBITS_1);
}

void HAL_MspInit(void)
{
    __HAL_RCC_PWR_CLK_ENABLE();
    __HAL_RCC_SYSCFG_CLK_ENABLE();
    HAL_NVIC_SetPriorityGrouping(NVIC_PRIORITYGROUP_4);
}

void HAL_UART_MspInit(UART_HandleTypeDef *uart)
{
    GPIO_InitTypeDef gpio = {0};

    if ((uart == NULL) || (uart->Instance != USART1)) {
        return;
    }

    __HAL_RCC_USART1_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_GPIOB_CLK_ENABLE();

    gpio.Pin = GPIO_PIN_9;
    gpio.Mode = GPIO_MODE_AF_PP;
    gpio.Pull = GPIO_PULLUP;
    gpio.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
    gpio.Alternate = GPIO_AF7_USART1;
    HAL_GPIO_Init(GPIOA, &gpio);

    gpio.Pin = GPIO_PIN_7;
    HAL_GPIO_Init(GPIOB, &gpio);

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
    HAL_GPIO_DeInit(GPIOA, GPIO_PIN_9);
    HAL_GPIO_DeInit(GPIOB, GPIO_PIN_7);
}

void board_error_handler(void)
{
    __disable_irq();
    for (;;) {
    }
}
