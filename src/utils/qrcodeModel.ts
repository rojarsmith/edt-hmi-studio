/**
 * What a QrCode widget encodes, read the one way every layer agrees on.
 *
 * The content has three sources. A *text resource* from the Texts library —
 * read in English whatever language the panel is showing, because a QR code
 * is scanned by a phone, not read by the operator, and the URL behind it does
 * not translate. A *literal*, typed into the widget. And, on top of either,
 * *communication*: a string tag bound to the widget replaces the content at
 * run time, so a server can point the code at a work order or a session URL.
 *
 * Version, scale and error correction are the QR standard's own knobs, and
 * they are exposed as the standard names them — a person who knows QR codes
 * knows exactly what Version 5 at ECC Q means, and a person who does not can
 * leave all three alone.
 */

import type { TextResource } from '../types';
import { resolveText } from '../codegen/textResources';
import qrcode from 'qrcode-generator';

/*
 * Encode text as UTF-8 bytes, not the library's default.
 *
 * The default byte encoder truncates every character to its low byte, which
 * turns 日本語 into three bytes of noise — the code still draws, scans, and
 * hands the phone garbage. UTF-8 in byte mode is what every phone scanner
 * decodes, and it is exactly what the firmware's encoder receives: the
 * generated C string literal carries the same UTF-8 bytes. One encoder rule
 * on both sides is what makes the canvas honest.
 *
 * Our own TextEncoder rather than the library's optional UTF-8 table: the
 * library ships several builds, not all of which carry the table, and which
 * one a bundler picks is not this module's to control.
 */
qrcode.stringToBytes = (text: string) => Array.from(new TextEncoder().encode(text));

export type QrcodeSource = 'text' | 'literal';

/** The four levels the QR standard defines, lowest to highest redundancy. */
export type QrcodeEcc = 'L' | 'M' | 'Q' | 'H';

export const QRCODE_ECC_LEVELS: { value: QrcodeEcc; label: string }[] = [
  { value: 'L', label: 'L — smallest code, ~7% recoverable' },
  { value: 'M', label: 'M — balanced, ~15% recoverable' },
  { value: 'Q', label: 'Q — sturdier, ~25% recoverable' },
  { value: 'H', label: 'H — densest, ~30% recoverable' },
];

/** Version 0 means "the smallest version the content fits", the usual choice. */
export const QRCODE_VERSION_AUTO = 0;
export const QRCODE_VERSION_MAX = 40;

export const QRCODE_SCALE_MIN = 1;
export const QRCODE_SCALE_MAX = 8;

export interface QrcodeSettings {
  source: QrcodeSource;
  /** The Texts-library resource encoded when `source` is `text`. */
  textId: string;
  /** The string encoded when `source` is `literal`. */
  literal: string;
  /** 0 = auto; 1–40 pins the QR version exactly. */
  version: number;
  /** Pixels per module. The widget box does not stretch the code. */
  scale: number;
  ecc: QrcodeEcc;
  /**
   * The standard's 4-module clear margin, drawn in the light colour on every
   * side. On by default because scanners rely on it. Turning it off removes
   * the drawn margin — the right move only when the widget already sits on a
   * plain, light background that provides the clearance instead.
   */
  quietZone: boolean;
  /**
   * A string the designer wants the widget sized for — the longest work-order
   * URL the server will ever send, say. Never encoded, never generated: it
   * feeds the property editor's planning arithmetic (which version it needs
   * at each level, how many pixels, how many registers) and nothing else.
   * Saved with the project so the next person sees what the code was planned
   * around.
   */
  sampleText: string;
}

/**
 * A new widget encodes nothing. There is no sample address to clear out of
 * the way, and — the reason that matters — a panel whose code is meant to
 * arrive over communication shows a blank square until it does, rather than
 * a code for a string nobody chose.
 */
export const QRCODE_DEFAULT_LITERAL = '';

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.max(min, Math.min(max, n));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeQrcodeProps(props: Record<string, any> | undefined): QrcodeSettings {
  const p = props ?? {};
  return {
    source: p.source === 'text' ? 'text' : 'literal',
    textId: typeof p.textId === 'string' ? p.textId : '',
    literal: typeof p.literal === 'string' ? p.literal : QRCODE_DEFAULT_LITERAL,
    version: clampInt(p.version, QRCODE_VERSION_AUTO, QRCODE_VERSION_MAX, QRCODE_VERSION_AUTO),
    scale: clampInt(p.scale, QRCODE_SCALE_MIN, QRCODE_SCALE_MAX, 2),
    ecc: p.ecc === 'L' || p.ecc === 'Q' || p.ecc === 'H' ? p.ecc : 'M',
    quietZone: p.quietZone !== false,
    sampleText: typeof p.sampleText === 'string' ? p.sampleText : '',
  };
}

/**
 * The string the widget encodes at design time.
 *
 * English deliberately, not the project's current language: a QR code is for
 * the phone pointed at it, and the address behind it is the same in every
 * language the panel speaks. English is resolved the way every text reader
 * resolves a missing translation — the `en` value, then the first language
 * that has one.
 */
export function resolveQrcodeContent(
  settings: QrcodeSettings,
  texts: TextResource[],
  languages: string[],
): string {
  if (settings.source === 'text') {
    const resource = texts.find((text) => text.id === settings.textId);
    if (!resource) return '';
    return resolveText(resource, 'en', languages);
  }
  return settings.literal;
}

export interface QrcodeRender {
  /** Modules per side, quiet zone not included. */
  moduleCount: number;
  /** The version actually used — the pinned one, or the smallest that fit. */
  version: number;
  isDark: (row: number, col: number) => boolean;
}

export type QrcodeEncoded =
  | { render: QrcodeRender; error: null; empty: false }
  | { render: null; error: string; empty: false }
  /**
   * No content. Not an error: the widget draws nothing — its own background
   * shows, a plain square — on every layer, until communication sends a
   * string. The encoder could make a code out of an empty string, and a
   * phone can do nothing with that code.
   */
  | { render: null; error: null; empty: true };

/**
 * Encode the content, or say why it cannot be.
 *
 * The one honest failure is capacity: a pinned version holds a fixed number
 * of bytes at a given correction level, and content past it does not fit.
 * The error message is the fix, not the symptom.
 */
export function encodeQrcode(
  content: string,
  settings: QrcodeSettings,
): QrcodeEncoded {
  if (content === '') {
    return { render: null, error: null, empty: true };
  }
  try {
    const qr = qrcode(
      settings.version as Parameters<typeof qrcode>[0],
      settings.ecc,
    );
    qr.addData(content);
    qr.make();
    const moduleCount = qr.getModuleCount();
    return {
      render: {
        moduleCount,
        version: (moduleCount - 17) / 4,
        isDark: (row, col) => qr.isDark(row, col),
      },
      error: null,
      empty: false,
    };
  } catch {
    return {
      render: null,
      empty: false,
      error: settings.version === QRCODE_VERSION_AUTO
        ? 'The content is too long for a QR code — it holds at most about 2,950 bytes.'
        : `The content does not fit version ${settings.version} at level ${settings.ecc}. Raise the version, lower the correction level, or set the version to Auto.`,
    };
  }
}

/**
 * The pixel square the code needs: the modules, plus the standard's 4-module
 * quiet zone each side when it is on, at the widget's scale. What the
 * property editor compares against the widget box, and what the panel will
 * actually draw.
 */
export function qrcodePixelSize(
  moduleCount: number,
  scale: number,
  quietZone: boolean = true,
): number {
  return (moduleCount + (quietZone ? 8 : 0)) * scale;
}

/** The most a string binding can carry: 64 registers, two bytes each. */
export const QRCODE_COMM_BYTES_MAX = 128;

/** The smallest version `text` fits at `ecc`, or null past version 40. */
export function qrcodeMinVersion(text: string, ecc: QrcodeEcc): number | null {
  try {
    const qr = qrcode(0, ecc);
    qr.addData(text);
    qr.make();
    return (qr.getModuleCount() - 17) / 4;
  } catch {
    return null;
  }
}

export interface QrcodePlan {
  /** Code points — what a person would count. */
  characters: number;
  /** UTF-8 bytes — what the code and the registers count. */
  bytes: number;
  /** Any character wider than one byte: the two counts differ, and that is worth saying. */
  multibyte: boolean;
  /** The smallest version per level; null when even version 40 is too small. */
  minVersionByLevel: Record<QrcodeEcc, number | null>;
  /** At the widget's own level. */
  minVersion: number | null;
  moduleCount: number | null;
  /** At the widget's scale, with its quiet zone setting. */
  pixelSize: number | null;
  /** The largest scale at which the code fits the widget box; 0 when none does. */
  scaleThatFits: number;
  /** Registers a string binding needs to carry every byte. */
  registers: number;
  /**
   * What the designer should do about it, in order of how much it matters.
   * Each one names the setting and the number, so it can be acted on without
   * working anything out.
   */
  advice: string[];
  /**
   * Not a problem, a choice: with the version on Auto the code grows and
   * shrinks with every string, and so does the white around it. Pinning the
   * version this string needs gives every shorter string the same footprint.
   */
  footprintTip: string | null;
}

/**
 * Size the widget for a string that is not its content.
 *
 * The planning arithmetic the property editor does for the real content,
 * done for a string the designer is planning around instead — typically the
 * longest thing communication will ever send, which the widget has no other
 * way of knowing at design time. Unicode is counted the way the code counts
 * it: in UTF-8 bytes, where a kanji is three and a letter is one.
 */
export function planQrcode(
  text: string,
  settings: QrcodeSettings,
  box: { width: number; height: number },
  binding: { stringRegisters: number } | null,
): QrcodePlan | null {
  if (text === '') return null;

  const characters = Array.from(text).length;
  const bytes = new TextEncoder().encode(text).length;
  const levels: QrcodeEcc[] = ['L', 'M', 'Q', 'H'];
  const minVersionByLevel = Object.fromEntries(
    levels.map((level) => [level, qrcodeMinVersion(text, level)]),
  ) as Record<QrcodeEcc, number | null>;
  const minVersion = minVersionByLevel[settings.ecc];
  const moduleCount = minVersion === null ? null : 17 + 4 * minVersion;
  const pixelSize = moduleCount === null
    ? null
    : qrcodePixelSize(moduleCount, settings.scale, settings.quietZone);
  const side = Math.min(box.width, box.height);
  const modulesWithMargin = moduleCount === null ? 0 : moduleCount + (settings.quietZone ? 8 : 0);
  const scaleThatFits = moduleCount === null
    ? 0
    : Math.min(QRCODE_SCALE_MAX, Math.floor(side / modulesWithMargin));
  const registers = Math.ceil(bytes / 2);

  const advice: string[] = [];
  if (minVersion === null) {
    advice.push(
      `Too long for a QR code at level ${settings.ecc}: ${bytes} bytes, and version 40 holds at most `
      + `${{ L: 2953, M: 2331, Q: 1663, H: 1273 }[settings.ecc]}. Shorten the string or lower the correction level.`,
    );
  } else {
    if (settings.version !== QRCODE_VERSION_AUTO && settings.version < minVersion) {
      advice.push(
        `Version is pinned to ${settings.version}, which cannot hold this: set it to ${minVersion} or higher, or to Auto.`,
      );
    }
    if (pixelSize !== null && pixelSize > side) {
      advice.push(
        scaleThatFits >= QRCODE_SCALE_MIN
          ? `At scale ${settings.scale} the code is ${pixelSize}×${pixelSize} px and the widget is ${box.width}×${box.height}: `
            + `lower the scale to ${scaleThatFits}, or enlarge the widget to ${pixelSize}×${pixelSize}.`
          : `Even at scale 1 the code is ${modulesWithMargin}×${modulesWithMargin} px and the widget is ${box.width}×${box.height}: `
            + `enlarge the widget to at least ${modulesWithMargin}×${modulesWithMargin}.`,
      );
    }
  }
  if (bytes > QRCODE_COMM_BYTES_MAX) {
    advice.push(
      `Longer than communication can carry: ${bytes} bytes, and a string binding reads at most `
      + `${QRCODE_COMM_BYTES_MAX} (64 registers). Only the first ${QRCODE_COMM_BYTES_MAX} bytes would arrive.`,
    );
  } else if (binding && binding.stringRegisters < registers) {
    advice.push(
      `The binding's Length is ${binding.stringRegisters} registers (${2 * binding.stringRegisters} bytes); `
      + `this string needs ${registers}. Raise Length to ${registers} or the string will be cut.`,
    );
  }

  const footprintTip = (settings.version === QRCODE_VERSION_AUTO && minVersion !== null && moduleCount !== null)
    ? `On Auto the code is resized for every string, and the white around it changes with it. `
      + `Pin the version to ${minVersion} and every string up to this one draws at the same ${moduleCount}×${moduleCount} modules.`
    : null;

  return {
    characters,
    bytes,
    multibyte: bytes !== characters,
    minVersionByLevel,
    minVersion,
    moduleCount,
    pixelSize,
    scaleThatFits,
    registers,
    advice,
    footprintTip,
  };
}
