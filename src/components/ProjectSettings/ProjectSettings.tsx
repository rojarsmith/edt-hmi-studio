import React, { useState, useEffect } from 'react';
import { useAppStore, parseFontSize } from '../../store/appStore';
import { useProjectStore } from '../../store/projectStore';
import type { ProjectConfig } from '../../store/projectStore';
import { DEFAULT_LVGL_CONFIG } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useResourceStore } from '../../resources/resourceStore';
import { getBoardDefinition } from '../../types/hmi';
import { toast } from '../Toast';
import './ProjectSettings.css';

const ProjectSettings: React.FC = () => {
  const { currentProjectId, setShowProjectSettings, setDefaultFontSize } = useAppStore();
  const { getProjectConfig, updateProjectConfig } = useProjectStore();
  const { setCanvasSize } = useEditorStore();
  const fonts = useResourceStore((s) => s.fonts);

  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    if (!currentProjectId) return;
    getProjectConfig(currentProjectId).then(cfg => {
      if (!cfg) return;
      setConfig(cfg);
      setName(cfg.name);
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
    if (!config || !board) return;

    const display = {
      ...config.display,
      width: board.display.width,
      height: board.display.height,
      colorDepth: board.display.colorDepth,
    };
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
    if (resynced) {
      toast.info(`Display and LVGL settings re-synced to ${board.name}.`);
    }
  };

  const handleClose = () => setShowProjectSettings(false);

  if (!config || !board) return null;

  return (
    <div className="modal-global-overlay" onClick={handleClose}>
      <div className="modal-dialog project-settings-dialog" onClick={e => e.stopPropagation()}>
        <div className="ps-title">Project Settings</div>
        <div className="ps-body">
          <label className="npd-label">
            Project Name
            <input className="npd-input" type="text" value={name} onChange={e => setName(e.target.value)} />
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
