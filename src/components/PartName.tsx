// A part's name as a builder would say it, with Rebrickable's own name under it where that's different
import { bothNames } from '../lib/builderNames';

export default function PartName({ part, official = true }: { part: { partNum: string; name: string }; official?: boolean }) {
  const names = bothNames(part);
  return (
    <>
      {names.plain}
      {official && names.official && <span className="official-name">{names.official}</span>}
    </>
  );
}
