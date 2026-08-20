import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { useEditorStore } from '../../../store/editorStore';
import type { BuiltinAction, LvglComponent } from '../../../types';
import EventPanel from '../EventPanel';

/** One selected button carrying a single navigate event. */
function selectButtonWith(action: BuiltinAction) {
  const component: LvglComponent = {
    id: 'btn1',
    type: 'btn',
    name: 'go_btn',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    children: [],
    props: {},
    styles: { default: {} },
    events: [{ id: 'e1', eventType: 'LV_EVENT_CLICKED', handlerType: 'builtin', action }],
    animations: [],
    parentId: null,
    locked: false,
    visible: true,
  };

  useEditorStore.setState({
    screens: [{ id: 's1', name: 'Screen 1', components: [component], backgroundColor: '#fff' }],
    currentScreenId: 's1',
    openScreenIds: ['s1'],
    selection: { selectedIds: ['btn1'], hoveredId: null },
  });
}

describe('EventPanel — navigate description', () => {
  beforeEach(() => {
    useEditorStore.setState({ selection: { selectedIds: [], hoveredId: null } });
  });

  it('names the screen an event created by the current editor points at', () => {
    selectButtonWith({ type: 'navigate', targetScreen: 'Settings' });
    render(<EventPanel />);
    expect(screen.getByText(/Navigate to: Settings/)).toBeInTheDocument();
  });

  it('still names it for a project saved before the rename', () => {
    // `targetPage` is all an older project file carries
    selectButtonWith({ type: 'navigate', targetPage: 'Settings' });
    render(<EventPanel />);
    expect(screen.getByText(/Navigate to: Settings/)).toBeInTheDocument();
  });

  it('prefers the current spelling when a reopened project carries both', () => {
    // Editing an old event writes `targetScreen` and leaves `targetPage` behind
    selectButtonWith({ type: 'navigate', targetScreen: 'Alarms', targetPage: 'Settings' });
    render(<EventPanel />);
    expect(screen.getByText(/Navigate to: Alarms/)).toBeInTheDocument();
  });

  it('names the transition beside the screen', () => {
    // Two buttons can reach the same screen and look different doing it, so
    // the row says which one this is.
    selectButtonWith({
      type: 'navigate',
      targetScreen: 'Settings',
      transition: 'slide',
      transitionDirection: 'left',
      transitionDuration: 250,
    });
    render(<EventPanel />);
    expect(screen.getByText('Navigate to: Settings (Slide Left, 250 ms)')).toBeInTheDocument();
  });

  it('says Not set when no screen was chosen', () => {
    // The dialog saves an empty string rather than omitting the field
    selectButtonWith({ type: 'navigate', targetScreen: '' });
    render(<EventPanel />);
    expect(screen.getByText(/Navigate to: Not set/)).toBeInTheDocument();
  });
});

describe('EventPanel — property-section shape', () => {
  it('renders as a property category with line icons and named tooltips', () => {
    selectButtonWith({ type: 'navigate', targetScreen: 'Settings' });
    const { container } = render(<EventPanel />);

    // A category inside the property editor, not a standalone panel.
    expect(container.querySelector('.property-section')).not.toBeNull();
    expect(container.querySelector('.event-panel')).toBeNull();

    // Monochrome line icons instead of emoji, each named on hover.
    expect(container.querySelector('.event-icon svg')).not.toBeNull();
    expect(screen.getByTitle('Edit event').querySelector('svg')).not.toBeNull();
    expect(screen.getByTitle('Delete event').querySelector('svg')).not.toBeNull();
    expect(screen.getByTitle('Add event')).toBeInTheDocument();
    expect(container.textContent).not.toContain('⚡');
  });

  it('collapses from its header, sparing the add button', () => {
    selectButtonWith({ type: 'navigate', targetScreen: 'Settings' });
    const { container } = render(<EventPanel />);
    expect(container.querySelector('.event-list')).not.toBeNull();
    fireEvent.click(container.querySelector('.pe-events-header')!);
    expect(container.querySelector('.event-list')).toBeNull();
    // The add button still works while collapsed and does not re-toggle.
    fireEvent.click(screen.getByTitle('Add event'));
    expect(container.querySelector('.event-list')).toBeNull();
    fireEvent.click(container.querySelector('.pe-events-header')!);
    expect(container.querySelector('.event-list')).not.toBeNull();
  });

  it('renders nothing without a selection — the editor owns that state', () => {
    useEditorStore.setState({ selection: { selectedIds: [], hoveredId: null } });
    const { container } = render(<EventPanel />);
    expect(container.firstChild).toBeNull();
  });
});
