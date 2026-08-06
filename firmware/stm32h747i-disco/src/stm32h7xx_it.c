#include "stm32h7xx_it.h"

#include "board.h"
#include "stm32h7xx_hal.h"
#include "stm32h747i_discovery_lcd.h"

void NMI_Handler(void)
{
}

void HardFault_Handler(void)
{
    board_error_handler();
}

void MemManage_Handler(void)
{
    board_error_handler();
}

void BusFault_Handler(void)
{
    board_error_handler();
}

void UsageFault_Handler(void)
{
    board_error_handler();
}

void SVC_Handler(void)
{
}

void DebugMon_Handler(void)
{
}

void PendSV_Handler(void)
{
}

void SysTick_Handler(void)
{
    HAL_IncTick();
}

void USART1_IRQHandler(void)
{
    HAL_UART_IRQHandler(&huart1);
}

/*
 * The BSP enables the LTDC register-reload interrupt when it brings the display
 * up, and the DSI host has its own. Every interrupt the BSP enables needs a
 * handler here: an unhandled one lands in the startup file's default handler,
 * which spins forever — the display stops mid-frame and the main loop, Modbus
 * included, never runs again.
 */
void LTDC_IRQHandler(void)
{
    HAL_LTDC_IRQHandler(&hlcd_ltdc);
}

void LTDC_ER_IRQHandler(void)
{
    HAL_LTDC_IRQHandler(&hlcd_ltdc);
}

void DSI_IRQHandler(void)
{
    HAL_DSI_IRQHandler(&hlcd_dsi);
}
