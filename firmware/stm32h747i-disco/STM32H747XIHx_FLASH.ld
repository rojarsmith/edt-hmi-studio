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
 * external SDRAM at 0xD0000000.
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
    SDRAM   (xrw) : ORIGIN = 0xD0000000, LENGTH = 32M
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
