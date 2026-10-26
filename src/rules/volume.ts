export interface MuscleMap {
  primary: string;
  secondary: string[];
}

/** Weekly sets per muscle: a set counts 1 for the main muscle and 0.5 for helpers. */
export function setsByMuscle(exerciseIds: string[], muscles: Record<string, MuscleMap>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of exerciseIds) {
    const m = muscles[id];
    if (!m) continue;
    out[m.primary] = (out[m.primary] ?? 0) + 1;
    for (const s of m.secondary) out[s] = (out[s] ?? 0) + 0.5;
  }
  return out;
}
