// Builds src/seed/foods-wafct.ts from the FAO/INFOODS West African Food Composition Table (2019).
//
//   1. Download https://www.fao.org/fileadmin/user_upload/faoweb/2020/WAFCT_2019.xlsx (3.06 MB)
//      into data/wafct/ (git-ignored).
//   2. npm run foods:wafct
//
// Licence: FAO permits use in non-commercial products with acknowledgement. Commercial use
// (e.g. a paid version of this app) needs permission: www.fao.org/contact-us/licence-request.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';

const FILE = process.argv[2] || 'data/wafct/WAFCT_2019.xlsx';
const EXPECTED_SHA256 = 'bca8e44f7a41fdd538998d9e31849ed26af4703ddb5a451803d73a2d9532cc85';
const SHEET = '03 NV_sum_39 (per 100g EP)';
const CITATION = 'FAO/INFOODS Food Composition Table for Western Africa (2019), © FAO 2020';
const SOURCE_URL = 'https://www.fao.org/food-composition/tables-and-databases/detail/food-composition-tables/en';

// WAFCT code → name shown in the app. The script checks each code exists and prints FAO's own name.
const FOODS = {
  '01_069': 'White rice, boiled',
  '01_101': 'Oats, rolled, dry',
  '01_133': 'Oat porridge (made with water)',
  '01_100': 'Pap / ogi (fermented maize porridge), cooked',
  '01_046': 'White bread',
  '02_039': 'Garri, white, dry (log eba by the dry garri used)',
  '02_041': 'Fufu (wet fermented cassava paste)',
  '02_035': 'Yam (Nigerian varieties), boiled',
  '02_057': 'Ripe plantain, boiled',
  '02_064': 'Unripe plantain, boiled',
  '02_084': 'Plantain, deep fried (dodo)',
  '02_023': 'Sweet potato (white flesh), boiled',
  '03_029': 'White beans (cowpea), boiled, drained',
  '03_028': 'Brown beans (cowpea, e.g. oloyin), boiled, drained',
  '03_004': 'Beans (cowpea), dry, raw (for moi moi / akara recipes)',
  '03_042': 'Iru / dawadawa (fermented locust beans)',
  '04_086': 'Efo / amaranth leaves, boiled',
  '04_107': 'Ewedu (jute leaves), boiled',
  '04_111': 'Okra, boiled',
  '06_010': 'Groundnuts, raw (shelled)',
  '06_026': 'Groundnut paste',
  '06_013': 'Egusi (melon seed kernels), dried',
  '07_085': 'Beef, lean, stewed',
  '07_086': 'Beef, medium fat, stewed',
  '07_092': 'Shaki (beef tripe), stewed',
  '07_089': 'Beef liver, stewed',
  '07_102': 'Chicken, dark meat, no skin, stewed',
  '07_103': 'Chicken, dark meat with skin, stewed',
  '07_104': 'Chicken, light meat with skin, stewed',
  '07_115': 'Goat meat, lean, stewed',
  '07_025': 'Corned beef, canned',
  '08_002': 'Egg, boiled',
  '08_003': 'Egg, fried in oil',
  '09_069': 'Mackerel (titus), boiled',
  '09_108': 'Catfish, boiled (e.g. in pepper soup)',
  '09_089': 'Tilapia, boiled',
  '09_037': 'Sardines, canned in oil, drained',
  '09_057': 'Crayfish, dried',
  '11_004': 'Palm oil, red',
  '11_031': 'Vegetable oil',
  // Raw ingredients, as bought: used by meal recipes, the shopping list and the cooking guide.
  '01_036': 'Rice, white, raw',
  '02_034': 'Yam (Nigerian varieties), raw, peeled',
  '02_042': 'Ripe plantain, raw, peeled',
  '02_046': 'Unripe plantain, raw, peeled',
  '04_023': 'Efo / amaranth leaves, raw',
  '04_018': 'Onion, raw',
  '04_021': 'Tomato, raw',
  '04_046': 'Chilli pepper (ata rodo / tatashe-type), raw',
  '07_009': 'Beef, lean, raw',
  '07_030': 'Chicken, dark meat with skin, raw',
  '08_001': 'Egg, raw (as bought)',
  '09_003': 'Mackerel (titus), raw',
  '09_018': 'Catfish, raw',
  '13_002': 'Sugar, white',
  '10_002': 'Powdered milk, whole',
  '10_016': 'Evaporated milk',
  '05_003': 'Banana, ripe',
  '01_052': 'Pasta (spaghetti or macaroni), dry',
};

const sha = createHash('sha256').update(readFileSync(FILE)).digest('hex');
if (sha !== EXPECTED_SHA256) console.warn(`⚠ File hash differs from the 2019 edition this list was checked against (${sha}).`);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(FILE);
const ws = wb.getWorksheet(SHEET);
if (!ws) throw new Error(`Sheet "${SHEET}" not found`);

const text = (v) => (v && typeof v === 'object' ? (v.result ?? v.text ?? v.richText?.map((t) => t.text).join('')) : v);
// Values in [brackets] are lower-quality in WAFCT (e.g. fat by a less precise method); "tr" = trace.
const num = (v) => {
  const s = String(text(v) ?? '').trim();
  if (s === '' || s === '-') return { value: null, flagged: false };
  if (/^tr$/i.test(s)) return { value: 0, flagged: false };
  const flagged = s.startsWith('[');
  const value = Number(s.replace(/[[\]]/g, ''));
  return { value: Number.isFinite(value) ? value : null, flagged };
};

const rows = new Map();
ws.eachRow((row, r) => {
  if (r < 4) return;
  const v = row.values;
  const code = text(v[1]);
  if (code && FOODS[code]) rows.set(code, v);
});

const out = [];
for (const [code, name] of Object.entries(FOODS)) {
  const v = rows.get(code);
  if (!v) throw new Error(`WAFCT code ${code} (${name}) not found`);
  // Columns: 2 English name, 5 source, 8 energy kcal, 10 protein, 11 fat, 12 available carbohydrate
  const faoName = text(v[2]);
  const kcal = num(v[8]), protein = num(v[10]), fat = num(v[11]), carbs = num(v[12]);
  if ([kcal, protein, fat, carbs].some((n) => n.value === null)) throw new Error(`Missing macro for ${code} ${faoName}`);
  const notes = [];
  if ([kcal, protein, fat, carbs].some((n) => n.flagged)) notes.push('some values are lower-quality estimates in the source');
  if (/\*/.test(faoName)) notes.push('cooked values calculated by FAO from the raw food');
  console.log(`${code}  ${name.padEnd(52)} ← ${faoName}`);
  out.push({
    id: `wafct-${code}`,
    name,
    kcal: kcal.value,
    proteinG: protein.value,
    carbsG: carbs.value,
    fatG: fat.value,
    measures: [],
    source: {
      kind: 'reference',
      citation: `${CITATION}, code ${code}: "${faoName}"${notes.length ? ` (${notes.join('; ')})` : ''}`,
      url: SOURCE_URL,
    },
    builtIn: true,
  });
}

const file = `// GENERATED by scripts/import-wafct.mjs on ${new Date().toISOString().slice(0, 10)}. Do not edit by hand.
// Values per 100 g edible portion from the ${CITATION}.
// Licence: non-commercial use with acknowledgement; commercial use needs FAO permission.
import type { Food } from '../db';

export const WAFCT_FOODS: Food[] = ${JSON.stringify(out, null, 2)};
`;
writeFileSync(new URL('../src/seed/foods-wafct.ts', import.meta.url), file);
console.log(`\nWrote ${out.length} foods to src/seed/foods-wafct.ts`);
