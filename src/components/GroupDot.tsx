// A coloured dot for a group of families, as a dot sticker on a drawer front would show it, and the key to them
import { GROUP_COLOURS, GROUPS } from '../lib/taxonomy';

export function GroupDot({ group }: { group?: string }) {
  const c = group ? GROUP_COLOURS[group] : undefined;
  if (!c) return null;
  const label = GROUPS.find((g) => g.key === group)?.label ?? group;
  return <span className="group-dot" style={{ background: c.hex }} title={`${label}: ${c.name} dot`} aria-label={`${c.name} dot`} />;
}

/** Which colour is which group, for sticking dots (or coloured tape) on drawer fronts */
export function GroupKey() {
  return (
    <p className="group-key small">
      <span className="muted">Dot stickers by group: </span>
      {GROUPS.map((g) => (
        <span key={g.key} className="group-key-item">
          <GroupDot group={g.key} /> {g.label} <span className="muted">({GROUP_COLOURS[g.key]?.name})</span>
        </span>
      ))}
    </p>
  );
}
