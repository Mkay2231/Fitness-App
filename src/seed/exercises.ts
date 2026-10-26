import type { Exercise } from '../db';

// Built-in exercise library. Names, equipment and muscles only: no how-to
// instructions are included until they can be taken from a cited source.
// Add them per exercise as `instructions: { steps, source, url }`.

export const EXERCISES: Exercise[] = [
  // Quads
  { id: 'leg-press', name: 'Leg press', equipment: 'machine', primary: 'quads', secondary: ['glutes'] },
  { id: 'goblet-squat', name: 'Goblet squat', equipment: 'dumbbell', primary: 'quads', secondary: ['glutes'] },
  { id: 'split-squat', name: 'Dumbbell split squat', equipment: 'dumbbell', primary: 'quads', secondary: ['glutes'], perHand: true },
  { id: 'box-squat', name: 'Goblet squat to a box', equipment: 'dumbbell', primary: 'quads', secondary: ['glutes'] },
  // Chest
  { id: 'db-bench', name: 'Dumbbell bench press', equipment: 'dumbbell', primary: 'chest', secondary: ['triceps', 'front delts'], perHand: true },
  { id: 'db-floor-press', name: 'Dumbbell bench or floor press', equipment: 'dumbbell', primary: 'chest', secondary: ['triceps', 'front delts'], perHand: true },
  { id: 'machine-chest-press', name: 'Machine chest press', equipment: 'machine', primary: 'chest', secondary: ['triceps', 'front delts'] },
  { id: 'push-up', name: 'Push-up', equipment: 'bodyweight', primary: 'chest', secondary: ['triceps', 'front delts'] },
  // Back
  { id: 'lat-pulldown', name: 'Lat pulldown', equipment: 'cable', primary: 'back', secondary: ['biceps'] },
  { id: 'seated-cable-row', name: 'Seated cable row', equipment: 'cable', primary: 'back', secondary: ['biceps', 'rear delts'] },
  { id: 'one-arm-row', name: 'One-arm dumbbell row', equipment: 'dumbbell', primary: 'back', secondary: ['biceps', 'rear delts'] },
  { id: 'db-bent-row', name: 'Dumbbell bent-over row', equipment: 'dumbbell', primary: 'back', secondary: ['biceps', 'rear delts'], perHand: true },
  // Hamstrings and glutes
  { id: 'db-rdl', name: 'Dumbbell Romanian deadlift', equipment: 'dumbbell', primary: 'hamstrings', secondary: ['glutes', 'back'], perHand: true },
  { id: 'leg-curl', name: 'Lying or seated leg curl', equipment: 'machine', primary: 'hamstrings', secondary: [] },
  { id: 'db-hip-thrust', name: 'Dumbbell hip thrust', equipment: 'dumbbell', primary: 'glutes', secondary: ['hamstrings'] },
  { id: 'glute-bridge', name: 'Dumbbell glute bridge', equipment: 'dumbbell', primary: 'glutes', secondary: ['hamstrings'] },
  // Shoulders
  { id: 'db-shoulder-press', name: 'Seated dumbbell shoulder press', equipment: 'dumbbell', primary: 'front delts', secondary: ['triceps'], perHand: true },
  { id: 'machine-shoulder-press', name: 'Machine shoulder press', equipment: 'machine', primary: 'front delts', secondary: ['triceps'] },
  { id: 'db-lateral-raise', name: 'Dumbbell lateral raise', equipment: 'dumbbell', primary: 'side delts', secondary: [], perHand: true },
  { id: 'cable-lateral-raise', name: 'Cable lateral raise', equipment: 'cable', primary: 'side delts', secondary: [] },
  // Arms
  { id: 'cable-pushdown', name: 'Cable triceps pushdown', equipment: 'cable', primary: 'triceps', secondary: [] },
  { id: 'db-overhead-ext', name: 'Overhead dumbbell triceps extension', equipment: 'dumbbell', primary: 'triceps', secondary: [] },
  { id: 'db-curl', name: 'Dumbbell curl', equipment: 'dumbbell', primary: 'biceps', secondary: [], perHand: true },
  { id: 'hammer-curl', name: 'Dumbbell hammer curl', equipment: 'dumbbell', primary: 'biceps', secondary: [], perHand: true },
  // Calves
  { id: 'calf-raise', name: 'Standing calf raise (machine)', equipment: 'machine', primary: 'calves', secondary: [] },
  { id: 'db-calf-raise', name: 'Dumbbell calf raise', equipment: 'dumbbell', primary: 'calves', secondary: [], perHand: true },
];
