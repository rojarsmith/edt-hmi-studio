import React from 'react';
import './LackBadge.css';

/**
 * Marks something that names a dependency the project no longer has — an
 * animation whose target widget was deleted, an event bound to a deleted
 * animation. Shown rather than repaired: silently dropping the reference would
 * hide work the user still has to redo.
 */
const LackBadge: React.FC<{ reason: string }> = ({ reason }) => (
  <span className="lack-badge" title={reason}>LACK</span>
);

export default LackBadge;
