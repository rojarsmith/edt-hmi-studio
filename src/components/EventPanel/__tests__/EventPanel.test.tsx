import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('Navigate to: Settings')).toBeInTheDocument();
  });

  it('still names it for a project saved before the rename', () => {
    // `targetPage` is all an older project file carries
    selectButtonWith({ type: 'navigate', targetPage: 'Settings' });
    render(<EventPanel />);
    expect(screen.getByText('Navigate to: Settings')).toBeInTheDocument();
  });

  it('prefers the current spelling when a reopened project carries both', () => {
    // Editing an old event writes `targetScreen` and leaves `targetPage` behind
    selectButtonWith({ type: 'navigate', targetScreen: 'Alarms', targetPage: 'Settings' });
    render(<EventPanel />);
    expect(screen.getByText('Navigate to: Alarms')).toBeInTheDocument();
  });

  it('says Not set when no screen was chosen', () => {
    // The dialog saves an empty string rather than omitting the field
    selectButtonWith({ type: 'navigate', targetScreen: '' });
    render(<EventPanel />);
    expect(screen.getByText('Navigate to: Not set')).toBeInTheDocument();
  });
});
