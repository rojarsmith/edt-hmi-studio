import React, { useState, useEffect } from 'react';
import { useAppStore, parseFontSize } from '../../store/appStore';
import { useProjectStore } from '../../store/projectStore';
import type { ProjectConfig } from '../../store/projectStore';
import { useEditorStore } from '../../store/editorStore';
import { useResourceStore } from '../../resources/resourceStore';
import { toast } from '../Toast';
import './ProjectSettings.css';

const FONT_OPTIONS = [
  'montserrat_14',
  'montserrat_16',
  'montserrat_20',
  'montserrat_24',
  'montserrat_28',
  'montserrat_32',
];

const FONT_SIZE_OPTIONS = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48];

const ProjectSettings: React.FC = () => {
  const { currentProjectId, setShowProjectSettings, setDefaultFontSize } = useAppStore();
  const { getProjectConfig, updateProjectConfig } = useProjectStore();
  const { setCanvasSize } = useEditorStore();
  const fonts = useResourceStore((s) => s.fonts);

  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [name, setName] = useState('');
  const [width, setWidth] = useState(480);
  const [height, setHeight] = useState(320);
  const [colorDepth, setColorDepth] = useState<16 | 24 | 32>(32);
  const [fontLarge, setFontLarge] = useState(true);
  const [defaultFont, setDefaultFont] = useState('montserrat_14');
  const [defaultFontSize, setDefaultFontSizeLocal] = useState<number>(16);
  const [useBuiltinSymbols, setUseBuiltinSymbols] = useState(true);
  const [symbolFont, setSymbolFont] = useState('montserrat_14');
  const [memSize, setMemSize] = useState(64);

  useEffect(() => {
    if (!currentProjectId) return;
    getProjectConfig(currentProjectId).then(cfg => {
      if (!cfg) return;
      setConfig(cfg);
      setName(cfg.name);
      setWidth(cfg.display.width);
      setHeight(cfg.display.height);
      setColorDepth(cfg.display.colorDepth);
      setFontLarge(cfg.lvglConfig.fontLarge);
      setDefaultFont(cfg.lvglConfig.defaultFont);
      setDefaultFontSizeLocal(cfg.lvglConfig.defaultFontSize || 16);
      setUseBuiltinSymbols(cfg.lvglConfig.useBuiltinSymbols !== false);
      setSymbolFont(cfg.lvglConfig.symbolFont || 'montserrat_14');
      setMemSize(cfg.lvglConfig.memSize);
    });
  }, [currentProjectId, getProjectConfig]);

  const handleSave = async () => {
    if (!config) return;
    const colorFormat = colorDepth === 16 ? 'RGB565' as const : colorDepth === 24 ? 'RGB888' as const : 'ARGB8888' as const;
    const isCustomFont = !/^montserrat_\d+$/.test(defaultFont);
    const lvglChanged =
      config.lvglConfig.colorFormat !== colorFormat ||
      config.lvglConfig.fontLarge !== fontLarge ||
      config.lvglConfig.defaultFont !== defaultFont ||
      config.lvglConfig.defaultFontSize !== (isCustomFont ? defaultFontSize : undefined) ||
      config.lvglConfig.useBuiltinSymbols !== useBuiltinSymbols ||
      config.lvglConfig.memSize !== memSize;

    const updated: ProjectConfig = {
      ...config,
      name: name.trim() || config.name,
      display: { ...config.display, width, height, colorDepth },
      lvglConfig: {
        ...config.lvglConfig,
        colorFormat,
        fontLarge,
        defaultFont,
        defaultFontSize: isCustomFont ? defaultFontSize : undefined,
        useBuiltinSymbols,
        symbolFont: useBuiltinSymbols ? symbolFont : undefined,
        memSize,
      },
    };
    await updateProjectConfig(updated);
    setCanvasSize(width, height);
    // Update canvas default font size
    const fontRes = fonts.find(f => f.cFontName === defaultFont);
    setDefaultFontSize(parseFontSize(defaultFont, fontRes?.sizes, isCustomFont ? defaultFontSize : undefined));
    setShowProjectSettings(false);
    toast.success('Project settings saved');
    if (lvglChanged) {
      toast.info('LVGL configuration changed. The new settings will be used for build previews.');
    }
  };

  const handleClose = () => setShowProjectSettings(false);

  if (!config) return null;

  return (
    <div className="modal-global-overlay" onClick={handleClose}>
      <div className="modal-dialog project-settings-dialog" onClick={e => e.stopPropagation()}>
        <div className="ps-title">Project Settings</div>
        <div className="ps-body">
          <label className="npd-label">
            Project Name
            <input className="npd-input" type="text" value={name} onChange={e => setName(e.target.value)} />
          </label>

          <div className="npd-section-title">Display Configuration</div>

          <div className="npd-row">
            <label className="npd-label npd-half">
              Width
              <input className="npd-input" type="number" min={100} max={2048} value={width} onChange={e => setWidth(Number(e.target.value))} />
            </label>
            <label className="npd-label npd-half">
              Height
              <input className="npd-input" type="number" min={100} max={2048} value={height} onChange={e => setHeight(Number(e.target.value))} />
            </label>
          </div>

          <label className="npd-label">
            Color Depth
            <select className="npd-select" value={colorDepth} onChange={e => setColorDepth(Number(e.target.value) as 16 | 24 | 32)}>
              <option value={16}>16 bit (RGB565)</option>
              <option value={24}>24 bit (RGB888)</option>
              <option value={32}>32 bit (ARGB8888)</option>
            </select>
          </label>

          <div className="npd-section-title">LVGL Configuration</div>

          <label className="npd-label npd-checkbox-label">
            <input type="checkbox" checked={fontLarge} onChange={e => setFontLarge(e.target.checked)} />
            LV_FONT_FMT_TXT_LARGE (large font support)
          </label>

          <label className="npd-label">
            Default Font
            <select className="npd-select" value={defaultFont} onChange={e => setDefaultFont(e.target.value)}>
              <optgroup label="Built-in Fonts">
                {FONT_OPTIONS.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </optgroup>
              {fonts.length > 0 && (
                <optgroup label="Uploaded Fonts">
                  {fonts.map(f => (
                    <option key={f.id} value={f.cFontName}>{f.name} ({f.family})</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          {!/^montserrat_\d+$/.test(defaultFont) && (
            <label className="npd-label">
              Default Font Size
              <select className="npd-select" value={defaultFontSize} onChange={e => setDefaultFontSizeLocal(Number(e.target.value))}>
                {FONT_SIZE_OPTIONS.map(s => (
                  <option key={s} value={s}>{s}px</option>
                ))}
              </select>
            </label>
          )}

          <label className="npd-label npd-checkbox-label">
            <input type="checkbox" checked={useBuiltinSymbols} onChange={e => setUseBuiltinSymbols(e.target.checked)} />
            Include LVGL built-in icons (FontAwesome Symbols)
          </label>

          {useBuiltinSymbols && (
            <label className="npd-label">
              Icon Font
              <select className="npd-select" value={symbolFont} onChange={e => setSymbolFont(e.target.value)}>
                {FONT_OPTIONS.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
          )}

          <label className="npd-label">
            Memory Size (KB)
            <input className="npd-input" type="number" min={16} max={1024} step={8} value={memSize} onChange={e => setMemSize(Number(e.target.value))} />
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
