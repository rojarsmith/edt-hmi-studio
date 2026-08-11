cmake_minimum_required(VERSION 3.22)

project(edt_evk043027b_hmi C ASM)

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
set(CMSIS_DEVICE_ROOT "${HMI_DEPS_ROOT}/Drivers/CMSIS/Device/ST/STM32U5xx")
set(HAL_ROOT "${HMI_DEPS_ROOT}/Drivers/STM32U5xx_HAL_Driver")
set(LVGL_ROOT "${HMI_DEPS_ROOT}/Middlewares/Third_Party/lvgl")
# ST's USB device stack, behind the Type-C virtual COM port that carries Modbus.
set(USBD_ROOT "${HMI_DEPS_ROOT}/Middlewares/ST/STM32_USB_Device_Library")
# There is no ST BSP for this board — it is not an ST Discovery kit. The panel,
# touch controller and OctoSPI NOR drivers are vendored instead; see
# vendor/README.md.
set(VENDOR_ROOT "${BOARD_ROOT}/vendor")

set(CPU_FLAGS
    -mcpu=cortex-m33
    -mthumb
    -mfpu=fpv5-sp-d16
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

# HMI_IMAGES_IN_EXTERNAL_FLASH is deliberately *not* defined here, unlike the
# STM32H747I-DISCO template it was adapted from. Image pixel data stays in the
# 2 MB internal flash alongside the code, which it comfortably fits in — see
# src/types/hmi.ts and docs/edt-evk043027b.md §4. Defining it moves images into
# the OctoSPI NOR and makes every flash depend on an external loader that does
# not currently work on this board.
add_compile_definitions(
    STM32U599xx
    USE_HAL_DRIVER
    LV_CONF_INCLUDE_SIMPLE
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
    "${HAL_ROOT}/Src/stm32u5xx_hal.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_cortex.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_dcache.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_dma.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_dma_ex.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_exti.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_flash.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_flash_ex.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_gpio.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_i2c.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_i2c_ex.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_icache.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_ltdc.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_ospi.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_pcd.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_pcd_ex.c"
    "${HAL_ROOT}/Src/stm32u5xx_ll_usb.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_pwr.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_pwr_ex.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_rcc.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_rcc_ex.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_tim.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_tim_ex.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_uart.c"
    "${HAL_ROOT}/Src/stm32u5xx_hal_uart_ex.c"
)

set(USBD_SOURCES
    "${USBD_ROOT}/Core/Src/usbd_core.c"
    "${USBD_ROOT}/Core/Src/usbd_ctlreq.c"
    "${USBD_ROOT}/Core/Src/usbd_ioreq.c"
    "${USBD_ROOT}/Class/CDC/Src/usbd_cdc.c"
)

set(VENDOR_SOURCES
    # Macronix OctoSPI NOR holding the image resources (ST component driver).
    "${VENDOR_ROOT}/st/mx25lm51245g.c"
    # Atmel maXTouch controller behind the capacitive panel (EDT drivers).
    "${VENDOR_ROOT}/edt/edt_bsp_ctp.c"
    "${VENDOR_ROOT}/edt/ctp/mxt336u.c"
)

file(GLOB BOARD_SOURCES CONFIGURE_DEPENDS "${BOARD_ROOT}/src/*.c")
file(GLOB GENERATED_SOURCES CONFIGURE_DEPENDS "${HMI_PROJECT_SOURCE}/*.c")

add_executable(firmware
    ${BOARD_SOURCES}
    ${GENERATED_SOURCES}
    ${HAL_SOURCES}
    ${USBD_SOURCES}
    ${VENDOR_SOURCES}
    "${CMSIS_DEVICE_ROOT}/Source/Templates/system_stm32u5xx.c"
    "${CMSIS_DEVICE_ROOT}/Source/Templates/gcc/startup_stm32u599xx.s"
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
    "${USBD_ROOT}/Core/Inc"
    "${USBD_ROOT}/Class/CDC/Inc"
    "${VENDOR_ROOT}/st"
    # The EDT drivers include each other as "Common/ts.h" and "ctp/mxt336u.h",
    # so this directory — not its subdirectories — is what goes on the path.
    "${VENDOR_ROOT}/edt"
    "${LVGL_ROOT}"
    "${LVGL_ROOT}/src"
)

# The editor currently emits the LVGL v8 short form for buttons even when the
# rest of the source targets v9.  LVGL v9's public implementation is
# lv_button_create, so keep generated projects source-compatible here.
target_compile_definitions(firmware PRIVATE lv_btn_create=lv_button_create)

# The vendored drivers are third-party code carried verbatim so a later vendor
# drop can replace them wholesale. They do not build clean under -Wall -Wextra,
# and patching them would defeat that, so the warnings are silenced for those
# translation units alone rather than for the whole target.
set_source_files_properties(${VENDOR_SOURCES}
    PROPERTIES COMPILE_OPTIONS "-w"
)

target_link_libraries(firmware PRIVATE lvgl m c nosys)

target_link_options(firmware PRIVATE
    ${CPU_FLAGS}
    --specs=nano.specs
    --specs=nosys.specs
    "-T${BOARD_ROOT}/STM32U599NJHXQ_FLASH.ld"
    "-Wl,-Map=${HMI_ARTIFACT_DIR}/firmware.map"
    -Wl,--gc-sections
    -Wl,--cref
)
set_property(TARGET firmware APPEND PROPERTY
    LINK_DEPENDS "${BOARD_ROOT}/STM32U599NJHXQ_FLASH.ld"
)

# .ext_flash_images sits at 0x90000000, two gigabytes past the internal flash.
# A plain `objcopy -O binary` pads the gap, so the two images have to be cut
# apart: firmware.bin is the internal image with that section removed, and
# firmware_extflash.bin is the section on its own, programmed through the
# MX25LM51245G external loader. The .hex drops it too — CubeProgrammer would
# otherwise try to write those records without a loader loaded.
add_custom_command(TARGET firmware POST_BUILD
    COMMAND "${CMAKE_SIZE}" "$<TARGET_FILE:firmware>"
    COMMAND "${CMAKE_OBJCOPY}" -O ihex
        --remove-section .ext_flash_images
        "$<TARGET_FILE:firmware>" "${HMI_ARTIFACT_DIR}/firmware.hex"
    COMMAND "${CMAKE_OBJCOPY}" -O binary
        --remove-section .ext_flash_images
        "$<TARGET_FILE:firmware>" "${HMI_ARTIFACT_DIR}/firmware.bin"
    COMMAND "${CMAKE_OBJCOPY}" -O binary
        -j .ext_flash_images
        "$<TARGET_FILE:firmware>" "${HMI_ARTIFACT_DIR}/firmware_extflash.bin"
    VERBATIM
)
