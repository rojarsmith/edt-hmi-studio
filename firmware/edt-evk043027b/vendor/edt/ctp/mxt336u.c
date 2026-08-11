/**
  ******************************************************************************
  * @file    MXT336U.c
  * @author  EDT Embedded Application Team
  * @version V1.0.0
  * @date    26-Jan-2022
  * @brief   This file provides a set of functions needed to manage the Touch 
  *          Screen on EDT smart embedded board.
  ******************************************************************************
  * @attention
  *
  * <h2><center>&copy; COPYRIGHT(c) 2022 EDT</center></h2>
  *
  * Redistribution and use in source and binary forms, with or without modification,
  * are permitted provided that the following conditions are met:
  *   1. Redistributions of source code must retain the above copyright notice,
  *      this list of conditions and the following disclaimer.
  *   2. Redistributions in binary form must reproduce the above copyright notice,
  *      this list of conditions and the following disclaimer in the documentation
  *      and/or other materials provided with the distribution.
  *   3. Neither the name of STMicroelectronics nor the names of its contributors
  *      may be used to endorse or promote products derived from this software
  *      without specific prior written permission.
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
#include "main.h"
#include "ctp/mxt336u.h"
#include <math.h>
#include <string.h>

#if defined(MXT336U)

static uint8_t REPORT_MODE  ;

static  uint16_t MXT336U_MAX_WIDTH __attribute__((unused)) =0;
static  uint16_t MXT336U_MAX_HEIGHT __attribute__((unused)) =0;

TS_Muti_DrvTypeDef mxt336u_ts_drv =
{
  mxt336u_Init,
  mxt336u_ReadID,
  mxt336u_Reset,

  mxt336u_TS_Start,
  mxt336u_TS_DetectTouch,
  mxt336u_TS_GetXY,

  mxt336u_TS_EnableIT,
  mxt336u_TS_ClearIT,
  mxt336u_TS_ITStatus,
  mxt336u_TS_DisableIT,
  
  NULL,         //  mxt336u_TS_Set2D3DMode,
  NULL,         //  mxt336u_TS_Get2D3DMode,
};

/*  MXT336U General Function     */
static uint8_t mxt336u_Get_I2C_InitializedStatus(void);
static void mxt336u_I2C_InitializeIfRequired(void);
static int mxt_read_Point2D(struct mxt_data *data , struct mxt_touchReport *report);
/*  MXT336U Driver Function     */

static int __mxt_read_reg(uint16_t DeviceAddr,uint16_t reg, uint16_t len, uint8_t *val);
static int __mxt_read_reg_V2(uint16_t DeviceAddr,uint16_t reg, uint16_t len, uint8_t *val);

//static int mxt_read_reg(uint16_t DeviceAddr  , uint16_t reg, uint8_t *val);
static int mxt_write_reg(uint16_t DeviceAddr , uint16_t reg, uint8_t *val, uint8_t len);
static int mxt_write_reg_V2(uint16_t DeviceAddr , uint16_t reg, uint8_t *val, uint8_t len);
uint8_t crc8_MAXIM_V2(uint8_t *data, uint8_t len);

//static int mxt_read_reg_V2(uint16_t DeviceAddr  , uint16_t reg, uint8_t *val);
static int mxt_read_buf_V2(uint16_t DeviceAddr  , uint16_t reg , uint8_t *val , uint16_t len);


//static int mxt_read_object_table(uint16_t DeviceAddr , uint16_t reg, uint8_t *object_buf);
//static struct mxt_object *mxt_get_object(struct mxt_data *data, uint8_t type);
//static int mxt_read_object(struct mxt_data *data,uint8_t type, uint8_t offset, uint8_t *val);
//static int mxt_write_object(struct mxt_data *data, uint8_t type, uint8_t offset, uint8_t val);
static int mxt_get_info(struct mxt_data *data);
static int mxt_get_object_table(struct mxt_data *data);
static int mxt_initialize(struct mxt_data *data);



static int mxt_read_buf(uint16_t DeviceAddr  , uint16_t reg , uint8_t *val , uint16_t len);

//static void mxt_sw_reset(void);
uint32_t EMPTY_ReportEvent =0;
static int mxt_get_confg(struct mxt_data *data);
static void mxt_set_obj(struct mxt_object *obj, uint8_t *buf);
/**************************************************************************/

static mxt336u_handle_TypeDef mxt336u_handle = { MXT336U_I2C_NOT_INITIALIZED, 0, 0};
static struct mxt_touchReport mtouch;
struct mxt_data mxt336u_data;
struct mxt_platform_data mxt336u_platform_data;

struct mxt_BackuptouchRawData mxt336u_backrawdata;
bool rawdataBackEn = false;
static struct mxt_object mxt_T5;
static struct mxt_object mxt_T100;
/******************************************************************************
  * @brief  Initialize the mxt336u communication bus
  *         from MCU to mxt336u : ie I2C channel initialization (if required).
  * @param  DeviceAddr: Device address on communication Bus 
                       (I2C slave address of mxt336u).
  * @retval None
  *****************************************************************************/
void mxt336u_Init(uint16_t DeviceAddr,uint16_t MaxX,uint16_t MaxY)
{
  /* Wait at least 200ms after power up before accessing registers
   * Trsi timing (Time of starting to report point after resetting) datasheet */
//  TS_IO_Delay(200);
  /* Initialize I2C link if needed */
  
  MXT336U_MAX_WIDTH   = MaxX;
  MXT336U_MAX_HEIGHT  = MaxY;
  REPORT_MODE = MXT336U_REPORT_2D_MODE;
  
  mxt336u_I2C_InitializeIfRequired();    
}

/*******************************************************************************
  * @brief  Software Reset the MXT336U.
  *         @note : Not applicable to MXT336U.
  * @param  DeviceAddr: Device address on communication Bus 
                        (I2C slave address of MXT336U).
  * @retval None
  ******************************************************************************/
void mxt336u_Reset(uint16_t DeviceAddr)
{
    uint8_t data = 0xff;
    mxt_write_reg(DeviceAddr,0x0154,&data,1);    //T6
//    TS_IO_Delay(200);
}
/***********************************************************************************
  * @brief  Read the MXT336U device ID, pre initialize I2C in case of need to be
  *         able to read the MXT336U device ID, and verify this is a MXT336U.
  * @param  DeviceAddr: I2C MXT336U Slave address.
  * @retval The Device ID (two bytes).
  **********************************************************************************/
uint16_t mxt336u_ReadID(uint16_t DeviceAddr)
{
  volatile uint8_t ucReadId = 0;

  return (ucReadId);
}
/*******************************************************************************
  * @brief  Configures the touch Screen IC device to start detecting touches
  * @param  DeviceAddr: Device address on communication Bus (I2C slave address).
  * @retval None.
  ****************************************************************************/
void mxt336u_TS_Start(uint16_t DeviceAddr)
{
    mxt_write_reg(MXT336U_I2C_SLAVE_ADDRESS,mxt_T5.start_address,0,0);
}

/*******************************************************************************
  * @brief  Configures the touch Screen IC device to start detecting touches
  * @param  DeviceAddr: Device address on communication Bus (I2C slave address).
  * @retval None.
  ****************************************************************************/
uint8_t mxt336u_TS_DetectTouch(uint16_t DeviceAddr)
{
  uint8_t nbTouch = 0;
  
 if(mxt336u_handle.i2cInitialized ==  MXT336U_I2C_INITIALIZED)
 {
   if(REPORT_MODE == MXT336U_REPORT_2D_MODE)  //2D
   {
      mxt_read_Point2D(&mxt336u_data,&mtouch);
//      nbTouch = mtouch.flag;

      if((mtouch.flag==MXT_TOUCH_EVENT_CONTECT)||(mtouch.flag==MXT_TOUCH_EVENT_SILDER))
      {      
        nbTouch= true;
      }
      else if(mtouch.flag == MXT_TOUCH_EVENT_UNCONTECT)
      {
        nbTouch=false;
      }
      else
      {
        nbTouch=false;
      }
   }
//      
//    if((MXT336U_MAX_WIDTH ==0)&&(MXT336U_MAX_HEIGHT ==0))
//       nbTouch=false;
 }
  return(nbTouch);
}

/******************************************************************
  * @brief  Get the touch screen X and Y positions values
  *         Manage multi touch thanks to touch Index global
  *         variable 'ILI2511_handle.currActiveTouchIdx'.
  * @param  DeviceAddr: Device address on communication Bus.
  * @param  X: Pointer to X position value
  * @param  Y: Pointer to Y position value
  * @retval None.
 ******************************************************************/
void mxt336u_TS_GetXY(uint16_t DeviceAddr, uint16_t *X, uint16_t *Y)
{
  static uint16_t coordX, coordY;

  uint16_t lcdw,lcdh;
  float Xfloat = 0 , Yfloat = 0;  
  

//      coordX = (uint16_t)  mtouch.xpoint;
//      coordY = (uint16_t)  mtouch.ypoint;
      coordX = (uint16_t)  mtouch.ypoint;
      coordY = (uint16_t)  mtouch.xpoint;
     
      lcdw = EDT_LCD_GetXSize();//800
      lcdh = EDT_LCD_GetYSize();//480
      
      if(REPORT_MODE == MXT336U_REPORT_2D_MODE)
      {
//      Xfloat = ((float)(lcdw-10)   / (float)(mxt336u_data.max_x )) ;  // 800/4096
//      Yfloat = ((float)(lcdh-10) / (float)(mxt336u_data.max_y )) ;
      Xfloat = ((float)(lcdw-10)   / (float)(mxt336u_data.max_y )) ;  // 800/4096
      Yfloat = ((float)(lcdh-10) / (float)(mxt336u_data.max_x )) ;
      
      }
      else
      {
        Xfloat = (float)(lcdw) / (float)(mxt336u_data.max_x ) ; 
        Yfloat = (float)(lcdh) / (float)(mxt336u_data.max_y ) ;
      }
            
    /* Send back ready X position to caller */
    *X = (uint16_t) (coordX* Xfloat);
    /* Send back ready Y position to caller */
    *Y = (uint16_t) (coordY* Yfloat);
    
   // #if (CTP_DEBUG_RAW_LEVEL > 0)
   //   dev_err(NULL,"x:%04d , y:%04d \r\n ",&X,&Y);
   // #endif
    
    
}

/******************************************************************************
  * @brief  Configure the mxt336u device to generate IT on given INT pin
  *         connected to MCU as EXTI.
  * @param  DeviceAddr: Device address on communication Bus 
                       (Slave I2C address of mxt336u).
  * @retval None
  ******************************************************************************/
void mxt336u_TS_EnableIT(uint16_t DeviceAddr)
{
  /* Nothing to be done here for mxt336u */
}
/*****************************************************************************************
  * @brief  Clear IT status in mxt336u interrupt status clear registers
  *         Should be called Following an EXTI coming to the MCU.
  *         @note : This feature is not applicable to mxt336u.
  * @param  DeviceAddr: Device address on communication Bus 
                        (I2C slave address of mxt336u).
  * @retval None
  ****************************************************************************************/
void mxt336u_TS_ClearIT(uint16_t DeviceAddr)
{
  /* Nothing to be done here for mxt336u */
}
/****************************************************************************************
  * @brief  Get IT status from mxt336u interrupt status registers
  *         Should be called Following an EXTI coming to the MCU to know the detailed
  *         reason of the interrupt.
  *         @note : This feature is not applicable to mxt336u.
  * @param  DeviceAddr: Device address on communication Bus
                       (I2C slave address of mxt336u).
  * @retval TS interrupts status : always return 0 here
  ***************************************************************************************/
uint8_t mxt336u_TS_ITStatus(uint16_t DeviceAddr)
{
  /* Nothing to be done here for mxt336u */
  return 0;
}
/**************************************************************************************
  * @brief  Configure the mxt336u device to stop generating IT on the given INT pin
  *         connected to MCU as EXTI.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of mxt336u).
  * @retval None
  *************************************************************************************/
void mxt336u_TS_DisableIT(uint16_t DeviceAddr)
{  
  /* Nothing to be done here for mxt336u */
}
/******************************************************************************
  * @brief  Return the status of I2C was initialized or not.
  * @param  None.
  * @retval : I2C initialization status.
  *****************************************************************************/
static uint8_t mxt336u_Get_I2C_InitializedStatus(void)
{
  return(mxt336u_handle.i2cInitialized);
}

/*******************************************************************************
  * @brief  I2C initialize if needed.
  * @param  None.
  * @retval : None.
  *****************************************************************************/
static void mxt336u_I2C_InitializeIfRequired(void)
{   
  uint8_t value[10]={0};
  uint8_t rxvalue[10]={0};
  
  if(mxt336u_Get_I2C_InitializedStatus() == MXT336U_I2C_NOT_INITIALIZED)
  {
    /* Initialize TS IO BUS layer (I2C) */
    TS_IO_Init();
    /* Set state to initialized */
    
    mxt336u_data.DeviceAddr     =  MXT336U_I2C_SLAVE_ADDRESS;
    mxt336u_data.seq_num        = 0;
    
//    TS_IO_Delay(100);

    mxt_initialize(&mxt336u_data) ;
		
    if((mxt336u_data.info.family_id==MXT_FAMILYID)&&(mxt336u_data.info.variant_id==MXT_VARIANTID)&&(mxt336u_data.info.build==MXT_FWBUILD))
    {
     mxt336u_handle.i2cInitialized =  MXT336U_I2C_INITIALIZED;
    
      value[0] =0x83;
      mxt_write_reg(mxt336u_data.DeviceAddr , 0x0556,value, 1);//disable event T100
      value[0] =0x09;
      mxt_write_reg(mxt336u_data.DeviceAddr , 0x0557,value, 1);//disable event T100
      value[0] =0x3a;//value[0] =0x3e;
      mxt_write_reg(mxt336u_data.DeviceAddr , 0x055A,value, 1);//disable event T100
      
      value[0] =0x00;
      mxt_write_reg(mxt336u_data.DeviceAddr , 0x03D5,value, 1);//disable lens bending T65
      mxt_write_reg(mxt336u_data.DeviceAddr , 0x03EC,value, 1);//disable lens bending T65
      mxt_write_reg(mxt336u_data.DeviceAddr , 0x0403,value, 1);//disable lens bending T65
    }
    else if((mxt336u_data.info.family_id==MXT_FAMILYID)&&(mxt336u_data.info.variant_id==MXT_VARIANTID_2)&&(mxt336u_data.info.build==MXT_FWBUILD_2))
    {
     mxt336u_handle.i2cInitialized =  MXT336U_I2C_INITIALIZED;
#if 1     
        value[0] =0x07;
        mxt_write_reg_V2(mxt336u_data.DeviceAddr , 0x85E1,value, 1);//disable event T100
        mxt_read_buf_V2(mxt336u_data.DeviceAddr  , 0x85E1 , rxvalue , 1);
        
        value[0] =0x01;
        mxt_write_reg_V2(mxt336u_data.DeviceAddr , 0x85E2,value, 1);//disable event T100
        mxt_read_buf_V2(mxt336u_data.DeviceAddr  , 0x85E2 , rxvalue , 1);
        
        value[0] =0x3E;
        mxt_write_reg_V2(mxt336u_data.DeviceAddr , 0x85E5,value, 1);//disable event T100
        mxt_read_buf_V2(mxt336u_data.DeviceAddr  , 0x85E5 , rxvalue , 1);
      
      value[0] =0x00;
      mxt_write_reg_V2(mxt336u_data.DeviceAddr , 0x8460,value, 1);//disable lens bending T65
      mxt_write_reg_V2(mxt336u_data.DeviceAddr , 0x8477,value, 1);//disable lens bending T65
      mxt_write_reg_V2(mxt336u_data.DeviceAddr , 0x848E,value, 1);//disable lens bending T65
      
#endif
    }
  }
}

/**************************************************************************************
  * @brief  __mxt_read_reg.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
static int __mxt_read_reg(uint16_t DeviceAddr,uint16_t reg, uint16_t len, uint8_t *val)
{	        
    uint8_t regbuf[20];
    regbuf[0] = (reg & 0xff);
    regbuf[1] = (reg >> 8) & 0xff;        
    regbuf[2] = mxt336u_data.seq_num++;
    regbuf[3] = crc8_MAXIM(regbuf,3);
    MXT336U_Read_Multi_Buf(DeviceAddr, regbuf, 4, val ,len);
    return 0;
}


/**************************************************************************************
  * @brief  __mxt_read_reg.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
static int __mxt_read_reg_V2(uint16_t DeviceAddr,uint16_t reg, uint16_t len, uint8_t *val)
{	        
    uint8_t regbuf[20];
    regbuf[0] = (reg & 0xff);
    regbuf[1] = (reg >> 8) & 0xff;        
    regbuf[2] = crc8_MAXIM(regbuf,2);
    MXT336U_Read_Multi_Buf(DeviceAddr, regbuf, 3, val ,len);
    return 0;
}
/**************************************************************************************
  * @brief  mxt_read_reg.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
//static int mxt_read_reg(uint16_t DeviceAddr  , uint16_t reg, uint8_t *val)
//{
//	return __mxt_read_reg(DeviceAddr  , reg , 1 , val);
//}
/**************************************************************************************
  * @brief  mxt_read_reg.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
static int mxt_read_buf(uint16_t DeviceAddr  , uint16_t reg , uint8_t *val , uint16_t len)
{
	return __mxt_read_reg(DeviceAddr  , reg , len , val);
}
/**************************************************************************************
  * @brief  mxt_read_reg.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
static int mxt_read_buf_V2(uint16_t DeviceAddr  , uint16_t reg , uint8_t *val , uint16_t len)
{
	return __mxt_read_reg_V2(DeviceAddr  , reg , len , val);
}
/**************************************************************************************
  * @brief  mxt_write_reg.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
static int mxt_write_reg(uint16_t DeviceAddr , uint16_t reg, uint8_t *val, uint8_t len)
{
      uint8_t regbuf[12];   
      uint8_t i;
      
      memset(regbuf , 0 ,sizeof(regbuf));
      regbuf[0] = (reg & 0xff);
      regbuf[1] = (reg >> 8) & 0xff;  
      
      if (len > 0) {
          for (i=0;  i< len ; i++) {
            regbuf[i+2] = val[i];            
          }
          regbuf[len+2] = mxt336u_data.seq_num++;
          regbuf[len+3] = crc8_MAXIM(regbuf,len + 3);
          MXT336U_Write_Value(DeviceAddr, regbuf, len+4);
      } else {
          regbuf[2] = mxt336u_data.seq_num++;
          regbuf[3] = crc8_MAXIM(regbuf,3);
          MXT336U_Write_Value(DeviceAddr, regbuf, 4);             
      }
      return 0;
}
/**************************************************************************************
  * @brief  mxt_write_reg.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
static int mxt_write_reg_V2(uint16_t DeviceAddr , uint16_t reg, uint8_t *val, uint8_t len)
{
      uint8_t regbuf[12];   
      uint8_t i;
      
      memset(regbuf , 0 ,sizeof(regbuf));
      regbuf[0] = (reg & 0xff);
      regbuf[1] = (reg >> 8) & 0xff;  
      
      if (len > 0) {
          for (i=0;  i< len ; i++) {
            regbuf[i+2] = val[i];            
          }          
          regbuf[len+2] = crc8_MAXIM_V2(regbuf,len + 2);        
          MXT336U_Write_Value(DeviceAddr, regbuf, len+3);
      } else {          
          regbuf[2] = crc8_MAXIM_V2(regbuf,2);
          MXT336U_Write_Value(DeviceAddr, regbuf, 3);             
      }
      return 0;
}
/**************************************************************************************
  * @brief  mxt_write_reg.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
static void mxt_read_only(uint16_t DeviceAddr , uint8_t *val , uint16_t Size)
{       
      MXT336U_Read_Only(DeviceAddr, val, Size);
}
/**************************************************************************************
  * @brief  mxt_read_object_table.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
//static int mxt_read_object_table(uint16_t DeviceAddr , uint16_t reg, uint8_t *object_buf)
//{
//	return __mxt_read_reg(DeviceAddr, reg, MXT_OBJECT_SIZE , object_buf);
//}
/**************************************************************************************
  * @brief  mxt_get_object.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
//static struct mxt_object *mxt_get_object(struct mxt_data *data, uint8_t type)
//{
//	struct mxt_object *object;
//	int i;
//
//	for (i = 0; i < data->info.object_num; i++) {
//		object = data->object_table + i;
//		if (object->type == type)
//			return object;
//	}
//	return NULL;
//}

/**************************************************************************************
  * @brief  mxt_read_Point2D.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
static int mxt_read_Point2D(struct mxt_data *data, struct mxt_touchReport *report)
{
    if((mxt336u_data.info.family_id==MXT_FAMILYID)&&(mxt336u_data.info.variant_id==MXT_VARIANTID)&&(mxt336u_data.info.build==MXT_FWBUILD))
    {
      mxt_read_only(data->DeviceAddr,(uint8_t*)report ,sizeof(struct mxt_touchReport));
  
      if(!((report->event ==0x25)&&(report->flag==0X90)))
      {  
         report->flag = false;
      }
    }
    else if((mxt336u_data.info.family_id==MXT_FAMILYID)&&(mxt336u_data.info.variant_id==MXT_VARIANTID_2)&&(mxt336u_data.info.build==MXT_FWBUILD_2))
    {      
     mxt_read_buf_V2(data->DeviceAddr ,0x0162, (uint8_t *)report , sizeof(struct mxt_touchReport));
       
    if(!((report->event ==0x29)&&(report->flag==0X90)))
    {  
         report->flag = false;
    }
    }     
      return 0;
}

/**************************************************************************************
  * @brief  mxt_read_object.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
//static int mxt_read_object(struct mxt_data *data,
//				uint8_t type, uint8_t offset, uint8_t *val)
//{
//	struct mxt_object *object;
//	uint16_t reg;
//
//	object = mxt_get_object(data, type);
//	if (!object)
//		return -1;
//
//	reg = object->start_address;
//	return __mxt_read_reg(data->DeviceAddr, reg + offset, 1, val);
//}
/**************************************************************************************
  * @brief  mxt_write_object.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
//static int mxt_write_object(struct mxt_data *data,
//				 uint8_t type, uint8_t offset, uint8_t val)
//{
//	struct mxt_object *object;
//	uint16_t reg;
//
//	object = mxt_get_object(data, type);
//	if (!object)
//		return -1;
//
//	reg = object->start_address;
//	return mxt_write_reg(data->DeviceAddr, reg + offset, &val,1);
//}

/**************************************************************************************
  * @brief  mxt_get_info.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
static int mxt_get_info(struct mxt_data *data)
{
	struct mxt_info *info = &data->info;
	int error;

        uint8_t val_[7]={0};
        error = mxt_read_buf(data->DeviceAddr,MXT_FAMILY_ID,val_,7);
        if (error) {
        error = mxt_read_buf_V2(data->DeviceAddr,MXT_FAMILY_ID,val_,7);
        if (error) {
          return error;
         }
        else{
           info->family_id     = val_[0];
            info->variant_id    = val_[1];
            info->version       = val_[2];
            info->build         = val_[3];
            info->matrix_xsize  = val_[4];
            info->matrix_ysize  = val_[5];
            info->object_num    = val_[6];
            if (val_[6] != MXT_NUMBER_OF_OBJECTS){ 
              return val_[6];
        }
        }
        } else {
            info->family_id     = val_[0];
            info->variant_id    = val_[1];
            info->version       = val_[2];
            info->build         = val_[3];
            info->matrix_xsize  = val_[4];
            info->matrix_ysize  = val_[5];
            info->object_num    = val_[6];
            if (val_[6] != MXT_NUMBER_OF_OBJECTS){ 
              return val_[6];
            }
        }
	return 0;
}
/**************************************************************************************
  * @brief  mxt_get_info.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
static int mxt_get_object_table(struct mxt_data *data)
{
	int error;
	int i;	
	uint8_t buf[MXT_OBJECT_SIZE * MXT_NUMBER_OF_OBJECTS];
//        TS_IO_Delay(200);
        error = mxt_read_buf(data->DeviceAddr,MXT_OBJECT_START,buf,sizeof(buf));
        if (error) return error;     
        
        for (i = 0; i < data->info.object_num; i++) {
            switch (buf[6*i]) {
            case MXT_GEN_MESSAGE :        
              {
                mxt_set_obj(&mxt_T5, &buf[6*i]);
                break;
              }
            case MXT_TOUCH_MULTI :
              {
                mxt_set_obj(&mxt_T100, &buf[6*i]);
                break;
              }
            default:
              break;
            }
          
        }
/*
	for (i = 0; i < data->info.object_num; i++) {
		struct mxt_object *object = data->object_table + i;
                
                object->type = buf[6*i];
		object->start_address = (buf[6*i+2] << 8) | buf[6*i+1];
		object->size = buf[6*i+3];
		object->instances = buf[6*i+4];
		object->num_report_ids = buf[6*i+5];
                
#if (CTP_DEBUG_LEVEL > 0)
           
       dev_err(dev, "type: T%03d --  start_address: %04x  --  size: %03d,-- instances : 
               %02d , num_report_ids : %02d", object->type,object->start_address, 
                 object->size ,object->instances , object->num_report_ids);
#endif
	}	       */
	return 0;
}
static void mxt_set_obj(struct mxt_object *obj, uint8_t *buf)
{
      obj->type = buf[0];
      obj->start_address = (buf[2] << 8) | buf[1];
      obj->size = buf[3]+1;
      obj->instances = buf[4]+1;
      obj->num_report_ids = buf[5];
}
static int mxt_get_confg(struct mxt_data *data)
{
     int error;
     uint8_t buf[76];
     error = mxt_write_reg(MXT336U_I2C_SLAVE_ADDRESS,mxt_T5.start_address,0,0);
     error += mxt_read_buf(data->DeviceAddr,mxt_T100.start_address,buf,sizeof(buf));        
     if (error) return error;     
     data->max_x = buf[14]<<8|buf[13];
     data->max_y = buf[25]<<8|buf[24];
      
     return 0;
}
/**************************************************************************************
  * @brief  mxt_initialize.
  * @param  DeviceAddr: Device address on communication Bus 
            (Slave I2C address of MXT336U).
  * @retval None
  *************************************************************************************/
static int mxt_initialize(struct mxt_data *data)
{	
//	struct mxt_info *info = &data->info;
	int error;      
       
        
   data->pdata = &mxt336u_platform_data;
                    
	error = mxt_get_info(data);
     
	/* Get object table information */
	error += mxt_get_object_table(data);

   //     mxt_sw_reset();
        error += mxt_get_confg(data);    //read from T100
	/* Update matrix size at info struct */        
        
	if (error) {
          return error;
        }    
        
	return 0;
}
  
uint8_t mxt_crc8(uint8_t crc, uint8_t data)
{
  static const uint8_t CRCPOLY = 0x8C;
  for (uint8_t index = 0; index < 8; index++) {
    uint8_t fb = (crc ^ data) & 0x01;
    data >>= 1;
    crc >>= 1;
    if (fb) {
      crc ^= CRCPOLY;
    }
  }
  return crc;
}

uint8_t crc8_MAXIM(uint8_t *data, uint8_t len)
{   
    uint8_t crc, i;
    crc = 0x00;
    while(len--) {    
        crc = crc ^ *data++;
        for(i = 0;i < 8;i++) {    
            if(crc & 0x01) {    
                crc = (crc >> 1) ^ 0x8c;
            }
                else crc >>= 1;
        }
    }
    return crc;
}

uint8_t crc8_MAXIM_V2(uint8_t *data, uint8_t len)
{   
    uint8_t crc, i;
    uint8_t crcdata[20]={0};
    crc = 0x00;
    uint8_t index =0;
    
    memset(crcdata,0,sizeof(crcdata));
    memcpy(crcdata ,data, len);
    //crcdata[1]&=0x7f;
    while(len--) {    
        crc = crc ^ crcdata[index++];
        for(i = 0;i < 8;i++) {    
            if(crc & 0x01) {    
                crc = (crc >> 1) ^ 0x8c;
            }
                else crc >>= 1;
        }
    }
    return crc;
}

//static void mxt_sw_reset(void)
//{
//  uint8_t data[1] = {0xff};
//    mxt_write_reg(MXT336U_I2C_SLAVE_ADDRESS,0x0154,data,1);    //T6
////    TS_IO_Delay(200);
//}

#endif
/************************ (C) COPYRIGHT EDT *****END OF FILE****/
