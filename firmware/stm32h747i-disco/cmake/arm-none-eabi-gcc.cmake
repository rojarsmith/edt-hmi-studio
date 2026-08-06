set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR arm)
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)

if(NOT DEFINED ARM_GCC_ROOT OR ARM_GCC_ROOT STREQUAL "")
    message(FATAL_ERROR "ARM_GCC_ROOT must point at CubeCLT/GNU-tools-for-STM32")
endif()

set(ARM_GCC_ROOT "${ARM_GCC_ROOT}" CACHE PATH "GNU Arm Embedded toolchain root")
list(APPEND CMAKE_TRY_COMPILE_PLATFORM_VARIABLES ARM_GCC_ROOT)

file(TO_CMAKE_PATH "${ARM_GCC_ROOT}" ARM_GCC_ROOT_CMAKE)
set(ARM_GCC_BIN "${ARM_GCC_ROOT_CMAKE}/bin")

find_program(CMAKE_C_COMPILER
    NAMES arm-none-eabi-gcc
    PATHS "${ARM_GCC_BIN}"
    NO_DEFAULT_PATH
    REQUIRED
)
find_program(CMAKE_ASM_COMPILER
    NAMES arm-none-eabi-gcc
    PATHS "${ARM_GCC_BIN}"
    NO_DEFAULT_PATH
    REQUIRED
)
find_program(CMAKE_CXX_COMPILER
    NAMES arm-none-eabi-g++
    PATHS "${ARM_GCC_BIN}"
    NO_DEFAULT_PATH
    REQUIRED
)
find_program(CMAKE_AR
    NAMES arm-none-eabi-ar
    PATHS "${ARM_GCC_BIN}"
    NO_DEFAULT_PATH
    REQUIRED
)
find_program(CMAKE_RANLIB
    NAMES arm-none-eabi-ranlib
    PATHS "${ARM_GCC_BIN}"
    NO_DEFAULT_PATH
    REQUIRED
)
find_program(CMAKE_OBJCOPY
    NAMES arm-none-eabi-objcopy
    PATHS "${ARM_GCC_BIN}"
    NO_DEFAULT_PATH
    REQUIRED
)
find_program(CMAKE_SIZE
    NAMES arm-none-eabi-size
    PATHS "${ARM_GCC_BIN}"
    NO_DEFAULT_PATH
    REQUIRED
)

set(CMAKE_EXECUTABLE_SUFFIX ".elf")
