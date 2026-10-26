// Meal recipes for the planner, built from cited foods (FAO West African table, raw as bought).
// Amounts are typical home portions for ONE serving. They are estimates, not measurements:
// the planner scales them to your targets, and you can weigh once to make them your own.

export type MealKind = 'breakfast' | 'main' | 'snack';

export interface MealIngredient {
  foodId: string;
  /** Raw, as-bought grams for one serving. */
  grams: number;
  /** Cook-ahead group this ingredient is prepared in (rice, beans, stew, soup...). */
  batch?: string;
}

export interface MealRecipe {
  id: string;
  name: string;
  kind: MealKind;
  ingredients: MealIngredient[];
  /** What in the numbers is an estimate, in plain words. */
  notes: string[];
}

const f = (code: string) => `wafct-${code}`;
const FOOD = {
  rice: f('01_036'), oats: f('01_101'), ogi: f('01_100'), bread: f('01_046'), pasta: f('01_052'),
  gari: f('02_039'), fufu: f('02_041'), yam: f('02_034'), ripePlantain: f('02_042'),
  beans: f('03_004'), efo: f('04_023'), onion: f('04_018'), tomato: f('04_021'), chilli: f('04_046'),
  groundnuts: f('06_010'), egusi: f('06_013'), beef: f('07_009'), chicken: f('07_030'), egg: f('08_001'),
  mackerel: f('09_003'), catfish: f('09_018'), crayfish: f('09_057'), milk: f('10_002'), banana: f('05_003'),
  palmOil: f('11_004'), vegOil: f('11_031'), sugar: f('13_002'),
};

const FRY_NOTE = 'Oil soaked up when frying is an estimate.';
const STEW_NOTE = 'Stew oil and tomato amounts are typical, not measured.';

export const MEALS: MealRecipe[] = [
  // Breakfasts
  { id: 'oats-milk-groundnuts', name: 'Oats with milk and groundnuts', kind: 'breakfast', notes: [],
    ingredients: [{ foodId: FOOD.oats, grams: 60 }, { foodId: FOOD.milk, grams: 25 }, { foodId: FOOD.groundnuts, grams: 20 }] },
  { id: 'akara-pap', name: 'Akara and pap', kind: 'breakfast', notes: [FRY_NOTE],
    ingredients: [
      { foodId: FOOD.beans, grams: 60 }, { foodId: FOOD.onion, grams: 10 }, { foodId: FOOD.vegOil, grams: 12 },
      { foodId: FOOD.ogi, grams: 300 }, { foodId: FOOD.milk, grams: 10 }, { foodId: FOOD.sugar, grams: 10 },
    ] },
  { id: 'bread-eggs', name: 'Bread and boiled eggs', kind: 'breakfast', notes: [],
    ingredients: [{ foodId: FOOD.bread, grams: 100 }, { foodId: FOOD.egg, grams: 100 }] },
  { id: 'yam-egg-sauce', name: 'Yam and egg sauce', kind: 'breakfast', notes: [STEW_NOTE],
    ingredients: [
      { foodId: FOOD.yam, grams: 250 }, { foodId: FOOD.egg, grams: 100 }, { foodId: FOOD.tomato, grams: 100 },
      { foodId: FOOD.onion, grams: 30 }, { foodId: FOOD.chilli, grams: 10 }, { foodId: FOOD.vegOil, grams: 15 },
    ] },

  // Main meals (lunch and dinner)
  { id: 'rice-chicken', name: 'Rice and chicken stew', kind: 'main', notes: [STEW_NOTE],
    ingredients: [
      { foodId: FOOD.rice, grams: 100, batch: 'Rice' },
      { foodId: FOOD.chicken, grams: 150, batch: 'Stew' }, { foodId: FOOD.tomato, grams: 120, batch: 'Stew' },
      { foodId: FOOD.onion, grams: 30, batch: 'Stew' }, { foodId: FOOD.chilli, grams: 10, batch: 'Stew' },
      { foodId: FOOD.vegOil, grams: 15, batch: 'Stew' },
    ] },
  { id: 'rice-beans-fish', name: 'Rice and beans with fish stew', kind: 'main', notes: [STEW_NOTE],
    ingredients: [
      { foodId: FOOD.rice, grams: 70, batch: 'Rice' }, { foodId: FOOD.beans, grams: 40, batch: 'Beans' },
      { foodId: FOOD.mackerel, grams: 120, batch: 'Stew' }, { foodId: FOOD.tomato, grams: 100, batch: 'Stew' },
      { foodId: FOOD.onion, grams: 25, batch: 'Stew' }, { foodId: FOOD.chilli, grams: 10, batch: 'Stew' },
      { foodId: FOOD.palmOil, grams: 10, batch: 'Stew' },
    ] },
  { id: 'beans-dodo', name: 'Beans and dodo', kind: 'main', notes: [FRY_NOTE],
    ingredients: [
      { foodId: FOOD.beans, grams: 90, batch: 'Beans' }, { foodId: FOOD.palmOil, grams: 12, batch: 'Beans' },
      { foodId: FOOD.crayfish, grams: 5, batch: 'Beans' }, { foodId: FOOD.onion, grams: 20, batch: 'Beans' },
      { foodId: FOOD.ripePlantain, grams: 150 }, { foodId: FOOD.vegOil, grams: 10 },
    ] },
  { id: 'eba-egusi-beef', name: 'Eba and egusi soup with beef', kind: 'main', notes: ['Soup oil is a typical amount, not measured. Eba is counted as the dry garri.'],
    ingredients: [
      { foodId: FOOD.gari, grams: 100 },
      { foodId: FOOD.egusi, grams: 40, batch: 'Egusi soup' }, { foodId: FOOD.palmOil, grams: 15, batch: 'Egusi soup' },
      { foodId: FOOD.beef, grams: 120, batch: 'Egusi soup' }, { foodId: FOOD.efo, grams: 50, batch: 'Egusi soup' },
      { foodId: FOOD.crayfish, grams: 5, batch: 'Egusi soup' }, { foodId: FOOD.onion, grams: 20, batch: 'Egusi soup' },
    ] },
  { id: 'fufu-efo-fish', name: 'Fufu and efo riro with fish', kind: 'main', notes: ['Soup oil is a typical amount, not measured.'],
    ingredients: [
      { foodId: FOOD.fufu, grams: 250 },
      { foodId: FOOD.efo, grams: 150, batch: 'Efo riro' }, { foodId: FOOD.palmOil, grams: 15, batch: 'Efo riro' },
      { foodId: FOOD.catfish, grams: 150, batch: 'Efo riro' }, { foodId: FOOD.tomato, grams: 60, batch: 'Efo riro' },
      { foodId: FOOD.chilli, grams: 10, batch: 'Efo riro' }, { foodId: FOOD.onion, grams: 20, batch: 'Efo riro' },
    ] },
  { id: 'yam-porridge-fish', name: 'Yam porridge with fish', kind: 'main', notes: [STEW_NOTE],
    ingredients: [
      { foodId: FOOD.yam, grams: 300 }, { foodId: FOOD.palmOil, grams: 15 }, { foodId: FOOD.mackerel, grams: 100 },
      { foodId: FOOD.tomato, grams: 60 }, { foodId: FOOD.chilli, grams: 10 }, { foodId: FOOD.onion, grams: 25 },
      { foodId: FOOD.crayfish, grams: 5 },
    ] },
  { id: 'spaghetti-egg', name: 'Spaghetti with egg', kind: 'main', notes: [STEW_NOTE],
    ingredients: [
      { foodId: FOOD.pasta, grams: 100 }, { foodId: FOOD.egg, grams: 100 }, { foodId: FOOD.tomato, grams: 80 },
      { foodId: FOOD.onion, grams: 20 }, { foodId: FOOD.vegOil, grams: 10 },
    ] },

  // Snacks
  { id: 'groundnuts', name: 'Groundnuts', kind: 'snack', notes: [],
    ingredients: [{ foodId: FOOD.groundnuts, grams: 40 }] },
  { id: 'boiled-eggs', name: 'Boiled eggs', kind: 'snack', notes: [],
    ingredients: [{ foodId: FOOD.egg, grams: 100 }] },
  { id: 'banana', name: 'Banana', kind: 'snack', notes: ['One medium banana is taken as about 120 g of fruit.'],
    ingredients: [{ foodId: FOOD.banana, grams: 120 }] },
  { id: 'garri-soakings', name: 'Garri soaked with milk and groundnuts', kind: 'snack', notes: [],
    ingredients: [{ foodId: FOOD.gari, grams: 60 }, { foodId: FOOD.milk, grams: 20 }, { foodId: FOOD.groundnuts, grams: 20 }, { foodId: FOOD.sugar, grams: 10 }] },
];

/** Average weight of one egg used to show eggs as a count. */
export const EGG_GRAMS = 50;
export const EGG_FOOD_ID = FOOD.egg;
