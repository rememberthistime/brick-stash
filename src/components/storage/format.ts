// How sizes and shares are shown across My storage
export const L = (cm3: number) => `${(cm3 / 1000).toFixed(1)} L`;
export const pct = (x: number) => `${Math.round(x * 100)}%`;
