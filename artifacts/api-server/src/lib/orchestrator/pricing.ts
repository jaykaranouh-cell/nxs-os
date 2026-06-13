/**
 * Shared model pricing (USD per token, list prices) used by both the usage
 * report and the spend guard. Longest-prefix match; opus fallback.
 */
export const MODEL_PRICES: Array<[string, { input: number; output: number; cacheRead: number; cacheWrite: number }]> = [
  ["claude-opus", { input: 5 / 1e6, output: 25 / 1e6, cacheRead: 0.5 / 1e6, cacheWrite: 6.25 / 1e6 }],
  ["claude-sonnet", { input: 3 / 1e6, output: 15 / 1e6, cacheRead: 0.3 / 1e6, cacheWrite: 3.75 / 1e6 }],
  ["claude-haiku", { input: 1 / 1e6, output: 5 / 1e6, cacheRead: 0.1 / 1e6, cacheWrite: 1.25 / 1e6 }],
  ["gpt-4o-mini", { input: 0.15 / 1e6, output: 0.6 / 1e6, cacheRead: 0.075 / 1e6, cacheWrite: 0 }],
  ["gpt-4o", { input: 2.5 / 1e6, output: 10 / 1e6, cacheRead: 1.25 / 1e6, cacheWrite: 0 }],
];

export function pricesFor(model: string) {
  const sorted = [...MODEL_PRICES].sort((a, b) => b[0].length - a[0].length);
  return sorted.find(([prefix]) => model.startsWith(prefix))?.[1] ?? MODEL_PRICES[0][1];
}

export function rowCost(r: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}): number {
  const p = pricesFor(r.model);
  return (
    r.inputTokens * p.input +
    r.outputTokens * p.output +
    r.cacheReadTokens * p.cacheRead +
    r.cacheWriteTokens * p.cacheWrite
  );
}
