/*
 * STM32U599NJH6Q memory layout for the EDT EVK043027B.
 *
 * The part has 4 MB of Flash in two 2 MB banks. Only bank 1 is used: the image
 * boots from 0x08000000, and bank 2 is left erased and outside this link. See
 * docs/edt-evk043027b.md — supporting the second bank would mean deciding what
 * lives there and teaching the flasher to program it, and nothing here needs
 * the space.
 *
 * SRAM is one contiguous 2496 KB run from 0x20000000 (SRAM1, SRAM2, SRAM3 and
 * SRAM5 back to back). The split below reserves the first 1024 KB for the two
 * frame buffers and gives the rest to the application, which is where LVGL's
 * heap comes from.
 *
 * FRAMEBUFFER has to match HMI_FRAMEBUFFER_0/1 in src/board_display.c. At
 * ARGB8888 two 480 x 272 x 4 buffers need 1020 KB, so the region is 1024 KB —
 * a third of the part's SRAM, which is what 32-bit colour costs here and the
 * reason this split is worth stating twice.
 */

ENTRY(Reset_Handler)

_estack = ORIGIN(RAM) + LENGTH(RAM);
_Min_Heap_Size = 0x800;
_Min_Stack_Size = 0x2000;

MEMORY
{
    FLASH       (rx)  : ORIGIN = 0x08000000, LENGTH = 2048K
    FRAMEBUFFER (rw)  : ORIGIN = 0x20000000, LENGTH = 1024K
    RAM         (xrw) : ORIGIN = 0x20100000, LENGTH = 1472K
    SRAM4       (xrw) : ORIGIN = 0x28000000, LENGTH = 16K
    /* MX25LM51245G OctoSPI NOR, readable at 0x90000000 once memory mapped mode
       is enabled. Image resources live here; nothing is executed from it. The
       part is 64 MB; the window is declared at the 32 MB the vendor package
       uses, which is more than any project's images. */
    EXTFLASH    (r)   : ORIGIN = 0x90000000, LENGTH = 32M
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
       NOLOAD is wrong here: the contents are real and are written to the NOR
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
        *(.RamFunc)
        *(.RamFunc*)
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

    /* Nothing is placed here by name; the region exists so the linker reports
       an overflow rather than silently overlapping .bss if the frame buffer
       size in board_display.c and the region above ever drift apart. */
    .framebuffer (NOLOAD) :
    {
        . = ALIGN(8);
        __framebuffer_start__ = .;
        *(.framebuffer)
        *(.framebuffer*)
        . = ALIGN(8);
        __framebuffer_end__ = .;
    } > FRAMEBUFFER

    ._user_heap_stack (NOLOAD) :
    {
        . = ALIGN(8);
        PROVIDE(end = .);
        PROVIDE(_end = .);
        . += _Min_Heap_Size;
        . += _Min_Stack_Size;
        . = ALIGN(8);
    } > RAM

    /DISCARD/ :
    {
        *(.note.GNU-stack)
        *(.gnu_debuglink)
        *(.gnu.lto_*)
    }

    .ARM.attributes 0 : { *(.ARM.attributes) }
}
