// The Information pane: what the selected component needs from the panel.
//
// Visual Studio's Error List is the model — a strip of plain sentences under
// the workspace, refreshed from the selection — but these are not errors.
// Most are rules a designer has to know and cannot see on the canvas: that a
// video hides whatever overlaps it, that its file lives on a card the editor
// has never seen. The pane says them where the designer is looking, in the
// designer's words, and adds what it can check for this one component.
//
// Today only a video has notes. Any component whose behaviour on the panel
// cannot be read off the canvas belongs here — see componentNotes.ts.

import React from 'react';
import { useEditorStore } from '../../store/editorStore';
import { getComponentDefinition } from '../../utils/componentDefinitions';
import { VIDEO_RULES, videoWarnings, type ComponentNote } from './componentNotes';
import { describeVideoPlaylist, normalizeVideoProps } from '../../utils/videoPlaylist';

const NoteRow: React.FC<{ note: ComponentNote }> = ({ note }) => (
  <li className={`info-note ${note.kind}`}>
    <span className="info-note-glyph" aria-hidden="true">
      {note.kind === 'warning' ? '!' : '•'}
    </span>
    <span className="info-note-text">
      <span className="info-note-title">{note.title}</span>
      <span className="info-note-body">{note.body}</span>
    </span>
  </li>
);

const InformationPane: React.FC = () => {
  const selectedId = useEditorStore((state) => state.selection.selectedIds[0] ?? null);
  const selectedCount = useEditorStore((state) => state.selection.selectedIds.length);
  const screens = useEditorStore((state) => state.screens);
  const currentScreenId = useEditorStore((state) => state.currentScreenId);
  const canvasWidth = useEditorStore((state) => state.canvas.width);
  const canvasHeight = useEditorStore((state) => state.canvas.height);
  const getComponentById = useEditorStore((state) => state.getComponentById);

  const component = selectedId ? getComponentById(selectedId) : undefined;
  const screen = screens.find((item) => item.id === currentScreenId);

  if (!component || !screen) {
    return (
      <div className="dock-pane info-pane">
        <p className="info-empty">
          Select a component to see what it needs from the panel. Today that
          is the Video component; the others behave on the panel as they do on
          the canvas.
        </p>
      </div>
    );
  }

  if (component.type !== 'video') {
    const definition = getComponentDefinition(component.type);
    return (
      <div className="dock-pane info-pane">
        <div className="dock-pane-toolbar">
          <span className="info-subject">
            {definition?.icon} {component.name}
            {selectedCount > 1 && <span className="dock-pane-meta"> and {selectedCount - 1} more</span>}
          </span>
        </div>
        <p className="info-empty">
          Nothing to add: a {definition?.typeName ?? definition?.name ?? component.type} behaves
          on the panel as it does on the canvas.
        </p>
      </div>
    );
  }

  const warnings = videoWarnings(component, screen, { width: canvasWidth, height: canvasHeight });
  const playlist = normalizeVideoProps(component.props);
  const fileName = describeVideoPlaylist(playlist);

  return (
    <div className="dock-pane info-pane">
      <div className="dock-pane-toolbar">
        <span className="info-subject">
          🎬 {component.name}
          <span className="dock-pane-meta">
            {' '}· {component.width} × {component.height}
            {' '}· {fileName ? fileName : 'no file named'}
            {playlist.shuffle && ' · random order'}
          </span>
        </span>
        <span className="dock-pane-toolbar-end">
          {/* Reminders, not faults: nothing here stops a build or a flash.
              The panel will play whatever it is given, and these are the
              things it is worth knowing about before it does. */}
          <span className={`info-verdict ${warnings.length === 0 ? 'ok' : 'attention'}`} role="status">
            {warnings.length === 0
              ? 'Ready to play'
              : `${warnings.length} reminder${warnings.length === 1 ? '' : 's'}`}
          </span>
        </span>
      </div>
      <div className="info-body">
        {warnings.length > 0 && (
          <section className="info-section">
            <h3>On this screen</h3>
            <ul className="info-list">
              {warnings.map((note) => <NoteRow key={note.title} note={note} />)}
            </ul>
          </section>
        )}
        <section className="info-section">
          <h3>How video works on the panel</h3>
          <ul className="info-list">
            {VIDEO_RULES.map((note) => <NoteRow key={note.title} note={note} />)}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default InformationPane;
