# STM32F746G-DISCO firmware target

The editor normally invokes this target through the local HMI service. For a
standalone diagnostic build:

```powershell
powershell -ExecutionPolicy Bypass -File `
  firmware\stm32f746g-disco\scripts\build.ps1 `
  -ProjectSource <generated-project-source-directory> `
  -OutputDir <output-directory> `
  -ToolchainRoot C:\ST\STM32CubeCLT_1.22.0
```

`ProjectSource` must contain the generated `ui*.c/h` and
`hmi_bindings_generated.c/h` files. Dependencies are pinned and bootstrapped
into `firmware\stm32f746g-disco\.hmi-cache` on the first build.

See [the end-to-end PoC guide](../../docs/stm32f746g-disco-modbus-hmi-poc.md)
for the Web editor, Modbus test server and hardware limitations.
