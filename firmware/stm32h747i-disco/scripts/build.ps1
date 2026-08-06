[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ProjectSource,
    [Parameter(Mandatory = $true)][string]$OutputDir,
    [Parameter(Mandatory = $true)][string]$ToolchainRoot
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$boardRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$ProjectSource = [IO.Path]::GetFullPath($ProjectSource)
$OutputDir = [IO.Path]::GetFullPath($OutputDir)
$ToolchainRoot = [IO.Path]::GetFullPath($ToolchainRoot)
$depsRoot = Join-Path $boardRoot ".hmi-cache"
$buildDir = Join-Path $OutputDir "cmake-build"

if (-not (Test-Path -LiteralPath $ProjectSource -PathType Container)) {
    throw "Generated project source directory does not exist: $ProjectSource"
}
foreach ($required in @(
    "ui.c",
    "ui.h",
    "ui_logic.c",
    "ui_logic.h",
    "hmi_bindings_generated.c",
    "hmi_bindings_generated.h"
)) {
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectSource $required) -PathType Leaf)) {
        throw "Generated project source is missing $required"
    }
}

$cmake = Join-Path $ToolchainRoot "CMake\bin\cmake.exe"
$ninja = Join-Path $ToolchainRoot "Ninja\bin\ninja.exe"
$gccRoot = Join-Path $ToolchainRoot "GNU-tools-for-STM32"
foreach ($tool in @($cmake, $ninja, (Join-Path $gccRoot "bin\arm-none-eabi-gcc.exe"))) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
        throw "CubeCLT tool not found: $tool"
    }
}

New-Item -ItemType Directory -Force -Path $OutputDir, $buildDir | Out-Null

& (Join-Path $PSScriptRoot "bootstrap-deps.ps1") -CacheRoot $depsRoot

$toolchainFile = Join-Path $boardRoot "cmake\arm-none-eabi-gcc.cmake"
$configureArguments = @(
    "-S", $boardRoot,
    "-B", $buildDir,
    "-G", "Ninja",
    "-DCMAKE_MAKE_PROGRAM=$ninja",
    "-DCMAKE_TOOLCHAIN_FILE=$toolchainFile",
    "-DARM_GCC_ROOT=$gccRoot",
    "-DHMI_PROJECT_SOURCE=$ProjectSource",
    "-DHMI_DEPS_ROOT=$depsRoot",
    "-DHMI_ARTIFACT_DIR=$OutputDir",
    "-DCMAKE_BUILD_TYPE=Release"
)

Write-Host "Configuring STM32H747I-DISCO firmware"
& $cmake @configureArguments
if ($LASTEXITCODE -ne 0) {
    throw "CMake configure failed with exit code $LASTEXITCODE"
}

Write-Host "Building STM32H747I-DISCO firmware"
# CubeCLT's GCC processes can exhaust Windows process/memory resources when
# Ninja expands to every logical CPU. Keep browser-triggered builds predictable.
$buildJobs = [Math]::Min([Environment]::ProcessorCount, 4)
& $cmake --build $buildDir --target firmware --parallel $buildJobs
if ($LASTEXITCODE -ne 0) {
    throw "Firmware build failed with exit code $LASTEXITCODE"
}

$artifacts = @(
    (Join-Path $OutputDir "firmware.elf"),
    (Join-Path $OutputDir "firmware.hex"),
    (Join-Path $OutputDir "firmware.bin"),
    (Join-Path $OutputDir "firmware.map")
)
foreach ($artifact in $artifacts) {
    if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
        throw "Expected firmware artifact was not produced: $artifact"
    }
    if ((Get-Item -LiteralPath $artifact).Length -eq 0) {
        throw "Firmware artifact is empty: $artifact"
    }
}

Write-Host "Firmware artifacts:"
$artifacts | ForEach-Object {
    $item = Get-Item -LiteralPath $_
    Write-Host ("  {0} ({1} bytes)" -f $item.FullName, $item.Length)
}
