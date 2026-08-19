/*
 * STM32F746NGHx memory layout.
 *
 * DMA-visible data is deliberately placed in SRAM1/SRAM2 (RAM).  The
 * Cortex-M7-only DTCM is reserved for the process stack and C heap.  The
 * display framebuffer remains in the board's external SDRAM at 0xC0000000,
 * and LVGL's heap now shares that SDRAM through the .sdram section - see
 * include/lv_conf.h for why it cannot stay in internal RAM.
 */

ENTRY(Reset_Handler)

_estack = ORIGIN(DTCMRAM) + LENGTH(DTCMRAM);
_Min_Heap_Size = 0x800;
_Min_Stack_Size = 0x2000;

MEMORY
{
    ITCMRAM (xrw) : ORIGIN = 0x00000000, LENGTH = 16K
    FLASH   (rx)  : ORIGIN = 0x08000000, LENGTH = 1024K
    DTCMRAM (xrw) : ORIGIN = 0x20000000, LENGTH = 64K
    RAM     (xrw) : ORIGIN = 0x20010000, LENGTH = 240K
    /* The first megabyte belongs to the two LTDC frame buffers: the BSP fixes
       them at LCD_FB_START_ADDRESS (0xC0000000) and board_display.c places
       them back to back, 2 x 480 x 272 x 2 = 510 KB. The linker's region
       starts above them so nothing it lays out - LVGL's heap above all - can
       land on a frame buffer. */
    SDRAM   (xrw) : ORIGIN = 0xC0100000, LENGTH = 7M
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
    } > RAM AT > FLASH

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
    } > RAM

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
