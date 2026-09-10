/** Number formatting shared by the sections. Fixed en-US locale so text is stable. */

const INTEGER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function count(value: number): string {
  return INTEGER.format(value);
}

/** `$2,475,300,433`, the form scripts/demo_queries.py prints. */
export function money(value: number): string {
  return `$${INTEGER.format(Math.round(value))}`;
}

export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return money(value);
}

export function millis(value: number): string {
  return value < 1 ? `${value.toFixed(2)} ms` : `${value.toFixed(0)} ms`;
}

export function percent(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}
