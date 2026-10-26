import type { Program, ProgramSlot } from '../db';

// Beginner full-body, 3 days a week, two alternating sessions (A/B).
// Each major muscle gets roughly 6–10 hard sets a week, which is plenty to
// grow as a beginner while learning the movements. About 50–60 minutes.

const slot = (exerciseId: string, sets: number, repMin: number, repMax: number, restSec: number): ProgramSlot => ({
  exerciseId, sets, repMin, repMax, targetRir: 2, restSec,
});

export const PROGRAM_TEMPLATES: Omit<Program, 'active' | 'createdAt'>[] = [
  {
    id: 'gym-full-body',
    name: 'Gym full body A/B',
    setting: 'gym',
    days: [
      { id: 'A', name: 'Full body A', slots: [
        slot('leg-press', 3, 8, 12, 150),
        slot('db-bench', 3, 8, 12, 120),
        slot('lat-pulldown', 3, 8, 12, 120),
        slot('db-rdl', 3, 8, 12, 120),
        slot('db-lateral-raise', 2, 12, 15, 60),
        slot('cable-pushdown', 2, 10, 15, 60),
      ] },
      { id: 'B', name: 'Full body B', slots: [
        slot('goblet-squat', 3, 8, 12, 150),
        slot('seated-cable-row', 3, 8, 12, 120),
        slot('db-shoulder-press', 3, 8, 12, 120),
        slot('leg-curl', 3, 10, 15, 90),
        slot('machine-chest-press', 2, 8, 12, 90),
        slot('db-curl', 2, 10, 15, 60),
        slot('calf-raise', 2, 10, 15, 60),
      ] },
    ],
  },
  {
    id: 'home-full-body',
    name: 'Home full body A/B (dumbbells + bench)',
    setting: 'home',
    days: [
      { id: 'A', name: 'Full body A', slots: [
        slot('goblet-squat', 3, 8, 12, 150),
        slot('db-floor-press', 3, 8, 12, 120),
        slot('one-arm-row', 3, 8, 12, 90),
        slot('db-rdl', 3, 8, 12, 120),
        slot('db-lateral-raise', 2, 12, 15, 60),
        slot('db-overhead-ext', 2, 10, 15, 60),
      ] },
      { id: 'B', name: 'Full body B', slots: [
        slot('split-squat', 3, 8, 12, 120),
        slot('push-up', 3, 8, 15, 90),
        slot('db-bent-row', 3, 8, 12, 120),
        slot('db-shoulder-press', 3, 8, 12, 120),
        slot('db-hip-thrust', 3, 10, 15, 90),
        slot('db-curl', 2, 10, 15, 60),
      ] },
    ],
  },
];
