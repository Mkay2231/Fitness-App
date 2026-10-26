// Checks WCAG contrast for the colour pairs the interface actually uses, read from styles.css.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const token = (name: string) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} not found`);
  return m[1];
};
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(token(a)), lum(token(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('colour contrast (WCAG 2.2 AA)', () => {
  it.each([
    ['text', 'bg'], ['text', 'surface'], ['muted', 'bg'], ['muted', 'surface'], ['muted', 'surface-sunk'],
    ['faint', 'surface'], ['accent', 'surface'], ['accent', 'bg'], ['accent-text', 'accent'], ['accent', 'accent-soft'],
    ['warn', 'warn-soft'], ['danger', 'surface'], ['danger', 'danger-soft'],
  ])('text %s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('input borders are at least 3:1 against white (non-text contrast)', () => {
    expect(ratio('border-strong', 'surface')).toBeGreaterThanOrEqual(3);
  });
});
