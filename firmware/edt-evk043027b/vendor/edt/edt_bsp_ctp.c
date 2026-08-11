/**
  ******************************************************************************
  * File Name          : edt_bsp_ctp.c
  * @author            : EDT Embedded Application Team
  * Description        : This file provides a set of functions needed to manage 
  *                      the CTP on smart embedded display board.
  * @brief             : EDT <https://smartembeddeddisplay.com/>
  ******************************************************************************
  * @attention
  *
  * COPYRIGHT(c) 2023 Emerging Display Technologies Corp.
  *
  * Redistribution and use in source and binary forms, with or without modification,
  * are permitted provided that the following conditions are met:
  *   1. Redistributions of source code must retain the above copyright notice,
  *      this list of conditions and the following disclaimer.
  *   2. Redistributions in binary form must reproduce the above copyright notice,
  *      this list of conditions and the following disclaimer in the documentation
  *      and/or other materials provided with the distribution.
  *   3. Neither the name of Emerging Display Technologies Corp. nor the names of 
  *      its contributors may be used to endorse or promote products derived from 
  *      this software without specific prior written permission.
  *
  * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
  * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
  * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
  * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
  * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
  * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
  * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
  * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
  *
  ******************************************************************************
  */

/* Includes ------------------------------------------------------------------*/
#include "edt_bsp_ctp.h"


#if defined (MXT640U)||defined(MXT1664T)||defined(MXT336U)
static TS_Muti_DrvTypeDef *tsDriver;
#else
static TS_DrvTypeDef *tsDriver;
#endif

static uint16_t tsXBoundary, tsYBoundary;
static uint8_t  tsOrientation;
static uint8_t  I2cAddress;

static HAL_StatusTypeDef I2Cx_ReadMultiple(I2C_HandleTypeDef *i2c_handler, \
  uint8_t Addr, uint16_t Reg, uint16_t MemAddSize, uint8_t *Buffer, uint16_t Length);
static HAL_StatusTypeDef I2Cx_WriteMultiple(I2C_HandleTypeDef *i2c_handler, \
  uint8_t Addr, uint16_t Reg, uint16_t MemAddSize, uint8_t *Buffer, uint16_t Length);
static void              I2Cx_Error(I2C_HandleTypeDef *i2c_handler, uint8_t Addr);
static bool TouchDetected; // check touch dectect for LCD sleep function 

uint16_t ctp_res_x, ctp_res_y;

I2C_HandleTypeDef hI2cCTP;

I2C_InitTypeDef ctp_init;
I2C_TypeDef    *ctp_inst;
/**
  * @brief  Initializes and configures the touch screen functionalities and
  *         configures all necessary hardware resources (GPIOs, I2C, clocks..).
  * @param  ts_SizeX: Maximum X size of the TS area on LCD
  * @param  ts_SizeY: Maximum Y size of the TS area on LCD
  * @retval TS_OK if all initializations are OK. Other value if error.
  */

void TS_IO_Init( void )
{ 
  HAL_I2C_DeInit( &hI2cCTP );

  if ( HAL_I2C_GetState( &hI2cCTP ) == HAL_I2C_STATE_RESET ) {
  /* Restore the CTP I2C configuration */
    hI2cCTP.Instance = ctp_inst;
    hI2cCTP.Init = ctp_init;
  /* Init the I2C */
    HAL_I2C_Init( &hI2cCTP );
  }
}
void EDT_TS_Set_Handle(I2C_HandleTypeDef hctp)
{
  hI2cCTP = hctp;
  ctp_init = hctp.Init;
  ctp_inst = hctp.Instance;
}
/**
  * @brief  Writes a single data.
  * @param  Addr: I2C address
  * @param  Reg: Reg address
  * @param  Value: Data to be written
  * @retval None
  */
void TS_IO_Write(uint8_t Addr, uint8_t Reg, uint8_t Value)
{
  I2Cx_WriteMultiple( &hI2cCTP, Addr, ( uint16_t )Reg, I2C_MEMADD_SIZE_8BIT, \
    ( uint8_t* ) &Value, 1);
}

/**
  * @brief  Reads a single data.
  * @param  Addr: I2C address
  * @param  Reg: Reg address
  * @retval Data to be read
  */
uint8_t TS_IO_Read(uint8_t Addr, uint8_t Reg)
{
  uint8_t read_value = 0;

  I2Cx_ReadMultiple( &hI2cCTP, Addr, Reg, I2C_MEMADD_SIZE_8BIT, \
    ( uint8_t* ) &read_value, 1);

  return read_value;
}
/**
  * @brief  Reads a multiple data.
  * @param  Addr: I2C address
  * @param  Reg: Reg address
  * @retval databuffer
  */

void TS_IO_Read_Multi(uint8_t Addr, uint8_t Reg, uint8_t* buffer)
{
    I2Cx_ReadMultiple( &hI2cCTP, Addr, Reg, I2C_MEMADD_SIZE_8BIT, buffer, 5);
}

HAL_StatusTypeDef TS_IO_Read_Buffer(uint8_t Addr, uint8_t Reg, uint8_t* buffer, uint8_t Length)
{
//	I2Cx_ReadMultiple( &hI2cCTP, Addr, Reg, I2C_MEMADD_SIZE_8BIT, buffer, size);
    HAL_StatusTypeDef status = HAL_OK;

    status = HAL_I2C_Mem_Read(&hI2cCTP, Addr, (uint16_t)Reg, I2C_MEMADD_SIZE_8BIT, \
    		buffer, Length, 1000);

    /* Check the communication status */
    if ( status != HAL_OK )	{
          /* I2C error occurred */
        I2Cx_Error(&hI2cCTP, Addr);
    }
    return status;
}

#if defined(MXT640U)|| defined(MXT1664T)
/*********************************************************
  * @brief  Writes a single data. MXT640U
  * @param  Addr: I2C address
  * @param  Reg: Reg address
  * @param  Value: Data to be written
  * @retval None
  *******************************************************/
#if defined(MXT640U)
void TS_IO_MXT640U_Write_Value(uint16_t Addr, uint16_t Reg, uint8_t Value)
#elif defined(MXT1664T)
void TS_IO_MXT1664T_Write_Value(uint16_t Addr, uint16_t Reg, uint8_t Value)
#endif
{
	HAL_StatusTypeDef status = HAL_OK;

	uint8_t regbuf[3];

	regbuf[0] = (Reg & 0xff);
	regbuf[1] = (Reg >> 8) & 0xff;
	regbuf[2] = Value;

	status = HAL_I2C_Master_Transmit(&hI2cCTP, Addr, regbuf, 3, 100);

	if (status != HAL_OK)
	{
		HAL_I2C_DeInit(&hI2cCTP);
		TS_IO_Init();
	}
}
/*********************************************************
  * @brief  Writes a single data. MXT640U
  * @param  Addr: I2C address
  * @param  Reg: Reg address
  * @param  Value: Data to be written
  * @retval None
  *******************************************************/
#if defined(MXT640U)
void TS_IO_MXT640U_Read_Only(uint16_t Addr, uint8_t* buffer, uint16_t Size)
#elif defined(MXT1664T)
void TS_IO_MXT1664T_Read_Only(uint16_t Addr, uint8_t* buffer, uint16_t Size)
#endif
{
	HAL_StatusTypeDef status = HAL_OK;

	HAL_I2C_Master_Receive(&hI2cCTP, Addr, buffer, Size, 100);

	if (status != HAL_OK)
	{
		HAL_I2C_DeInit(&hI2cCTP);
		TS_IO_Init();
	}
}

/************************************************************
  * @brief  Reads a multiple data. MXT640U
  * @param  Addr: I2C address
  * @param  Reg: Reg address
  * @retval databuffer
  ***********************************************************/
#if defined(MXT640U)
void TS_IO_MXT640U_Read_Multi_Buf(uint16_t Addr, uint16_t Reg, uint8_t* buffer, uint16_t Size)
#elif defined(MXT1664T)
void TS_IO_MXT1664T_Read_Multi_Buf(uint16_t Addr, uint16_t Reg, uint8_t* buffer, uint16_t Size)
#endif
{
	HAL_StatusTypeDef status = HAL_OK;
	uint8_t regbuf[2];

	regbuf[0] = (Reg & 0xff);
	regbuf[1] = (Reg >> 8) & 0xff;

	status = HAL_I2C_Master_Transmit(&hI2cCTP, Addr, regbuf, 2, 100);
	status = HAL_I2C_Master_Receive(&hI2cCTP, Addr, buffer, Size, 100);

	/* Check the communication status */
	if (status != HAL_OK)
	{
		HAL_I2C_DeInit(&hI2cCTP);
		TS_IO_Init();
	}
}
#endif /*#if defined(MXT640U)|| defined(MXT1664T)*/

#if defined(MXT336U)
void MXT336U_Read_Multi_Buf(uint16_t Addr, uint8_t *pData, uint8_t tx_size,
                                  uint8_t* buffer,  uint8_t rx_size)
{
	HAL_StatusTypeDef status = HAL_OK;

   status = HAL_I2C_Master_Transmit(&hI2cCTP, Addr, pData, tx_size, 1000);

//        HAL_Delay(10);

	status = HAL_I2C_Master_Receive(&hI2cCTP, Addr, buffer, rx_size, 1000);

	/* Check the communication status */
	if (status != HAL_OK)
	{
		HAL_I2C_DeInit(&hI2cCTP);
		TS_IO_Init();
	}
}
void MXT336U_Read_Only(uint16_t Addr, uint8_t* buffer, uint16_t Size)
{
	HAL_StatusTypeDef status = HAL_OK;

	HAL_I2C_Master_Receive(&hI2cCTP, Addr, buffer, Size, 100);

	if (status != HAL_OK)
	{
		HAL_I2C_DeInit(&hI2cCTP);
		TS_IO_Init();
	}
}
void MXT336U_Write_Value(uint16_t Addr, uint8_t *pData, uint8_t tx_size)
{
	HAL_StatusTypeDef status = HAL_OK;

	status = HAL_I2C_Master_Transmit(&hI2cCTP, Addr, pData, tx_size, 1000);

	if (status != HAL_OK)
	{
		HAL_I2C_DeInit(&hI2cCTP);
		TS_IO_Init();
	}
}
#endif

/**
  * @brief  TS delay
  * @param  Delay: Delay in ms
  * @retval None
  */
//void TS_IO_Delay(uint32_t Delay)
//{
////	HAL_Delay(Delay);
//  uint32_t tickstart;
//  tickstart = (int32_t)HAL_GetTick();
//  while(((int32_t)HAL_GetTick() - tickstart) < Delay){}
//}
/**
  * @brief  Reads multiple data.
  * @param  i2c_handler : I2C handler
  * @param  Addr: I2C address
  * @param  Reg: Reg address
  * @param  MemAddress: Memory address
  * @param  Buffer: Pointer to data buffer
  * @param  Length: Length of the data
  * @retval Number of read data
  */
static HAL_StatusTypeDef I2Cx_ReadMultiple(I2C_HandleTypeDef *i2c_handler,
	uint8_t Addr, uint16_t Reg, uint16_t MemAddress, uint8_t *Buffer,
	uint16_t Length)
{
    HAL_StatusTypeDef status = HAL_OK;

    status = HAL_I2C_Mem_Read(i2c_handler, Addr, (uint16_t)Reg, MemAddress, \
      Buffer, Length, 1000);

    /* Check the communication status */
    if ( status != HAL_OK )	{
          /* I2C error occurred */
        I2Cx_Error(i2c_handler, Addr);
    }
    return status;
}

/**
  * @brief  Writes a value in a register of the device through BUS in using DMA mode.
  * @param  i2c_handler : I2C handler
  * @param  Addr: Device address on BUS Bus.
  * @param  Reg: The target register address to write
  * @param  MemAddress: Memory address
  * @param  Buffer: The target register value to be written
  * @param  Length: buffer size to be written
  * @retval HAL status
  */
static HAL_StatusTypeDef I2Cx_WriteMultiple(I2C_HandleTypeDef *i2c_handler,\
	uint8_t Addr, uint16_t Reg, uint16_t MemAddress, uint8_t *Buffer,\
	uint16_t Length)
{
    HAL_StatusTypeDef status = HAL_OK;

    status = HAL_I2C_Mem_Write(i2c_handler, Addr, (uint16_t)Reg, MemAddress,\
      Buffer, Length, 1000);

    /* Check the communication status */
    if ( status != HAL_OK )	{
          /* I2C error occurred */
        I2Cx_Error(i2c_handler, Addr);
    }
    return status;
}

/**
  * @brief  Checks if target device is ready for communication.
  * @note   This function is used with Memory devices
  * @param  i2c_handler : I2C handler
  * @param  DevAddress: Target device address
  * @param  Trials: Number of trials
  * @retval HAL status
  */
HAL_StatusTypeDef TS_IO_IsDeviceReady( I2C_HandleTypeDef *i2c_handler, \
    uint16_t DevAddress, uint32_t Trials )
{
    return ( HAL_I2C_IsDeviceReady( i2c_handler, DevAddress, Trials, 1000 ));
}

/**
  * @brief  Manages error callback by re-initializing I2C.
  * @param  i2c_handler : I2C handler
  * @param  Addr: I2C Address
  * @retval None
  */
static void I2Cx_Error(I2C_HandleTypeDef *i2c_handler, uint8_t Addr)
{
    /* De-initialize the I2C communication bus */
    HAL_I2C_DeInit(i2c_handler);

    /* Re-Initialize the I2C communication bus */
    TS_IO_Init();
}


uint8_t EDT_TS_Init(uint16_t ts_SizeX, uint16_t ts_SizeY)
{
    uint8_t status = TS_OK;

    tsXBoundary = ts_SizeX;
    tsYBoundary = ts_SizeY;

    I2cAddress = TS_I2C_ADDRESS;
    tsDriver = CTP_driver;
//    tsDriver->Init(TS_I2C_ADDRESS,CTP_RESOLUTION_X,CTP_RESOLUTION_Y);
    tsDriver->Init(TS_I2C_ADDRESS,ts_SizeX,ts_SizeY);
//    tsOrientation = TS_SWAP_NONE;
    tsOrientation =TS_SWAP_Y;

    /* Initialize the TS driver */
    tsDriver->Start(I2cAddress);        

//    tpid = tsDriver->ReadID(I2cAddress);

    return status;
}

/**
  * @brief  DeInitializes the TouchScreen.
  * @retval TS state
  */
uint8_t EDT_TS_DeInit(void)
{
    /* Actually ts_driver does not provide a DeInit function */
    return TS_OK;
}

/**
  * @brief  Configures and enables the touch screen interrupts.
  * @retval TS_OK if all initializations are OK. Other value if error.
  */
uint8_t EDT_TS_ITConfig(void)
{
     /* Enable the TS ITs */
    tsDriver->EnableIT(I2cAddress);
    return TS_OK;
}

/**
  * @brief  Gets the touch screen interrupt status.
  * @retval TS_OK if all initializations are OK. Other value if error.
  */
uint8_t EDT_TS_ITGetStatus(void)
{
    /* Return the TS IT status */
    return (tsDriver->GetITStatus(I2cAddress));
}
/******************************************************
  * @brief  Gets the touch screen status for sleep function.
  * @retval
   design :channing
  *****************************************************/
void EDT_TS_SetDetected(bool bl)
{
    TouchDetected = bl;
}
bool EDT_TS_GetDetected(void)
{
    return  TouchDetected;
}
/***********************************************************************
  * @brief  Returns status and positions of the touch screen.
  * @param  TS_State: Pointer to touch screen current state structure
  * @retval TS_OK if all initializations are OK. Other value if error.
  **********************************************************************/
uint8_t EDT_TS_GetState(TS_StateTypeDef *TS_State)
{
  static uint32_t _x[TS_MAX_NB_TOUCH] = { 0, 0 };
  static uint32_t _y[TS_MAX_NB_TOUCH] = { 0, 0 };
  uint8_t ts_status = TS_OK;
  uint16_t x[TS_MAX_NB_TOUCH];
  uint16_t y[TS_MAX_NB_TOUCH];
  uint16_t brute_x[TS_MAX_NB_TOUCH];
  uint16_t brute_y[TS_MAX_NB_TOUCH];
  uint16_t x_diff;
  uint16_t y_diff;
  uint32_t index;
#if (CTP_MULTI_TOUCH_SUPPORTED == 1)
  uint32_t weight = 0;
  uint32_t area = 0;
  uint32_t event = 0;
#endif /* CTP_MULTI_TOUCH_SUPPORTED == 1 */

  /* Check and update the number of touches active detected */
  TS_State->touchDetected = tsDriver->DetectTouch(I2cAddress);

  if ( TS_State->touchDetected ) {
    /* check touch detect for LCD sleep function :*/
    if ( EDT_Sleep_GetDetected() ) {
        EDT_Sleep_SetDetected( false );
        return TouchDetected = true;
    } else {
        TouchDetected = true;
    }

    for ( index = 0; index < TS_State->touchDetected; index++ ) {
      /* Get each touch coordinates */
      tsDriver->GetXY(I2cAddress, &(brute_x[index]), &(brute_y[index]));

      if ( tsOrientation == TS_SWAP_NONE ) {
          x[index] = brute_x[index];
          y[index] = brute_y[index];
      }

      if ( tsOrientation & TS_SWAP_X ) {
          x[index] = EDT_LCD_GetXSize() - brute_x[index];
          y[index] = brute_y[index];
      }

      if ( tsOrientation & TS_SWAP_Y ) {
          x[index] = brute_x[index];
          y[index] = EDT_LCD_GetYSize() - brute_y[index];
      }

      if ( tsOrientation & TS_SWAP_XY ) {
          y[index] = brute_x[index];
          x[index] = brute_y[index];
      }

      if ( tsOrientation & TS_MIRSWAP_XY ) {
          x[index] = EDT_LCD_GetXSize() - brute_x[index];
          y[index] = EDT_LCD_GetYSize() - brute_y[index];
      }

      x_diff = x[index] > _x[index] ? (x[index] - _x[index]) : (_x[index] - x[index]);
      y_diff = y[index] > _y[index] ? (y[index] - _y[index]) : (_y[index] - y[index]);

      if (( x_diff + y_diff ) > 5 ) {
          _x[index] = x[index];
          _y[index] = y[index];
      }

      if ( I2cAddress == TS_I2C_ADDRESS ) {
          TS_State->touchX[index] = x[index];
          TS_State->touchY[index] = y[index];
      }
      else
      {
          /* 2^12 = 4096 : indexes are expressed on a dynamic of 4096 */
          TS_State->touchX[index] = (tsXBoundary * _x[index]) >> 12;
          TS_State->touchY[index] = (tsYBoundary * _y[index]) >> 12;
      }

#if (CTP_MULTI_TOUCH_SUPPORTED == 1)

      /* Get touch info related to the current touch */
      CTP_GetTouchInfo(I2cAddress, index, &weight, &area, &event);

      /* Update TS_State structure */
      TS_State->touchWeight[index] = weight;
      TS_State->touchArea[index] = area;

      /* Remap touch event */
      switch (event)
      {
      case CTP_TOUCH_EVT_FLAG_PRESS_DOWN:
              TS_State->touchEventId[index] = TOUCH_EVENT_PRESS_DOWN;
              break;
      case CTP_TOUCH_EVT_FLAG_LIFT_UP:
              TS_State->touchEventId[index] = TOUCH_EVENT_LIFT_UP;
              break;
      case CTP_TOUCH_EVT_FLAG_CONTACT:
              TS_State->touchEventId[index] = TOUCH_EVENT_CONTACT;
              break;
      case CTP_TOUCH_EVT_FLAG_NO_EVENT:
              TS_State->touchEventId[index] = TOUCH_EVENT_NO_EVT;
              break;
      default:
              ts_status = TS_ERROR;
              break;
      } /* of switch(event) */

#endif /* CTP_MULTI_TOUCH_SUPPORTED == 1 */

    } /* of for(index=0; index < TS_State->touchDetected; index++) */

#if (CTP_MULTI_TOUCH_SUPPORTED == 1)
/* Get gesture Id */
    ts_status = EDT_TS_Get_GestureId(TS_State);
#endif /* CTP_MULTI_TOUCH_SUPPORTED == 1 */

  } /* end of if(TS_State->touchDetected != 0) */

  return (ts_status);
}

#if (CTP_MULTI_TOUCH_SUPPORTED == 1)
/**
  * @brief  Update gesture Id following a touch detected.
  * @param  TS_State: Pointer to touch screen current state structure
  * @retval TS_OK if all initializations are OK. Other value if error.
  */
uint8_t EDT_TS_Get_GestureId(TS_StateTypeDef *TS_State)
{
    uint32_t gestureId = 0;
    uint8_t  ts_status = TS_OK;

    /* Get gesture Id */
    CTP_GetGestureID(I2cAddress, &gestureId);

    /* Remap gesture Id to a TS_GestureIdTypeDef value */
    switch (gestureId)
    {
    case CTP_GEST_ID_NO_GESTURE:
          TS_State->gestureId = GEST_ID_NO_GESTURE;
          break;
    case CTP_GEST_ID_MOVE_UP:
          TS_State->gestureId = GEST_ID_MOVE_UP;
          break;
    case CTP_GEST_ID_MOVE_RIGHT:
          TS_State->gestureId = GEST_ID_MOVE_RIGHT;
          break;
    case CTP_GEST_ID_MOVE_DOWN:
          TS_State->gestureId = GEST_ID_MOVE_DOWN;
          break;
    case CTP_GEST_ID_MOVE_LEFT:
          TS_State->gestureId = GEST_ID_MOVE_LEFT;
          break;
    case CTP_GEST_ID_ZOOM_IN:
          TS_State->gestureId = GEST_ID_ZOOM_IN;
          break;
    case CTP_GEST_ID_ZOOM_OUT:
          TS_State->gestureId = GEST_ID_ZOOM_OUT;
          break;
    default:
          ts_status = TS_ERROR;
          break;
    } /* of switch(gestureId) */

    return(ts_status);
}
#endif /* CTP_MULTI_TOUCH_SUPPORTED == 1 */

/**
  * @brief  Clears all touch screen interrupts.
  */
void EDT_TS_ITClear(void)
{
	/* Clear TS IT pending bits */
	tsDriver->ClearIT(I2cAddress);
}

/**
  * @brief  Function used to reset all touch data before a new acquisition
  *         of touch information.
  * @param  TS_State: Pointer to touch screen current state structure
  * @retval TS_OK if OK, TE_ERROR if problem found.
  */
uint8_t EDT_TS_ResetTouchData(TS_StateTypeDef *TS_State)
{
    uint8_t ts_status = TS_ERROR;
    uint32_t index;

    if ( TS_State != ( TS_StateTypeDef *) NULL ) {
#if ( TS_MULTI_TOUCH_SUPPORTED == 1 )
        TS_State -> gestureId = GEST_ID_NO_GESTURE;
#endif
        TS_State -> touchDetected = 0;
        for ( index = 0; index < TS_MAX_NB_TOUCH; index++ ) {
            TS_State -> touchX[index] = 0;
            TS_State -> touchY[index] = 0;
#if (TS_MULTI_TOUCH_SUPPORTED == 1)
            TS_State -> touchArea[index] = 0;
            TS_State -> touchEventId[index] = TOUCH_EVENT_NO_EVT;
            TS_State -> touchWeight[index] = 0;
#endif
          }
        ts_status = TS_OK;
    } /* of if (TS_State != (TS_StateTypeDef *)NULL) */
    return (ts_status);
}

#if defined(MXT640U)||defined(MXT1664T)

#if defined(MXT640U)
/*******************************************************************************
  * @brief  Function used to reset all touch data before a new acquisition
  *         of touch information.
  * @param  TS_State: Pointer to touch screen current state structure
  * @retval TS_OK if OK, TE_ERROR if problem found.
  *****************************************************************************/
void EDT_TS_SetMXT640U_2D3DMode(uint8_t mode)
#elif defined(MXT1664T)
void EDT_TS_SetMXT1664T_2D3DMode(uint8_t mode)
#endif
{
	tsDriver->Set2D3DMode(mode);  //mode=0 : 2D   , mode=1 : 3D;
}

/*******************************************************************************
  * @brief  Function used to reset all touch data before a new acquisition
  *         of touch information.
  * @param  TS_State: Pointer to touch screen current state structure
  * @retval TS_OK if OK, TE_ERROR if problem found.
  *****************************************************************************/
#if defined(MXT640U)
uint8_t EDT_TS_GetMXT640U_2D3DMode(void)
#elif defined(MXT1664T)
uint8_t EDT_TS_GetMXT1664T_2D3DMode(void)
#endif
{
	return tsDriver->Get2D3DMode();
}


#endif /*#if defined(MXT640U)||defined(MXT1164T)*/


 /*******(C) COPYRIGHT Emerging Display Technologies Corp. **** END OF FILE ***/
