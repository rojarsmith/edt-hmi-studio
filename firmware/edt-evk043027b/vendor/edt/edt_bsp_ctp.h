/**
  ******************************************************************************  
  * File Name          : edt_bsp_ctp.h
  * @author            : EDT Embedded Application Team
  * Description        : This file contains the common defines and functions 
  *                      prototypes for the edt_bsp_ctp.c driver.
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

/* Define to prevent recursive inclusion -------------------------------------*/
#ifndef __EDT_BSP_CTP_H
#define __EDT_BSP_CTP_H

#ifdef __cplusplus
 extern "C" {
#endif   
   
/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "Common/ts.h"

#if defined (ILI2511)
 #include "ctp/ili2511v6.h"

 #define TS_MAX_NB_TOUCH               ((uint32_t) ILI2511_MAX_DETECTABLE_TOUCH)
 #define TS_I2C_ADDRESS                ((uint8_t)ILI2511_I2C_SLAVE_ADDRESS)
 #define CTP_driver                    &ili2511_ts_drv
#endif

#if defined (MXT336U)
#include "ctp/mxt336u.h"
#define TS_MAX_NB_TOUCH               ((uint32_t) MXT336U_MAX_DETECTABLE_TOUCH)
#define TS_I2C_ADDRESS                ((uint8_t)MXT336U_I2C_SLAVE_ADDRESS)
#define CTP_driver                    &mxt336u_ts_drv
#endif

#if defined (MXT640U)
 #include "ctp/mxt640u.h"
 #define TS_MAX_NB_TOUCH               ((uint32_t) MXT640U_MAX_DETECTABLE_TOUCH)
 #define TS_I2C_ADDRESS                ((uint8_t)MXT640U_I2C_SLAVE_ADDRESS)
 #define CTP_driver                    &mxt640u_ts_drv
#endif


#define TS_NO_IRQ_PENDING               ((uint8_t) 0)
#define TS_IRQ_PENDING                  ((uint8_t) 1)

   /* Touch Panel start orientation */
#define TS_SWAP_NONE                    ((uint8_t) 0x01)  // nomally  (0,0 ) to (x,y)
#define TS_SWAP_X                       ((uint8_t) 0x02)  // The X axis is reversed, and the Y axis does not change (x,0 ) to (0,y)
#define TS_SWAP_Y                       ((uint8_t) 0x04)  // The X axis does not change, the Y axis is reversed (0,y ) to (x,0)
#define TS_SWAP_XY                      ((uint8_t) 0x08)  // The X axis becomes Y axis, The Y axis becomes X axis (0,0)to(y,x)
#define TS_MIRSWAP_XY                   ((uint8_t) 0x10)  // The X and Y axis are reversed,(x,y ) to (0,0)
   
#define CTP_MULTI_TOUCH_SUPPORTED          0  

/**
*  @brief TS_StateTypeDef
*  Define TS State structure
*/
typedef struct
{
  uint8_t  touchDetected;                /*!< Total number of active touches detected at last scan */
  uint16_t touchX[TS_MAX_NB_TOUCH];      /*!< Touch X[0], X[1] coordinates on 12 bits */
  uint16_t touchY[TS_MAX_NB_TOUCH];      /*!< Touch Y[0], Y[1] coordinates on 12 bits */

#if (TS_MULTI_TOUCH_SUPPORTED == 1)
  uint8_t  touchWeight[TS_MAX_NB_TOUCH]; /*!< Touch_Weight[0], Touch_Weight[1] : weight property of touches */
  uint8_t  touchEventId[TS_MAX_NB_TOUCH];     /*!< Touch_EventId[0], Touch_EventId[1] : take value of type @ref TS_TouchEventTypeDef */
  uint8_t  touchArea[TS_MAX_NB_TOUCH];   /*!< Touch_Area[0], Touch_Area[1] : touch area of each touch */
  uint32_t gestureId; /*!< type of gesture detected : take value of type @ref TS_GestureIdTypeDef */
#endif  /* TS_MULTI_TOUCH_SUPPORTED == 1 */

} TS_StateTypeDef;

typedef struct
{
	I2C_InitTypeDef		 Init;
	I2C_TypeDef			*Inst;
	void              	*handle;
}TS_InitTypeDef;

typedef enum 
{
  TS_OK                = 0x00, /*!< Touch Ok */
  TS_ERROR             = 0x01, /*!< Touch Error */
  TS_TIMEOUT           = 0x02, /*!< Touch Timeout */
  TS_DEVICE_NOT_FOUND  = 0x03  /*!< Touchscreen device not found */
}TS_StatusTypeDef;

/**
 *  @brief TS_GestureIdTypeDef
 *  Define Possible managed gesture identification values returned by touch screen
 *  driver.
 */
typedef enum
{
  GEST_ID_NO_GESTURE = 0x00, /*!< Gesture not defined / recognized */
  GEST_ID_MOVE_UP    = 0x01, /*!< Gesture Move Up */
  GEST_ID_MOVE_RIGHT = 0x02, /*!< Gesture Move Right */
  GEST_ID_MOVE_DOWN  = 0x03, /*!< Gesture Move Down */
  GEST_ID_MOVE_LEFT  = 0x04, /*!< Gesture Move Left */
  GEST_ID_ZOOM_IN    = 0x05, /*!< Gesture Zoom In */
  GEST_ID_ZOOM_OUT   = 0x06, /*!< Gesture Zoom Out */
  GEST_ID_NB_MAX     = 0x07  /*!< max number of gesture id */

} TS_GestureIdTypeDef;

/**
 *  @brief TS_TouchEventTypeDef
 *  Define Possible touch events kind as returned values
 *  by touch screen IC Driver.
 */
typedef enum
{
  TOUCH_EVENT_NO_EVT        = 0x00, /*!< Touch Event : undetermined */
  TOUCH_EVENT_PRESS_DOWN    = 0x01, /*!< Touch Event Press Down */
  TOUCH_EVENT_LIFT_UP       = 0x02, /*!< Touch Event Lift Up */
  TOUCH_EVENT_CONTACT       = 0x03, /*!< Touch Event Contact */
  TOUCH_EVENT_NB_MAX        = 0x04  /*!< max number of touch events kind */
} TS_TouchEventTypeDef;
extern I2C_HandleTypeDef hI2cCTP;
/**
 *  @brief Table for touchscreen event information display on LCD :
 *  table indexed on enum @ref TS_TouchEventTypeDef information
 */
extern char * ts_event_string_tab[TOUCH_EVENT_NB_MAX];

/**
 *  @brief Table for touchscreen gesture Id information display on LCD : table indexed
 *  on enum @ref TS_GestureIdTypeDef information
 */
extern char * ts_gesture_id_string_tab[GEST_ID_NB_MAX];
extern I2C_InitTypeDef ctp_init;
extern I2C_TypeDef    *ctp_inst;
uint8_t EDT_TS_Init(uint16_t ts_SizeX, uint16_t ts_SizeY);
uint8_t EDT_TS_DeInit(void);
uint8_t EDT_TS_GetState(TS_StateTypeDef *TS_State);

#if (TS_MULTI_TOUCH_SUPPORTED == 1)
uint8_t EDT_TS_Get_GestureId(TS_StateTypeDef *TS_State);
#endif /* TS_MULTI_TOUCH_SUPPORTED == 1 */

void    TS_IO_Init (void);  
void    TS_IO_Write(uint8_t Addr, uint8_t Reg, uint8_t Value);
uint8_t TS_IO_Read(uint8_t Addr, uint8_t Reg);
void    TS_IO_Read_Multi(uint8_t Addr, uint8_t Reg, uint8_t* buffer);
//void    TS_IO_Delay(uint32_t Delay);
HAL_StatusTypeDef TS_IO_Read_Buffer(uint8_t Addr, uint8_t Reg, uint8_t* buffer, uint8_t Length);

uint8_t EDT_TS_Init(uint16_t ts_SizeX, uint16_t ts_SizeY);
uint8_t EDT_TS_DeInit(void);
uint8_t EDT_TS_GetState(TS_StateTypeDef *TS_State);

uint8_t EDT_TS_ITConfig(void);
uint8_t EDT_TS_ITGetStatus(void);
void    EDT_TS_ITClear(void);
uint8_t EDT_TS_ResetTouchData(TS_StateTypeDef *TS_State);

uint32_t EDT_LCD_GetXSize(void);
uint32_t EDT_LCD_GetYSize(void);

#if defined(MXT336U)
void MXT336U_Read_Multi_Buf(uint16_t Addr, uint8_t *pData, uint8_t tx_size,
                                  uint8_t* buffer, uint8_t rx_size);
void MXT336U_Write_Value(uint16_t Addr, uint8_t *pData, uint8_t tx_size);
#endif

#if defined(MXT640U)
void    TS_IO_MXT640U_Write_Value(uint16_t Addr, uint16_t Reg, uint8_t Value);
void    TS_IO_MXT640U_Read_Only(uint16_t Addr,  uint8_t* buffer , uint16_t Size);
uint8_t TS_IO_MXT640U_Read_Value(uint16_t Addr, uint16_t Reg);
void    TS_IO_MXT640U_Read_Multi_Buf(uint16_t Addr, uint16_t Reg, uint8_t* buffer,uint16_t Size);
void    EDT_TS_SetMXT640U_2D3DMode(uint8_t mode);
uint8_t EDT_TS_GetMXT640U_2D3DMode(void);
#endif

// check touch dectect for LCD sleep function // 
bool EDT_TS_GetDetected(void);
void EDT_TS_SetDetected(bool bl);
void EDT_TS_Set_Handle(I2C_HandleTypeDef hctp);
#ifdef __cplusplus
}
#endif

#endif /* __EDT_BSP_CTP_H */

 /*******(C) COPYRIGHT Emerging Display Technologies Corp. **** END OF FILE ***/
