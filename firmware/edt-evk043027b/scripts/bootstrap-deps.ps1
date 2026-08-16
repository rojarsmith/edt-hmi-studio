[CmdletBinding()]
param(
    [string]$CacheRoot = "",
    [string]$VendorRoot = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Windows PowerShell repaints the progress bar on every read, which is the
# difference between minutes and seconds on the large archives below.
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$boardRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if ([string]::IsNullOrWhiteSpace($CacheRoot)) {
    $CacheRoot = Join-Path $boardRoot ".hmi-cache"
}
$CacheRoot = [IO.Path]::GetFullPath($CacheRoot)

if ($CacheRoot -eq [IO.Path]::GetPathRoot($CacheRoot)) {
    throw "Refusing to use a filesystem root as the dependency cache."
}

$downloadsRoot = Join-Path $CacheRoot ".downloads"
$stagingRoot = Join-Path $CacheRoot ".staging"
New-Item -ItemType Directory -Force -Path $CacheRoot, $downloadsRoot, $stagingRoot | Out-Null

# A transfer cut short by a build timeout leaves a partial *.download behind.
# Nothing resumes those, and a re-pinned dependency orphans them under the old
# name, so sweep them rather than let the cache grow without bound.
Get-ChildItem -LiteralPath $downloadsRoot -Filter "*.download" -File -ErrorAction SilentlyContinue |
    Remove-Item -Force

if ([string]::IsNullOrWhiteSpace($VendorRoot)) {
    $VendorRoot = if ([string]::IsNullOrWhiteSpace($env:HMI_VENDOR_ROOT)) {
        Join-Path $boardRoot "..\vendor"
    } else {
        $env:HMI_VENDOR_ROOT
    }
}
$VendorRoot = [IO.Path]::GetFullPath($VendorRoot)

function Get-ArchiveCommit {
    param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    # GitHub stamps the source commit into the archive's end-of-central-directory
    # comment. Reading it is what lets a hand-downloaded zip satisfy a pin: the
    # filename is whatever the browser chose, but the commit cannot be faked by
    # renaming, so a vendored archive is held to the same pin as a fetched one.
    try {
        $stream = [IO.File]::OpenRead($Path)
    } catch {
        return ""
    }
    try {
        $tailSize = [Math]::Min(512, $stream.Length)
        if ($tailSize -lt 22) {
            return ""
        }
        $stream.Seek(-$tailSize, [IO.SeekOrigin]::End) | Out-Null
        $tail = New-Object byte[] $tailSize
        $read = 0
        while ($read -lt $tailSize) {
            $chunk = $stream.Read($tail, $read, $tailSize - $read)
            if ($chunk -le 0) { break }
            $read += $chunk
        }
    } finally {
        $stream.Dispose()
    }

    for ($offset = $tailSize - 22; $offset -ge 0; $offset--) {
        if ($tail[$offset] -eq 0x50 -and $tail[$offset + 1] -eq 0x4B -and
            $tail[$offset + 2] -eq 0x05 -and $tail[$offset + 3] -eq 0x06) {
            $length = [BitConverter]::ToUInt16($tail, $offset + 20)
            if ($length -le 0 -or ($offset + 22 + $length) -gt $tailSize) {
                return ""
            }
            return [Text.Encoding]::ASCII.GetString($tail, $offset + 22, $length).Trim()
        }
    }
    return ""
}

# Index the drop-in directory by commit once, rather than re-reading every
# archive for each of the pins below.
$vendoredArchives = @{}
if (Test-Path -LiteralPath $VendorRoot -PathType Container) {
    foreach ($candidate in (Get-ChildItem -LiteralPath $VendorRoot -Filter "*.zip" -File)) {
        $candidateCommit = Get-ArchiveCommit -Path $candidate.FullName
        if ($candidateCommit -match "^[0-9a-f]{40}$" -and
            -not $vendoredArchives.ContainsKey($candidateCommit)) {
            $vendoredArchives[$candidateCommit] = $candidate.FullName
        }
    }
}

function Get-PinnedFile {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    if (Test-Path -LiteralPath $Destination -PathType Leaf) {
        return
    }

    $parent = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    $temporary = "$Destination.download"
    Write-Host "Downloading $Uri"

    # Invoke-WebRequest buffers the whole body before it writes anything, so a
    # dropped connection on the ~100 MB LVGL archive costs the entire transfer
    # and the caller's build timeout with it. WebClient streams to disk, and the
    # retry absorbs the transient resets codeload hands out under load.
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        if (Test-Path -LiteralPath $temporary) {
            Remove-Item -LiteralPath $temporary -Force
        }
        $client = New-Object System.Net.WebClient
        $client.Headers.Add("User-Agent", "edt-hmi-studio-bootstrap")
        try {
            $client.DownloadFile($Uri, $temporary)
            break
        } catch {
            if ($attempt -ge 3) {
                throw "Failed to download $Uri after $attempt attempts: $($_.Exception.Message)"
            }
            Write-Host "  attempt $attempt failed, retrying: $($_.Exception.Message)"
            Start-Sleep -Seconds (2 * $attempt)
        } finally {
            $client.Dispose()
        }
    }

    if ((Get-Item -LiteralPath $temporary).Length -eq 0) {
        throw "Downloaded an empty file from $Uri"
    }
    Move-Item -LiteralPath $temporary -Destination $Destination -Force
}

function Install-PinnedArchive {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)][string]$Target,
        [Parameter(Mandatory = $true)][string]$Sentinel
    )

    $sentinelPath = Join-Path $Target $Sentinel
    $versionMarker = Join-Path $Target ".hmi-version-$Name"
    if ((Test-Path -LiteralPath $sentinelPath -PathType Leaf) -and
        (Test-Path -LiteralPath $versionMarker -PathType Leaf)) {
        Write-Host "Using cached $Name"
        return
    }

    $archive = Join-Path $downloadsRoot "$Name.zip"
    if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) {
        # An archive dropped into the vendor directory is used in place of the
        # download when it carries the pinned commit, which turns a ~100 MB
        # transfer into a local read. See firmware/vendor/README.md.
        $commit = ($Uri -split "/")[-1]
        if ($commit -match "^[0-9a-f]{40}$" -and $vendoredArchives.ContainsKey($commit)) {
            $archive = $vendoredArchives[$commit]
            Write-Host "Using vendored $Name from $archive"
        } else {
            Get-PinnedFile -Uri $Uri -Destination $archive
        }
    }

    $stage = Join-Path $stagingRoot $Name
    if (Test-Path -LiteralPath $stage) {
        Remove-Item -LiteralPath $stage -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $stage | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $stage -Force

    $sourceRoot = Get-ChildItem -LiteralPath $stage -Directory | Select-Object -First 1
    if ($null -eq $sourceRoot) {
        throw "Archive $archive did not contain a root directory."
    }

    if (Test-Path -LiteralPath $Target) {
        Remove-Item -LiteralPath $Target -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
    Move-Item -LiteralPath $sourceRoot.FullName -Destination $Target
    Set-Content -LiteralPath $versionMarker -Value $Name -Encoding ASCII

    if (-not (Test-Path -LiteralPath $sentinelPath -PathType Leaf)) {
        throw "$Name is incomplete; missing $sentinelPath"
    }
}

# Far shorter than the Discovery boards' lists, because this board has no ST
# BSP to assemble from component drivers -- it is not an ST kit. The panel,
# touch and OctoSPI NOR drivers are vendored under vendor/ instead; only the
# genuinely upstream pieces are fetched here.
#
# The HAL and CMSIS pins are the versions the EVK043027B vendor package ships
# (HAL v1.6.2, CMSIS device v1.4.2), so the firmware is built against the code
# the board was brought up on rather than whatever is newest.
Install-PinnedArchive `
    -Name "stm32u5xx-hal-driver-2c5e256" `
    -Uri "https://codeload.github.com/STMicroelectronics/stm32u5xx-hal-driver/zip/2c5e2568fbdb1900a13ca3b2901fdd302cac3444" `
    -Target (Join-Path $CacheRoot "Drivers\STM32U5xx_HAL_Driver") `
    -Sentinel "Src\stm32u5xx_hal.c"

Install-PinnedArchive `
    -Name "cmsis-device-u5-6e67187" `
    -Uri "https://codeload.github.com/STMicroelectronics/cmsis-device-u5/zip/6e67187dec98035893692ab2923914cb5f4e0117" `
    -Target (Join-Path $CacheRoot "Drivers\CMSIS\Device\ST\STM32U5xx") `
    -Sentinel "Source\Templates\gcc\startup_stm32u599xx.s"

# The USB device stack behind the Type-C virtual COM port. ST's own middleware,
# and the only part of the USB path that is genuinely upstream — the descriptors
# and the low-level glue are board specific and live in src/.
Install-PinnedArchive `
    -Name "stm32-usb-device-2df324b" `
    -Uri "https://codeload.github.com/STMicroelectronics/stm32_mw_usb_device/zip/2df324bd60d4b0bb27404fd70b1c089b467f0e09" `
    -Target (Join-Path $CacheRoot "Middlewares\ST\STM32_USB_Device_Library") `
    -Sentinel "Core\Src\usbd_core.c"

Install-PinnedArchive `
    -Name "lvgl-85aa60d" `
    -Uri "https://codeload.github.com/lvgl/lvgl/zip/85aa60d18b3d5e5588d7b247abf90198f07c8a63" `
    -Target (Join-Path $CacheRoot "Middlewares\Third_Party\lvgl") `
    -Sentinel "src\lv_init.c"

# CMSIS Core v5.6.0, not the v5.4.0 the two Discovery boards pin: the Cortex-M33
# in this part is Armv8-M, and core_cm33.h with its mpu_armv8.h only arrived in
# v5.6. Fetched file by file because only a handful of the repository's headers
# are reachable from core_cm33.h.
$cmsisCoreRoot = Join-Path $CacheRoot "Drivers\CMSIS\Core"
$cmsisCoreInclude = Join-Path $cmsisCoreRoot "Include"
$cmsisCoreCommit = "96d6da4e252b06dcfdc041e7df23e86161c33007"
foreach ($file in @(
    "core_cm33.h",
    "cmsis_version.h",
    "cmsis_compiler.h",
    "cmsis_gcc.h",
    "mpu_armv8.h"
)) {
    Get-PinnedFile `
        -Uri "https://raw.githubusercontent.com/STMicroelectronics/cmsis-core/$cmsisCoreCommit/Core/Include/$file" `
        -Destination (Join-Path $cmsisCoreInclude $file)
}
Get-PinnedFile `
    -Uri "https://raw.githubusercontent.com/STMicroelectronics/cmsis-core/$cmsisCoreCommit/LICENSE.txt" `
    -Destination (Join-Path $cmsisCoreRoot "LICENSE.txt")

$manifest = @"
STM32U5 HAL v1.6.2 2c5e2568fbdb1900a13ca3b2901fdd302cac3444
CMSIS Device U5 v1.4.2 6e67187dec98035893692ab2923914cb5f4e0117
CMSIS Core v5.6.0 96d6da4e252b06dcfdc041e7df23e86161c33007
STM32 USB Device Library v2.11.6 2df324bd60d4b0bb27404fd70b1c089b467f0e09
LVGL v9.5.0 85aa60d18b3d5e5588d7b247abf90198f07c8a63
MX25LM51245G vendored, see vendor/README.md
EDT board drivers vendored, see vendor/README.md
"@
Set-Content -LiteralPath (Join-Path $CacheRoot "DEPENDENCIES.txt") -Value $manifest -Encoding ASCII

Write-Host "Dependency cache ready: $CacheRoot"
