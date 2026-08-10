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

# Each archive URL resolves an immutable upstream commit.  This avoids the
# multi-hundred-megabyte STM32CubeF7 monorepo while retaining ST's official
# HAL, CMSIS Device and BSP sources.
Install-PinnedArchive `
    -Name "stm32f7xx-hal-driver-e1446fa" `
    -Uri "https://codeload.github.com/STMicroelectronics/stm32f7xx-hal-driver/zip/e1446fa12ffda80ea1016faf349e45b2047fff12" `
    -Target (Join-Path $CacheRoot "Drivers\STM32F7xx_HAL_Driver") `
    -Sentinel "Src\stm32f7xx_hal.c"

Install-PinnedArchive `
    -Name "cmsis-device-f7-2352e88" `
    -Uri "https://codeload.github.com/STMicroelectronics/cmsis-device-f7/zip/2352e888e821aa0f4fe549bd5ea81d29c67a3222" `
    -Target (Join-Path $CacheRoot "Drivers\CMSIS\Device\ST\STM32F7xx") `
    -Sentinel "Source\Templates\gcc\startup_stm32f746xx.s"

Install-PinnedArchive `
    -Name "32f746gdiscovery-bsp-b639a33" `
    -Uri "https://codeload.github.com/STMicroelectronics/32f746gdiscovery-bsp/zip/b639a332a6cbe6884b3d8701d8ca90595c512388" `
    -Target (Join-Path $CacheRoot "Drivers\BSP\STM32746G-Discovery") `
    -Sentinel "stm32746g_discovery_lcd.c"

Install-PinnedArchive `
    -Name "stm32-rk043fn48h-448cfae" `
    -Uri "https://codeload.github.com/STMicroelectronics/stm32-rk043fn48h/zip/448cfae87110a37df9e490c48f3e21d12196b5c9" `
    -Target (Join-Path $CacheRoot "Drivers\BSP\Components\rk043fn48h") `
    -Sentinel "rk043fn48h.h"

Install-PinnedArchive `
    -Name "stm32-bsp-common-1e18c5a" `
    -Uri "https://codeload.github.com/STMicroelectronics/stm32-bsp-common/zip/1e18c5afdf1f5971a35c8e2f88b6a21e5568ed92" `
    -Target (Join-Path $CacheRoot "Drivers\BSP\Components\Common") `
    -Sentinel "ts.h"

Install-PinnedArchive `
    -Name "stm32-ft5336-8edacf0" `
    -Uri "https://codeload.github.com/STMicroelectronics/stm32-ft5336/zip/8edacf0e2195deceec0c1644ebaadc05fea62b93" `
    -Target (Join-Path $CacheRoot "Drivers\BSP\Components\ft5336") `
    -Sentinel "ft5336.c"

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

$cubeF7Commit = "e5939c26775f313f376b68c80c2a212a795a2993"
$fontsRoot = Join-Path $CacheRoot "Utilities\Fonts"
foreach ($file in @(
    "fonts.h",
    "font24.c",
    "font20.c",
    "font16.c",
    "font12.c",
    "font8.c"
)) {
    Get-PinnedFile `
        -Uri "https://raw.githubusercontent.com/STMicroelectronics/STM32CubeF7/$cubeF7Commit/Utilities/Fonts/$file" `
        -Destination (Join-Path $fontsRoot $file)
}

$manifest = @"
STM32F7 HAL v1.3.3 e1446fa12ffda80ea1016faf349e45b2047fff12
CMSIS Device F7 v1.2.10 2352e888e821aa0f4fe549bd5ea81d29c67a3222
CMSIS Core v5.4.0 9f95ff5b6ba01db09552b84a0ab79607060a2666
32F746GDISCOVERY BSP b639a332a6cbe6884b3d8701d8ca90595c512388
RK043FN48H 448cfae87110a37df9e490c48f3e21d12196b5c9
BSP Common 1e18c5afdf1f5971a35c8e2f88b6a21e5568ed92
FT5336 8edacf0e2195deceec0c1644ebaadc05fea62b93
LVGL v9.5.0 85aa60d18b3d5e5588d7b247abf90198f07c8a63
STM32CubeF7 fonts v1.17.4 e5939c26775f313f376b68c80c2a212a795a2993
"@
Set-Content -LiteralPath (Join-Path $CacheRoot "DEPENDENCIES.txt") -Value $manifest -Encoding ASCII

Write-Host "Dependency cache ready: $CacheRoot"
