#include "stm32f7xx_it.h"

#include "board.h"
#include "stm32f7xx_hal.h"

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
