// The preview simulates the device, so it boots on the entry screen rather
// than whichever screen is open in the editor, and Reset returns to it.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import PreviewPanel from '../PreviewPanel';

function activeScreenName(container: HTMLElement): string | undefined {
  return container.querySelector('.preview-screen-btn.active')?.textContent?.replace('Entry', '');
}

describe('PreviewPanel entry screen', () => {
  beforeEach(() => {
    useEditorStore.setState({
      screens: [
        { id: 'screen-1', name: 'Screen 1', components: [], backgroundColor: '#ffffff' },
        { id: 'screen-2', name: 'Screen 2', components: [], backgroundColor: '#ffffff', isEntry: true },
        { id: 'screen-3', name: 'Screen 3', components: [], backgroundColor: '#ffffff' },
      ],
      currentScreenId: 'screen-1',
      openScreenIds: ['screen-1'],
      selection: { selectedIds: [], hoveredId: null },
      history: [],
      historyIndex: -1,
    });
  });

  it('boots on the entry screen, not the screen being edited', () => {
    // The editor sits on Screen 1 while Screen 2 carries the entry flag.
    const { container } = render(<PreviewPanel />);
    expect(activeScreenName(container)).toBe('Screen 2');
  });

  it('marks the entry screen in the screen list', () => {
    const { container } = render(<PreviewPanel />);
    const entryBtn = [...container.querySelectorAll('.preview-screen-btn')].find(b =>
      b.textContent?.startsWith('Screen 2'),
    )!;
    expect(entryBtn.querySelector('.preview-screen-entry')).not.toBeNull();
    expect(
      [...container.querySelectorAll('.preview-screen-btn')].filter(b =>
        b.querySelector('.preview-screen-entry'),
      ),
    ).toHaveLength(1);
  });

  it('falls back to the first screen when nothing is flagged', () => {
    useEditorStore.setState({
      screens: useEditorStore.getState().screens.map(s => ({ ...s, isEntry: false })),
    });
    const { container } = render(<PreviewPanel />);
    expect(activeScreenName(container)).toBe('Screen 1');
  });

  it('Reset returns to the entry screen after navigating away', () => {
    const { container } = render(<PreviewPanel />);
    const screen3 = [...container.querySelectorAll('.preview-screen-btn')].find(b =>
      b.textContent?.startsWith('Screen 3'),
    )!;

    fireEvent.click(screen3);
    expect(activeScreenName(container)).toBe('Screen 3');

    fireEvent.click(screen.getByTitle('Restart from the entry screen'));
    expect(activeScreenName(container)).toBe('Screen 2');
  });

  it('stays put while browsing other screens', () => {
    const { container } = render(<PreviewPanel />);
    const screen1 = [...container.querySelectorAll('.preview-screen-btn')].find(b =>
      b.textContent?.startsWith('Screen 1'),
    )!;

    fireEvent.click(screen1);

    // Manual browsing is not undone by a re-render.
    expect(activeScreenName(container)).toBe('Screen 1');
  });
});
