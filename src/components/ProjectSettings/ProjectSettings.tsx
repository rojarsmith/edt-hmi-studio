import React, { useState, useEffect } from 'react';
import { useAppStore, parseFontSize } from '../../store/appStore';
import { useProjectStore } from '../../store/projectStore';
import type { ProjectConfig } from '../../store/projectStore';
import { DEFAULT_LVGL_CONFIG } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useResourceStore } from '../../resources/resourceStore';
import type { DisplayOrientation } from '../../types/hmi';
import {
  ORIENTATION_LABELS,
  SUPPORTED_ORIENTATIONS,
  boardCanDriveOrientation,
  getBoardDefinition,
  logicalResolution,
} from '../../types/hmi';
import { toast } from '../Toast';
import './ProjectSettings.css';

const ProjectSettings: React.FC = () => {
  const { currentProjectId, setShowProjectSettings, setDefaultFontSize } = useAppStore();
  const { getProjectConfig, updateProjectConfig } = useProjectStore();
  const { setCanvasSize } = useEditorStore();
  const fonts = useResourceStore((s) => s.fonts);

  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [name, setName] = useState('');
  const [orientation, setOrientation] = useState<DisplayOrientation | null>(null);

  useEffect(() => {
    if (!currentProjectId) return;
    getProjectConfig(currentProjectId).then(cfg => {
      if (!cfg) return;
      setConfig(cfg);
      setName(cfg.name);
      setOrientation(cfg.display.orientation);
    });
  }, [currentProjectId, getProjectConfig]);

  /*
   * Display and LVGL settings follow from the board and are not editable here,
   * for the same reason the New Project dialog stopped asking for them: the
   * firmware's lv_conf.h is checked in per board, so anything the editor stored
   * that disagreed with it was silently wrong — it only ever reached the WASM
   * preview. See docs/color-depth.md.
   *
   * Saving re-derives them, which also repairs a project created before its
   * board's definition changed.
   */
  const board = config ? getBoardDefinition(config.boardId) : null;

  const handleSave = async () => {
    if (!config || !board || !orientation) return;

    /*
     * Through the orientation, never straight from the board. The board's
     * width/height are the panel's, and a portrait project's are the panel's
     * turned — copying the panel's numbers over them would resize the canvas
     * out from under the widgets, on a save the user made to rename the
     * project. See docs/display-orientation.md §4.1.
     */
    const display = {
      ...config.display,
      ...logicalResolution(config.boardId, orientation),
      colorDepth: board.display.colorDepth,
      orientation,
    };

    /*
     * Only the canvas turns. Widgets keep the coordinates they were given, by
     * explicit request: rotating their boxes moves a layout the author placed
     * by hand, and rotating what is *inside* them is a different answer for
     * each widget type (a label's text direction, an arc's angles) rather than
     * a geometric one. See docs/display-orientation.md §6.
     */
    const turned = orientation !== config.display.orientation;
    const lvglConfig = {
      ...config.lvglConfig,
      colorFormat: board.display.colorFormat,
      fontLarge: board.lvgl.fontLarge,
      defaultFont: board.lvgl.defaultFont,
      defaultFontSize: undefined,
      useBuiltinSymbols: DEFAULT_LVGL_CONFIG.useBuiltinSymbols,
      symbolFont: DEFAULT_LVGL_CONFIG.symbolFont,
      memSize: board.lvgl.memSizeKb,
    };

    const resynced =
      config.display.width !== display.width ||
      config.display.height !== display.height ||
      config.display.colorDepth !== display.colorDepth ||
      config.lvglConfig.colorFormat !== lvglConfig.colorFormat ||
      config.lvglConfig.fontLarge !== lvglConfig.fontLarge ||
      config.lvglConfig.defaultFont !== lvglConfig.defaultFont ||
      config.lvglConfig.memSize !== lvglConfig.memSize;

    await updateProjectConfig({
      ...config,
      name: name.trim() || config.name,
      display,
      lvglConfig,
    });
    setCanvasSize(display.width, display.height);

    const fontRes = fonts.find(f => f.cFontName === lvglConfig.defaultFont);
    setDefaultFontSize(parseFontSize(lvglConfig.defaultFont, fontRes?.sizes, undefined));

    setShowProjectSettings(false);
    toast.success('Project settings saved');
    if (turned) {
      // Says what changed and what deliberately did not, because a canvas that
      // changes shape under an unchanged layout is the surprising half.
      toast.info(
        `Design canvas is now ${display.width}×${display.height} `
        + `(${ORIENTATION_LABELS[orientation].toLowerCase()}). Widgets kept their `
        + 'positions — any that now sit outside the canvas need moving.',
      );
    }
    if (resynced) {
      toast.info(`Display and LVGL settings re-synced to ${board.name}.`);
    }
  };

  const handleClose = () => setShowProjectSettings(false);

  if (!config || !board || !orientation) return null;

  const design = logicalResolution(config.boardId, orientation);
  const willTurn = orientation !== config.display.orientation;
  const orientationBuildable = boardCanDriveOrientation(config.boardId, orientation);

  return (
    <div className="modal-global-overlay" onClick={handleClose}>
      <div className="modal-dialog project-settings-dialog" onClick={e => e.stopPropagation()}>
        <div className="ps-title">Project Settings</div>
        <div className="ps-body">
          <label className="ps-label">
            Project Name
            <input className="ps-input" type="text" value={name} onChange={e => setName(e.target.value)} />
          </label>

          {/* Changeable here, unlike the board and the protocol. Only the
              canvas turns; the widgets on it are left exactly where the author
              put them, which is why the note below is about what will end up
              off-canvas rather than about what moved. See
              docs/display-orientation.md §6. */}
          <label className="ps-label">
            Display Orientation
            <select
              className="ps-select"
              value={orientation}
              onChange={e => setOrientation(e.target.value as DisplayOrientation)}
            >
              {SUPPORTED_ORIENTATIONS.map(id => (
                <option key={id} value={id}>
                  {ORIENTATION_LABELS[id]}
                  {boardCanDriveOrientation(config.boardId, id) ? '' : ' — no firmware support yet'}
                </option>
              ))}
            </select>
            <span className="ps-hint">
              Design canvas {design.width}×{design.height}.
              {orientationBuildable
                ? ''
                : ` ${board.name} cannot be built this way up yet — the project`
                  + ' can still be designed and previewed.'}
            </span>
            {willTurn && (
              <span className="ps-warning">
                ⚠️ Saving reshapes the canvas to {design.width}×{design.height}.
                Widgets are not moved, so anything lying outside the new canvas
                will need repositioning.
              </span>
            )}
          </label>
        </div>

        <div className="modal-dialog-footer">
          <button className="modal-dialog-btn modal-btn-cancel" onClick={handleClose}>Cancel</button>
          <button className="modal-dialog-btn modal-btn-confirm" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default ProjectSettings;
