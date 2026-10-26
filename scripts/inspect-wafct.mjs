// Lists WAFCT rows matching keywords: node scripts/inspect-wafct.mjs <file> <regex>
import ExcelJS from 'exceljs';

const [file, pattern] = process.argv.slice(2);
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const cell = (v) => (v && typeof v === 'object' ? (v.result ?? v.text ?? v.richText?.map((t) => t.text).join('')) : v);

if (pattern === 'intro') {
  wb.getWorksheet('01 Introduction').eachRow((row) => console.log(row.values.slice(1).map(cell).filter(Boolean).join(' | ').slice(0, 900)));
  process.exit(0);
}
const re = new RegExp(pattern, 'i');
const ws = wb.getWorksheet('03 NV_sum_39 (per 100g EP)');
ws.eachRow((row, r) => {
  if (r < 4) return;
  const v = row.values.map(cell);
  if (!v[1] || !re.test(v[2] ?? '')) return;
  // Columns: 1 code, 2 English name, 5 source, 8 kcal, 10 protein, 11 fat, 12 carbs, 13 fibre
  console.log(`${v[1]} | ${v[2]} | kcal ${v[8]} P ${v[10]} F ${v[11]} C ${v[12]} Fib ${v[13]} | ${String(v[5]).slice(0, 40)}`);
});
