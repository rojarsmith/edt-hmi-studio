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
}

export const QRCODE_DEFAULT_LITERAL = 'https://bitdove.net';

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
): { render: QrcodeRender; error: null } | { render: null; error: string } {
  if (content === '') {
    return { render: null, error: 'Nothing to encode yet — the content is empty.' };
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
    };
  } catch {
    return {
      render: null,
      error: settings.version === QRCODE_VERSION_AUTO
        ? 'The content is too long for a QR code — it holds at most about 2,950 bytes.'
        : `The content does not fit version ${settings.version} at level ${settings.ecc}. Raise the version, lower the correction level, or set the version to Auto.`,
    };
  }
}

/**
 * The pixel square the code needs: modules plus the standard's 4-module quiet
 * zone each side, at the widget's scale. What the property editor compares
 * against the widget box, and what the panel will actually draw.
 */
export function qrcodePixelSize(moduleCount: number, scale: number): number {
  return (moduleCount + 8) * scale;
}
