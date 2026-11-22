// The bar shown while trying a change: every page works on a copy of the project, and this compares the copy with
// the project as it is, until the change is kept or thrown away.
import { useState } from 'react';
import type { Catalog, Project } from '../lib/types';
import WhatIf from './WhatIf';

export default function TryChange({ real, trial, catalog, keep, discard }: { real: Project; trial: Project; catalog: Catalog | null; keep: () => void; discard: () => void }) {
  const [open, setOpen] = useState(false);
  const changed = JSON.stringify(real) !== JSON.stringify(trial);
  return (
    <div className="banner warn no-print try-banner">
      <div className="row">
        <span>
          <b>Trying a change.</b> Change anything on any page: storage, sets kept built, parts, sorting. None of it is saved until you keep it, and every device still sees your project as it was.
        </span>
        <button className="ghost" onClick={() => setOpen(!open)} disabled={!changed}>
          {open ? 'Hide the comparison' : changed ? 'Compare with now' : 'Nothing changed yet'}
        </button>
        <button disabled={!changed} onClick={() => confirm('Keep these changes? They replace your project as it is now, on every device.') && keep()}>
          Keep the changes
        </button>
        <button className="ghost danger" onClick={() => (!changed || confirm('Throw these changes away?')) && discard()}>
          Throw them away
        </button>
      </div>
      {open && changed && <WhatIf now={real} after={trial} catalog={catalog} title="Your project now, and with these changes" />}
    </div>
  );
}
