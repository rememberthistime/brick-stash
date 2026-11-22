// Re-sort everything: every drawer planned afresh by the current grouping and plan settings, the ones you've recorded
// included. Shown first next to how things are now, and done only when asked; Undo on the storage pages puts every
// drawer back.
import { useMemo, useState } from 'react';
import { resortedSetup } from '../lib/whatIf';
import type { Step } from '../lib/move';
import type { Catalog, Project, Setup } from '../lib/types';
import { uid } from '../state';
import WhatIf from './WhatIf';

export default function ResortAll({ project, catalog, apply }: { project: Project; catalog: Catalog | null; apply: (setup: Setup, undo: Step) => void }) {
  const [look, setLook] = useState(false);
  const setup = useMemo(() => (look ? resortedSetup(project, catalog, uid) : null), [look, project, catalog]);
  const recorded = Object.values(project.setup.drawers).filter((d) => d.length).length;
  const after = useMemo(() => (setup ? { ...project, setup } : null), [setup, project]);
  const go = () => {
    if (!setup) return;
    const ok = confirm(
      `Re-sort every drawer, including the ${recorded} you've recorded? Each drawer gets what the plan puts in it, with every part unticked until you've moved it. ${project.setup.accepted.length ? `The ${project.setup.accepted.length} moves still to make are dropped. ` : ''}Undo on the storage pages puts every drawer back.`,
    );
    if (!ok) return;
    const keys = new Set([...Object.keys(project.setup.drawers), ...Object.keys(setup.drawers)]);
    const before: Step['drawers'] = Object.fromEntries([...keys].map((k) => [k, project.setup.drawers[k]]));
    apply(setup, { text: 'Re-sorted every drawer', drawers: before });
    setLook(false);
  };
  return (
    <div className="resort">
      <p className="muted small">
        The rest of the app leaves your recorded drawers alone and only suggests for the rest. This plans <b>every</b> drawer afresh instead, by the grouping above and the plan settings below, as if nothing were recorded yet. Drawer names, uses and opened-up units stay. See what it would do first; nothing changes until you press Re-sort.
      </p>
      <div className="row">
        <button className="ghost" onClick={() => setLook(!look)}>
          {look ? 'Hide' : 'See what re-sorting would do'}
        </button>
        {look && setup && <button onClick={go}>Re-sort every drawer</button>}
      </div>
      {look && after && <WhatIf now={project} after={after} catalog={catalog} title="Your drawers now, and re-sorted" note="Re-sorting changes recorded drawers too. Each part listed would move to the drawer shown." />}
    </div>
  );
}
