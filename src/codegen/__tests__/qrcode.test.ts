import { describe, it, expect } from 'vitest';
import { generateUiSource } from '../templates/ui.c';
import { generateUiHeader } from '../templates/ui.h';
import { generateHmiBindings } from '../hmiBindingGenerator';
import { createComponent, createScreen, defaultOptions } from './helpers';
import { createDefaultCommunicationConfig } from '../../types/hmi';
import type { TextResource, ProjectLanguage } from '../../types';

function sourceFor(
  props: Record<string, unknown>,
  extra: { texts?: TextResource[]; languages?: ProjectLanguage[] } = {},
): string {
  return generateUiSource(
    [createScreen({ components: [createComponent('qrcode', { name: 'qr1', props })] })],
    defaultOptions({ lvglVersion: '9' }),
    undefined, [], undefined, undefined, [], undefined, undefined, undefined,
    extra.texts ?? [],
    extra.languages ?? [],
  );
}

describe('qrcode code generation', () => {
  it('creates a canvas and applies the context beside it', () => {
    const source = sourceFor({ source: 'literal', literal: 'https://bitdove.net' });
    expect(source).toContain('ui_qr1 = lv_canvas_create(');
    expect(source).toContain('ui_qrcode_apply(ui_qr1, &ui_qr1_qr);');
    expect(source).toContain('static ui_qrcode_context_t ui_qr1_qr = {');
    expect(source).toContain('.text = "https://bitdove.net",');
  });

  it('pins version, ecc and scale as configured', () => {
    const source = sourceFor({ source: 'literal', literal: 'x', version: 7, scale: 4, ecc: 'H' });
    expect(source).toContain('.min_version = 7U,');
    expect(source).toContain('.max_version = 7U,');
    expect(source).toContain('.ecc = qrcodegen_Ecc_HIGH,');
    expect(source).toContain('.scale = 4U,');
  });

  it('spans the full range on auto version', () => {
    const source = sourceFor({ source: 'literal', literal: 'x', version: 0 });
    expect(source).toContain('.min_version = 1U,');
    expect(source).toContain('.max_version = 40U,');
  });

  it('resolves a text resource in English, whatever the panel speaks', () => {
    const source = sourceFor(
      { source: 'text', textId: 'text-1' },
      {
        texts: [{ id: 'text-1', key: 'siteUrl', values: { 'zh-TW': '中文', en: 'https://bitdove.net' } }],
        languages: [{ code: 'zh-TW', name: '繁體中文' }, { code: 'en', name: 'English' }] as ProjectLanguage[],
      },
    );
    expect(source).toContain('.text = "https://bitdove.net",');
  });

  it('carries Unicode content through as UTF-8 in the generated string', () => {
    // The generated .c is written as UTF-8 and compilers read string
    // literals as the bytes they are, so the firmware's encoder receives
    // exactly the bytes the canvas encoded.
    const source = sourceFor({ source: 'literal', literal: 'https://例え.jp/こんにちは' });
    expect(source).toContain('.text = "https://例え.jp/こんにちは",');
  });

  it('carries the widget colours as dark and light', () => {
    const qr = createComponent('qrcode', {
      name: 'qr1',
      props: { source: 'literal', literal: 'x' },
      styles: { default: { textColor: '#112233', bgColor: '#eeddcc' } },
    });
    const source = generateUiSource(
      [createScreen({ components: [qr] })], defaultOptions({ lvglVersion: '9' }));
    expect(source).toContain('.dark = 0x112233U,');
    expect(source).toContain('.light = 0xeeddccU,');
  });

  it('emits the renderer and includes only for a project with a QR code', () => {
    const withQr = sourceFor({ source: 'literal', literal: 'x' });
    expect(withQr).toContain('#include "libs/qrcode/qrcodegen.h"');
    expect(withQr).toContain('static void ui_qrcode_apply');

    const without = generateUiSource(
      [createScreen({ components: [createComponent('label', { name: 'l' })] })],
      defaultOptions({ lvglVersion: '9' }),
    );
    expect(without).not.toContain('qrcodegen');
  });

  it('declares the set_text entry in ui.h for communication to call', () => {
    const header = generateUiHeader(
      [createScreen({ components: [createComponent('qrcode', { name: 'qr1', props: {} })] })],
      defaultOptions({ lvglVersion: '9' }),
    );
    expect(header).toContain('void ui_qr1_qr_set_text(lv_obj_t *object, const char *text);');
  });
});

describe('qrcode Modbus string binding', () => {
  it('emits a string descriptor routed to the widget’s text writer', () => {
    const qr = createComponent('qrcode', {
      name: 'qr1',
      props: { source: 'literal', literal: 'x' },
      modbusBinding: {
        enabled: true, area: 'holding-register', address: 100, dataType: 'string',
        access: 'read', property: 'text', scale: 1, pollIntervalMs: 500,
        writeBehavior: 'widget-value', writeValue: 0, stringRegisters: 24,
      },
    });
    const files = generateHmiBindings(
      [createScreen({ components: [qr] })],
      { ...createDefaultCommunicationConfig(), enabled: true },
    );
    const c = files['hmi_bindings_generated.c'];
    expect(c).toContain('.data_type = HMI_DATA_STRING,');
    expect(c).toContain('.text_writer = ui_qr1_qr_set_text,');
    expect(c).toContain('.string_registers = 24U,');
  });

  it('clamps the register span to one Modbus read', () => {
    const qr = createComponent('qrcode', {
      name: 'qr1',
      props: {},
      modbusBinding: {
        enabled: true, area: 'holding-register', address: 0, dataType: 'string',
        access: 'read', property: 'text', scale: 1, pollIntervalMs: 500,
        writeBehavior: 'widget-value', writeValue: 0, stringRegisters: 500,
      },
    });
    const files = generateHmiBindings(
      [createScreen({ components: [qr] })],
      { ...createDefaultCommunicationConfig(), enabled: true },
    );
    expect(files['hmi_bindings_generated.c']).toContain('.string_registers = 64U,');
  });
});
