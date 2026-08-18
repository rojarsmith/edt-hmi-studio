// The screen manager marks the project's entry screen with a badge right of
// its name — on the flagged screen, or the first screen when none is flagged.

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import ScreenManager from '../ScreenManager';

function rowByName(container: HTMLElement, name: string): HTMLElement {
  return [...container.querySelectorAll<HTMLElement>('.sm-row.sm-screen')].find(
    row => row.querySelector('.sm-label-text')?.textContent === name,
  )!;
}

describe('ScreenManager entry badge', () => {
  beforeEach(() => {
    useEditorStore.setState({
      screens: [
        { id: 'screen-1', name: 'Screen 1', components: [], backgroundColor: '#ffffff' },
        { id: 'screen-2', name: 'Screen 2', components: [], backgroundColor: '#ffffff' },
      ],
      screenGroups: [],
      currentScreenId: 'screen-1',
      openScreenIds: ['screen-1'],
      selection: { selectedIds: [], hoveredId: null },
      history: [],
      historyIndex: -1,
    });
  });

  it('badges the first screen when no entry is flagged', () => {
    const { container } = render(<ScreenManager />);
    expect(rowByName(container, 'Screen 1').querySelector('.sm-entry-badge')).not.toBeNull();
    expect(rowByName(container, 'Screen 2').querySelector('.sm-entry-badge')).toBeNull();
  });

  it('follows the entry flag to the screen carrying it', () => {
    useEditorStore.getState().setEntryScreen('screen-2');
    const { container } = render(<ScreenManager />);
    expect(rowByName(container, 'Screen 1').querySelector('.sm-entry-badge')).toBeNull();
    expect(rowByName(container, 'Screen 2').querySelector('.sm-entry-badge')).not.toBeNull();
  });
});
