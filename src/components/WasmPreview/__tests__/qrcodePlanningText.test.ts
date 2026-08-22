// The planning string is the editor's alone: it is saved on the widget so
// the project remembers it, and it goes nowhere else — not into the firmware
// (src/codegen/__tests__/qrcode.test.ts) and not to the Simulator, which is
// what this checks.
import { describe, expect, it } from 'vitest';
import { editorStateToJson } from '../editorStateToJson';
import type { Screen } from '../../../types';

describe('the QR planning string and the Simulator', () => {
  it('is stripped from the JSON; the content goes through resolved', () => {
    const screens: Screen[] = [{
      id: 's1', name: 'main', backgroundColor: '#fff',
      components: [{
        id: 'qr', type: 'qrcode', name: 'qr', x: 0, y: 0, width: 120, height: 120,
        children: [], events: [], animations: [], parentId: null, locked: false, visible: true,
        props: { source: 'literal', literal: 'A', sampleText: 'https://planning.only/never-sent' },
        styles: { default: {} },
      }],
    }];
    const json = editorStateToJson(screens, 's1', { width: 800, height: 480 } as never);
    expect(json).not.toContain('planning.only');
    expect(JSON.parse(json).components[0].props.content).toBe('A');
  });
});
