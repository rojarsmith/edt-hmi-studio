import React, { useState, useMemo, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useEditorStore } from '../../store/editorStore';
import { useThemeStore } from '../../store/themeStore';
import { useLogicEditorStore } from '../LogicEditor';
import { useResourceStore } from '../../resources/resourceStore';
import { useAppStore } from '../../store/appStore';
import { useProjectStore } from '../../store/projectStore';
import { useProjectModbusTags } from '../../hooks/useProjectModbusTags';
import { generateCode, getGeneratedFileNames } from '../../codegen/generator';
import type { CodeGenOptions, GeneratedCode } from '../../codegen/types';
import { toast } from '../Toast';
import './CodePreview.css';

const CodePreview: React.FC = () => {
  const { screens } = useEditorStore();
  const { graphs: logicGraphs } = useLogicEditorStore();
  const { currentTheme } = useThemeStore();
  const imageResources = useResourceStore((s) => s.images);
  const fontResources = useResourceStore((s) => s.fonts);
  const modbusTags = useProjectModbusTags();
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const getProjectConfig = useProjectStore((s) => s.getProjectConfig);
  const [selectedFile, setSelectedFile] = useState<keyof GeneratedCode>('ui.c');
  const [isLoading, setIsLoading] = useState(true);
  const [lvglVersion, setLvglVersion] = useState<CodeGenOptions['lvglVersion']>('9');
  const [projectDefaultFont, setProjectDefaultFont] = useState<string | undefined>();
  const [projectDefaultFontSize, setProjectDefaultFontSize] = useState<number | undefined>();
  const [projectUseBuiltinSymbols, setProjectUseBuiltinSymbols] = useState<boolean>(true);
  const [projectSymbolFont, setProjectSymbolFont] = useState<string | undefined>();

  useEffect(() => {
    if (!currentProjectId) return;
    getProjectConfig(currentProjectId).then(cfg => {
      if (cfg) {
        setProjectDefaultFont(cfg.lvglConfig.defaultFont);
        setProjectDefaultFontSize(cfg.lvglConfig.defaultFontSize);
        setProjectUseBuiltinSymbols(cfg.lvglConfig.useBuiltinSymbols !== false);
        setProjectSymbolFont(cfg.lvglConfig.symbolFont);
      }
    });
  }, [currentProjectId, getProjectConfig]);

  const fileNames = getGeneratedFileNames();

  const codeGenOptions: Partial<CodeGenOptions> = useMemo(() => ({
    lvglVersion,
  }), [lvglVersion]);

  const generatedCode = useMemo(() => {
    try {
      return generateCode(screens, codeGenOptions, logicGraphs, currentTheme, imageResources, fontResources, projectDefaultFont, projectDefaultFontSize, projectUseBuiltinSymbols, projectSymbolFont, undefined, undefined, undefined, modbusTags);
    } catch {
      console.error('Code generation error');
      return null;
    }
  }, [screens, codeGenOptions, logicGraphs, currentTheme, imageResources, fontResources, projectDefaultFont, projectDefaultFontSize, projectUseBuiltinSymbols, projectSymbolFont, modbusTags]);

  const currentCode = generatedCode?.[selectedFile] || '// Code generation failed';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      toast.success('Code copied to clipboard');
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([currentCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${selectedFile} downloaded`);
  };

  const handleDownloadAll = async () => {
    if (!generatedCode) return;
    
    try {
      // Create a simple zip-like download by downloading each file
      for (const [fileName, content] of Object.entries(generatedCode)) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      toast.success('All files downloaded');
    } catch {
      toast.error('Download failed');
    }
  };

  return (
    <div className="code-preview">
      <div className="code-preview-header">
        <div className="code-preview-tabs">
          {fileNames.map(fileName => (
            <button
              key={fileName}
              className={`code-tab ${selectedFile === fileName ? 'active' : ''}`}
              onClick={() => setSelectedFile(fileName)}
            >
              {fileName}
            </button>
          ))}
        </div>
        <div className="code-preview-actions">
          <select
            className="code-version-select"
            value={lvglVersion}
            onChange={(e) => setLvglVersion(e.target.value as CodeGenOptions['lvglVersion'])}
            title="LVGL version"
          >
            <option value="8">LVGL v8</option>
            <option value="9">LVGL v9</option>
          </select>
          <button className="code-action-btn" onClick={handleCopy} title="Copy code">
            📋 Copy
          </button>
          <button className="code-action-btn" onClick={handleDownload} title="Download current file">
            💾 Download
          </button>
          <button className="code-action-btn primary" onClick={handleDownloadAll} title="Download all files">
            📦 Download All
          </button>
        </div>
      </div>
      <div className="code-preview-editor">
        <div className="code-preview-editor-inner">
          <Editor
            width="100%"
            height="100%"
            language="c"
            theme="vs-light"
            value={currentCode}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'off',
              automaticLayout: true,
              folding: true,
              renderLineHighlight: 'line',
              scrollbar: {
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
              },
            }}
            onMount={() => setIsLoading(false)}
            loading={
              <div className="code-preview-loading">
                <span>Loading editor...</span>
              </div>
            }
          />
        </div>
        {isLoading && (
          <div className="code-preview-loading">
            <span>Loading editor...</span>
          </div>
        )}
      </div>
      <div className="code-preview-footer">
        <span className="code-stats">
          {currentCode.split('\n').length} lines | {new Blob([currentCode]).size} bytes
        </span>
      </div>
    </div>
  );
};

export default CodePreview;
