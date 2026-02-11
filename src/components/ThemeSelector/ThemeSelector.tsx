import React from 'react';
import { useThemeStore } from '../../store/themeStore';
import type { ThemePreset } from '../../types';
import './ThemeSelector.css';

const ThemeSelector: React.FC = () => {
  const { preset, setTheme, currentTheme } = useThemeStore();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTheme(e.target.value as ThemePreset);
  };

  return (
    <div className="theme-selector">
      <span className="theme-selector-icon">🎨</span>
      <select
        className="theme-selector-select"
        value={preset}
        onChange={handleChange}
        title={`Current theme: ${currentTheme.name}`}
      >
        <option value="light">☀️ Light</option>
        <option value="dark">🌙 Dark</option>
      </select>
    </div>
  );
};

export default ThemeSelector;
