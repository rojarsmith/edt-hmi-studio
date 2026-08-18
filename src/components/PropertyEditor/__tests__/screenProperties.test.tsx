// With no component selected, the property panel edits the current screen:
// pinned Screen/Id block, plus the Entry Screen setting. Exactly one screen
// is the entry at all times.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import { getEntryScreen } from '../../../utils/entryScreen';
import PropertyEditor from '..';

describe('PropertyEditor screen properties', () => {
  beforeEach(() => {
    useEditorStore.setState({
      screens: [
        { id: 'screen-1', name: 'Screen 1', components: [], backgroundColor: '#ffffff' },
        { id: 'screen-2', name: 'Screen 2', components: [], backgroundColor: '#ffffff' },
      ],
      currentScreenId: 'screen-1',
      openScreenIds: ['screen-1', 'screen-2'],
      selection: { selectedIds: [], hoveredId: null },
      history: [],
      historyIndex: -1,
    });
  });

  it('shows the current screen when nothing is selected', () => {
    const { container } = render(<PropertyEditor />);
    const pinned = container.querySelector('[data-pe-pinned]')!;
    expect(pinned.querySelector('.section-header')!.textContent).toBe('Screen');
    expect([...pinned.querySelectorAll('.property-row > label')].map(l => l.textContent)).toEqual([
      'Id',
      'Type',
    ]);
    expect(pinned.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('Screen 1');
    // The search box still sits directly below the pinned block.
    expect(pinned.nextElementSibling).toBe(container.querySelector('.pe-search'));
  });

  it('gives the pinned screen block no fold behaviour', () => {
    const { container } = render(<PropertyEditor />);
    const pinned = container.querySelector('[data-pe-pinned]')!;

    fireEvent.click(pinned.querySelector('.section-header')!);

    expect(pinned.classList.contains('pe-collapsed')).toBe(false);
  });

  it('checks and locks the Entry checkbox on the entry screen', () => {
    render(<PropertyEditor />);
    const checkbox = screen.getByLabelText('Entry Screen') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(checkbox.disabled).toBe(true);
  });

  it('moves the entry flag when checked on another screen', () => {
    useEditorStore.setState({ currentScreenId: 'screen-2' });
    render(<PropertyEditor />);
    const checkbox = screen.getByLabelText('Entry Screen') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(false);

    fireEvent.click(checkbox);

    const screens = useEditorStore.getState().screens;
    expect(getEntryScreen(screens)?.id).toBe('screen-2');
    expect(screens.filter(s => s.isEntry)).toHaveLength(1);
    // The checkbox now reads as the locked entry.
    const after = screen.getByLabelText('Entry Screen') as HTMLInputElement;
    expect(after.checked).toBe(true);
    expect(after.disabled).toBe(true);
  });

  it('renames the screen through the Id field on commit', () => {
    const { container } = render(<PropertyEditor />);
    const input = container.querySelector<HTMLInputElement>(
      '[data-pe-pinned] input[type="text"]',
    )!;

    fireEvent.change(input, { target: { value: 'Home' } });
    // Uncommitted draft: the store still holds the old name.
    expect(useEditorStore.getState().screens[0].name).toBe('Screen 1');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useEditorStore.getState().screens[0].name).toBe('Home');
  });

  it('discards an empty rename instead of committing it', () => {
    const { container } = render(<PropertyEditor />);
    const input = container.querySelector<HTMLInputElement>(
      '[data-pe-pinned] input[type="text"]',
    )!;

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);

    expect(useEditorStore.getState().screens[0].name).toBe('Screen 1');
    // The field rolls back to the kept name rather than showing the blank.
    expect(input.value).toBe('Screen 1');
  });
});
