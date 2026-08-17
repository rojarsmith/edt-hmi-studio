import React from 'react';
import './HelpPanel.css';

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string; description: string }[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Basic Actions',
    shortcuts: [
      { keys: 'Ctrl + Z', description: 'Undo' },
      { keys: 'Ctrl + Shift + Z', description: 'Redo' },
      { keys: 'Ctrl + Y', description: 'Redo' },
      { keys: 'Delete / Backspace', description: 'Delete selected components' },
      { keys: 'Escape', description: 'Clear selection' },
    ],
  },
  {
    title: 'Selection',
    shortcuts: [
      { keys: 'Ctrl + A', description: 'Select all' },
      { keys: 'Ctrl + Click', description: 'Add to or toggle selection' },
      { keys: 'Mouse drag', description: 'Select multiple components with a marquee' },
    ],
  },
  {
    title: 'Clipboard',
    shortcuts: [
      { keys: 'Ctrl + C', description: 'Copy' },
      { keys: 'Ctrl + X', description: 'Cut' },
      { keys: 'Ctrl + V', description: 'Paste' },
      { keys: 'Ctrl + D', description: 'Duplicate' },
    ],
  },
  {
    title: 'Canvas',
    shortcuts: [
      { keys: 'Space + Drag', description: 'Pan canvas' },
      { keys: 'Middle-button drag', description: 'Pan canvas' },
      { keys: 'Ctrl + Mouse wheel', description: 'Zoom canvas' },
    ],
  },
  {
    title: 'Other',
    shortcuts: [
      { keys: 'F1 / ?', description: 'Show keyboard shortcut help' },
      { keys: 'Ctrl + S', description: 'Save project' },
      { keys: 'Ctrl + N', description: 'Create new project' },
    ],
  },
];

const HelpPanel: React.FC<HelpPanelProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="help-panel-overlay" onClick={onClose}>
      <div className="help-panel" onClick={e => e.stopPropagation()}>
        <div className="help-panel-header">
          <h2>⌨️ Keyboard Shortcuts</h2>
          <button className="help-panel-close" onClick={onClose}>×</button>
        </div>
        <div className="help-panel-content">
          {shortcutGroups.map((group, index) => (
            <div key={index} className="shortcut-group">
              <h3>{group.title}</h3>
              <div className="shortcut-list">
                {group.shortcuts.map((shortcut, idx) => (
                  <div key={idx} className="shortcut-item">
                    <kbd className="shortcut-keys">{shortcut.keys}</kbd>
                    <span className="shortcut-desc">{shortcut.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="help-panel-footer">
          <span>Press Escape or click outside to close</span>
        </div>
      </div>
    </div>
  );
};

export default HelpPanel;
