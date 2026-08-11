export type BoardId =
  | 'stm32f746g-disco'
  | 'stm32h747i-disco'
  | 'edt-evk043027b';

export type ProtocolId = 'modbus-rtu' | 'can-bus';

export interface ProtocolDefinition {
  id: ProtocolId;
  name: string;
  /** Shown under the protocol name in the New Project dialog. */
  summary: string;
  /**
   * Whether the binding generator and the firmware runtime implement this
   * protocol. An unimplemented protocol can be configured and saved, but a
   * project using it cannot be built, and the Protocol tab says so rather than
   * letting the build fail later with a codegen error.
   */
  implemented: boolean;
}

export const SUPPORTED_PROTOCOLS: readonly ProtocolDefinition[] = [
  {
    id: 'modbus-rtu',
    name: 'Modbus RTU',
    summary: 'Serial client over the ST-LINK virtual COM port.',
    implemented: true,
  },
  {
    id: 'can-bus',
    name: 'CAN bus',
    summary: 'Frame and signal configuration. No firmware support yet.',
    implemented: false,
  },
] as const;

export const DEFAULT_PROTOCOL_ID: ProtocolId = 'modbus-rtu';

export function getProtocolDefinition(protocolId: ProtocolId): ProtocolDefinition {
  return SUPPORTED_PROTOCOLS.find((protocol) => protocol.id === protocolId)
    ?? SUPPORTED_PROTOCOLS[0];
}

export function isSupportedProtocolId(value: unknown): value is ProtocolId {
  return SUPPORTED_PROTOCOLS.some((protocol) => protocol.id === value);
}

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
   *
   * `null` for a board programmed through a *standalone* probe. An ST-LINK/V2
   * on a flying lead has no idea what it is plugged into and reports no board
   * name at all, so there is nothing to match; `deviceId` is what identifies
   * the target instead.
   */
  probeBoardPattern: string | null;
  /**
   * The MCU's DBGMCU identity code, as the programmer prints it on connect
   * ("Device ID : 0x450"). Checked before anything is written when
   * `probeBoardPattern` is null — it does not tell one board from another
   * board built on the same part, but it does stop an image reaching a
   * different STM32 family, which is where a stray flash does real damage.
   */
  deviceId: string;
  /**
   * The NOR flash image resources are linked into, when they do not fit
   * alongside the code. `null` keeps them in internal flash — see
   * docs/images-external-flash.md.
   */
  externalFlash: {
    /** Where the part is memory mapped, and where the flasher writes it. */
    baseAddress: string;
    /**
     * External loader driving that part, as named in CubeProgrammer's
     * `bin/ExternalLoader` directory. Programming external flash is the one
     * step SWD cannot do on its own.
     */
    loaderName: string;
  } | null;
  /**
   * Field buses this board can drive, in the order the New Project dialog
   * offers them. A board lists a protocol only when it carries the wiring for
   * it, so the Protocol tab shows what the hardware can actually do rather than
   * every protocol the editor knows about.
   *
   * Neither Discovery board has a CAN transceiver fitted, so both list Modbus
   * RTU alone. Adding `'can-bus'` here is all that is needed to make the CAN
   * configuration reachable for a board that has one.
   */
  protocols: readonly ProtocolId[];
  /**
   * LVGL build settings that follow from the hardware, one-to-one with the
   * board. These mirror `firmware/<board>/include/lv_conf.h`, which is what the
   * firmware is actually compiled against; keep the two in step when either
   * changes. Selecting a board fixes them, so the New Project dialog does not
   * ask for them.
   */
  lvgl: {
    /** `LV_FONT_FMT_TXT_LARGE` */
    fontLarge: boolean;
    /** `LV_FONT_DEFAULT`, without the `lv_font_` prefix. */
    defaultFont: string;
    /** `LV_MEM_SIZE`, in KB. See docs/lvgl-configuration.md. */
    memSizeKb: number;
  };
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
    deviceId: '0x449',
    externalFlash: null,
    protocols: ['modbus-rtu'],
    lvgl: {
      fontLarge: true,
      defaultFont: 'montserrat_14',
      memSizeKb: 96,
    },
  },
  {
    id: 'stm32h747i-disco',
    name: 'STM32H747I-DISCO',
    vendor: 'STMicroelectronics',
    display: {
      width: 800,
      height: 480,
      // The BSP drives a 24-bit DSI link from a 32-bit ARGB8888 frame buffer;
      // there is no packed 24 bpp path. Matches firmware/stm32h747i-disco.
      colorDepth: 32,
      colorFormat: 'ARGB8888',
    },
    // Flash bank 1, which is the Cortex-M7's. Bank 2 belongs to the Cortex-M4
    // and is not part of this image — see docs/stm32h747i-disco-dual-core.md.
    flashBytes: 1024 * 1024,
    probeBoardPattern: 'DISCO-H747XI',
    deviceId: '0x450',
    externalFlash: {
      baseAddress: '0x90000000',
      /** Ships with CubeProgrammer; matches the MT25TL01G fitted to this board. */
      loaderName: 'MT25TL01G_STM32H747I-DISCO.stldr',
    },
    protocols: ['modbus-rtu'],
    lvgl: {
      fontLarge: true,
      defaultFont: 'montserrat_14',
      memSizeKb: 256,
    },
  },
  {
    id: 'edt-evk043027b',
    name: 'EDT EVK043027B',
    vendor: 'Emerging Display Technologies',
    display: {
      width: 480,
      height: 272,
      // 32-bit. The LTDC drives this parallel RGB panel directly and could scan
      // a packed 24 bpp layer — the vendor's TouchGFX demo does — but this is
      // an LVGL product and runs ARGB8888. Costs 1020 KB of the part's 2496 KB
      // SRAM for the two frame buffers. See docs/color-depth.md.
      colorDepth: 32,
      colorFormat: 'ARGB8888',
    },
    // Bank 1 of the STM32U599NJ's two 2 MB banks. Bank 2 is left erased and out
    // of this image — see docs/edt-evk043027b.md.
    flashBytes: 2 * 1024 * 1024,
    // Programmed through a standalone ST-LINK/V2 on the SWD header, which
    // reports no board name. See `deviceId`.
    probeBoardPattern: null,
    /** STM32U59x/5Ax. */
    deviceId: '0x481',
    /*
     * Images live in internal flash. There is 2 MB of it and the firmware uses
     * about 285 KB, so even several full-screen 480x272 RGB888 backgrounds
     * (383 KB each) fit alongside the code — the pressure that forces the
     * H747I's images into external flash simply does not exist here.
     *
     * The board does carry a 64 MB MX25LM51245G, and board.c still maps it at
     * 0x90000000, so a project that genuinely outgrows internal flash has
     * somewhere to go. Switching to it needs a loader that works on this board:
     * ST's MX25LM51245G_STM32U599J-DK.stldr drives the right pins but fails to
     * erase here. See docs/edt-evk043027b.md §4.
     */
    externalFlash: null,
    // The only board here with a CAN transceiver fitted (FDCAN1, behind the
    // CAN_STB pin). CAN has no firmware support yet, so a project using it
    // still cannot be built — the Protocol tab says so rather than letting the
    // build fail later.
    protocols: ['modbus-rtu', 'can-bus'],
    lvgl: {
      fontLarge: true,
      defaultFont: 'montserrat_14',
      memSizeKb: 256,
    },
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

/** Shared by every protocol's tag table. */
export type BusAccess = 'read' | 'write' | 'readwrite';

export type ModbusAccess = BusAccess;

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

export type CanFrameFormat = 'standard' | 'extended';

/** Mirrors the STM32 FDCAN/bxCAN test modes. */
export type CanBusMode = 'normal' | 'listen-only' | 'loopback';

export type CanByteOrder = 'little-endian' | 'big-endian';

export type CanSignalDataType =
  | 'bool'
  | 'unsigned'
  | 'signed'
  | 'float32';

/**
 * One signal carved out of a CAN frame's payload, in the same spirit as a DBC
 * signal: the frame identifies the message, and the bit window identifies the
 * value inside it.
 */
export interface CanSignalTag {
  id: string;
  name: string;
  /** 11-bit for standard frames, 29-bit for extended. */
  frameId: number;
  frameFormat: CanFrameFormat;
  startBit: number;
  bitLength: number;
  byteOrder: CanByteOrder;
  dataType: CanSignalDataType;
  access: BusAccess;
  scale: number;
  offset: number;
  pollIntervalMs: number;
}

export interface CanBusConfig {
  enabled: boolean;
  /** Nominal (arbitration) bitrate in bit/s. */
  bitrate: number;
  /** CAN FD raises the bitrate for the data phase only. */
  fd: boolean;
  dataBitrate: number;
  /** Position of the sample point within the bit, as a percentage. */
  samplePointPercent: number;
  mode: CanBusMode;
  /** Applied to newly added signals. */
  defaultFrameFormat: CanFrameFormat;
  pollIntervalMs: number;
  signals: CanSignalTag[];
}

export const CAN_BITRATES: readonly number[] = [
  125_000,
  250_000,
  500_000,
  800_000,
  1_000_000,
];

export const CAN_DATA_BITRATES: readonly number[] = [
  1_000_000,
  2_000_000,
  4_000_000,
  5_000_000,
];

export function createDefaultCanBusConfig(): CanBusConfig {
  return {
    enabled: true,
    bitrate: 500_000,
    fd: false,
    dataBitrate: 2_000_000,
    samplePointPercent: 75,
    mode: 'normal',
    defaultFrameFormat: 'standard',
    pollIntervalMs: 100,
    signals: [],
  };
}

/** Largest identifier each frame format can carry. */
export function maxCanFrameId(format: CanFrameFormat): number {
  return format === 'extended' ? 0x1fff_ffff : 0x7ff;
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

/** Never empty: a board that declares nothing still gets the default protocol. */
export function getBoardProtocols(boardId: BoardId): readonly ProtocolId[] {
  const { protocols } = getBoardDefinition(boardId);
  return protocols.length > 0 ? protocols : [DEFAULT_PROTOCOL_ID];
}

export function boardSupportsProtocol(
  boardId: BoardId,
  protocolId: ProtocolId,
): boolean {
  return getBoardProtocols(boardId).includes(protocolId);
}
