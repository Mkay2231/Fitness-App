// Food preferences the app acts on: foods you don't eat are hidden from search
// and from meal ideas. Categories are derived from food names, so foods you
// create are covered too.

export type AvoidCategory = 'pork' | 'beef' | 'goat' | 'poultry' | 'fish' | 'eggs' | 'dairy';

export const AVOID_LABELS: Record<AvoidCategory, string> = {
  pork: 'Pork',
  beef: 'Beef (incl. shaki, liver)',
  goat: 'Goat',
  poultry: 'Chicken & turkey',
  fish: 'Fish & seafood',
  eggs: 'Eggs',
  dairy: 'Milk & dairy',
};

const PATTERNS: Record<AvoidCategory, RegExp> = {
  pork: /\b(pork|bacon|ham|sausage)\b/i,
  beef: /\b(beef|shaki|tripe|liver|corned|suya|kpomo|ponmo)\b/i,
  goat: /\bgoat\b/i,
  poultry: /\b(chicken|turkey|gizzard)\b/i,
  fish: /\b(fish|sardines?|mackerel|titus|catfish|tilapia|crayfish|shrimps?|prawns?|stockfish|panla)\b/i,
  eggs: /\beggs?\b|\bomelette\b/i,
  dairy: /\b(milk|cheese|yoghurt|yogurt|butter|wara)\b/i,
};

export function categoriesOf(name: string): AvoidCategory[] {
  return (Object.keys(PATTERNS) as AvoidCategory[]).filter((c) => PATTERNS[c].test(name));
}

export const fitsPreferences = (name: string, avoid: AvoidCategory[]) => !categoriesOf(name).some((c) => avoid.includes(c));
