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
        $client.Headers.Add("User-Agent", "edt-gui-studio-bootstrap")
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

# Each archive URL resolves an immutable upstream commit, mirroring the
# STM32F746G-DISCO template. The H747I-DISCO uses ST's second-generation BSP
# (instance-based API, driven through stm32h747i_discovery_bus.c), so the
# component drivers differ from the F7 board even where the roles match.
Install-PinnedArchive `
    -Name "stm32h7xx-hal-driver-c5e7052" `
    -Uri "https://codeload.github.com/STMicroelectronics/stm32h7xx-hal-driver/zip/c5e70527126710a6415929ff10c1fd1f40394b1e" `
    -Target (Join-Path $CacheRoot "Drivers\STM32H7xx_HAL_Driver") `
    -Sentinel "Src\stm32h7xx_hal.c"

Install-PinnedArchive `
    -Name "cmsis-device-h7-de8243d" `
    -Uri "https://codeload.github.com/STMicroelectronics/cmsis-device-h7/zip/de8243d2c15f87936f28a49fcd9e6f5ba10fc233" `
    -Target (Join-Path $CacheRoot "Drivers\CMSIS\Device\ST\STM32H7xx") `
    -Sentinel "Source\Templates\gcc\startup_stm32h747xx.s"

Install-PinnedArchive `
    -Name "stm32h747i-disco-bsp-c61d8f0" `
    -Uri "https://codeload.github.com/STMicroelectronics/stm32h747i-disco-bsp/zip/c61d8f01d3fa9a03b81c21ce83c0d334150ea3d4" `
    -Target (Join-Path $CacheRoot "Drivers\BSP\STM32H747I-Discovery") `
    -Sentinel "stm32h747i_discovery_lcd.c"

Install-PinnedArchive `
    -Name "stm32-otm8009a-c0229f0" `
    -Uri "https://codeload.github.com/STMicroelectronics/stm32-otm8009a/zip/c0229f087eb3b87a99b392a08b74d2a8933f4aa4" `
    -Target (Join-Path $CacheRoot "Drivers\BSP\Components\otm8009a") `
    -Sentinel "otm8009a.c"

# stm32h747i_discovery_lcd.h includes both panel drivers unconditionally, even
# though USE_LCD_CTRL_NT35510 is 0 for this board's DSI display.
Install-PinnedArchive `
    -Name "stm32-nt35510-0d3008b" `
    -Uri "https://codeload.github.com/STMicroelectronics/stm32-nt35510/zip/0d3008be195d1b0750a6d33cc7e944eea61e2074" `
    -Target (Join-Path $CacheRoot "Drivers\BSP\Components\nt35510") `
    -Sentinel "nt35510.h"

# SDRAM part fitted to this board; stm32h747i_discovery_sdram.h includes it for
# the timing constants.
Install-PinnedArchive `
    -Name "stm32-is42s32800j-d806931" `
    -Uri "https://codeload.github.com/STMicroelectronics/stm32-is42s32800j/zip/d8069315a8ecdd218358d9ae67ca6c4312cf9ed5" `
    -Target (Join-Path $CacheRoot "Drivers\BSP\Components\is42s32800j") `
    -Sentinel "is42s32800j.h"

Install-PinnedArchive `
    -Name "stm32-ft6x06-d4d40ad" `
    -Uri "https://codeload.github.com/STMicroelectronics/stm32-ft6x06/zip/d4d40ad52b495b650222addb4549257c0b9c0059" `
    -Target (Join-Path $CacheRoot "Drivers\BSP\Components\ft6x06") `
    -Sentinel "ft6x06.c"

Install-PinnedArchive `
    -Name "stm32-adv7533-ef0f7e8" `
    -Uri "https://codeload.github.com/STMicroelectronics/stm32-adv7533/zip/ef0f7e8782205a33560f54712ba9b2306b322d96" `
    -Target (Join-Path $CacheRoot "Drivers\BSP\Components\adv7533") `
    -Sentinel "adv7533.h"

# A newer BSP-common than the F7 board pins: the H747I BSP is ST's second
# generation and needs the LCD_UTILS_Drv_t interface, which the older revision
# used by the F746 template predates.
Install-PinnedArchive `
    -Name "stm32-bsp-common-6893c33" `
    -Uri "https://codeload.github.com/STMicroelectronics/stm32-bsp-common/zip/6893c33e9a5ebbcea1b23f3137f8a1d87753947d" `
    -Target (Join-Path $CacheRoot "Drivers\BSP\Components\Common") `
    -Sentinel "ts.h"

# The QSPI NOR fitted to this board, used to hold image resources outside the
# 1 MB internal flash. stm32h747i_discovery_qspi.h includes it directly.
Install-PinnedArchive `
    -Name "stm32-mt25tl01g-d13cf81" `
    -Uri "https://codeload.github.com/STMicroelectronics/stm32-mt25tl01g/zip/d13cf81bba79f9cae3592dfbd9509aeffc884e40" `
    -Target (Join-Path $CacheRoot "Drivers\BSP\Components\mt25tl01g") `
    -Sentinel "mt25tl01g.h"

Install-PinnedArchive `
    -Name "lvgl-85aa60d" `
    -Uri "https://codeload.github.com/lvgl/lvgl/zip/85aa60d18b3d5e5588d7b247abf90198f07c8a63" `
    -Target (Join-Path $CacheRoot "Middlewares\Third_Party\lvgl") `
    -Sentinel "src\lv_init.c"

$cmsisCoreRoot = Join-Path $CacheRoot "Drivers\CMSIS\Core"
$cmsisCoreInclude = Join-Path $cmsisCoreRoot "Include"
$cmsisCoreCommit = "9f95ff5b6ba01db09552b84a0ab79607060a2666"
foreach ($file in @(
    "core_cm7.h",
    "core_cm4.h",
    "cmsis_version.h",
    "cmsis_compiler.h",
    "cmsis_gcc.h",
    "mpu_armv7.h"
)) {
    Get-PinnedFile `
        -Uri "https://raw.githubusercontent.com/STMicroelectronics/cmsis-core/$cmsisCoreCommit/Core/Include/$file" `
        -Destination (Join-Path $cmsisCoreInclude $file)
}
Get-PinnedFile `
    -Uri "https://raw.githubusercontent.com/STMicroelectronics/cmsis-core/$cmsisCoreCommit/LICENSE.txt" `
    -Destination (Join-Path $cmsisCoreRoot "LICENSE.txt")

$manifest = @"
STM32H7 HAL c5e70527126710a6415929ff10c1fd1f40394b1e
CMSIS Device H7 de8243d2c15f87936f28a49fcd9e6f5ba10fc233
CMSIS Core v5.4.0 9f95ff5b6ba01db09552b84a0ab79607060a2666
STM32H747I-DISCO BSP c61d8f01d3fa9a03b81c21ce83c0d334150ea3d4
OTM8009A c0229f087eb3b87a99b392a08b74d2a8933f4aa4
NT35510 0d3008be195d1b0750a6d33cc7e944eea61e2074
IS42S32800J d8069315a8ecdd218358d9ae67ca6c4312cf9ed5
FT6X06 d4d40ad52b495b650222addb4549257c0b9c0059
ADV7533 ef0f7e8782205a33560f54712ba9b2306b322d96
BSP Common 6893c33e9a5ebbcea1b23f3137f8a1d87753947d
MT25TL01G v2.3.0 d13cf81bba79f9cae3592dfbd9509aeffc884e40
LVGL v9.5.0 85aa60d18b3d5e5588d7b247abf90198f07c8a63
"@
Set-Content -LiteralPath (Join-Path $CacheRoot "DEPENDENCIES.txt") -Value $manifest -Encoding ASCII

Write-Host "Dependency cache ready: $CacheRoot"
