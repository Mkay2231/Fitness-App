// Everything is stored in kg and cm; these convert only for display and input.

export type WeightUnit = 'kg' | 'lb';
export type LengthUnit = 'cm' | 'in';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export const toWeight = (kg: number, u: WeightUnit) => (u === 'kg' ? kg : kg / KG_PER_LB);
export const fromWeight = (v: number, u: WeightUnit) => (u === 'kg' ? v : v * KG_PER_LB);
export const toLength = (cm: number, u: LengthUnit) => (u === 'cm' ? cm : cm / CM_PER_IN);
export const fromLength = (v: number, u: LengthUnit) => (u === 'cm' ? v : v * CM_PER_IN);

/** Rounds away float noise (e.g. 49.9999 lb → 50) without hiding real decimals. */
export const tidy = (n: number, decimals = 2) => Math.round(n * 10 ** decimals) / 10 ** decimals;

/** Smallest weight jumps per equipment type, stored in kg. */
export function defaultIncrements(u: WeightUnit) {
  const v = u === 'kg'
    ? { barbell: 2.5, dumbbell: 2, machine: 5, cable: 5 }
    : { barbell: 5, dumbbell: 5, machine: 10, cable: 10 };
  return {
    barbell: fromWeight(v.barbell, u),
    dumbbell: fromWeight(v.dumbbell, u),
    machine: fromWeight(v.machine, u),
    cable: fromWeight(v.cable, u),
    bodyweight: 0,
  };
}
