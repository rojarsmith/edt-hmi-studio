#include "stm32u5xx_it.h"

#include "board.h"
#include "stm32u5xx_hal.h"

extern LTDC_HandleTypeDef hltdc;

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

/*
 * Modbus RTU. The USART is instance 2 on this board — the handle keeps the
 * `huart1` name the shared runtime expects, see board.h.
 */
void USART2_IRQHandler(void)
{
    HAL_UART_IRQHandler(&huart1);
}

/*
 * HAL_LTDC_Init enables the register-reload and error interrupts, so this has
 * to exist: an unhandled interrupt lands in the startup file's default handler,
 * which spins forever — the display stops mid-frame and the main loop, Modbus
 * included, never runs again.
 */
void LTDC_IRQHandler(void)
{
    HAL_LTDC_IRQHandler(&hltdc);
}

void LTDC_ER_IRQHandler(void)
{
    HAL_LTDC_IRQHandler(&hltdc);
}
