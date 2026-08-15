// VS Code-style twisty shared by the collapsible side panels.
// Points right; the panel's own CSS rotates it via the `open` class
// this adds beside the given className.

import React from 'react';

const PanelChevron: React.FC<{ open: boolean; className: string }> = ({ open, className }) => (
  <svg
    className={`${className} ${open ? 'open' : ''}`}
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M6 4l4 4-4 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default PanelChevron;
