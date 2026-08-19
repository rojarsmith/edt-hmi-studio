import React, { useState, useCallback, useMemo } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useLogicEditorStore } from '../LogicEditor';
import type { EventBinding, LvglComponent, LvglEventType, Screen } from '../../types';
import { NEXT_LANGUAGE } from '../../types';
import EventEditDialog from './EventEditDialog';
import PanelChevron from '../LogicEditor/PanelChevron';
import LackBadge from '../common/LackBadge';
import './EventPanel.css';

// LVGL Event type definitions
// eslint-disable-next-line react-refresh/only-export-components
export const LVGL_EVENTS: { type: LvglEventType; label: string; description: string }[] = [
  { type: 'LV_EVENT_CLICKED', label: 'Clicked', description: 'Triggered when the component is clicked' },
  { type: 'LV_EVENT_PRESSED', label: 'Pressed', description: 'Triggered when the component is pressed' },
  { type: 'LV_EVENT_RELEASED', label: 'Released', description: 'Triggered when the component is released' },
  { type: 'LV_EVENT_LONG_PRESSED', label: 'Long Pressed', description: 'Triggered when the component is long-pressed' },
  { type: 'LV_EVENT_VALUE_CHANGED', label: 'Value Changed', description: 'Triggered when the component value changes' },
  { type: 'LV_EVENT_FOCUSED', label: 'Focused', description: 'Triggered when the component gains focus' },
  { type: 'LV_EVENT_DEFOCUSED', label: 'Defocused', description: 'Triggered when the component loses focus' },
  { type: 'LV_EVENT_READY', label: 'Ready', description: 'Triggered when the component is ready' },
  { type: 'LV_EVENT_CANCEL', label: 'Cancel', description: 'Triggered when the operation is canceled' },
];

/**
 * What a screen itself can react to. LVGL brackets a transition with these,
 * which is what makes "when this screen has finished loading, play that
 * animation" expressible without writing code.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const LVGL_SCREEN_EVENTS: { type: LvglEventType; label: string; description: string }[] = [
  { type: 'LV_EVENT_SCREEN_LOADED', label: 'Screen Loaded', description: 'The screen has finished appearing — where an entry animation belongs' },
  { type: 'LV_EVENT_SCREEN_LOAD_START', label: 'Screen Load Start', description: 'Fired before the first frame of this screen is drawn' },
  { type: 'LV_EVENT_SCREEN_UNLOAD_START', label: 'Screen Unload Start', description: 'Fired as this screen begins to leave' },
  { type: 'LV_EVENT_SCREEN_UNLOADED', label: 'Screen Unloaded', description: 'The screen has finished leaving' },
];

// Monochrome line icons, in the panel family's stroke language.
const BoltIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M8.6 1.5 3.6 9h3.5L6.2 14.5 12.4 6.6H8.8l.9-5.1Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

const PencilIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M11.2 2.8a1.3 1.3 0 0 1 1.84 0l.16.16a1.3 1.3 0 0 1 0 1.84L5.7 12.3l-3.2 1 1-3.2Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

const TrashIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 4.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path
      d="M6.2 4.5V3.2A1.2 1.2 0 0 1 7.4 2h1.2a1.2 1.2 0 0 1 1.2 1.2v1.3"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <path
      d="M4.3 4.5l.6 8.4a1.2 1.2 0 0 0 1.2 1.1h3.8a1.2 1.2 0 0 0 1.2-1.1l.6-8.4"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface EventPanelProps {
  /**
   * Edit this screen's own events instead of the selected component's. The
   * property editor passes it when nothing on the canvas is selected.
   */
  screenId?: string;
}

/** Every component id on a screen, children included. */
function componentIdsOf(screen: Screen): Set<string> {
  const ids = new Set<string>();
  const visit = (components: LvglComponent[]) => {
    for (const component of components) {
      ids.add(component.id);
      visit(component.children);
    }
  };
  visit(screen.components);
  return ids;
}

const EventPanel: React.FC<EventPanelProps> = ({ screenId }) => {
  const { selection, getComponentById, updateComponent, screens, setScreenEvents, animations } = useEditorStore();
  const logicGraphs = useLogicEditorStore(state => state.graphs);
  const [editingEvent, setEditingEvent] = useState<EventBinding | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const selectedId = selection.selectedIds[0];
  const component = screenId ? undefined : (selectedId ? getComponentById(selectedId) : undefined);
  const screen = screenId ? screens.find(s => s.id === screenId) : undefined;
  const owner = screen ?? component;
  const events = useMemo(() => owner?.events ?? [], [owner]);

  /** Write the list back to whichever owner this panel is serving. */
  const commit = useCallback((next: EventBinding[]) => {
    if (screen) setScreenEvents(screen.id, next);
    else if (selectedId && component) updateComponent(selectedId, { events: next });
  }, [screen, setScreenEvents, selectedId, component, updateComponent]);

  const handleAddEvent = useCallback(() => {
    setEditingEvent(null);
    setIsCreating(true);
    setIsDialogOpen(true);
  }, []);

  const handleEditEvent = useCallback((event: EventBinding) => {
    setEditingEvent(event);
    setIsCreating(false);
    setIsDialogOpen(true);
  }, []);

  const handleDeleteEvent = useCallback((eventId: string) => {
    commit(events.filter(e => e.id !== eventId));
  }, [commit, events]);

  const handleSaveEvent = useCallback((event: EventBinding) => {
    commit(isCreating ? [...events, event] : events.map(e => (e.id === event.id ? event : e)));
    setIsDialogOpen(false);
    setEditingEvent(null);
  }, [commit, events, isCreating]);

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    setEditingEvent(null);
  }, []);

  const eventCatalog = screen ? LVGL_SCREEN_EVENTS : LVGL_EVENTS;

  /** Why this binding cannot run, or null. Same rule as the animation panel. */
  const eventLack = (event: EventBinding): string | null => {
    const type = event.action?.type;
    if (type !== 'playAnimation' && type !== 'stopAnimation') return null;
    if (!event.action?.animationId) return 'No animation chosen';
    const bound = animations.find(a => a.id === event.action?.animationId);
    if (!bound) return 'The animation this played no longer exists';
    // A screen can only animate what it shows: driving a widget that lives on
    // another screen moves something invisible, and looks like nothing
    // happening at all.
    if (screen) {
      const home = screens.find(s => componentIdsOf(s).has(bound.targetComponentId));
      if (home && home.id !== screen.id) {
        return `This animation drives a widget on "${home.name}", which this screen does not show`;
      }
    }
    return null;
  };

  const getEventLabel = (eventType: LvglEventType): string => {
    const event = eventCatalog.find(e => e.type === eventType);
    return event?.label || eventType;
  };

  const getHandlerDescription = (event: EventBinding): string => {
    if (event.handlerType === 'custom') {
      return 'Custom code';
    }
    if (event.handlerType === 'logic') {
      const names = (event.logicGraphIds ?? []).map(
        id => logicGraphs.find(graph => graph.id === id)?.name ?? '(missing)'
      );
      return names.length > 0 ? `Run logic: ${names.join(', ')}` : 'Run logic: nothing selected';
    }
    if (event.action) {
      switch (event.action.type) {
        case 'navigate':
          // `targetPage` is the pre-rename spelling, still present in older
          // projects — the same fallback the generator applies. `||` rather
          // than `??` because the dialog writes an empty string for a navigate
          // whose screen was never chosen, and that is "Not set", not blank.
          return `Navigate to: ${event.action.targetScreen || event.action.targetPage || 'Not set'}`;
        case 'setProperty':
          return `Set property: ${event.action.property || 'Not set'}`;
        case 'show':
          return `Show: ${event.action.targetComponent || 'Not set'}`;
        case 'hide':
          return `Hide: ${event.action.targetComponent || 'Not set'}`;
        case 'enable':
          return `Enable: ${event.action.targetComponent || 'Not set'}`;
        case 'disable':
          return `Disable: ${event.action.targetComponent || 'Not set'}`;
        case 'setText':
          return `Set text: "${event.action.value || ''}"`;
        case 'setValue':
          return `Set value: ${event.action.value ?? 'Not set'}`;
        case 'setLanguage':
          return event.action.language === NEXT_LANGUAGE
            ? 'Switch language: next'
            : `Switch language: ${event.action.language || 'Not set'}`;
        case 'playAnimation':
        case 'stopAnimation': {
          const verb = event.action.type === 'playAnimation' ? 'Play' : 'Stop';
          const animation = animations.find(a => a.id === event.action?.animationId);
          return `${verb} animation: ${animation?.name ?? 'Not set'}`;
        }
        default:
          return 'Built-in action';
      }
    }
    return 'Not configured';
  };

  // Rendered as a category inside the property editor's sections, so there
  // is nothing to show without a selected component — the editor's own
  // empty state covers that.
  if (!owner) return null;

  return (
    <div className="property-section pe-events-section">
      <div
        className="section-header pe-events-header"
        onClick={() => setExpanded(prev => !prev)}
        title={expanded ? 'Collapse' : 'Expand'}
      >
        <PanelChevron open={expanded} className="pe-events-toggle" />
        <span className="pe-events-title">Events</span>
        <button
          className="pe-events-add"
          onClick={e => {
            e.stopPropagation();
            handleAddEvent();
          }}
          title="Add event"
        >
          ＋
        </button>
      </div>

      {expanded && (
      <div className="event-list">
        {events.length === 0 ? (
          <div className="no-events">
            <p>No event bindings</p>
          </div>
        ) : (
          events.map(event => (
            <div key={event.id} className="event-item">
              <div className="event-info" onClick={() => handleEditEvent(event)}>
                <div className="event-type">
                  <span
                    className="event-icon"
                    title={eventCatalog.find(e => e.type === event.eventType)?.description ?? getEventLabel(event.eventType)}
                  >
                    <BoltIcon />
                  </span>
                  {getEventLabel(event.eventType)}
                  {eventLack(event) && <LackBadge reason={eventLack(event)!} />}
                </div>
                <div className="event-handler">
                  {getHandlerDescription(event)}
                </div>
              </div>
              <div className="event-actions">
                <button
                  className="event-edit-btn"
                  onClick={() => handleEditEvent(event)}
                  title="Edit event"
                >
                  <PencilIcon />
                </button>
                <button
                  className="event-delete-btn"
                  onClick={() => handleDeleteEvent(event.id)}
                  title="Delete event"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      )}

      {isDialogOpen && (
        <EventEditDialog
          event={editingEvent}
          isCreating={isCreating}
          forScreen={!!screen}
          onSave={handleSaveEvent}
          onClose={handleCloseDialog}
        />
      )}
    </div>
  );
};

export default EventPanel;
