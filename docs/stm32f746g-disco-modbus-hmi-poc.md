# STM32F746G-DISCO Modbus HMI PoC

This branch contains an end-to-end proof of concept that turns an EDT GUI Studio
project into firmware for the STM32F746G-DISCO without editing C code.

## What is included

- Board selection for `STM32F746G-DISCO` with its fixed 480 x 272 RGB565
  display profile.
- A project-level Modbus RTU client configuration page with selectable Windows
  COM port, baud rate, parity, stop bits, unit ID, timeout, retry count and
  polling interval.
- A reusable tag table for coils, discrete inputs, input registers and holding
  registers.
- Per-widget Modbus bindings for reading widget properties and writing coils or
  registers. A binding can use a tag or a direct address.
- Generated LVGL UI, generated Modbus binding descriptors and an STM32F746
  runtime containing display, touch and Modbus RTU support.
- Local build and download endpoints used by the Web editor.
- SWD programming and verification through `STM32_Programmer_CLI.exe`.

Supported client functions are FC01, FC02, FC03, FC04, FC05, FC06 and FC16.
The runtime uses USART1 on PA9/PB7, which is connected to the ST-LINK Virtual
COM Port on the Discovery board.

Modbus transactions use an interrupt-driven state machine. Serial timeouts and
retries therefore do not block the LVGL loop; operator writes take priority
over background reads, and rapid slider changes are coalesced to the latest
value.

## Requirements

- Windows and an attached STM32F746G-DISCO.
- Node.js dependencies installed with `npm install`.
- STM32CubeCLT at `C:\ST\STM32CubeCLT_1.22.0`. A different absolute directory
  can be supplied through `STM32_CUBE_CLT_ROOT`.
- Internet access for the first firmware build. The bootstrap script downloads
  pinned official STM32CubeF7, CMSIS and LVGL sources into the target's
  `.hmi-cache` directory. Archives already present in `firmware/vendor` are used
  instead of being fetched — see `firmware/vendor/README.md`, which matters most
  for LVGL at ~100 MB.

The local HMI service is intentionally exposed only by the Vite development or
preview server and accepts only loopback browser origins.

## Quick validation

1. Start the editor:

   ```powershell
   npm run dev
   ```

2. Open `http://127.0.0.1:5173`.
3. Create a project and select `STM32F746G-DISCO`, or import
   `examples\f746-modbus-hmi.json`.
4. Open **Communication**, refresh the ports, and select the ST-LINK port. It
   was COM5 during development, but Windows can assign a different number.
5. Configure the Modbus tags and bind widgets from the widget property editor.
6. Select **Build firmware**. The resulting `.hex`, `.bin`, `.elf` and `.map`
   files can be downloaded from the editor.
7. Select **Flash board**. The editor identifies the matching ST-LINK probe and
   programs the `.hex` over SWD, verifies it, then resets the MCU.

The COM selection is for Modbus communication. Flashing always uses SWD and
does not consume the COM port.

## PC Modbus RTU test server

Close other applications that have opened the board's COM port, then run:

```powershell
powershell -ExecutionPolicy Bypass -File `
  tools\modbus-rtu-test-server.ps1 `
  -Port COM5 -BaudRate 9600 -Parity None -StopBits 1 -UnitId 1 `
  -TraceFrames
```

The sample project reads holding registers 0 and 1, writes register 1 from the
slider and toggles coil 0 from the button. The test server initializes registers
0 and 1 to 123 and 25. Its default console is a fixed dashboard: every Modbus
reference keeps the same row while its value, read/write counters and last
access time are updated in place. `-TraceFrames` adds the latest RX and TX hex
frames to fixed dashboard rows; it does not append a new line per poll.
The default dashboard preloads coils `000001` through `000004` and holding
registers `400001` through `400004`, so these rows remain visible even before
the first request reaches them.

For an append-only packet log during low-level troubleshooting, add
`-RawTrace`. Combining `-RawTrace -TraceFrames` restores the fully verbose
RX/operation/TX output. The dashboard keeps the first 12 accessed references
by default; use `-DashboardRows 24` (up to 64) for a larger project.

### ModRSsim2 settings

Connect the PC to the board's ST-LINK/V2-1 USB Mini-B connector (`CN14`), not
one of the target MCU's USB OTG connectors. On an unmodified board, the VCP is
wired to USART1 on PA9 (target TX) and PB7 (target RX).

The serial settings in the PC server must exactly match the settings compiled
from the editor project. For `examples\f746-modbus-hmi.json`, configure
ModRSsim2 as follows:

| Setting | Sample value |
| --- | --- |
| Port | The current ST-LINK Virtual COM Port, for example `COM5` |
| Protocol | `RS-232 MODBUS` (Modbus RTU) |
| Baud rate | `9600` |
| Data bits | `8` |
| Parity | `None` |
| Stop bits | `1` |
| Client unit ID | `1`; keep ModRSsim2 station `01` enabled |
| RTS / flow control | Always off / none (`R-off` in the title) |
| DTR | Off |

The current sample matches `9600,8,N,1`. If the board still contains an older
`115200` build, changing the editor field alone is not enough: build and flash
the project again. `R-on` is not required by the ST-LINK VCP; use `R-off` to
match the firmware's no-flow-control UART configuration.

The `Connected (1)` text in ModRSsim2 is connection/status information, not
proof that the request unit ID is `1`; verify the `01` station button itself is
enabled.

The editor and generated runtime use zero-based Modbus PDU offsets. ModRSsim2
shows six-digit reference addresses, which add the data-area prefix and one:

| Editor area and address | ModRSsim2 cell | Sample behavior |
| --- | --- | --- |
| Coil `0` | `000001` | Button writes/toggles with FC05 |
| Holding register `0` | `400001` | Label reads with FC03; set it to `123` |
| Holding register `1` | `400002` | Slider reads/writes with FC03/FC06; set it to `25` |

In ModRSsim2, the `Holding Regs (400000)` selector names the data area; it is
not the first register address. The first cell, `400001`, is PDU address `0`.
Values already visible in other cells (for example repeated `28256`) are
simulator memory contents and are not evidence that this firmware wrote them:
the sample only accesses the three cells listed above.

Only one Windows process can own the COM port at a time. Stop the PowerShell
test server before opening the same port in ModRSsim2, and close ModRSsim2
before starting the PowerShell server. If traffic still does not decode, enable
`-TraceFrames`: the dashboard shows the latest RX/TX frames plus discarded-byte
and CRC-error counters, while a wrong baud/parity commonly makes those counters
increase. Use `-RawTrace -TraceFrames` only when a complete chronological packet
log is required.

## PoC boundary

This is a working vertical slice, not yet a production-certified industrial HMI
product. Before field deployment it still needs, at minimum:

- generated custom image/font assets in the firmware build path;
- grouped Modbus reads, richer diagnostics and reconnect/backoff policy for
  larger tag counts;
- project/schema migration, persistent alarms/recipes/trends and localization;
- bootloader/update strategy, signed firmware and role-based editor access;
- watchdog, brownout and fault recovery tests;
- an isolated RS-485 transceiver and EMC/ESD/surge validation for industrial
  wiring. The onboard ST-LINK VCP is a development UART bridge, not an isolated
  RS-485 field interface;
- target hardware validation, endurance testing and any required regulatory or
  functional-safety certification.
