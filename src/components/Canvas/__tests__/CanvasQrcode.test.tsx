import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../../../store/editorStore';
import CanvasQrcodeContent from '../CanvasQrcode';
import { resolveFallbackBackground } from '../widgetBackground';

const setTexts = (texts: import('../../../types').TextResource[]) => {
  act(() => {
    useEditorStore.setState({
      texts,
      languages: [{ code: 'zh-TW', name: '繁體中文' }, { code: 'en', name: 'English' }],
    });
  });
};

afterEach(() => {
  act(() => {
    useEditorStore.setState({ texts: [], languages: [] });
  });
});

describe('a QR code on the design canvas', () => {
  it('draws the real code — an SVG of the encoded modules, not a placeholder', () => {
    const { container } = render(
      <CanvasQrcodeContent props={{ source: 'literal', literal: 'https://bitdove.net' }} />,
    );

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-label')).toBe('QR code for https://bitdove.net');
    expect(container.querySelector('path')).not.toBeNull();
  });

  it('encodes a bound text resource in English, whatever the project speaks', () => {
    setTexts([{ id: 't1', key: 'siteUrl', values: { 'zh-TW': '中文', en: 'english-content' } }]);
    const { container } = render(
      <CanvasQrcodeContent props={{ source: 'text', textId: 't1' }} />,
    );

    expect(container.querySelector('svg')!.getAttribute('aria-label'))
      .toBe('QR code for english-content');
  });

  it('says so when a pinned version cannot hold the content', () => {
    const { container } = render(
      <CanvasQrcodeContent
        props={{ source: 'literal', literal: 'https://bitdove.net/a/very/long/path', version: 1, ecc: 'H' }}
      />,
    );

    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toMatch(/does not fit version 1/);
  });

  it('draws a blank square when there is nothing to encode — as the panel does', () => {
    const { container } = render(
      <CanvasQrcodeContent props={{ source: 'text', textId: '' }} />,
    );

    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toBe('');
    expect(container.querySelector('.lvgl-qrcode.empty')).not.toBeNull();
  });

  it('is blank out of the box: a new widget has no sample content', () => {
    const { container } = render(<CanvasQrcodeContent props={{}} />);

    expect(container.querySelector('svg')).toBeNull();
  });

  it('scales the drawing by pixels per module', () => {
    const { container } = render(
      <CanvasQrcodeContent props={{ source: 'literal', literal: 'x', version: 1, scale: 4 }} />,
    );

    // Version 1 = 21 modules + 8 quiet, at 4 px each.
    expect(container.querySelector('svg')!.getAttribute('width')).toBe(String((21 + 8) * 4));
  });

  it('keeps the white it ships with, rather than filling it back in', () => {
    expect(resolveFallbackBackground('qrcode')).toBe('transparent');
  });
});
