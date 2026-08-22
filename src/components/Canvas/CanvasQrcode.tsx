// A QR code on the design canvas — the real one, not a placeholder.
//
// Unlike a video, whose file the editor has never seen, a QR code's content is
// right here in the project: a text resource or a literal. So the canvas
// encodes it and draws it, and what the designer sees is what the panel will
// show — same modules, same version, same quiet zone. The one thing the
// canvas cannot know is a string arriving over communication at run time,
// and that replaces the content without changing the geometry rules.

import React from 'react';
import { useEditorStore } from '../../store/editorStore';
import {
  encodeQrcode,
  normalizeQrcodeProps,
  resolveQrcodeContent,
} from '../../utils/qrcodeModel';

export const CanvasQrcodeContent: React.FC<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  darkColor?: string;
  lightColor?: string;
}> = React.memo(({ props, darkColor, lightColor }) => {
  const texts = useEditorStore((state) => state.texts);
  const languages = useEditorStore((state) => state.languages);

  const settings = normalizeQrcodeProps(props);
  const content = resolveQrcodeContent(
    settings,
    texts,
    languages.map((language) => language.code),
  );

  const dark = darkColor || '#000000';
  const light = lightColor || '#ffffff';

  // Encoded on every render, no memo: a QR encode is a millisecond, the
  // component is React.memo'd against unchanged props, and a hand-pruned
  // dependency list is a staleness bug waiting for its moment.
  const encoded = encodeQrcode(content, settings);

  // Nothing to encode: the panel shows the widget's background and nothing
  // else, so the canvas does the same — the property editor is where the
  // words about it live.
  if (encoded.empty) {
    return (
      <div
        className="lvgl-qrcode empty"
        style={{ width: '100%', height: '100%', backgroundColor: light }}
        aria-label="QR code with no content yet"
      />
    );
  }

  let svg: { error: string | null; path: string | null; size: number };
  if (!encoded.render) {
    svg = { error: encoded.error, path: null, size: 0 };
  } else {
    const { moduleCount, isDark } = encoded.render;
    // One SVG path for every dark module, at 1 unit per module; the quiet
    // zone, when on, is the 4-unit offset. Scaling is the viewBox's job.
    const margin = settings.quietZone ? 4 : 0;
    const size = moduleCount + 2 * margin;
    let path = '';
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (isDark(row, col)) {
          path += `M${col + margin} ${row + margin}h1v1h-1z`;
        }
      }
    }
    svg = { error: null, path, size };
  }

  if (!svg.path) {
    return (
      <div
        className="lvgl-qrcode empty"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          padding: '6px',
          boxSizing: 'border-box',
          textAlign: 'center',
          fontSize: '11px',
          color: '#8a5a00',
          backgroundColor: light,
        }}
        title={svg.error ?? undefined}
      >
        {svg.error}
      </div>
    );
  }

  // Drawn at its true pixel size and centred, exactly as the panel lays it
  // out; the box around it stays the widget's background. When the box is too
  // small the code is clipped — which is the truth, and the property editor
  // says so in words.
  const px = svg.size * settings.scale;

  return (
    <div
      className="lvgl-qrcode"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: light,
      }}
      title={content}
    >
      <svg
        width={px}
        height={px}
        viewBox={`0 0 ${svg.size} ${svg.size}`}
        // The panel draws hard-edged modules; anti-aliasing here would show a
        // softer code than the one the scanner gets.
        shapeRendering="crispEdges"
        role="img"
        aria-label={`QR code for ${content}`}
      >
        <rect width={svg.size} height={svg.size} fill={light} />
        <path d={svg.path} fill={dark} />
      </svg>
    </div>
  );
});

CanvasQrcodeContent.displayName = 'CanvasQrcodeContent';

export default CanvasQrcodeContent;
