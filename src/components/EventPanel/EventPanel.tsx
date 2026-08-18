import React, { useState, useCallback } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useLogicEditorStore } from '../LogicEditor';
import type { EventBinding, LvglEventType } from '../../types';
import { NEXT_LANGUAGE } from '../../types';
import EventEditDialog from './EventEditDialog';
import PanelChevron from '../LogicEditor/PanelChevron';
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

const EventPanel: React.FC = () => {
  const { selection, getComponentById, updateComponent } = useEditorStore();
  const logicGraphs = useLogicEditorStore(state => state.graphs);
  const [editingEvent, setEditingEvent] = useState<EventBinding | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const selectedId = selection.selectedIds[0];
  const component = selectedId ? getComponentById(selectedId) : undefined;

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
    if (!selectedId || !component) return;
    const newEvents = component.events.filter(e => e.id !== eventId);
    updateComponent(selectedId, { events: newEvents });
  }, [selectedId, component, updateComponent]);

  const handleSaveEvent = useCallback((event: EventBinding) => {
    if (!selectedId || !component) return;
    
    if (isCreating) {
      // Add new event
      updateComponent(selectedId, { 
        events: [...component.events, event] 
      });
    } else {
      // Update existing event
      const newEvents = component.events.map(e => 
        e.id === event.id ? event : e
      );
      updateComponent(selectedId, { events: newEvents });
    }
    
    setIsDialogOpen(false);
    setEditingEvent(null);
  }, [selectedId, component, updateComponent, isCreating]);

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    setEditingEvent(null);
  }, []);

  const getEventLabel = (eventType: LvglEventType): string => {
    const event = LVGL_EVENTS.find(e => e.type === eventType);
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
        default:
          return 'Built-in action';
      }
    }
    return 'Not configured';
  };

  // Rendered as a category inside the property editor's sections, so there
  // is nothing to show without a selected component — the editor's own
  // empty state covers that.
  if (!component) return null;

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
        {component.events.length === 0 ? (
          <div className="no-events">
            <p>No event bindings</p>
            <button className="add-first-event" onClick={handleAddEvent}>
              + Add Event
            </button>
          </div>
        ) : (
          component.events.map(event => (
            <div key={event.id} className="event-item">
              <div className="event-info" onClick={() => handleEditEvent(event)}>
                <div className="event-type">
                  <span
                    className="event-icon"
                    title={LVGL_EVENTS.find(e => e.type === event.eventType)?.description ?? getEventLabel(event.eventType)}
                  >
                    <BoltIcon />
                  </span>
                  {getEventLabel(event.eventType)}
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
          onSave={handleSaveEvent}
          onClose={handleCloseDialog}
        />
      )}
    </div>
  );
};

export default EventPanel;
