// The property panel's search: Type/Id stay pinned above the box, every
// other section filters by its title, collapsible subsection titles, or
// field labels.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
import { useAppStore } from '../../../store/appStore';
import type { LvglComponent } from '../../../types';
import PropertyEditor from '..';

function buildComponent(): LvglComponent {
  return {
    id: 'comp-1',
    type: 'btn',
    name: 'Button_1',
    x: 10,
    y: 20,
    width: 100,
    height: 40,
    children: [],
    props: { text: 'OK' },
    styles: { default: {} },
    events: [],
    animations: [],
    parentId: null,
    locked: false,
    visible: true,
  };
}

describe('PropertyEditor search', () => {
  beforeEach(() => {
    useEditorStore.setState({
      screens: [
        {
          id: 'screen-1',
          name: 'Screen 1',
          components: [buildComponent()],
          backgroundColor: '#ffffff',
        },
      ],
      currentScreenId: 'screen-1',
      selection: { selectedIds: ['comp-1'], hoveredId: null },
    });
    // Factory dev mode is global and memory-only; a test that unlocks it must
    // not decide what the next one sees.
    useAppStore.setState({ factoryDevMode: false });
  });

  function sectionByTitle(container: HTMLElement, title: string): HTMLElement | null {
    return (
      [...container.querySelectorAll<HTMLElement>('.property-section')].find(
        s => s.querySelector('.section-header')?.textContent === title,
      ) ?? null
    );
  }

  it('keeps Id above Type, pinned above the search box', () => {
    const { container } = render(<PropertyEditor />);
    const sections = container.querySelector('.property-sections')!;
    const pinned = sections.querySelector('[data-pe-pinned]')!;
    const search = sections.querySelector('.pe-search')!;
    // Pinned Component block comes first, the search box directly after.
    expect(pinned.nextElementSibling).toBe(search);
    expect([...pinned.querySelectorAll('.property-row > label')].map(l => l.textContent)).toEqual([
      'Id',
      'Type',
    ]);
  });

  it('gives the pinned block no fold behaviour', () => {
    const { container } = render(<PropertyEditor />);
    const pinned = container.querySelector('[data-pe-pinned]')!;

    fireEvent.click(pinned.querySelector('.section-header')!);
    expect(pinned.classList.contains('pe-collapsed')).toBe(false);

    // Nor does the sweep reach it — Id and Type stay put.
    fireEvent.click(screen.getByTitle('Collapse all'));
    expect(pinned.classList.contains('pe-collapsed')).toBe(false);
    expect(sectionByTitle(container, 'Position')!.classList.contains('pe-collapsed')).toBe(true);
  });

  it('filters sections by title and leaves the pinned block alone', () => {
    const { container } = render(<PropertyEditor />);
    fireEvent.change(screen.getByLabelText('Search properties'), {
      target: { value: 'position' },
    });
    expect(sectionByTitle(container, 'Position')!.classList.contains('pe-filtered-out')).toBe(false);
    expect(sectionByTitle(container, 'Size')!.classList.contains('pe-filtered-out')).toBe(true);
    expect(container.querySelector('[data-pe-pinned]')!.classList.contains('pe-filtered-out')).toBe(false);
  });

  it('matches field labels and collapsible subsection titles', () => {
    const { container } = render(<PropertyEditor />);
    const input = screen.getByLabelText('Search properties');

    // "Width" is a field label inside the Size section.
    fireEvent.change(input, { target: { value: 'width' } });
    expect(sectionByTitle(container, 'Size')!.classList.contains('pe-filtered-out')).toBe(false);

    // "Shadow" is a collapsible subsection inside the Style section.
    fireEvent.change(input, { target: { value: 'shadow' } });
    const style = sectionByTitle(container, 'Style')!;
    expect(style.classList.contains('pe-filtered-out')).toBe(false);
    const shadow = [...style.querySelectorAll<HTMLElement>('.collapsible-section')].find(s =>
      s.querySelector('.collapsible-header')?.textContent?.includes('Shadow'),
    )!;
    expect(shadow.classList.contains('pe-filtered-out')).toBe(false);

    // Clearing the query brings everything back.
    fireEvent.change(input, { target: { value: '' } });
    expect(sectionByTitle(container, 'Position')!.classList.contains('pe-filtered-out')).toBe(false);
    expect(sectionByTitle(container, 'Size')!.classList.contains('pe-filtered-out')).toBe(false);
  });

  it('places Events directly above Modbus Binding', () => {
    const { container } = render(<PropertyEditor />);
    const sections = [...container.querySelectorAll('.property-sections > .property-section')];
    const eventsIdx = sections.findIndex(s => s.classList.contains('pe-events-section'));
    const modbusIdx = sections.findIndex(s => s.classList.contains('modbus-binding-section'));
    expect(eventsIdx).toBeGreaterThan(-1);
    expect(modbusIdx).toBeGreaterThan(-1);
    expect(eventsIdx).toBe(modbusIdx - 1);
  });

  it('folds a category from its header, like a hierarchy member', () => {
    const { container } = render(<PropertyEditor />);
    const position = sectionByTitle(container, 'Position')!;
    fireEvent.click(position.querySelector('.section-header')!);
    expect(position.classList.contains('pe-collapsed')).toBe(true);
    // Other categories are untouched, and a second click reopens.
    expect(sectionByTitle(container, 'Size')!.classList.contains('pe-collapsed')).toBe(false);
    fireEvent.click(position.querySelector('.section-header')!);
    expect(position.classList.contains('pe-collapsed')).toBe(false);
  });

  it('collapses and expands every category from the header buttons', () => {
    const { container } = render(<PropertyEditor />);
    fireEvent.click(screen.getByTitle('Collapse all'));
    expect(sectionByTitle(container, 'Position')!.classList.contains('pe-collapsed')).toBe(true);
    expect(sectionByTitle(container, 'Size')!.classList.contains('pe-collapsed')).toBe(true);
    // Events keeps its own toggle and is not swept up.
    expect(container.querySelector('.pe-events-section')!.classList.contains('pe-collapsed')).toBe(false);
    fireEvent.click(screen.getByTitle('Expand all'));
    expect(sectionByTitle(container, 'Position')!.classList.contains('pe-collapsed')).toBe(false);
    expect(sectionByTitle(container, 'Size')!.classList.contains('pe-collapsed')).toBe(false);
  });

  it('keeps the whole panel open outside factory dev mode', () => {
    const { container } = render(<PropertyEditor />);
    // No twisty to press, and pressing the header anyway changes nothing.
    expect(container.querySelector('.pe-toggle')).toBeNull();
    fireEvent.click(container.querySelector('.pe-header')!);
    expect(container.querySelector('.property-sections')).not.toBeNull();
    expect(container.querySelector('.property-editor')!.classList.contains('collapsed')).toBe(false);
  });

  it('collapses the whole panel from its header in factory dev mode', () => {
    useAppStore.setState({ factoryDevMode: true });
    const { container } = render(<PropertyEditor />);
    expect(container.querySelector('.pe-toggle')).not.toBeNull();

    fireEvent.click(container.querySelector('.pe-header')!);
    expect(container.querySelector('.property-sections')).toBeNull();
    expect(container.querySelector('.property-editor')!.classList.contains('collapsed')).toBe(true);

    fireEvent.click(container.querySelector('.pe-header')!);
    expect(container.querySelector('.property-sections')).not.toBeNull();
  });

  it('reopens a panel left collapsed when factory dev mode is locked again', () => {
    useAppStore.setState({ factoryDevMode: true });
    const { container } = render(<PropertyEditor />);
    fireEvent.click(container.querySelector('.pe-header')!);
    expect(container.querySelector('.property-sections')).toBeNull();

    // Locking the mode must not leave the panel folded with no way back.
    act(() => useAppStore.setState({ factoryDevMode: false }));

    expect(container.querySelector('.property-sections')).not.toBeNull();
    expect(container.querySelector('.pe-toggle')).toBeNull();
  });
});
