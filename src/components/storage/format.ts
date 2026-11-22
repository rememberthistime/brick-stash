// How sizes and shares are shown across the storage pages
export const L = (cm3: number) => `${(cm3 / 1000).toFixed(1)} L`;
/** A count of pieces: "1 pc", "2 pcs" */
export const pcs = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'pc' : 'pcs'}`;
export const pct = (x: number) => `${Math.round(x * 100)}%`;
