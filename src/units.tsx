// Display helpers for the user's chosen units. Values are always stored in kg and cm.

import { createContext, useContext, type ReactNode } from 'react';
import { fromLength, fromWeight, tidy, toLength, toWeight, type LengthUnit, type WeightUnit } from './rules/units';

export interface Units {
  wu: WeightUnit;
  lu: LengthUnit;
  /** kg → number in the display unit, float noise removed. */
  wNum: (kg: number) => number;
  /** "62.4 kg" / "137.6 lb" */
  w: (kg: number, decimals?: number) => string;
  /** display-unit input → kg */
  wIn: (v: number) => number;
  lNum: (cm: number) => number;
  l: (cm: number, decimals?: number) => string;
  lIn: (v: number) => number;
  /** "+0.25 kg/week" */
  rate: (kgPerWeek: number) => string;
}

const num = (n: number, d: number) => n.toLocaleString('en-NG', { maximumFractionDigits: d });

export function makeUnits(wu: WeightUnit = 'kg', lu: LengthUnit = 'cm'): Units {
  return {
    wu,
    lu,
    wNum: (kg) => tidy(toWeight(kg, wu)),
    w: (kg, d = 1) => `${num(toWeight(kg, wu), d)} ${wu}`,
    wIn: (v) => fromWeight(v, wu),
    lNum: (cm) => tidy(toLength(cm, lu), 1),
    l: (cm, d = 1) => `${num(toLength(cm, lu), d)} ${lu}`,
    lIn: (v) => fromLength(v, lu),
    rate: (kg) => {
      const v = toWeight(kg, wu);
      return `${v >= 0 ? '+' : '−'}${num(Math.abs(v), 2)} ${wu}/week`;
    },
  };
}

const UnitsContext = createContext<Units>(makeUnits());

export function UnitsProvider({ wu, lu, children }: { wu: WeightUnit; lu: LengthUnit; children: ReactNode }) {
  return <UnitsContext.Provider value={makeUnits(wu, lu)}>{children}</UnitsContext.Provider>;
}

export const useUnits = () => useContext(UnitsContext);
