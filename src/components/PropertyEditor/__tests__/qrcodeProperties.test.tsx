// The QR code's own section: what it encodes, the standard's three knobs, and
// the arithmetic line that says which version the content needs and whether
// the code fits the widget's box.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import { useAppStore } from '../../../store/appStore';
import { useProjectStore } from '../../../store/projectStore';
import type { LvglComponent } from '../../../types';
import PropertyEditor from '..';

function qr(props: Record<string, unknown>, box: Partial<LvglComponent> = {}): LvglComponent {
  return {
    id: 'qr-1', type: 'qrcode', name: 'QR 1',
    x: 10, y: 10, width: 200, height: 200,
    children: [], events: [], animations: [],
    parentId: null, locked: false, visible: true,
    props,
    styles: { default: { bgColor: '#ffffff', textColor: '#000000', opacity: 1 } },
    ...box,
  };
}

function setUp(component: LvglComponent) {
  useAppStore.setState({ currentProjectId: 'project-1' });
  useProjectStore.setState({
    projects: [
      { config: { id: 'project-1', boardId: 'stm32h747i-disco', communication: { tags: [] } } },
    ] as unknown as ReturnType<typeof useProjectStore.getState>['projects'],
  });
  useEditorStore.setState({
    screens: [{ id: 'screen-1', name: 'Screen 1', backgroundColor: '#fff', components: [component] }],
    texts: [{ id: 't1', key: 'siteUrl', values: { en: 'https://bitdove.net' } }],
    languages: [{ code: 'en', name: 'English' }],
    animations: [],
    selectedAnimationId: null,
    currentScreenId: 'screen-1',
    selection: { selectedIds: ['qr-1'], hoveredId: null },
    history: [],
    historyIndex: -1,
  });
  return render(<PropertyEditor />);
}

const current = () => useEditorStore.getState().screens[0].components[0];

describe('qrcode properties', () => {
  beforeEach(() => {
    setUp(qr({ source: 'literal', literal: 'https://bitdove.net', version: 0, scale: 2, ecc: 'M' }));
  });

  it('offers the literal and the Texts library as sources', () => {
    const select = screen.getByLabelText('QR content source') as HTMLSelectElement;
    expect(select.value).toBe('literal');

    fireEvent.change(select, { target: { value: 'text' } });
    expect(current().props.source).toBe('text');
  });

  it('keeps the typed literal', () => {
    fireEvent.change(screen.getByLabelText('QR literal content'), {
      target: { value: 'https://example.com/a' },
    });
    expect(current().props.literal).toBe('https://example.com/a');
  });

  it('lists the Texts library by key when the source is a resource', () => {
    fireEvent.change(screen.getByLabelText('QR content source'), { target: { value: 'text' } });
    const picker = screen.getByLabelText('QR text resource') as HTMLSelectElement;
    expect([...picker.options].map((o) => o.textContent)).toContain('siteUrl');

    fireEvent.change(picker, { target: { value: 't1' } });
    expect(current().props.textId).toBe('t1');
    expect(screen.getByText(/Encoded in English/)).toBeTruthy();
  });

  it('offers every version the standard defines, and auto', () => {
    const versions = screen.getByLabelText('QR version') as HTMLSelectElement;
    expect(versions.options).toHaveLength(41);
    expect(versions.options[0].textContent).toMatch(/Auto/);
    expect(versions.options[40].textContent).toMatch(/Version 40 · 177×177/);

    fireEvent.change(versions, { target: { value: '7' } });
    expect(current().props.version).toBe(7);
  });

  it('offers the four correction levels under their own names', () => {
    const ecc = screen.getByLabelText('QR error correction') as HTMLSelectElement;
    expect([...ecc.options].map((o) => o.value)).toEqual(['L', 'M', 'Q', 'H']);

    fireEvent.change(ecc, { target: { value: 'H' } });
    expect(current().props.ecc).toBe('H');
  });

  it('changes the scale', () => {
    fireEvent.change(screen.getByLabelText('QR scale'), { target: { value: '5' } });
    expect(current().props.scale).toBe(5);
  });

  it('does the arithmetic: version, modules and pixels', () => {
    expect(screen.getByText(/Version \d+, \d+×\d+ modules — \d+×\d+ px/)).toBeTruthy();
  });

  it('warns when the code outgrows the widget box', () => {
    cleanup();
    setUp(qr(
      { source: 'literal', literal: 'https://bitdove.net', version: 20, scale: 4, ecc: 'M' },
      { width: 100, height: 100 },
    ));
    expect(screen.getByText(/will be clipped/)).toBeTruthy();
  });

  it('says when a pinned version cannot hold the content', () => {
    cleanup();
    setUp(qr({ source: 'literal', literal: 'https://bitdove.net/long/path/here', version: 1, ecc: 'H' }));
    expect(screen.getByText(/does not fit version 1 at level H/)).toBeTruthy();
  });

  it('turns the quiet zone off, with a warning about clear space', () => {
    fireEvent.click(screen.getByText('Quiet zone').closest('.property-row')!
      .querySelector('.toggle-switch-wrapper')!);
    expect(current().props.quietZone).toBe(false);

    cleanup();
    setUp(qr({ source: 'literal', literal: 'https://bitdove.net', quietZone: false }));
    expect(screen.getByText(/keep the area around this widget plain/)).toBeTruthy();
  });

  it('shrinks the widget to the code in one click', () => {
    cleanup();
    // Version 2 at scale 2 with quiet zone: (25+8)*2 = 66 px, box is 200.
    setUp(qr({ source: 'literal', literal: 'https://bitdove.net', version: 2, scale: 2 }));
    const button = screen.getByRole('button', { name: /Shrink the widget to the code — 66 × 66/ });

    fireEvent.click(button);
    expect(current().width).toBe(66);
    expect(current().height).toBe(66);
  });

  it('names the leftover margin for what it is: the widget’s own background', () => {
    cleanup();
    setUp(qr({ source: 'literal', literal: 'https://bitdove.net', version: 2, scale: 2 }));
    expect(screen.getByText(/margin around the code is the widget's own background/)).toBeTruthy();
  });

  it('points at the Communication section for run-time content', () => {
    expect(screen.getByText(/sent over communication replaces this content/)).toBeTruthy();
  });
});

describe('planning a QR code around a string that is not its content', () => {
  beforeEach(() => {
    cleanup();
    setUp(qr({ source: 'literal', literal: '', version: 0, scale: 2, ecc: 'M' }));
  });

  it('keeps the planning string on the widget, so the project remembers it', () => {
    fireEvent.change(screen.getByLabelText('QR planning string'), {
      target: { value: 'https://bitdove.net/order/12345' },
    });
    expect(current().props.sampleText).toBe('https://bitdove.net/order/12345');
    // And the content itself is untouched: this is a plan, not the code.
    expect(current().props.literal).toBe('');
  });

  it('does the arithmetic for it, in UTF-8 bytes', () => {
    fireEvent.change(screen.getByLabelText('QR planning string'), {
      target: { value: 'https://例え.jp/こんにちは' },
    });
    const result = screen.getByLabelText('QR planning result');
    expect(result.textContent).toMatch(/19 characters, 33 bytes of UTF-8/);
    expect(result.textContent).toMatch(/At level M it needs version \d+/);
    expect(result.textContent).toMatch(/Over communication: 17 registers/);
  });

  it('shows the version every level would need, the current one marked', () => {
    fireEvent.change(screen.getByLabelText('QR planning string'), {
      target: { value: 'https://bitdove.net' },
    });
    const rows = screen.getByLabelText('QR planning result').querySelectorAll('tbody tr');
    expect(rows.length).toBe(4);
    expect(rows[1].className).toBe('current');
    expect(rows[3].textContent).toMatch(/H.*3 · 29×29/);
  });

  it('says what to change when the pinned version or the box is too small', () => {
    cleanup();
    setUp(qr(
      { source: 'literal', literal: '', version: 1, scale: 8, ecc: 'M', sampleText: 'https://bitdove.net/order/12345' },
      { width: 100, height: 100 },
    ));
    const result = screen.getByLabelText('QR planning result');
    expect(result.textContent).toMatch(/Version is pinned to 1/);
    expect(result.textContent).toMatch(/lower the scale to \d+, or enlarge the widget/);
  });

  it('checks the string against the binding’s Length', () => {
    cleanup();
    const component = qr({ source: 'literal', literal: '', sampleText: 'https://bitdove.net/order/12345' });
    component.modbusBinding = {
      enabled: true, area: 'holding-register', address: 100, dataType: 'string',
      access: 'read', property: 'text', scale: 1, pollIntervalMs: 500,
      writeBehavior: 'widget-value', writeValue: 0, stringRegisters: 8,
    };
    setUp(component);
    expect(screen.getByLabelText('QR planning result').textContent)
      .toMatch(/Length is 8 registers \(16 bytes\); this string needs 16/);
  });

  it('says it is planning only', () => {
    expect(screen.getByText(/never encoded, never built into the firmware/)).toBeTruthy();
  });
});

describe('a blank widget with a pinned version', () => {
  it('has a size, and the Shrink button, before it has content', () => {
    cleanup();
    setUp(qr({ source: 'literal', literal: '', version: 3, scale: 2, ecc: 'M' }));
    // 29 modules + 8 quiet, at 2 px.
    expect(screen.getByText(/Version 3 pinned: 29×29 modules — 74×74 px with its quiet zone/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Shrink the widget to the code — 74 × 74/));
    expect(current().width).toBe(74);
    expect(current().height).toBe(74);
  });

  it('says when the pinned size outgrows the box', () => {
    cleanup();
    setUp(qr({ source: 'literal', literal: '', version: 10, scale: 4 }, { width: 100, height: 100 }));
    expect(screen.getByText(/Version 10 pinned: 57×57 modules — 260×260 px.*will be clipped/)).toBeTruthy();
  });

  it('offers no size on Auto, since there is nothing to size yet', () => {
    cleanup();
    setUp(qr({ source: 'literal', literal: '', version: 0 }));
    expect(screen.queryByText(/pinned:/)).toBeNull();
    expect(screen.queryByText(/Shrink the widget/)).toBeNull();
  });
});
