/*
 * STM32H747XIHx memory layout, Cortex-M7 core.
 *
 * The M7 boots from Flash bank 1 at 0x08000000. Bank 2 (0x08100000) belongs to
 * the Cortex-M4 and is deliberately left out of this image — see
 * docs/stm32h747i-disco-dual-core.md for how the second core is handled.
 *
 * Data lives in AXI SRAM (D1) because it is the largest contiguous block and is
 * reachable by the DMA controllers. The Cortex-M7-only DTCM is reserved for the
 * process stack and C heap. The display frame buffers stay in the board's
 * external SDRAM at 0xD0000000, and LVGL's heap now shares that SDRAM through
 * the .sdram section - see include/lv_conf.h for why it cannot stay in
 * internal RAM.
 */

ENTRY(Reset_Handler)

_estack = ORIGIN(DTCMRAM) + LENGTH(DTCMRAM);
_Min_Heap_Size = 0x800;
_Min_Stack_Size = 0x2000;

MEMORY
{
    ITCMRAM (xrw) : ORIGIN = 0x00000000, LENGTH = 64K
    FLASH   (rx)  : ORIGIN = 0x08000000, LENGTH = 1024K
    DTCMRAM (xrw) : ORIGIN = 0x20000000, LENGTH = 128K
    RAM_D1  (xrw) : ORIGIN = 0x24000000, LENGTH = 512K
    RAM_D2  (xrw) : ORIGIN = 0x30000000, LENGTH = 288K
    RAM_D3  (xrw) : ORIGIN = 0x38000000, LENGTH = 64K
    /* The first 4 MB belongs to the two LTDC frame buffers. The board's
       discovery_conf header fixes them at LCD_LAYER_0_ADDRESS (0xD0000000)
       and LCD_LAYER_1_ADDRESS (0xD0200000), 2 MB apart, and 800 x 480 x 4 is
       1.5 MB each. The linker's region starts above them so nothing it lays
       out - LVGL's heap above all - can land on a frame buffer. */
    SDRAM   (xrw) : ORIGIN = 0xD0400000, LENGTH = 28M
    /* MT25TL01G QSPI NOR, readable at 0x90000000 once memory mapped mode is
       enabled. Image resources live here; nothing is executed from it. */
    EXTFLASH (r)  : ORIGIN = 0x90000000, LENGTH = 128M
}

SECTIONS
{
    .isr_vector :
    {
        . = ALIGN(4);
        KEEP(*(.isr_vector))
        . = ALIGN(4);
    } > FLASH

    .text :
    {
        . = ALIGN(4);
        *(.text)
        *(.text*)
        *(.glue_7)
        *(.glue_7t)
        *(.eh_frame)
        KEEP(*(.init))
        KEEP(*(.fini))
        . = ALIGN(4);
        _etext = .;
    } > FLASH

    .rodata :
    {
        . = ALIGN(4);
        *(.rodata)
        *(.rodata*)
        . = ALIGN(4);
    } > FLASH

    /* Image resources, placed by HMI_IMAGE_ATTRIBUTE in the generated sources.
       NOLOAD is wrong here: the contents are real and are written to the QSPI
       by a separate programming step, so the section has to carry its bytes
       into the ELF for objcopy to extract them. */
    .ext_flash_images :
    {
        . = ALIGN(4);
        __ext_flash_images_start = .;
        *(.ext_flash_images)
        *(.ext_flash_images.*)
        . = ALIGN(4);
        __ext_flash_images_end = .;
    } > EXTFLASH

    /* Converted font glyph bitmaps, placed by LV_ATTRIBUTE_LARGE_CONST in the
       generated font sources. A CJK subset is the largest thing this firmware
       links, and 1 MB of internal flash cannot hold it beside the code.

       Its own section rather than sharing .ext_flash_images: the two are
       programmed together but they are different assets, and the placement
       read back from this map is only useful if a font can be told from an
       image by the section it landed in. Follows the images with no gap, so
       objcopy cuts one contiguous binary for the QSPI. */
    .ext_flash_fonts :
    {
        . = ALIGN(4);
        __ext_flash_fonts_start = .;
        *(.ext_flash_fonts)
        *(.ext_flash_fonts.*)
        . = ALIGN(4);
        __ext_flash_fonts_end = .;
    } > EXTFLASH

    .ARM.extab :
    {
        *(.ARM.extab* .gnu.linkonce.armextab.*)
    } > FLASH

    .ARM.exidx :
    {
        __exidx_start = .;
        *(.ARM.exidx*)
        __exidx_end = .;
    } > FLASH

    .preinit_array :
    {
        PROVIDE_HIDDEN(__preinit_array_start = .);
        KEEP(*(.preinit_array*))
        PROVIDE_HIDDEN(__preinit_array_end = .);
    } > FLASH

    .init_array :
    {
        PROVIDE_HIDDEN(__init_array_start = .);
        KEEP(*(SORT(.init_array.*)))
        KEEP(*(.init_array*))
        PROVIDE_HIDDEN(__init_array_end = .);
    } > FLASH

    .fini_array :
    {
        PROVIDE_HIDDEN(__fini_array_start = .);
        KEEP(*(SORT(.fini_array.*)))
        KEEP(*(.fini_array*))
        PROVIDE_HIDDEN(__fini_array_end = .);
    } > FLASH

    _sidata = LOADADDR(.data);

    .data :
    {
        . = ALIGN(4);
        _sdata = .;
        *(.data)
        *(.data*)
        . = ALIGN(4);
        _edata = .;
    } > RAM_D1 AT > FLASH

    .bss (NOLOAD) :
    {
        . = ALIGN(4);
        _sbss = .;
        __bss_start__ = _sbss;
        *(.bss)
        *(.bss*)
        *(COMMON)
        . = ALIGN(4);
        _ebss = .;
        __bss_end__ = _ebss;
    } > RAM_D1

    .sdram (NOLOAD) :
    {
        . = ALIGN(32);
        __sdram_start__ = .;
        *(.sdram)
        *(.sdram*)
        . = ALIGN(32);
        __sdram_end__ = .;
    } > SDRAM

    ._user_heap_stack (NOLOAD) :
    {
        . = ALIGN(8);
        PROVIDE(end = .);
        PROVIDE(_end = .);
        . += _Min_Heap_Size;
        . += _Min_Stack_Size;
        . = ALIGN(8);
    } > DTCMRAM

    /DISCARD/ :
    {
        *(.note.GNU-stack)
        *(.gnu_debuglink)
        *(.gnu.lto_*)
    }

    .ARM.attributes 0 : { *(.ARM.attributes) }
}
