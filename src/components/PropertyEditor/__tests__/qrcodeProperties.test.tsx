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

  it('points at the Communication section for run-time content', () => {
    expect(screen.getByText(/sent over communication replaces this content/)).toBeTruthy();
  });
});
