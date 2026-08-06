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
add_compile_definitions(
    STM32H747xx
    CORE_CM7
    USE_HAL_DRIVER
    USE_STM32H747I_DISCO
    LV_CONF_INCLUDE_SIMPLE
)

# LVGL reads lv_conf.h through this directory-level include path.  Directory
# properties intentionally precede add_subdirectory so they also reach LVGL.
include_directories("${BOARD_ROOT}/include")
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(LV_CONF_BUILD_DISABLE_EXAMPLES ON CACHE BOOL "" FORCE)
set(LV_CONF_BUILD_DISABLE_DEMOS ON CACHE BOOL "" FORCE)
set(LV_CONF_BUILD_DISABLE_THORVG_INTERNAL ON CACHE BOOL "" FORCE)
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

add_custom_command(TARGET firmware POST_BUILD
    COMMAND "${CMAKE_SIZE}" "$<TARGET_FILE:firmware>"
    COMMAND "${CMAKE_OBJCOPY}" -O ihex
        "$<TARGET_FILE:firmware>" "${HMI_ARTIFACT_DIR}/firmware.hex"
    COMMAND "${CMAKE_OBJCOPY}" -O binary
        "$<TARGET_FILE:firmware>" "${HMI_ARTIFACT_DIR}/firmware.bin"
    VERBATIM
)
