import { useState } from 'react';
import { partImages } from '../lib/partImages';

/** Remembers which source worked (or that none did) so tiles don't retry failed URLs on every render */
const resolved = new Map<string, number>();

export default function PartImage({ partNum, size = 32, title }: { partNum: string; size?: number; title?: string }) {
  const [idx, setIdx] = useState(() => resolved.get(partNum) ?? 0);
  const urls = partImages(partNum);
  const box = { width: size, height: size };
  if (idx >= urls.length) return <span className="part-img missing" style={box} title={title ?? partNum} />;
  return (
    <img
      className="part-img"
      style={box}
      src={urls[idx]}
      alt={title ?? partNum}
      title={title ?? partNum}
      loading="lazy"
      referrerPolicy="no-referrer"
      onLoad={() => resolved.set(partNum, idx)}
      onError={() => {
        resolved.set(partNum, idx + 1);
        setIdx(idx + 1);
      }}
    />
  );
}
