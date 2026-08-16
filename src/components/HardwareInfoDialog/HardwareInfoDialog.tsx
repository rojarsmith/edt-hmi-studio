// Read-only view of the board a project targets. Everything here is fixed by
// the board definition and the firmware built against it, which is why none of
// it is editable in Project Settings — see docs/color-depth.md.

import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { useProjectStore } from '../../store/projectStore';
import type { ProjectConfig } from '../../store/projectStore';
import {
  getBoardDefinition,
  getBoardProtocols,
  getProtocolDefinition,
} from '../../types/hmi';
import './HardwareInfoDialog.css';

interface HardwareInfoDialogProps {
  onClose: () => void;
}

/**
 * MB only when it divides evenly, otherwise KB. A 800x480 ARGB8888 frame is
 * exactly 1500 KB, which as megabytes is 1.46484375.
 */
function formatBytes(bytes: number): string {
  const kb = bytes / 1024;
  if (Number.isInteger(kb / 1024)) return `${kb / 1024} MB`;
  return `${Math.round(kb)} KB`;
}

const HardwareInfoDialog: React.FC<HardwareInfoDialogProps> = ({ onClose }) => {
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const factoryDevMode = useAppStore((state) => state.factoryDevMode);
  const getProjectConfig = useProjectStore((state) => state.getProjectConfig);
  const [config, setConfig] = useState<ProjectConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!currentProjectId) return;
    getProjectConfig(currentProjectId).then((cfg) => {
      if (!cancelled && cfg) setConfig(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, [currentProjectId, getProjectConfig]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!config) return null;

  const board = getBoardDefinition(config.boardId);
  const protocol = getProtocolDefinition(config.protocol);
  const frameBufferBytes =
    board.display.width * board.display.height * (board.display.colorDepth / 8);

  return (
    <div className="modal-global-overlay" onClick={onClose}>
      <div
        className="modal-dialog hardware-info-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ps-title">Hardware Information</div>
        <div className="hwinfo-body">
          <p className="hwinfo-board">{board.name}</p>
          <p className="hwinfo-vendor">{board.vendor}</p>

          <div className="hwinfo-section">Display</div>
          <dl className="hwinfo-meta">
            <dt>Resolution</dt>
            <dd>{board.display.width} × {board.display.height}</dd>

            <dt>Color format</dt>
            <dd>
              {board.display.colorFormat} ({board.display.colorDepth}-bit)
            </dd>

            <dt>Frame buffer</dt>
            <dd>{formatBytes(frameBufferBytes)} per buffer</dd>
          </dl>

          <div className="hwinfo-section">Memory</div>
          <dl className="hwinfo-meta">
            <dt>Flash</dt>
            <dd>{formatBytes(board.flashBytes)}</dd>
          </dl>

          {/* The LVGL build settings are an implementation detail of the
              firmware rather than a property of the board, so they are for EDT
              engineers — see docs/factory-dev-mode.md. */}
          {factoryDevMode && (
            <>
              <div className="hwinfo-section">
                LVGL
                <span className="hwinfo-dev-badge">Factory Mode</span>
              </div>
              <dl className="hwinfo-meta">
                <dt>LVGL heap</dt>
                <dd>{board.lvgl.memSizeKb} KB</dd>

                <dt>Default font</dt>
                <dd>{board.lvgl.defaultFont}</dd>

                <dt>Large font support</dt>
                <dd>{board.lvgl.fontLarge ? 'Enabled' : 'Disabled'}</dd>
              </dl>
            </>
          )}

          <div className="hwinfo-section">Field bus</div>
          <dl className="hwinfo-meta">
            <dt>Protocol</dt>
            <dd>
              {protocol.name}
              {protocol.implemented ? '' : ' (configuration only)'}
            </dd>

            <dt>Supported</dt>
            <dd>
              {getBoardProtocols(board.id)
                .map((id) => getProtocolDefinition(id).name)
                .join(', ')}
            </dd>
          </dl>

          <div className="hwinfo-section">Programming</div>
          <dl className="hwinfo-meta">
            <dt>ST-LINK board name</dt>
            <dd className="hwinfo-mono">{board.probeBoardPattern}</dd>
          </dl>

          <p className="hwinfo-note">
            Fixed by the board. The firmware is built against these values, so
            the editor does not offer to change them.
          </p>
        </div>

        <div className="modal-dialog-footer">
          <button className="modal-dialog-btn modal-btn-confirm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default HardwareInfoDialog;
