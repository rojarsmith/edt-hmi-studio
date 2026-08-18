// The property panel's search: Type/Id stay pinned above the box, every
// other section filters by its title, collapsible subsection titles, or
// field labels.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useEditorStore } from '../../../store/editorStore';
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
  });

  function sectionByTitle(container: HTMLElement, title: string): HTMLElement | null {
    return (
      [...container.querySelectorAll<HTMLElement>('.property-section')].find(
        s => s.querySelector('.section-header')?.textContent === title,
      ) ?? null
    );
  }

  it('keeps Type and Id pinned above the search box', () => {
    const { container } = render(<PropertyEditor />);
    const sections = container.querySelector('.property-sections')!;
    const pinned = sections.querySelector('[data-pe-pinned]')!;
    const search = sections.querySelector('.pe-search')!;
    // Pinned Component block comes first, the search box directly after.
    expect(pinned.nextElementSibling).toBe(search);
    expect(pinned.textContent).toContain('Type');
    expect(pinned.textContent).toContain('Id');
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

  it('collapses the whole panel from its header', () => {
    const { container } = render(<PropertyEditor />);
    expect(container.querySelector('.property-sections')).not.toBeNull();
    fireEvent.click(container.querySelector('.pe-header')!);
    expect(container.querySelector('.property-sections')).toBeNull();
    expect(container.querySelector('.property-editor')!.classList.contains('collapsed')).toBe(true);
    fireEvent.click(container.querySelector('.pe-header')!);
    expect(container.querySelector('.property-sections')).not.toBeNull();
  });
});
