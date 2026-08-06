export type BoardId = 'stm32f746g-disco' | 'stm32h747i-disco';

export interface BoardDefinition {
  id: BoardId;
  name: string;
  vendor: string;
  display: {
    width: number;
    height: number;
    colorDepth: 16 | 24 | 32;
    colorFormat: 'RGB565' | 'RGB888' | 'ARGB8888';
  };
  /**
   * On-chip Flash available to the firmware image, in bytes. The generated
   * assets (images, fonts) are linked into it, so the editor can tell before a
   * build that a project will not fit rather than surfacing a linker overflow.
   */
  flashBytes: number;
  /**
   * Regular expression source matching how the board identifies itself in the
   * ST-LINK probe list — the "Board Name" field of
   * `STM32_Programmer_CLI -l st-link-only`. Matched case-insensitively so a
   * build cannot be flashed onto a different board by mistake.
   */
  probeBoardPattern: string;
}

export const DEFAULT_BOARD_ID: BoardId = 'stm32f746g-disco';

export const SUPPORTED_BOARDS: readonly BoardDefinition[] = [
  {
    id: 'stm32f746g-disco',
    name: 'STM32F746G-DISCO',
    vendor: 'STMicroelectronics',
    display: {
      width: 480,
      height: 272,
      colorDepth: 16,
      colorFormat: 'RGB565',
    },
    flashBytes: 1024 * 1024,
    probeBoardPattern: '(?:32)?F746GDISCOVERY',
  },
  {
    id: 'stm32h747i-disco',
    name: 'STM32H747I-DISCO',
    vendor: 'STMicroelectronics',
    display: {
      width: 800,
      height: 480,
      colorDepth: 16,
      colorFormat: 'RGB565',
    },
    // Flash bank 1, which is the Cortex-M7's. Bank 2 belongs to the Cortex-M4
    // and is not part of this image — see docs/stm32h747i-disco-dual-core.md.
    flashBytes: 1024 * 1024,
    probeBoardPattern: 'DISCO-H747XI',
  },
] as const;

export function isSupportedBoardId(value: unknown): value is BoardId {
  return SUPPORTED_BOARDS.some((board) => board.id === value);
}

export type ModbusRegisterArea =
  | 'coil'
  | 'discrete-input'
  | 'holding-register'
  | 'input-register';

export type ModbusDataType =
  | 'bool'
  | 'uint16'
  | 'int16'
  | 'uint32'
  | 'int32'
  | 'float32';

export type ModbusAccess = 'read' | 'write' | 'readwrite';

export type ModbusWidgetProperty =
  | 'checked'
  | 'value'
  | 'text'
  | 'selected';

export type ModbusWriteBehavior =
  | 'widget-value'
  | 'set'
  | 'toggle'
  | 'increment'
  | 'decrement';

export interface ModbusRegisterTag {
  id: string;
  name: string;
  area: ModbusRegisterArea;
  address: number;
  dataType: ModbusDataType;
  access: ModbusAccess;
  scale: number;
  pollIntervalMs: number;
}

export interface CommunicationConfig {
  enabled: boolean;
  protocol: 'modbus-rtu';
  role: 'client';
  /**
   * Windows host-side runtime port preference (for example COM5).
   * This value is not a firmware UART identifier and must not be passed to
   * STM32_Programmer_CLI as a flashing connection.
   */
  port: string;
  baudRate: number;
  parity: 'none' | 'even' | 'odd';
  dataBits: 8;
  stopBits: 1 | 2;
  timeoutMs: number;
  retries: number;
  unitId: number;
  pollIntervalMs: number;
  tags: ModbusRegisterTag[];
}

export interface ModbusBinding {
  enabled: boolean;
  /** Optional reusable project tag. Remaining fields are a codegen-ready snapshot. */
  tagId?: string;
  area: ModbusRegisterArea;
  address: number;
  dataType: ModbusDataType;
  access: ModbusAccess;
  property: ModbusWidgetProperty;
  scale: number;
  pollIntervalMs: number;
  writeBehavior: ModbusWriteBehavior;
  writeValue: number;
}

export function createDefaultCommunicationConfig(): CommunicationConfig {
  return {
    enabled: true,
    protocol: 'modbus-rtu',
    role: 'client',
    port: '',
    baudRate: 9600,
    parity: 'none',
    dataBits: 8,
    stopBits: 1,
    timeoutMs: 1000,
    retries: 2,
    unitId: 1,
    pollIntervalMs: 250,
    tags: [],
  };
}

export function getBoardDefinition(boardId: BoardId): BoardDefinition {
  return SUPPORTED_BOARDS.find((board) => board.id === boardId) ?? SUPPORTED_BOARDS[0];
}
