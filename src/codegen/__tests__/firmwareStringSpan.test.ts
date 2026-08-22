/**
 * The editor lets a string binding span up to 64 registers, the generator
 * clamps to the same 64, and every board's runtime decodes up to 64. None of
 * that matters if the board's Modbus client refuses the read before a byte
 * leaves the UART — which is exactly what happened when the client still
 * carried the two-register limit from the days of 32-bit numbers: the QR
 * code's poll was rejected silently, on every tick, and the panel simply
 * never asked the server for the string.
 *
 * So this reads the firmware sources and holds the three numbers together.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BOARDS = ['stm32h747i-disco', 'stm32f746g-disco', 'edt-evk043027b'];
const FIRMWARE = join(__dirname, '..', '..', '..', 'firmware');

/** The editor's and generator's ceiling — see ModbusBindingEditor's Length field. */
const EDITOR_STRING_REGISTERS_MAX = 64;

function define(source: string, name: string): number {
  const match = source.match(new RegExp(`#define\\s+${name}\\s+(\\d+)U?`));
  if (!match) throw new Error(`${name} not defined`);
  return Number(match[1]);
}

describe.each(BOARDS)('%s Modbus client', (board) => {
  const header = readFileSync(
    join(FIRMWARE, board, 'include', 'modbus_rtu_async_client.h'),
    'utf-8',
  );
  const runtime = readFileSync(
    join(FIRMWARE, board, 'src', 'hmi_runtime.c'),
    'utf-8',
  );

  it('can read the full span a string binding may ask for', () => {
    const clientMax = define(header, 'MODBUS_RTU_ASYNC_MAX_REGISTERS');
    const runtimeMax = define(runtime, 'HMI_STRING_REGISTERS_MAX');

    expect(runtimeMax).toBe(EDITOR_STRING_REGISTERS_MAX);
    expect(clientMax).toBeGreaterThanOrEqual(runtimeMax);
    // The protocol's own ceiling for one FC03/FC04 request.
    expect(clientMax).toBeLessThanOrEqual(125);
  });

  it('sizes the response buffer from that span, not a hand-typed number', () => {
    expect(header).toMatch(/rx_frame\[MODBUS_RTU_ASYNC_RX_FRAME_SIZE\]/);
    expect(header).toMatch(
      /MODBUS_RTU_ASYNC_RX_FRAME_SIZE\s*\\\s*\(5U \+ \(2U \* MODBUS_RTU_ASYNC_MAX_REGISTERS\)\)/,
    );
  });

  it('keeps writes on their own, smaller bound', () => {
    const source = readFileSync(
      join(FIRMWARE, board, 'src', 'modbus_rtu_async_client.c'),
      'utf-8',
    );
    expect(define(header, 'MODBUS_RTU_ASYNC_MAX_WRITE_REGISTERS')).toBe(2);
    expect(source).toMatch(
      /modbus_rtu_async_start_write_registers[\s\S]*?quantity > MODBUS_RTU_ASYNC_MAX_WRITE_REGISTERS/,
    );
  });

  it('gives a long reply its wire time on top of the response timeout', () => {
    const source = readFileSync(
      join(FIRMWARE, board, 'src', 'modbus_rtu_async_client.c'),
      'utf-8',
    );
    expect(source).toMatch(/client->timeout_ms \+ client->rx_budget_ms/);
  });
});
