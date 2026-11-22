// A part's name as a builder would say it, with Rebrickable's own name under it where that's different, and the
// group it's in, which can be changed from here
import { bothNames } from '../lib/builderNames';
import PartGroup from './PartGroup';

export default function PartName({ part, official = true, group = true }: { part: { partNum: string; name: string }; official?: boolean; group?: boolean }) {
  const names = bothNames(part);
  return (
    <>
      {names.plain}
      {group && <PartGroup partNum={part.partNum} name={names.plain} />}
      {official && names.official && <span className="official-name">{names.official}</span>}
    </>
  );
}
