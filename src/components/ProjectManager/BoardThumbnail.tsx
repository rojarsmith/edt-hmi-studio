// What the hardware picker shows for a board with no photograph.
//
// Deliberately a schematic rather than a stock image: it is drawn from the
// board definition, so it cannot go stale or claim to be a revision the user
// does not have. It also carries the one thing a photograph of a development
// kit hides — the panel's proportions — which is the property the picker exists
// to help choose between.

import React from 'react';
import type { BoardDefinition } from '../../types/hmi';
import { getBoardImage } from '../../resources/boardProfile';

interface BoardThumbnailProps {
  board: BoardDefinition;
  className?: string;
  /**
   * Bumped by the caller after a picture is stored or cleared, so the component
   * re-reads localStorage. Without it a Factory Mode upload would not appear
   * until the picker was reopened.
   */
  imageRevision?: number;
}

const BoardThumbnail: React.FC<BoardThumbnailProps> = ({ board, className, imageRevision }) => {
  // Read on every render rather than memoised: it is one localStorage lookup,
  // and memoising it would need `imageRevision` as a dependency it does not
  // actually derive from. The prop's only job is to make the parent re-render
  // after a picture is stored or cleared.
  void imageRevision;
  const photo = getBoardImage(board.id);

  if (photo) {
    return <img className={className} src={photo} alt="" />;
  }

  // The board outline is a fixed 4:3 card; the panel inside keeps the display's
  // real aspect ratio, letterboxed within it.
  const { width, height } = board.display;
  const outerW = 120;
  const outerH = 90;
  const maxPanelW = outerW - 20;
  const maxPanelH = outerH - 20;
  const scale = Math.min(maxPanelW / width, maxPanelH / height);
  const panelW = width * scale;
  const panelH = height * scale;
  const panelX = (outerW - panelW) / 2;
  const panelY = (outerH - panelH) / 2;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${outerW} ${outerH}`}
      role="img"
      aria-label={`${board.model} panel, ${width} by ${height}`}
    >
      <rect
        x="1"
        y="1"
        width={outerW - 2}
        height={outerH - 2}
        rx="6"
        fill="#20222f"
        stroke="#3a3a5c"
        strokeWidth="1"
      />
      <rect
        x={panelX}
        y={panelY}
        width={panelW}
        height={panelH}
        rx="2"
        fill="#0f1018"
        stroke="#4d7ea8"
        strokeWidth="1.5"
      />
      <text
        x={outerW / 2}
        y={outerH / 2 + 3}
        textAnchor="middle"
        fontSize="9"
        fill="#6f7d92"
      >
        {width}×{height}
      </text>
    </svg>
  );
};

export default BoardThumbnail;
