/*
 * Low-level glue between ST's USB Device Library and the STM32U5 PCD driver.
 *
 * Two halves that mirror each other: HAL_PCD_* callbacks coming up from the
 * peripheral are forwarded into USBD_LL_*, and USBD_LL_* calls coming down from
 * the library are forwarded into HAL_PCD_*. Adapted from the vendor package's
 * USB_Device/Target/usbd_conf.c, which is CubeMX output; the FIFO sizes and the
 * PHY bring-up in HAL_PCD_MspInit are the parts that are genuinely this board's
 * and are kept byte for byte.
 */

#include "usbd_conf.h"

#include "usbd_cdc.h"
#include "usbd_core.h"
#include "usbd_def.h"

PCD_HandleTypeDef hpcd_USB_OTG_HS;

/*
 * Storage for the CDC class handle. USBD_malloc is mapped here rather than to
 * the C library's — see usbd_conf.h. One block is enough because exactly one
 * class is ever registered, which is also why usbd_cdc.h is included from what
 * is otherwise class-agnostic glue: the size has to come from the real type.
 *
 * Sizing this by eye is a trap. USBD_CDC_HandleTypeDef carries a whole
 * high-speed packet buffer (512 bytes) plus its bookkeeping, so it is larger
 * than the round number it invites — and being short is close to invisible.
 * USBD_malloc is not called until SET_CONFIGURATION, long after the descriptors
 * have been read, so the device still enumerates, Windows still binds usbser.sys
 * and still assigns a COM number, and only then fails to start. The symptom is
 * a COM port that appears in Device Manager with a warning triangle.
 */
static uint32_t class_handle_storage[
    (sizeof(USBD_CDC_HandleTypeDef) + sizeof(uint32_t) - 1U) / sizeof(uint32_t)];
static bool class_handle_taken;

void *USBD_static_malloc(uint32_t size)
{
    if ((size > sizeof(class_handle_storage)) || class_handle_taken) {
        return NULL;
    }
    class_handle_taken = true;
    return class_handle_storage;
}

void USBD_static_free(void *p)
{
    UNUSED(p);
    class_handle_taken = false;
}

/*
 * The USB_OTG_HS peripheral, its PHY, and the supplies both need.
 *
 * Three things here have no equivalent anywhere else in this firmware and are
 * each individually fatal to enumeration if missed:
 *
 *   - the PHY needs its own kernel clock (USBPHYC, from PLL1/2) *and* a
 *     reference clock selection that matches the crystal arrangement;
 *   - VDDUSB is an isolated supply domain that reads as dead until enabled,
 *     the same trap as VDDA in HAL_MspInit;
 *   - the HS transceiver has a further supply of its own, and the PHY must be
 *     switched on through SYSCFG rather than RCC.
 *
 * All of it is taken from the vendor package's Core/Src/usb_otg.c.
 */
void HAL_PCD_MspInit(PCD_HandleTypeDef *pcdHandle)
{
    GPIO_InitTypeDef gpio = {0};
    RCC_PeriphCLKInitTypeDef periph_clock = {0};

    if (pcdHandle->Instance != USB_OTG_HS) {
        return;
    }

    __HAL_RCC_SYSCFG_CLK_ENABLE();

    periph_clock.PeriphClockSelection = RCC_PERIPHCLK_USBPHY;
    periph_clock.UsbPhyClockSelection = RCC_USBPHYCLKSOURCE_PLL1_DIV2;
    if (HAL_RCCEx_PeriphCLKConfig(&periph_clock) != HAL_OK) {
        return;
    }

    HAL_SYSCFG_SetOTGPHYReferenceClockSelection(SYSCFG_OTG_HS_PHY_CLK_SELECT_1);

    __HAL_RCC_GPIOA_CLK_ENABLE();
    /*
     * PA11/PA12 are D-/D+ and belong to the PHY, not to GPIO — they are
     * deliberately not configured here. Only the two signalling pins are:
     * PA10 = ID, PA9 = VBUS sense.
     */
    gpio.Pin = GPIO_PIN_10;
    gpio.Mode = GPIO_MODE_AF_PP;
    gpio.Pull = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
    gpio.Alternate = GPIO_AF10_USB_HS;
    HAL_GPIO_Init(GPIOA, &gpio);

    gpio.Pin = GPIO_PIN_9;
    gpio.Mode = GPIO_MODE_INPUT;
    gpio.Pull = GPIO_NOPULL;
    HAL_GPIO_Init(GPIOA, &gpio);

    __HAL_RCC_USB_OTG_HS_CLK_ENABLE();
    __HAL_RCC_USBPHYC_CLK_ENABLE();

    /* HAL_MspInit already enabled the PWR clock and VDDUSB; this is the
       transceiver's own supply, which is separate from both. */
    HAL_PWREx_EnableVddUSB();
    HAL_PWREx_EnableUSBHSTranceiverSupply();

    HAL_SYSCFG_EnableOTGPHY(SYSCFG_OTG_HS_PHY_ENABLE);

    /* Below the LTDC and above Modbus: a missed SOF costs a frame of latency,
       a missed LTDC reload tears the picture. */
    HAL_NVIC_SetPriority(OTG_HS_IRQn, 6U, 0U);
    HAL_NVIC_EnableIRQ(OTG_HS_IRQn);
}

void HAL_PCD_MspDeInit(PCD_HandleTypeDef *pcdHandle)
{
    if (pcdHandle->Instance != USB_OTG_HS) {
        return;
    }

    __HAL_RCC_USB_OTG_HS_CLK_DISABLE();
    __HAL_RCC_USBPHYC_CLK_DISABLE();
    HAL_NVIC_DisableIRQ(OTG_HS_IRQn);
}

/* ---- HAL_PCD callbacks, forwarded up into the library ------------------- */

void HAL_PCD_SetupStageCallback(PCD_HandleTypeDef *hpcd)
{
    USBD_LL_SetupStage((USBD_HandleTypeDef *)hpcd->pData,
                       (uint8_t *)hpcd->Setup);
}

void HAL_PCD_DataOutStageCallback(PCD_HandleTypeDef *hpcd, uint8_t epnum)
{
    USBD_LL_DataOutStage((USBD_HandleTypeDef *)hpcd->pData, epnum,
                         hpcd->OUT_ep[epnum].xfer_buff);
}

void HAL_PCD_DataInStageCallback(PCD_HandleTypeDef *hpcd, uint8_t epnum)
{
    USBD_LL_DataInStage((USBD_HandleTypeDef *)hpcd->pData, epnum,
                        hpcd->IN_ep[epnum].xfer_buff);
}

void HAL_PCD_SOFCallback(PCD_HandleTypeDef *hpcd)
{
    USBD_LL_SOF((USBD_HandleTypeDef *)hpcd->pData);
}

void HAL_PCD_ResetCallback(PCD_HandleTypeDef *hpcd)
{
    USBD_SpeedTypeDef speed = USBD_SPEED_FULL;

    switch (hpcd->Init.speed) {
        case PCD_SPEED_HIGH:
            speed = USBD_SPEED_HIGH;
            break;
        case PCD_SPEED_FULL:
            speed = USBD_SPEED_FULL;
            break;
        default:
            speed = USBD_SPEED_FULL;
            break;
    }

    USBD_LL_SetSpeed((USBD_HandleTypeDef *)hpcd->pData, speed);
    USBD_LL_Reset((USBD_HandleTypeDef *)hpcd->pData);
}

void HAL_PCD_SuspendCallback(PCD_HandleTypeDef *hpcd)
{
    USBD_LL_Suspend((USBD_HandleTypeDef *)hpcd->pData);
    /* Deliberately not entering low-power mode here: this board is mains
       powered and the HMI has to keep drawing while the host is asleep. */
}

void HAL_PCD_ResumeCallback(PCD_HandleTypeDef *hpcd)
{
    USBD_LL_Resume((USBD_HandleTypeDef *)hpcd->pData);
}

void HAL_PCD_ISOOUTIncompleteCallback(PCD_HandleTypeDef *hpcd, uint8_t epnum)
{
    USBD_LL_IsoOUTIncomplete((USBD_HandleTypeDef *)hpcd->pData, epnum);
}

void HAL_PCD_ISOINIncompleteCallback(PCD_HandleTypeDef *hpcd, uint8_t epnum)
{
    USBD_LL_IsoINIncomplete((USBD_HandleTypeDef *)hpcd->pData, epnum);
}

void HAL_PCD_ConnectCallback(PCD_HandleTypeDef *hpcd)
{
    USBD_LL_DevConnected((USBD_HandleTypeDef *)hpcd->pData);
}

void HAL_PCD_DisconnectCallback(PCD_HandleTypeDef *hpcd)
{
    USBD_LL_DevDisconnected((USBD_HandleTypeDef *)hpcd->pData);
}

/* ---- USBD_LL entry points, forwarded down into the HAL ------------------ */

USBD_StatusTypeDef USBD_LL_Init(USBD_HandleTypeDef *pdev)
{
    if (pdev->id != DEVICE_HS) {
        return USBD_FAIL;
    }

    hpcd_USB_OTG_HS.pData = pdev;
    pdev->pData = &hpcd_USB_OTG_HS;

    hpcd_USB_OTG_HS.Instance = USB_OTG_HS;
    hpcd_USB_OTG_HS.Init.dev_endpoints = 9;
    hpcd_USB_OTG_HS.Init.speed = PCD_SPEED_HIGH;
    hpcd_USB_OTG_HS.Init.phy_itface = USB_OTG_HS_EMBEDDED_PHY;
    hpcd_USB_OTG_HS.Init.Sof_enable = DISABLE;
    hpcd_USB_OTG_HS.Init.low_power_enable = DISABLE;
    hpcd_USB_OTG_HS.Init.lpm_enable = DISABLE;
    hpcd_USB_OTG_HS.Init.use_dedicated_ep1 = DISABLE;
    hpcd_USB_OTG_HS.Init.vbus_sensing_enable = ENABLE;
    hpcd_USB_OTG_HS.Init.dma_enable = DISABLE;

    if (HAL_PCD_Init(&hpcd_USB_OTG_HS) != HAL_OK) {
        return USBD_FAIL;
    }

    /* Sizes in 32-bit words, from the vendor package. The shared receive FIFO
       has to hold a full high-speed packet plus the peripheral's own status
       entries, which is why it dwarfs the two transmit FIFOs. */
    (void)HAL_PCDEx_SetRxFiFo(&hpcd_USB_OTG_HS, 0x200);
    (void)HAL_PCDEx_SetTxFiFo(&hpcd_USB_OTG_HS, 0, 0x40);
    (void)HAL_PCDEx_SetTxFiFo(&hpcd_USB_OTG_HS, 1, 0x80);

    return USBD_OK;
}

USBD_StatusTypeDef USBD_LL_DeInit(USBD_HandleTypeDef *pdev)
{
    return (HAL_PCD_DeInit(pdev->pData) == HAL_OK) ? USBD_OK : USBD_FAIL;
}

USBD_StatusTypeDef USBD_LL_Start(USBD_HandleTypeDef *pdev)
{
    return (HAL_PCD_Start(pdev->pData) == HAL_OK) ? USBD_OK : USBD_FAIL;
}

USBD_StatusTypeDef USBD_LL_Stop(USBD_HandleTypeDef *pdev)
{
    return (HAL_PCD_Stop(pdev->pData) == HAL_OK) ? USBD_OK : USBD_FAIL;
}

USBD_StatusTypeDef USBD_LL_OpenEP(USBD_HandleTypeDef *pdev, uint8_t ep_addr,
                                  uint8_t ep_type, uint16_t ep_mps)
{
    return (HAL_PCD_EP_Open(pdev->pData, ep_addr, ep_mps, ep_type) == HAL_OK)
        ? USBD_OK : USBD_FAIL;
}

USBD_StatusTypeDef USBD_LL_CloseEP(USBD_HandleTypeDef *pdev, uint8_t ep_addr)
{
    return (HAL_PCD_EP_Close(pdev->pData, ep_addr) == HAL_OK)
        ? USBD_OK : USBD_FAIL;
}

USBD_StatusTypeDef USBD_LL_FlushEP(USBD_HandleTypeDef *pdev, uint8_t ep_addr)
{
    return (HAL_PCD_EP_Flush(pdev->pData, ep_addr) == HAL_OK)
        ? USBD_OK : USBD_FAIL;
}

USBD_StatusTypeDef USBD_LL_StallEP(USBD_HandleTypeDef *pdev, uint8_t ep_addr)
{
    return (HAL_PCD_EP_SetStall(pdev->pData, ep_addr) == HAL_OK)
        ? USBD_OK : USBD_FAIL;
}

USBD_StatusTypeDef USBD_LL_ClearStallEP(USBD_HandleTypeDef *pdev, uint8_t ep_addr)
{
    return (HAL_PCD_EP_ClrStall(pdev->pData, ep_addr) == HAL_OK)
        ? USBD_OK : USBD_FAIL;
}

uint8_t USBD_LL_IsStallEP(USBD_HandleTypeDef *pdev, uint8_t ep_addr)
{
    PCD_HandleTypeDef *hpcd = (PCD_HandleTypeDef *)pdev->pData;

    if ((ep_addr & 0x80U) == 0x80U) {
        return hpcd->IN_ep[ep_addr & 0x7FU].is_stall;
    }
    return hpcd->OUT_ep[ep_addr & 0x7FU].is_stall;
}

USBD_StatusTypeDef USBD_LL_SetUSBAddress(USBD_HandleTypeDef *pdev, uint8_t dev_addr)
{
    return (HAL_PCD_SetAddress(pdev->pData, dev_addr) == HAL_OK)
        ? USBD_OK : USBD_FAIL;
}

USBD_StatusTypeDef USBD_LL_Transmit(USBD_HandleTypeDef *pdev, uint8_t ep_addr,
                                    uint8_t *pbuf, uint32_t size)
{
    return (HAL_PCD_EP_Transmit(pdev->pData, ep_addr, pbuf, size) == HAL_OK)
        ? USBD_OK : USBD_FAIL;
}

USBD_StatusTypeDef USBD_LL_PrepareReceive(USBD_HandleTypeDef *pdev, uint8_t ep_addr,
                                          uint8_t *pbuf, uint32_t size)
{
    return (HAL_PCD_EP_Receive(pdev->pData, ep_addr, pbuf, size) == HAL_OK)
        ? USBD_OK : USBD_FAIL;
}

uint32_t USBD_LL_GetRxDataSize(USBD_HandleTypeDef *pdev, uint8_t ep_addr)
{
    return HAL_PCD_EP_GetRxCount(pdev->pData, ep_addr);
}
