/**
  ******************************************************************************
  * @file    MXT336U.h
  * @author  EDT Embedded Team
  * @version V1.0.0
  * @date    26-Jan-2022
  * @brief   This file contains all the functions prototypes for the
  *          MXT336U.c Touch screen driver.
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

/* Define to prevent recursive inclusion -------------------------------------*/
#ifndef __MXT336U_H__
#define __MXT336U_H__

#ifdef __cplusplus
extern "C" {
#endif

#include "../Common/ts.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdlib.h>



#define swab16(x) ((x&0x00ff) << 8 | (x&0xff00) >> 8)
  
#if defined(MXT336U)
  
#define MXT336U_REPORT_2D_MODE               0
#define MXT336U_REPORT_3D_MODE               1 
#define MXT336U_DEFAULT_2D3D_MODE     MXT336U_REPORT_2D_MODE

//#define MXT_GEN_MESSAGE_MODE
  
#define CTP_DEBUG_LEVEL               0                  /*Debug RS485                      */
#define CTP_DEBUG_RAW_LEVEL           0                  /*Debug RS485 for point /raw data  */

  
//3D Self Raw Data Channel Set 
#define MXT336U_MAX_X_Channel         23
#define MXT336U_MAX_Y_Channel         14  
//3D Self Raw Data Channel Set  (use Read CTP Register T100 XSIZE YSIZE)

#define MXT336U_XCONTECT_SELFRAWVALUE  ((uint16_t)500)    /* Touchscreen Self Raw Data Effect Contect VAlue  */
#define MXT336U_YCONTECT_SELFRAWVALUE  ((uint16_t)500)    /* Touchscreen Self Raw Data Effect Contect VAlue  */
      
/* Version */
#define MXT_VER_20		20
#define MXT_VER_21		21
#define MXT_VER_22		22
  
#define MXT_FAMILYID		0xA6
#define MXT_VARIANTID		0x14
#define MXT_FWVERSION		0x10
#define MXT_FWBUILD		0xAB
  
#define MXT_MATRIX_X    	0x0E
#define MXT_MATRIX_Y    	0x18
#define MXT_NUM_OBJ		0x1F
#define MXT_OBJ_START   	0x25

#define MXT_VARIANTID_2		0x1C
#define MXT_FWVERSION_2		0x10
#define MXT_FWBUILD_2		0xAA  
  
  
#define MXT_TOUCH_EVENT_FINGER1		0x2D
#define MXT_TOUCH_EVENT_FINGER2		0x2E  
  
#define MXT_TOUCH_EVENT_CONTECT         0x90
#define MXT_TOUCH_EVENT_SILDER          0x91
#define MXT_TOUCH_EVENT_UNCONTECT       0x15

/* Slave addresses */
#define MXT336U_I2C_SLAVE_ADDRESS   0x94
#define MXT_APP_LOW		    0x4a
#define MXT_APP_HIGH		0x4b
#define MXT_BOOT_LOW		0x24
#define MXT_BOOT_HIGH		0x25

/* Firmware */
#define MXT_FW_NAME		"maxtouch.fw"

/* Registers */
#define MXT_FAMILY_ID		0x00
#define MXT_VARIANT_ID		0x01
#define MXT_VERSION		0x02
#define MXT_BUILD		0x03
#define MXT_MATRIX_X_SIZE	0x04
#define MXT_MATRIX_Y_SIZE	0x05
#define MXT_OBJECT_NUM		0x06
#define MXT_OBJECT_START	0x07

#define MXT_OBJECT_SIZE		6
#define MXT_INFO_CHECKSUM_SIZE	3
#define MXT_MAX_BLOCK_WRITE	256
#define MXT_NUMBER_OF_OBJECTS   31
  
/* Object types */
#define MXT_DEBUG_DIAGNOSTIC	37
#define MXT_GEN_MESSAGE		5
#define MXT_GEN_COMMAND		6
#define MXT_GEN_POWER		7
#define MXT_GEN_ACQUIRE		8
#define MXT_TOUCH_MULTI		100
#define MXT_TOUCH_KEYARRAY	15
#define MXT_TOUCH_PROXIMITY	23
#define MXT_PROCI_GRIPFACE	20
#define MXT_PROCG_NOISE		22
#define MXT_PROCI_ONETOUCH	24
#define MXT_PROCI_TWOTOUCH	27
#define MXT_PROCI_GRIP		40
#define MXT_PROCI_PALM		41
#define MXT_SPT_COMMSCONFIG	18
#define MXT_SPT_GPIOPWM		19
#define MXT_SPT_SELFTEST	25
#define MXT_SPT_CTECONFIG	28
#define MXT_SPT_USERDATA	38
#define MXT_SPT_DIGITIZER	43
#define MXT_SPT_MESSAGECOUNT	44

/* MXT_GEN_COMMAND T6 field */
#define MXT_COMMAND_RESET	0
#define MXT_COMMAND_BACKUPNV	1
#define MXT_COMMAND_CALIBRATE	2
#define MXT_COMMAND_REPORTALL	3
#define MXT_COMMAND_DIAGNOSTIC	5
  
/* MXT_DIAGNOSTIC  field */
  
#define MXT_PAGEUP               0X01   //Page up
#define MXT_PAGEDOWN             0X02   //Page Down
#define MXT_MCDM                 0X10   //Mutual Capacitance Deltas Mode
#define MXT_MCRM                 0X11   //Mutual Capacitance References Mode
#define MXT_DCDATAMODE           0X38   //DC Data Mode
#define MXT_DIM                  0X80   //Device Information Mode
#define MXT_SCDM                 0XF7   //Self Capacitance Delta Mode
#define MXT_SCRM                 0XF8   //Self Capacitance Reference Mode
#define MXT_NONE                 0X00   //No
  
/* MXT_GEN_POWER field */
#define MXT_POWER_IDLEACQINT	0
#define MXT_POWER_ACTVACQINT	1
#define MXT_POWER_ACTV2IDLETO	2

/* MXT_GEN_ACQUIRE field */
#define MXT_ACQUIRE_CHRGTIME	0
#define MXT_ACQUIRE_TCHDRIFT	2
#define MXT_ACQUIRE_DRIFTST	3
#define MXT_ACQUIRE_TCHAUTOCAL	4
#define MXT_ACQUIRE_SYNC	5
#define MXT_ACQUIRE_ATCHCALST	6
#define MXT_ACQUIRE_ATCHCALSTHR	7

/* MXT_TOUCH_MULTI field */
#define MXT_TOUCH_CTRL		0
#define MXT_TOUCH_CFG1		1
#define MXT_TOUCH_SCRAUX  	2
#define MXT_TOUCH_TCHAUX	3
#define MXT_TOUCH_TCHEVENTCGF	4
#define MXT_TOUCH_AKSCFG        5
#define MXT_TOUCH_NUMTCH	6
#define MXT_TOUCH_XYCGF  	7
#define MXT_TOUCH_XORIGIN	8
#define MXT_TOUCH_XSIZE 	9
#define MXT_TOUCH_XPITCH 	10
#define MXT_TOUCH_XLOCLIP	11
#define MXT_TOUCH_XHICLIP	12
#define MXT_TOUCH_XRANGE_L	13
#define MXT_TOUCH_XRANGE_H	14
#define MXT_TOUCH_XEDGECFG	15
#define MXT_TOUCH_XEDGEDIST	16
#define MXT_TOUCH_DXXEDGECFG	17
#define MXT_TOUCH_DXXEDGEDIST	18
#define MXT_TOUCH_YORIGIN	19
#define MXT_TOUCH_YSIZE 	20
#define MXT_TOUCH_YPITCH	21
#define MXT_TOUCH_YLOCLIP	22
#define MXT_TOUCH_YHICLIP	23
#define MXT_TOUCH_YRANGE_L	24
#define MXT_TOUCH_YRANGE_H	25
#define MXT_TOUCH_YEDGECFG	26
#define MXT_TOUCH_YEDGEDIST	27
#define MXT_TOUCH_GAIN  	28
#define MXT_TOUCH_DXGAIN	29
#define MXT_TOUCH_TCHITHR	30
#define MXT_TOUCH_TCHHYST	31

/* MXT_PROCI_GRIPFACE field */
#define MXT_GRIPFACE_CTRL	0
#define MXT_GRIPFACE_XLOGRIP	1
#define MXT_GRIPFACE_XHIGRIP	2
#define MXT_GRIPFACE_YLOGRIP	3
#define MXT_GRIPFACE_YHIGRIP	4
#define MXT_GRIPFACE_MAXTCHS	5
#define MXT_GRIPFACE_SZTHR1	7
#define MXT_GRIPFACE_SZTHR2	8
#define MXT_GRIPFACE_SHPTHR1	9
#define MXT_GRIPFACE_SHPTHR2	10
#define MXT_GRIPFACE_SUPEXTTO	11

/* MXT_PROCI_NOISE field */
#define MXT_NOISE_CTRL		0
#define MXT_NOISE_OUTFLEN	1
#define MXT_NOISE_GCAFUL_LSB	3
#define MXT_NOISE_GCAFUL_MSB	4
#define MXT_NOISE_GCAFLL_LSB	5
#define MXT_NOISE_GCAFLL_MSB	6
#define MXT_NOISE_ACTVGCAFVALID	7
#define MXT_NOISE_NOISETHR	8
#define MXT_NOISE_FREQHOPSCALE	10
#define MXT_NOISE_FREQ0		11
#define MXT_NOISE_FREQ1		12
#define MXT_NOISE_FREQ2		13
#define MXT_NOISE_FREQ3		14
#define MXT_NOISE_FREQ4		15
#define MXT_NOISE_IDLEGCAFVALID	16

/* MXT_SPT_COMMSCONFIG */
#define MXT_COMMS_CTRL		0
#define MXT_COMMS_CMD		1

/* MXT_SPT_CTECONFIG field */
#define MXT_CTE_CTRL		0
#define MXT_CTE_CMD		1
#define MXT_CTE_MODE		2
#define MXT_CTE_IDLEGCAFDEPTH	3
#define MXT_CTE_ACTVGCAFDEPTH	4
#define MXT_CTE_VOLTAGE		5

#define MXT_VOLTAGE_DEFAULT	2700000
#define MXT_VOLTAGE_STEP	10000

/* Define for MXT_GEN_COMMAND */
#define MXT_BOOT_VALUE		0xa5
#define MXT_BACKUP_VALUE	0x55
#define MXT_BACKUP_TIME		25	/* msec */
#define MXT_RESET_TIME		65	/* msec */

#define MXT_FWRESET_TIME	175	/* msec */

/* Command to unlock bootloader */
#define MXT_UNLOCK_CMD_MSB	0xaa
#define MXT_UNLOCK_CMD_LSB	0xdc

/* Bootloader mode status */
#define MXT_WAITING_BOOTLOAD_CMD	0xc0	/* valid 7 6 bit only */
#define MXT_WAITING_FRAME_DATA	0x80	/* valid 7 6 bit only */
#define MXT_FRAME_CRC_CHECK	0x02
#define MXT_FRAME_CRC_FAIL	0x03
#define MXT_FRAME_CRC_PASS	0x04
#define MXT_APP_CRC_FAIL	0x40	/* valid 7 8 bit only */
#define MXT_BOOT_STATUS_MASK	0x3f

/* Touch status */
#define MXT_SUPPRESS		(1 << 1)
#define MXT_AMP			(1 << 2)
#define MXT_VECTOR		(1 << 3)
#define MXT_MOVE		(1 << 4)
#define MXT_RELEASE		(1 << 5)
#define MXT_PRESS		(1 << 6)
#define MXT_DETECT		(1 << 7)

/* Touch orient bits */
#define MXT_XY_SWITCH		(1 << 0)
#define MXT_X_INVERT		(1 << 1)
#define MXT_Y_INVERT		(1 << 2)

/* Touchscreen absolute values */
#define MXT_MAX_AREA		0xff

#define MXT_MAX_FINGER		2

struct mxt_info {
	uint8_t family_id;
	uint8_t variant_id;
	uint8_t version;
	uint8_t build;
	uint8_t matrix_xsize;
	uint8_t matrix_ysize;
	uint8_t object_num;
};
#pragma pack(1) /// force alignment to 1 byte
struct mxt_object {
	uint8_t type;
	uint16_t start_address;
	uint8_t size;
	uint8_t instances;
	uint8_t num_report_ids;
};
#pragma pack()  /// set alignment back to default
struct mxt_message {
	uint8_t reportid;
	uint8_t message[10];
	uint8_t checksum;
};

struct mxt_finger {
	int status;
	int x;
	int y;
	int area;
};

struct mxt_platform_data {
        const uint8_t *config;
        size_t config_length;
    
        unsigned int x_line;
        unsigned int y_line;
        unsigned int x_size;
        unsigned int y_size;
        unsigned int blen;
        unsigned int threshold;
        unsigned int voltage;
        unsigned char orient;
        unsigned long irqflags;
};
/* Each client has this additional data */
struct mxt_data {
	const struct mxt_platform_data *pdata;
        uint16_t DeviceAddr ;
	struct mxt_object *object_table;
	struct mxt_info info;
	struct mxt_finger finger[MXT_MAX_FINGER];
	unsigned int irq;
        unsigned int cfg1;
	unsigned int max_x;
	unsigned int max_y;
        unsigned int matrix_x;
	unsigned int matrix_y;
        uint8_t seq_num;
};

//static bool mxt_object_readable(unsigned int type)
//{
//	switch (type) {
//	case MXT_GEN_MESSAGE:
//	case MXT_GEN_COMMAND:
//	case MXT_GEN_POWER:
//	case MXT_GEN_ACQUIRE:
//	case MXT_TOUCH_MULTI:
//	case MXT_TOUCH_KEYARRAY:
//	case MXT_TOUCH_PROXIMITY:
//	case MXT_PROCI_GRIPFACE:
//	case MXT_PROCG_NOISE:
//	case MXT_PROCI_ONETOUCH:
//	case MXT_PROCI_TWOTOUCH:
//	case MXT_PROCI_GRIP:
//	case MXT_PROCI_PALM:
//	case MXT_SPT_COMMSCONFIG:
//	case MXT_SPT_GPIOPWM:
//	case MXT_SPT_SELFTEST:
//	case MXT_SPT_CTECONFIG:
//	case MXT_SPT_USERDATA:
//		return true;
//	default:
//		return false;
//	}
//}

//static bool mxt_object_writable(unsigned int type)
//{
//	switch (type) {
//	case MXT_GEN_COMMAND:
//	case MXT_GEN_POWER:
//	case MXT_GEN_ACQUIRE:
//	case MXT_TOUCH_MULTI:
//	case MXT_TOUCH_KEYARRAY:
//	case MXT_TOUCH_PROXIMITY:
//	case MXT_PROCI_GRIPFACE:
//	case MXT_PROCG_NOISE:
//	case MXT_PROCI_ONETOUCH:
//	case MXT_PROCI_TWOTOUCH:
//	case MXT_PROCI_GRIP:
//	case MXT_PROCI_PALM:
//	case MXT_SPT_GPIOPWM:
//	case MXT_SPT_SELFTEST:
//	case MXT_SPT_CTECONFIG:
//		return true;
//	default:
//		return false;
//	}
//}

#pragma pack(1) /// force alignment to 1 byte
struct mxt_touchReport {
	uint8_t   event;
        uint8_t   flag;
	uint16_t  xpoint;
	uint16_t  ypoint;
        uint16_t  xpoint1;
	uint16_t  ypoint1;
};
 struct mxt_touchSelfRawData {
        uint16_t   flag;
        uint16_t  raw[51];
};

struct mxt_BackuptouchRawData {
	uint16_t  flag;
	uint16_t  raw[51];        
};
        
struct mxt_touchMutualRawData {
        uint16_t  flag;
        uint16_t  raw[640];
        uint16_t  rawMax;
        uint8_t   XrawMax;
        uint8_t   YrawMax;
};

#pragma pack() /// force alignment to 1 byte

/* Possible values of global variable 'TS_I2C_Initialized' */
#define MXT336U_I2C_NOT_INITIALIZED          ((uint8_t)0x00)
#define MXT336U_I2C_INITIALIZED              ((uint8_t)0x01)
#define MXT336U_MAX_DETECTABLE_TOUCH         ((uint32_t)0x02)

#if (CTP_DEBUG_LEVEL > 0)

#if defined (STM32H750xx)
 #include "edt_h7xx_usart.h"
#elif defined (STM32F750xx) 
 #include "edt_f7xx_usart.h"
#endif

#define dev_err(NULL,...)    printf(__VA_ARGS__);\
                             printf("\n");
                             
#endif

typedef struct
{
  uint8_t i2cInitialized;
  /* field holding the current number of simultaneous active touches */
  uint8_t currActiveTouchNb;
  /* field holding the touch index currently managed */
  uint8_t currActiveTouchIdx;

} mxt336u_handle_TypeDef;
  /* Exported functions --------------------------------------------------------*/

/**
 * @brief  Initialize the MXT336U communication bus
 *         from MCU to MXT336U : ie I2C channel initialization (if required).
 * @param  DeviceAddr: Device address on communication Bus (I2C slave address of MXT336U).
 * @retval None
 */
void mxt336u_Init(uint16_t DeviceAddr,uint16_t MaxX,uint16_t MaxY);

/**
 * @brief  Software Reset the MXT336U.
 * @param  DeviceAddr: Device address on communication Bus (I2C slave address of MXT336U).
 * @retval None
 */
void mxt336u_Reset(uint16_t DeviceAddr);

/**
 * @brief  Read the MXT336U device ID, pre initialize I2C in case of need to be
 *         able to read the MXT336U device ID, and verify this is a MXT336U.
 * @param  DeviceAddr: I2C MXT336U Slave address.
 * @retval The Device ID (two bytes).
 */
uint16_t mxt336u_ReadID(uint16_t DeviceAddr);

/**
 * @brief  Configures the touch Screen IC device to start detecting touches
 * @param  DeviceAddr: Device address on communication Bus (I2C slave address).
 * @retval None.
 */
void mxt336u_TS_Start(uint16_t DeviceAddr);

/**
 * @brief  Return if there is touches detected or not.
 *         Try to detect new touches and forget the old ones (reset internal global
 *         variables).
 * @param  DeviceAddr: Device address on communication Bus.
 * @retval : Number of active touches detected (can be 0, 1 or 2).
 */
uint8_t mxt336u_TS_DetectTouch(uint16_t DeviceAddr);

/**
 * @brief  Get the touch screen X and Y positions values
 *         Manage multi touch thanks to touch Index global
 *         variable 'MXT336U_handle.currActiveTouchIdx'.
 * @param  DeviceAddr: Device address on communication Bus.
 * @param  X: Pointer to X position value
 * @param  Y: Pointer to Y position value
 * @retval None.
 */
void mxt336u_TS_GetXY(uint16_t DeviceAddr, uint16_t *X, uint16_t *Y);

/**
 * @brief  Configure the MXT336U device to generate IT on given INT pin
 *         connected to MCU as EXTI.
 * @param  DeviceAddr: Device address on communication Bus (Slave I2C address of MXT336U).
 * @retval None
 */
void mxt336u_TS_EnableIT(uint16_t DeviceAddr);

/**
 * @brief  Configure the MXT336U device to stop generating IT on the given INT pin
 *         connected to MCU as EXTI.
 * @param  DeviceAddr: Device address on communication Bus (Slave I2C address of MXT336U).
 * @retval None
 */
void mxt336u_TS_DisableIT(uint16_t DeviceAddr);

/**
 * @brief  Get IT status from MXT336U interrupt status registers
 *         Should be called Following an EXTI coming to the MCU to know the detailed
 *         reason of the interrupt.
 * @param  DeviceAddr: Device address on communication Bus (I2C slave address of MXT336U).
 * @retval TS interrupts status
 */
uint8_t mxt336u_TS_ITStatus (uint16_t DeviceAddr);

/**
 * @brief  Clear IT status in MXT336U interrupt status clear registers
 *         Should be called Following an EXTI coming to the MCU.
 * @param  DeviceAddr: Device address on communication Bus (I2C slave address of MXT336U).
 * @retval TS interrupts status
 */
void mxt336u_TS_ClearIT (uint16_t DeviceAddr);

/**** NEW FEATURES enabled when Multi-touch support is enabled ****/

/*******************************************************************************
  * @brief  Software mxt336u_TS_Set2D3DMode.
  *         @note : Not applicable to MXT336U.
  * @param  DeviceAddr: Device address on communication Bus 
                        (I2C slave address of MXT336U).
  * @retval None
  ******************************************************************************/
void mxt336u_TS_Set2D3DMode(uint8_t mode);
/*******************************************************************************
  * @brief  Software mxt336u_TS_Get2D3DMode
  *         @note : Not applicable to MXT336U.
  * @param  DeviceAddr: Device address on communication Bus 
                        (I2C slave address of MXT336U).
  * @retval None
  ******************************************************************************/   
uint8_t mxt336u_TS_Get2D3DMode(void);

extern void     TS_IO_Init(void);
extern void     TS_IO_Write(uint8_t Addr, uint8_t Reg, uint8_t Value);
extern uint8_t  TS_IO_Read(uint8_t Addr, uint8_t Reg);
extern void     TS_IO_Read_Multi(uint8_t Addr, uint8_t Reg, uint8_t* buffer);
//extern void     TS_IO_Delay(uint32_t Delay);
extern void     MXT336U_Write_Value(uint16_t Addr, uint8_t *pData, uint8_t tx_size);
extern void     MXT336U_Read_Only(uint16_t Addr,  uint8_t* buffer , uint16_t Size);
extern void     MXT336U_Read_Multi_Buf(uint16_t Addr, uint8_t *pData,
                        uint8_t tx_size, uint8_t* buffer, uint8_t rx_size);

extern TS_Muti_DrvTypeDef mxt336u_ts_drv;
uint8_t crc8_MAXIM(uint8_t *data, uint8_t len);
uint8_t mxt_crc8(uint8_t crc, uint8_t data);
#endif

/*
obj_table_list
a6 14 10 ab 0e 18 1f 	        info

type,addrL/H,size,inst,rpt_id
25 c4 00 81 00 00 		T37
90 46 01 01 00 00 		T144
05 48 01 0b 00 00 		T5
06 54 01 06 00 01 		T6		
26 5b 01 3f 00 00 		T38
47 9b 01 c7 00 00 		T71
6e 63 02 2f 03 00 		T110
8d 23 03 02 0d 00 		T141
91 4d 03 00 00 00 		T145
07 4e 03 06 00 00 		T7
08 55 03 0e 00 00 		T8
0a 64 03 0a 00 01 		T10
0b 6f 03 03 00 00 		T11
0c 73 03 08 00 00 		T12
12 7c 03 01 00 00 		T18
13 7e 03 0f 00 01 		T19
2a 8e 03 0d 00 00 		T42
2e 9c 03 12 00 01 		T46
38 af 03 11 00 01 		T56
3d c1 03 04 03 01 		T61
41 d5 03 16 02 01 		T65
46 1a 04 09 13 01 		T70
48 e2 04 58 00 01 		T72
4e 3b 05 0b 00 00 		T78
50 47 05 0e 00 01 		T80
64 56 05 4b 00 0c 		T100
68 a2 05 0a 00 00 		T104
6c ad 05 4a 00 01 		T108
6d f8 05 10 00 01 		T109
6f 09 06 1f 01 af 		T111
4a 19 5f 00 00 b9 		T74
8e 67 78                        CRC24
*/
#ifdef __cplusplus
}
#endif

#endif /* __MXT336U_H__*/
/************************ (C) COPYRIGHT STMicroelectronics *****END OF FILE****/
