cmake_minimum_required(VERSION 3.22)

project(stm32h747i_disco_hmi C ASM)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS ON)

foreach(required_variable HMI_PROJECT_SOURCE HMI_DEPS_ROOT HMI_ARTIFACT_DIR)
    if(NOT DEFINED ${required_variable} OR "${${required_variable}}" STREQUAL "")
        message(FATAL_ERROR "${required_variable} must be provided by scripts/build.ps1")
    endif()
endforeach()

file(TO_CMAKE_PATH "${HMI_PROJECT_SOURCE}" HMI_PROJECT_SOURCE)
file(TO_CMAKE_PATH "${HMI_DEPS_ROOT}" HMI_DEPS_ROOT)
file(TO_CMAKE_PATH "${HMI_ARTIFACT_DIR}" HMI_ARTIFACT_DIR)

set(BOARD_ROOT "${CMAKE_CURRENT_SOURCE_DIR}")
set(CMSIS_CORE_ROOT "${HMI_DEPS_ROOT}/Drivers/CMSIS/Core")
set(CMSIS_DEVICE_ROOT "${HMI_DEPS_ROOT}/Drivers/CMSIS/Device/ST/STM32H7xx")
set(HAL_ROOT "${HMI_DEPS_ROOT}/Drivers/STM32H7xx_HAL_Driver")
set(BSP_ROOT "${HMI_DEPS_ROOT}/Drivers/BSP")
set(BOARD_BSP_ROOT "${BSP_ROOT}/STM32H747I-Discovery")
set(LVGL_ROOT "${HMI_DEPS_ROOT}/Middlewares/Third_Party/lvgl")

set(CPU_FLAGS
    -mcpu=cortex-m7
    -mthumb
    -mfpu=fpv5-d16
    -mfloat-abi=hard
)

add_compile_options(
    ${CPU_FLAGS}
    -ffunction-sections
    -fdata-sections
    -fno-common
    -Wall
    -Wextra
    $<$<CONFIG:Release>:-Os>
    $<$<CONFIG:Debug>:-Og>
    $<$<CONFIG:Debug>:-g3>
)
# CORE_CM7 selects the Cortex-M7 half of the dual-core headers; the Cortex-M4
# has no image of its own here, see docs/stm32h747i-disco-dual-core.md.
#
# USE_PWR_DIRECT_SMPS_SUPPLY is board wiring, not a preference: this board is
# hardwired for the SMPS, and the macro is what makes the CMSIS ExitRun0Mode()
# commit that supply from the reset handler — before the C runtime initialises
# RAM, which is not permitted while the part is still in Run* mode. Changing it
# to a supply the board is not wired for leaves the core unpowered and the
# device permanently unreachable over SWD; see the same document.
add_compile_definitions(
    STM32H747xx
    CORE_CM7
    USE_HAL_DRIVER
    USE_STM32H747I_DISCO
    USE_PWR_DIRECT_SMPS_SUPPLY
    LV_CONF_INCLUDE_SIMPLE
    # board_init brings the SDRAM up itself, because LVGL's heap lives there
    # and lv_init runs before the display does. This tells the BSP so, and it
    # skips the BSP_SDRAM_Init inside BSP_LCD_InitEx. See src/board.c.
    DATA_IN_ExtSDRAM
    # Moves generated image pixel data into .ext_flash_images, which the linker
    # script places in the QSPI NOR rather than the 1 MB internal flash.
    # See docs/images-external-flash.md.
    HMI_IMAGES_IN_EXTERNAL_FLASH
    # The same for converted font glyph bitmaps, into .ext_flash_fonts. A CJK
    # subset is the largest thing this firmware links; 1 MB of internal flash
    # cannot hold it beside the code. Board-specific on purpose — a board with
    # no external flash must not define this.
    HMI_FONTS_IN_EXTERNAL_FLASH
)

# LVGL reads lv_conf.h through this directory-level include path.  Directory
# properties intentionally precede add_subdirectory so they also reach LVGL.
include_directories("${BOARD_ROOT}/include")
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
# LVGL v9.5 looks for lv_conf.h in the top-level project directory and fails the
# configure step when it is not there; ours lives under include/.
set(LV_BUILD_CONF_DIR "${BOARD_ROOT}/include" CACHE PATH "" FORCE)
# Examples, demos and the bundled ThorVG all default to ON upstream and would
# otherwise be compiled and linked into the firmware image.
set(CONFIG_LV_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(CONFIG_LV_BUILD_DEMOS OFF CACHE BOOL "" FORCE)
set(CONFIG_LV_USE_THORVG_INTERNAL OFF CACHE BOOL "" FORCE)
add_subdirectory("${LVGL_ROOT}" "${CMAKE_BINARY_DIR}/lvgl" EXCLUDE_FROM_ALL)

set(HAL_SOURCES
    "${HAL_ROOT}/Src/stm32h7xx_hal.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_cortex.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_dma.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_dma_ex.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_dma2d.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_dsi.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_flash.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_flash_ex.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_gpio.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_hsem.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_i2c.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_i2c_ex.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_ltdc.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_ltdc_ex.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_mdma.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_qspi.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_pwr.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_pwr_ex.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_rcc.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_rcc_ex.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_sdram.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_uart.c"
    "${HAL_ROOT}/Src/stm32h7xx_hal_uart_ex.c"
    "${HAL_ROOT}/Src/stm32h7xx_ll_fmc.c"
)

set(BSP_SOURCES
    "${BOARD_BSP_ROOT}/stm32h747i_discovery.c"
    "${BOARD_BSP_ROOT}/stm32h747i_discovery_bus.c"
    "${BOARD_BSP_ROOT}/stm32h747i_discovery_lcd.c"
    "${BOARD_BSP_ROOT}/stm32h747i_discovery_qspi.c"
    "${BOARD_BSP_ROOT}/stm32h747i_discovery_sdram.c"
    "${BOARD_BSP_ROOT}/stm32h747i_discovery_ts.c"
    "${BSP_ROOT}/Components/otm8009a/otm8009a.c"
    "${BSP_ROOT}/Components/otm8009a/otm8009a_reg.c"
    # BSP_LCD_InitEx probes for either panel controller before selecting one, so
    # the NT35510 driver has to be linked even though this board carries the
    # OTM8009A DSI display.
    "${BSP_ROOT}/Components/nt35510/nt35510.c"
    "${BSP_ROOT}/Components/nt35510/nt35510_reg.c"
    "${BSP_ROOT}/Components/ft6x06/ft6x06.c"
    "${BSP_ROOT}/Components/ft6x06/ft6x06_reg.c"
    "${BSP_ROOT}/Components/is42s32800j/is42s32800j.c"
    "${BSP_ROOT}/Components/mt25tl01g/mt25tl01g.c"
)

file(GLOB BOARD_SOURCES CONFIGURE_DEPENDS "${BOARD_ROOT}/src/*.c")
file(GLOB GENERATED_SOURCES CONFIGURE_DEPENDS "${HMI_PROJECT_SOURCE}/*.c")

add_executable(firmware
    ${BOARD_SOURCES}
    ${GENERATED_SOURCES}
    ${HAL_SOURCES}
    ${BSP_SOURCES}
    # Cortex-M7 boots, Cortex-M4 stays gated at the option bytes. This is ST's
    # standard layout for a single-application dual-core part and is what
    # docs/stm32h747i-disco-dual-core.md tells the user to configure.
    "${CMSIS_DEVICE_ROOT}/Source/Templates/system_stm32h7xx_dualcore_bootcm7_cm4gated.c"
    "${CMSIS_DEVICE_ROOT}/Source/Templates/gcc/startup_stm32h747xx.s"
)

set_target_properties(firmware PROPERTIES
    OUTPUT_NAME "firmware"
    SUFFIX ".elf"
    RUNTIME_OUTPUT_DIRECTORY "${HMI_ARTIFACT_DIR}"
)

target_include_directories(firmware PRIVATE
    "${BOARD_ROOT}/include"
    "${HMI_PROJECT_SOURCE}"
    "${CMSIS_CORE_ROOT}/Include"
    "${CMSIS_DEVICE_ROOT}/Include"
    "${HAL_ROOT}/Inc"
    "${HAL_ROOT}/Inc/Legacy"
    "${BSP_ROOT}"
    "${BOARD_BSP_ROOT}"
    "${BSP_ROOT}/Components/Common"
    "${BSP_ROOT}/Components/otm8009a"
    "${BSP_ROOT}/Components/ft6x06"
    "${BSP_ROOT}/Components/is42s32800j"
    "${BSP_ROOT}/Components/mt25tl01g"
    "${LVGL_ROOT}"
    "${LVGL_ROOT}/src"
)

# The editor currently emits the LVGL v8 short form for buttons even when the
# rest of the source targets v9.  LVGL v9's public implementation is
# lv_button_create, so keep generated projects source-compatible here.
target_compile_definitions(firmware PRIVATE lv_btn_create=lv_button_create)

target_link_libraries(firmware PRIVATE lvgl m c nosys)

target_link_options(firmware PRIVATE
    ${CPU_FLAGS}
    --specs=nano.specs
    --specs=nosys.specs
    "-T${BOARD_ROOT}/STM32H747XIHx_FLASH.ld"
    "-Wl,-Map=${HMI_ARTIFACT_DIR}/firmware.map"
    -Wl,--gc-sections
    -Wl,--cref
)
set_property(TARGET firmware APPEND PROPERTY
    LINK_DEPENDS "${BOARD_ROOT}/STM32H747XIHx_FLASH.ld"
)

# The external-flash sections sit at 0x90000000, four gigabytes past the
# internal flash. A plain `objcopy -O binary` pads the gap, so the two images
# have to be cut apart: firmware.bin is the internal image with those sections
# removed, and firmware_extflash.bin is the sections on their own, programmed
# through the MT25TL01G external loader. The .hex drops them too —
# CubeProgrammer would otherwise try to write those records without a loader
# loaded. Both sections are named on every command: one missed here is either
# megabytes of padding in the internal image or a font that is never written.
add_custom_command(TARGET firmware POST_BUILD
    COMMAND "${CMAKE_SIZE}" "$<TARGET_FILE:firmware>"
    COMMAND "${CMAKE_OBJCOPY}" -O ihex
        --remove-section .ext_flash_images
        --remove-section .ext_flash_fonts
        "$<TARGET_FILE:firmware>" "${HMI_ARTIFACT_DIR}/firmware.hex"
    COMMAND "${CMAKE_OBJCOPY}" -O binary
        --remove-section .ext_flash_images
        --remove-section .ext_flash_fonts
        "$<TARGET_FILE:firmware>" "${HMI_ARTIFACT_DIR}/firmware.bin"
    COMMAND "${CMAKE_OBJCOPY}" -O binary
        -j .ext_flash_images
        -j .ext_flash_fonts
        "$<TARGET_FILE:firmware>" "${HMI_ARTIFACT_DIR}/firmware_extflash.bin"
    VERBATIM
)
