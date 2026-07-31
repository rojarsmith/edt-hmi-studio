param(
    [string]$Port = "COM5",
    [int]$BaudRate = 9600,
    [ValidateSet("None", "Even", "Odd")]
    [string]$Parity = "None",
    [ValidateSet(1, 2)]
    [int]$StopBits = 1,
    [ValidateRange(1, 247)]
    [int]$UnitId = 1,
    [switch]$TraceFrames,
    [switch]$RawTrace,
    [ValidateRange(3, 64)]
    [int]$DashboardRows = 12
)

$ErrorActionPreference = "Stop"

function Get-ModbusCrc16 {
    param(
        [byte[]]$Data,
        [int]$Length = $Data.Length
    )

    [uint16]$crc = 0xFFFF
    for ($index = 0; $index -lt $Length; $index++) {
        $crc = $crc -bxor $Data[$index]
        for ($bit = 0; $bit -lt 8; $bit++) {
            if (($crc -band 1) -ne 0) {
                $crc = [uint16](($crc -shr 1) -bxor 0xA001)
            } else {
                $crc = [uint16]($crc -shr 1)
            }
        }
    }
    return $crc
}

function Add-ModbusCrc {
    param([byte[]]$Payload)

    [uint16]$crc = Get-ModbusCrc16 -Data $Payload
    $frame = [byte[]]::new($Payload.Length + 2)
    [Array]::Copy($Payload, $frame, $Payload.Length)
    $frame[$Payload.Length] = [byte]($crc -band 0xFF)
    $frame[$Payload.Length + 1] = [byte](($crc -shr 8) -band 0xFF)
    return $frame
}

function New-ModbusException {
    param(
        [byte]$Address,
        [byte]$Function,
        [byte]$Exception
    )
    return Add-ModbusCrc -Payload ([byte[]]@(
        $Address,
        ($Function -bor 0x80),
        $Exception
    ))
}

function Get-UInt16BigEndian {
    param(
        [byte[]]$Frame,
        [int]$Offset
    )
    # Widen bytes before shifting. PowerShell otherwise preserves [byte] and
    # truncates the shifted high byte back to zero.
    return [uint16]((([int]$Frame[$Offset]) -shl 8) -bor [int]$Frame[$Offset + 1])
}

function Format-HexFrame {
    param([byte[]]$Frame)

    return (($Frame | ForEach-Object { "{0:X2}" -f $_ }) -join " ")
}

function Get-ModbusReference {
    param(
        [ValidateSet("Coil", "Discrete Input", "Input Register", "Holding Register")]
        [string]$Area,
        [int]$Address
    )

    $reference = switch ($Area) {
        "Coil" { 1 + $Address }
        "Discrete Input" { 100001 + $Address }
        "Input Register" { 300001 + $Address }
        "Holding Register" { 400001 + $Address }
    }
    return "{0:D6}" -f $reference
}

function Format-DashboardValue {
    param([object]$Value)

    if ($Value -is [bool]) {
        return $(if ($Value) { "ON (1)" } else { "OFF (0)" })
    }
    return [string]$Value
}

function Write-RawEvent {
    param(
        [string]$Message,
        [switch]$Warning
    )

    if (-not $RawTrace) {
        return
    }
    if ($Warning) {
        Write-Warning $Message
    } else {
        Write-Host $Message
    }
}

function Set-DashboardAddress {
    param(
        [ValidateSet("Coil", "Discrete Input", "Input Register", "Holding Register")]
        [string]$Area,
        [int]$Address,
        [object]$Value,
        [ValidateSet("Init", "Read", "Write")]
        [string]$Action,
        [int]$Function = 0
    )

    $key = "{0}:{1}" -f $Area, $Address
    if (-not $script:dashboardAddresses.Contains($key)) {
        if ($script:dashboardAddresses.Count -ge $script:maxDashboardAddresses) {
            return
        }
        $script:dashboardAddresses[$key] = [pscustomobject]@{
            Area = $Area
            Address = $Address
            Reference = Get-ModbusReference -Area $Area -Address $Address
            Value = Format-DashboardValue $Value
            Reads = 0L
            Writes = 0L
            Last = "initialized"
        }
    }

    $entry = $script:dashboardAddresses[$key]
    $entry.Value = Format-DashboardValue $Value
    if ($Action -eq "Read") {
        $entry.Reads++
        $entry.Last = "R FC{0:D2} {1}" -f $Function, (Get-Date -Format "HH:mm:ss")
    } elseif ($Action -eq "Write") {
        $entry.Writes++
        $entry.Last = "W FC{0:D2} {1}" -f $Function, (Get-Date -Format "HH:mm:ss")
    }
}

function Write-DashboardLine {
    param(
        [int]$Row,
        [string]$Text
    )

    try {
        $width = [Math]::Max(40, [Console]::WindowWidth - 1)
        if ($Text.Length -gt $width) {
            $Text = $Text.Substring(0, $width)
        }
        [Console]::SetCursorPosition(0, $script:dashboardTop + $Row)
        [Console]::Write($Text.PadRight($width))
    } catch {
        $script:dashboardEnabled = $false
    }
}

function Show-Dashboard {
    param([switch]$Force)

    if (-not $script:dashboardEnabled) {
        return
    }

    $now = [DateTime]::UtcNow
    if (-not $Force -and $now -lt $script:nextDashboardRender) {
        return
    }
    $script:nextDashboardRender = $now.AddMilliseconds(80)

    $uptime = [DateTime]::UtcNow - $script:dashboardStartedAt
    Write-DashboardLine 0 (
        "Modbus RTU server | {0} {1},8,{2},{3} | Unit {4} | uptime {5:hh\:mm\:ss}" -f
        $Port, $BaudRate, $Parity, $StopBits, $UnitId, $uptime
    )
    Write-DashboardLine 1 (
        "RX {0,8} | TX {1,8} | CRC errors {2,6} | discarded bytes {3,8} | exceptions {4,6}" -f
        $script:dashboardState.RxFrames,
        $script:dashboardState.TxFrames,
        $script:dashboardState.CrcErrors,
        $script:dashboardState.DiscardedBytes,
        $script:dashboardState.Exceptions
    )
    Write-DashboardLine 2 (
        "{0,-9} {1,-18} {2,-12} {3,9} {4,9} {5,-20}" -f
        "Reference", "Area / PDU", "Value", "Reads", "Writes", "Last access"
    )
    Write-DashboardLine 3 ("-" * 88)

    $row = 4
    foreach ($entry in $script:dashboardAddresses.Values) {
        Write-DashboardLine $row (
            "{0,-9} {1,-18} {2,-12} {3,9} {4,9} {5,-20}" -f
            $entry.Reference,
            ("{0} {1}" -f $entry.Area, $entry.Address),
            $entry.Value,
            $entry.Reads,
            $entry.Writes,
            $entry.Last
        )
        $row++
    }
    while ($row -lt (4 + $script:maxDashboardAddresses)) {
        Write-DashboardLine $row ""
        $row++
    }

    $footerRow = 4 + $script:maxDashboardAddresses
    Write-DashboardLine $footerRow ("Last operation: {0}" -f $script:dashboardState.LastOperation)
    if ($TraceFrames) {
        Write-DashboardLine ($footerRow + 1) ("Last RX: {0}" -f $script:dashboardState.LastRx)
        Write-DashboardLine ($footerRow + 2) ("Last TX: {0}" -f $script:dashboardState.LastTx)
    } else {
        Write-DashboardLine ($footerRow + 1) "Last RX/TX hidden; add -TraceFrames to show the latest frames in place."
        Write-DashboardLine ($footerRow + 2) ""
    }
    Write-DashboardLine ($footerRow + 3) "Ctrl+C to stop. Use -RawTrace for the old append-only packet log."

    try {
        [Console]::SetCursorPosition(0, $script:dashboardBottom)
    } catch {
        $script:dashboardEnabled = $false
    }
}

function Initialize-Dashboard {
    $script:dashboardEnabled = -not $RawTrace
    if ($script:dashboardEnabled) {
        try {
            if ([Console]::IsOutputRedirected -or [Console]::WindowWidth -le 0) {
                $script:dashboardEnabled = $false
            }
        } catch {
            $script:dashboardEnabled = $false
        }
    }
    if (-not $script:dashboardEnabled) {
        return
    }

    $script:dashboardHeight = 8 + $script:maxDashboardAddresses
    try {
        $script:originalCursorVisible = [Console]::CursorVisible
        [Console]::CursorVisible = $false
        for ($line = 0; $line -lt $script:dashboardHeight; $line++) {
            [Console]::WriteLine()
        }
        $script:dashboardBottom = [Console]::CursorTop
        $script:dashboardTop = $script:dashboardBottom - $script:dashboardHeight
        $script:dashboardInitialized = $true
        Show-Dashboard -Force
    } catch {
        $script:dashboardEnabled = $false
    }
}

if ($Port -notmatch '^COM[1-9][0-9]{0,3}$') {
    throw "Invalid serial port: $Port"
}

[System.IO.Ports.Parity]$serialParity = [System.Enum]::Parse(
    [System.IO.Ports.Parity],
    $Parity,
    $true
)
$serialStopBits = if ($StopBits -eq 2) {
    [System.IO.Ports.StopBits]::Two
} else {
    [System.IO.Ports.StopBits]::One
}

$coils = [bool[]]::new(1024)
$discreteInputs = [bool[]]::new(1024)
$holdingRegisters = [uint16[]]::new(1024)
$inputRegisters = [uint16[]]::new(1024)
$holdingRegisters[0] = 123
$holdingRegisters[1] = 25
$inputRegisters[0] = 456
$discreteInputs[0] = $true

$serial = [System.IO.Ports.SerialPort]::new(
    $Port,
    $BaudRate,
    $serialParity,
    8,
    $serialStopBits
)
$serial.ReadTimeout = 100
$serial.WriteTimeout = 500
$serial.Handshake = [System.IO.Ports.Handshake]::None
$serial.DtrEnable = $false
$serial.RtsEnable = $false
$supportedFunctions = [int[]]@(1, 2, 3, 4, 5, 6, 16)
$script:maxDashboardAddresses = $DashboardRows
$script:dashboardAddresses = [ordered]@{}
$script:dashboardState = [pscustomobject]@{
    RxFrames = 0L
    TxFrames = 0L
    CrcErrors = 0L
    DiscardedBytes = 0L
    Exceptions = 0L
    LastOperation = "Waiting for the first request..."
    LastRx = "-"
    LastTx = "-"
}
$script:dashboardStartedAt = [DateTime]::UtcNow
$script:nextDashboardRender = [DateTime]::MinValue
$script:dashboardEnabled = $false
$script:dashboardInitialized = $false
$script:originalCursorVisible = $true

Set-DashboardAddress -Area "Coil" -Address 0 -Value $coils[0] -Action "Init"
Set-DashboardAddress -Area "Coil" -Address 1 -Value $coils[1] -Action "Init"
Set-DashboardAddress -Area "Coil" -Address 2 -Value $coils[2] -Action "Init"
Set-DashboardAddress -Area "Coil" -Address 3 -Value $coils[3] -Action "Init"
Set-DashboardAddress -Area "Holding Register" -Address 0 -Value $holdingRegisters[0] -Action "Init"
Set-DashboardAddress -Area "Holding Register" -Address 1 -Value $holdingRegisters[1] -Action "Init"
Set-DashboardAddress -Area "Holding Register" -Address 2 -Value $holdingRegisters[2] -Action "Init"
Set-DashboardAddress -Area "Holding Register" -Address 3 -Value $holdingRegisters[3] -Action "Init"

try {
    $serial.Open()
    if ($RawTrace) {
        Write-Host (
            "Modbus RTU server listening on {0} at {1},8,{2},{3}; unit {4}; no flow control." -f
            $Port, $BaudRate, $Parity, $StopBits, $UnitId
        )
        Write-Host "PDU holding 0/1 = reference 400001/400002; PDU coil 0 = reference 000001."
        Write-Host "Holding register 0=123, holding register 1=25. Press Ctrl+C to stop."
    } else {
        Initialize-Dashboard
        if (-not $script:dashboardEnabled) {
            Write-Host (
                "Modbus RTU server listening on {0} at {1},8,{2},{3}; unit {4}; dashboard unavailable in this host." -f
                $Port, $BaudRate, $Parity, $StopBits, $UnitId
            )
        }
    }

    $receive = [System.Collections.Generic.List[byte]]::new()
    while ($true) {
        while ($serial.BytesToRead -gt 0) {
            $receive.Add([byte]$serial.ReadByte())
        }

        if ($receive.Count -lt 8) {
            Start-Sleep -Milliseconds 2
            continue
        }

        # A USB serial port may be opened in the middle of a queued RTU frame.
        # Discard one byte at a time until a plausible unit/function prefix is
        # found so a reconnect cannot leave the parser permanently misaligned.
        if (
            $receive[0] -ne $UnitId -or
            $supportedFunctions -notcontains [int]$receive[1]
        ) {
            $script:dashboardState.DiscardedBytes++
            $script:dashboardState.LastOperation = "Discarded prefix byte 0x{0:X2}" -f $receive[0]
            if ($TraceFrames) {
                Write-RawEvent ("RX discard prefix byte: {0:X2}" -f $receive[0])
            }
            $receive.RemoveAt(0)
            Show-Dashboard
            continue
        }

        $function = $receive[1]
        $expectedLength = if ($function -eq 16 -and $receive.Count -ge 7) {
            if ($receive[6] -gt 246 -or ($receive[6] % 2) -ne 0) {
                $receive.RemoveAt(0)
                continue
            }
            9 + $receive[6]
        } else {
            8
        }
        if ($receive.Count -lt $expectedLength) {
            Start-Sleep -Milliseconds 2
            continue
        }

        $request = $receive.GetRange(0, $expectedLength).ToArray()
        [uint16]$requestCrc = [uint16](
            [int]$request[$expectedLength - 2] -bor
            (([int]$request[$expectedLength - 1]) -shl 8)
        )
        [uint16]$calculatedCrc = Get-ModbusCrc16 -Data $request -Length ($expectedLength - 2)
        if ($requestCrc -ne $calculatedCrc) {
            $script:dashboardState.CrcErrors++
            $script:dashboardState.LastRx = Format-HexFrame $request
            $script:dashboardState.LastOperation = "Rejected frame with invalid CRC"
            if ($TraceFrames) {
                Write-RawEvent ("RX rejected (CRC): {0}" -f (Format-HexFrame $request)) -Warning
            }
            $receive.RemoveAt(0)
            Show-Dashboard
            continue
        }
        $receive.RemoveRange(0, $expectedLength)
        $script:dashboardState.RxFrames++
        $script:dashboardState.LastRx = Format-HexFrame $request
        if ($TraceFrames) {
            Write-RawEvent ("RX: {0}" -f (Format-HexFrame $request))
        }
        if ($request[0] -ne $UnitId) {
            continue
        }

        [uint16]$address = Get-UInt16BigEndian -Frame $request -Offset 2
        [uint16]$quantityOrValue = Get-UInt16BigEndian -Frame $request -Offset 4
        [byte[]]$response = $null

        switch ($function) {
            { $_ -eq 1 -or $_ -eq 2 } {
                $quantity = $quantityOrValue
                if ($quantity -lt 1 -or ($address + $quantity) -gt 1024) {
                    $response = New-ModbusException $request[0] $function 2
                    $script:dashboardState.Exceptions++
                    $script:dashboardState.LastOperation =
                        "FC{0:D2} illegal bit address={1} quantity={2}" -f $function, $address, $quantity
                    break
                }
                Write-RawEvent (
                    "FC{0:D2} read bits address={1} quantity={2}" -f
                    $function, $address, $quantity
                )
                $source = if ($function -eq 1) { $coils } else { $discreteInputs }
                $area = if ($function -eq 1) { "Coil" } else { "Discrete Input" }
                $byteCount = [int][Math]::Ceiling($quantity / 8.0)
                $payload = [byte[]]::new(3 + $byteCount)
                $payload[0] = $request[0]
                $payload[1] = $function
                $payload[2] = [byte]$byteCount
                for ($offset = 0; $offset -lt $quantity; $offset++) {
                    if ($source[$address + $offset]) {
                        $payload[3 + [int]($offset / 8)] = [byte](
                            $payload[3 + [int]($offset / 8)] -bor
                            (1 -shl ($offset % 8))
                        )
                    }
                    Set-DashboardAddress `
                        -Area $area `
                        -Address ($address + $offset) `
                        -Value $source[$address + $offset] `
                        -Action "Read" `
                        -Function $function
                }
                $response = Add-ModbusCrc $payload
                $script:dashboardState.LastOperation =
                    "FC{0:D2} read {1} address={2} quantity={3}" -f
                    $function, $area, $address, $quantity
                break
            }
            { $_ -eq 3 -or $_ -eq 4 } {
                $quantity = $quantityOrValue
                if ($quantity -lt 1 -or $quantity -gt 125 -or ($address + $quantity) -gt 1024) {
                    $response = New-ModbusException $request[0] $function 2
                    $script:dashboardState.Exceptions++
                    $script:dashboardState.LastOperation =
                        "FC{0:D2} illegal register address={1} quantity={2}" -f
                        $function, $address, $quantity
                    break
                }
                Write-RawEvent (
                    "FC{0:D2} read registers address={1} quantity={2}" -f
                    $function, $address, $quantity
                )
                $source = if ($function -eq 3) { $holdingRegisters } else { $inputRegisters }
                $area = if ($function -eq 3) { "Holding Register" } else { "Input Register" }
                $payload = [byte[]]::new(3 + (2 * $quantity))
                $payload[0] = $request[0]
                $payload[1] = $function
                $payload[2] = [byte](2 * $quantity)
                for ($offset = 0; $offset -lt $quantity; $offset++) {
                    $value = $source[$address + $offset]
                    $payload[3 + (2 * $offset)] = [byte](($value -shr 8) -band 0xFF)
                    $payload[4 + (2 * $offset)] = [byte]($value -band 0xFF)
                    Set-DashboardAddress `
                        -Area $area `
                        -Address ($address + $offset) `
                        -Value $value `
                        -Action "Read" `
                        -Function $function
                }
                $response = Add-ModbusCrc $payload
                $script:dashboardState.LastOperation =
                    "FC{0:D2} read {1} address={2} quantity={3}" -f
                    $function, $area, $address, $quantity
                break
            }
            5 {
                if ($address -ge 1024 -or ($quantityOrValue -ne 0x0000 -and $quantityOrValue -ne 0xFF00)) {
                    $response = New-ModbusException $request[0] $function 3
                    $script:dashboardState.Exceptions++
                    $script:dashboardState.LastOperation =
                        "FC05 illegal coil write address={0} value=0x{1:X4}" -f
                        $address, $quantityOrValue
                    break
                }
                $coils[$address] = $quantityOrValue -eq 0xFF00
                $response = [byte[]]$request.Clone()
                Set-DashboardAddress `
                    -Area "Coil" `
                    -Address $address `
                    -Value $coils[$address] `
                    -Action "Write" `
                    -Function $function
                $script:dashboardState.LastOperation =
                    "FC05 write Coil address={0} value={1}" -f $address, $coils[$address]
                Write-RawEvent "Coil $address = $($coils[$address])"
                break
            }
            6 {
                if ($address -ge 1024) {
                    $response = New-ModbusException $request[0] $function 2
                    $script:dashboardState.Exceptions++
                    $script:dashboardState.LastOperation =
                        "FC06 illegal holding-register address={0}" -f $address
                    break
                }
                $holdingRegisters[$address] = $quantityOrValue
                $response = [byte[]]$request.Clone()
                Set-DashboardAddress `
                    -Area "Holding Register" `
                    -Address $address `
                    -Value $quantityOrValue `
                    -Action "Write" `
                    -Function $function
                $script:dashboardState.LastOperation =
                    "FC06 write Holding Register address={0} value={1}" -f
                    $address, $quantityOrValue
                Write-RawEvent "Holding register $address = $quantityOrValue"
                break
            }
            16 {
                $quantity = $quantityOrValue
                $byteCount = [int]$request[6]
                if (
                    $quantity -lt 1 -or
                    $quantity -gt 123 -or
                    $byteCount -ne (2 * $quantity) -or
                    ($address + $quantity) -gt 1024
                ) {
                    $response = New-ModbusException $request[0] $function 3
                    $script:dashboardState.Exceptions++
                    $script:dashboardState.LastOperation =
                        "FC16 illegal holding-register write address={0} quantity={1}" -f
                        $address, $quantity
                    break
                }
                for ($offset = 0; $offset -lt $quantity; $offset++) {
                    $holdingRegisters[$address + $offset] =
                        Get-UInt16BigEndian -Frame $request -Offset (7 + (2 * $offset))
                    Set-DashboardAddress `
                        -Area "Holding Register" `
                        -Address ($address + $offset) `
                        -Value $holdingRegisters[$address + $offset] `
                        -Action "Write" `
                        -Function $function
                }
                $response = Add-ModbusCrc -Payload ([byte[]]$request[0..5])
                $script:dashboardState.LastOperation =
                    "FC16 write Holding Registers address={0}..{1}" -f
                    $address, ($address + $quantity - 1)
                Write-RawEvent (
                    "Holding registers $address..$($address + $quantity - 1) updated (FC16)"
                )
                break
            }
            default {
                $response = New-ModbusException $request[0] $function 1
                $script:dashboardState.Exceptions++
                $script:dashboardState.LastOperation =
                    "Unsupported function FC{0:D2}" -f $function
            }
        }

        if ($null -ne $response) {
            $script:dashboardState.LastTx = Format-HexFrame $response
            if ($TraceFrames) {
                Write-RawEvent ("TX: {0}" -f (Format-HexFrame $response))
            }
            $serial.Write($response, 0, $response.Length)
            $script:dashboardState.TxFrames++
        }
        Show-Dashboard
    }
} finally {
    if ($serial.IsOpen) {
        $serial.Close()
    }
    $serial.Dispose()
    if ($script:dashboardInitialized) {
        try {
            Show-Dashboard -Force
            [Console]::SetCursorPosition(0, $script:dashboardBottom)
            [Console]::CursorVisible = $script:originalCursorVisible
            [Console]::WriteLine()
        } catch {
            # The host may already be tearing down after Ctrl+C.
        }
    }
}
