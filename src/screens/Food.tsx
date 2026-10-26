import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db, type Food as FoodItem, type FoodSource, type MealSlot } from '../db';
import { nowISO, targetsOn, today, totalsFor } from '../data';
import { addDays } from '../rules/dates';
import { Icon } from '../icons';
import { HelpLink, ScreenTip } from '../tips';
import { useToday } from '../useToday';
import { fitsPreferences, type AvoidCategory } from '../rules/foodPrefs';
import { Chips, Loading, Sheet, fmt, fmtDate } from '../ui';

// Meal ideas are filtered by the foods you said you don't eat.
const SLOTS: { id: MealSlot; label: string; ideas: string[] }[] = [
  { id: 'breakfast', label: 'Breakfast', ideas: ['oats with milk and groundnuts', 'akara and pap', 'bread and boiled eggs', 'yam and egg sauce'] },
  { id: 'lunch', label: 'Lunch', ideas: ['jollof rice with chicken', 'beans and dodo', 'rice and beans with fish stew', 'beans porridge with crayfish'] },
  { id: 'dinner', label: 'Dinner', ideas: ['eba with egusi and beef', 'semo with efo riro and fish', 'yam porridge with fish', 'eba with egusi and goat meat'] },
  { id: 'snack', label: 'Snacks', ideas: ['groundnuts', 'boiled eggs', 'a banana', 'garri soaked with milk and groundnuts'] },
];

function ideasFor(slot: (typeof SLOTS)[number], avoid: AvoidCategory[]) {
  const fit = slot.ideas.filter((i) => fitsPreferences(i, avoid)).slice(0, 2);
  return fit.length ? `Ideas: ${fit.join(', or ')}.` : '';
}

const sourceLabel = (f: FoodItem) =>
  f.id.startsWith('wafct-') ? 'FAO West Africa table'
    : f.id.startsWith('fdc-') ? 'USDA'
      : f.source.kind === 'label' ? 'Food label'
        : f.source.kind === 'reference' ? 'Reference table'
          : 'Your estimate';

const macros = (f: FoodItem, grams: number) => ({
  kcal: (f.kcal * grams) / 100, proteinG: (f.proteinG * grams) / 100, carbsG: (f.carbsG * grams) / 100, fatG: (f.fatG * grams) / 100,
});

export default function Food() {
  const [params, setParams] = useSearchParams();
  const todayDate = useToday();
  const date = params.get('date') ?? todayDate;
  const [adding, setAdding] = useState<MealSlot | null>(null);

  const data = useLiveQuery(async () => {
    const entries = await db.foodEntries.where('date').equals(date).toArray();
    const foods = new Map((await db.foods.toArray()).map((f) => [f.id, f]));
    return {
      entries, foods,
      totals: await totalsFor(entries),
      targets: await targetsOn(date),
      mark: await db.foodDays.get(date),
      avoid: (await db.settings.get('me'))?.avoidFoods ?? [],
    };
  }, [date]);
  if (!data) return <Loading label="Loading food log" />;
  const { entries, foods, totals, targets, mark, avoid } = data;
  const complete = mark?.complete === true;
  const status = complete ? 'complete' : entries.length ? 'partial' : 'not-logged';
  const go = (d: string) => setParams(d === today() ? {} : { date: d });

  async function setComplete(value: boolean) {
    await db.foodDays.put({ date, complete: value });
  }

  async function saveMeal(slot: MealSlot) {
    const name = prompt('Name this meal (e.g. "Rice, stew and chicken")');
    if (!name) return;
    const items = entries.filter((e) => e.slot === slot).map(({ foodId, grams, portionText }) => ({ foodId, grams, portionText }));
    await db.savedMeals.add({ name, slot, items });
  }

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Food</h1>
          <p className="meta">{date === today() ? `Today, ${fmtDate(date, { day: 'numeric', month: 'long' })}` : fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="ghost icon-btn" aria-label="Previous day" onClick={() => go(addDays(date, -1))}><Icon name="back" /></button>
          <button className="ghost icon-btn" aria-label="Next day" disabled={date >= today()} onClick={() => go(addDays(date, 1))}><Icon name="next" /></button>
        </div>
      </header>

      <ScreenTip id="food" />

      <div className="card">
        <div className="row between">
          <span className={`badge ${status === 'complete' ? 'ok' : status === 'partial' ? 'warn' : ''}`}>
            {status === 'complete' ? 'Complete' : status === 'partial' ? 'In progress' : 'Not logged'}
          </span>
          <span className="muted small">All values are estimates</span>
        </div>
        {status === 'not-logged' ? (
          <p className="muted" style={{ marginTop: 8 }}>Nothing logged yet. An empty day is left out of your averages, not counted as 0 kcal.</p>
        ) : (
          <div className="kpis" style={{ marginTop: 8 }}>
            <Kpi label="kcal" value={totals.kcal} target={targets?.calories} />
            <Kpi label="protein g" value={totals.proteinG} target={targets?.proteinG} />
            <Kpi label="carbs g" value={totals.carbsG} target={targets?.carbsG} />
            <Kpi label="fat g" value={totals.fatG} target={targets?.fatG} />
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          {complete ? (
            <button className="block" onClick={() => setComplete(false)}>Undo "complete"</button>
          ) : entries.length > 0 ? (
            <button className="primary block" onClick={() => setComplete(true)}>I've logged everything I ate</button>
          ) : (
            <button className="ghost small block" onClick={() => confirm('Record that you ate nothing on this day? It will count as 0 kcal.') && setComplete(true)}>
              I ate nothing this day
            </button>
          )}
          <p className="hint">Only complete days are used for averages and calorie advice. <HelpLink term="complete-day">Why?</HelpLink></p>
        </div>
      </div>

      {SLOTS.map((slot) => {
        const list = entries.filter((e) => e.slot === slot.id);
        return (
          <section key={slot.id} className="card" aria-label={slot.label}>
            <div className="row between">
              <h2 style={{ margin: 0 }}>{slot.label}</h2>
              <span className="muted small num">{list.length ? `${fmt(list.reduce((s, e) => s + macros(foods.get(e.foodId)!, e.grams).kcal, 0))} kcal` : ''}</span>
            </div>
            {list.length === 0 && <p className="muted small" style={{ margin: '4px 0 0' }}>Nothing logged. {ideasFor(slot, avoid)}</p>}
            {list.length > 0 && (
              <ul className="list" style={{ marginTop: 6 }}>
                {list.map((e) => {
                  const f = foods.get(e.foodId);
                  const m = f ? macros(f, e.grams) : null;
                  return (
                    <li key={e.id} className="row between">
                      <div className="grow">
                        <div style={{ fontWeight: 600 }}>{f?.name ?? 'Unknown food'}</div>
                        <div className="muted small">{e.portionText} · {fmt(e.grams)} g</div>
                      </div>
                      <div className="num small" style={{ textAlign: 'right' }}>{m && <>{fmt(m.kcal)} kcal<br />{fmt(m.proteinG)} g P</>}</div>
                      <button className="ghost danger icon-btn" aria-label={`Remove ${f?.name}`} onClick={() => db.foodEntries.delete(e.id!)}><Icon name="trash" size="sm" /></button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="grow" onClick={() => setAdding(slot.id)}><Icon name="plus" size="sm" />Add to {slot.label.toLowerCase()}</button>
              {list.length > 1 && <button className="ghost" onClick={() => saveMeal(slot.id)}>Save as meal</button>}
            </div>
          </section>
        );
      })}

      {adding && <AddFood date={date} slot={adding} avoid={avoid} onClose={() => setAdding(null)} />}
    </div>
  );
}

function Kpi({ label, value, target }: { label: string; value: number; target?: number }) {
  return (
    <div className="kpi">
      <div className="v">{fmt(value)}</div>
      <div className="l">{label}{target ? ` of ${target}` : ''}</div>
      {target ? <div className="bar" style={{ marginTop: 4 }}><span style={{ width: `${Math.min(100, (value / target) * 100)}%` }} /></div> : null}
    </div>
  );
}

function AddFood({ date, slot, avoid, onClose }: { date: string; slot: MealSlot; avoid: AvoidCategory[]; onClose: () => void }) {
  const allFoods = useLiveQuery(() => db.foods.orderBy('name').toArray());
  const [showAll, setShowAll] = useState(false);
  const loading = allFoods === undefined;
  const fitting = (allFoods ?? []).filter((f) => fitsPreferences(f.name, avoid));
  const hidden = (allFoods?.length ?? 0) - fitting.length;
  const foods = showAll ? allFoods ?? [] : fitting;
  const meals = useLiveQuery(() => db.savedMeals.toArray()) ?? [];
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<FoodItem | null>(null);
  const [creating, setCreating] = useState(false);
  const shown = useMemo(() => foods.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())), [foods, q]);

  async function addMeal(id: number) {
    const meal = meals.find((m) => m.id === id);
    if (!meal) return;
    await db.foodEntries.bulkAdd(meal.items.map((it) => ({ ...it, date, slot, loggedAt: nowISO() })));
    onClose();
  }

  if (creating) return <Sheet title="New food" onClose={onClose}><NewFood onSaved={(f) => { setCreating(false); setPicked(f); }} /></Sheet>;
  if (picked) return <Sheet title={picked.name} onClose={onClose}><Portion food={picked} onBack={() => setPicked(null)} onAdd={async (grams, portionText) => {
    await db.foodEntries.add({ date, slot, foodId: picked.id, grams, portionText, loggedAt: nowISO() });
    onClose();
  }} /></Sheet>;

  return (
    <Sheet title={`Add to ${slot}`} onClose={onClose}>
      {meals.length > 0 && (
        <div className="field">
          <label>Saved meals</label>
          <div className="chips">{meals.map((m) => <button key={m.id} className="chip" onClick={() => addMeal(m.id!)}>{m.name}</button>)}</div>
        </div>
      )}
      <input type="search" placeholder="Search foods" aria-label="Search foods" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {loading && <p className="muted small" role="status" style={{ marginTop: 8 }}>Loading foods…</p>}
      {hidden > 0 && (
        <p className="hint">
          {showAll ? 'Showing all foods.' : `Hiding ${hidden} food${hidden === 1 ? '' : 's'} you don't eat.`}{' '}
          <button type="button" className="ghost" style={{ minHeight: 36, padding: '0 6px' }} onClick={() => setShowAll((v) => !v)}>{showAll ? 'Hide them' : 'Show all'}</button>
        </p>
      )}
      {!loading && q && shown.length === 0 && <p className="muted small" style={{ marginTop: 8 }}>No food matches "{q}". Create it below with values from the label or a reference table.</p>}
      {foods.length === 0 && <p className="muted small" style={{ marginTop: 8 }}>The food library is empty. Add your first food below.</p>}
      <ul className="list" style={{ marginTop: 8 }}>
        {shown.map((f) => (
          <li key={f.id}>
            <button className="ghost block" style={{ justifyContent: 'space-between', textAlign: 'left', padding: '0 4px' }} onClick={() => setPicked(f)}>
              <span className="grow">{f.name}<br /><span className="muted small">{sourceLabel(f)}</span></span>
              <span className="muted small num">{fmt(f.kcal)} kcal/100 g</span>
            </button>
          </li>
        ))}
      </ul>
      <button className="block" style={{ marginTop: 8 }} onClick={() => setCreating(true)}>+ Create a food</button>
    </Sheet>
  );
}

const MEASURE_BASIS = { weighed: 'weighed by me', estimate: 'my estimate, not weighed' } as const;

function Portion({ food, onAdd, onBack }: { food: FoodItem; onAdd: (grams: number, text: string) => void; onBack: () => void }) {
  const mine = useLiveQuery(() => db.measures.where('foodId').equals(food.id).toArray(), [food.id]) ?? [];
  const options = [
    { label: 'grams', grams: 1, basis: '', userId: undefined as number | undefined },
    ...mine.map((m) => ({ label: m.label, grams: m.grams, basis: MEASURE_BASIS[m.basis], userId: m.id })),
    ...food.measures.map((m) => ({ ...m, userId: undefined })),
  ];
  const [idx, setIdx] = useState(food.measures.length ? 1 : 0);
  const [qty, setQty] = useState(idx === 0 ? '100' : '1');
  const [addingMeasure, setAddingMeasure] = useState(false);
  const m = options[Math.min(idx, options.length - 1)];
  const grams = (+qty.replace(',', '.') || 0) * m.grams;
  const est = macros(food, grams);
  const text = idx === 0 ? `${qty} g` : `${qty} × ${m.label}`;
  return (
    <>
      <div className="row">
        <div className="field grow"><label htmlFor="qty">Amount</label><input id="qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
        <div className="field grow">
          <label htmlFor="unit">Unit</label>
          <select id="unit" value={idx} onChange={(e) => { const i = +e.target.value; setIdx(i); setQty(i === 0 ? '100' : '1'); }}>
            {options.map((o, i) => <option key={i} value={i}>{i === 0 ? 'grams' : `${o.label} (${fmt(o.grams)} g)`}</option>)}
          </select>
        </div>
      </div>
      {idx > 0 && (
        <p className="hint">
          Gram weight: {m.basis}.{m.basis !== MEASURE_BASIS.weighed && ' Weigh it once on a kitchen scale to make this more accurate.'}
          {m.userId !== undefined && <> <button className="ghost danger small" style={{ minHeight: 32, padding: '0 6px' }} onClick={() => { setIdx(0); setQty('100'); void db.measures.delete(m.userId!); }}>Remove measure</button></>}
        </p>
      )}
      {addingMeasure ? (
        <AddMeasure foodId={food.id} onDone={(added) => { setAddingMeasure(false); if (added) { setIdx(1); setQty('1'); } }} />
      ) : (
        <button className="ghost small" onClick={() => setAddingMeasure(true)}>+ Add a household measure (spoon, cup, wrap…)</button>
      )}
      <div className="kpis" style={{ margin: '8px 0' }}>
        <div className="kpi"><div className="v">{fmt(est.kcal)}</div><div className="l">kcal (est.)</div></div>
        <div className="kpi"><div className="v">{fmt(est.proteinG, 1)} g</div><div className="l">protein</div></div>
      </div>
      <p className="hint">Source: {food.source.citation}{food.source.url && <> · <a href={food.source.url} target="_blank" rel="noreferrer">view</a></>}</p>
      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={onBack}>Back</button>
        <button className="primary grow" disabled={grams <= 0} onClick={() => onAdd(grams, text)}>Add {fmt(grams)} g</button>
      </div>
    </>
  );
}

const COMMON_MEASURES = ['1 serving spoon', '1 cooking spoon', '1 cup', '1 wrap', '1 piece', '1 tablespoon', '1 handful'];

function AddMeasure({ foodId, onDone }: { foodId: string; onDone: (added: boolean) => void }) {
  const [label, setLabel] = useState('');
  const [grams, setGrams] = useState('');
  const [basis, setBasis] = useState<'weighed' | 'estimate'>('estimate');
  const g = +grams.replace(',', '.');
  const ok = label.trim() && g > 0 && g < 5000;
  return (
    <div className="card soft" style={{ padding: 12 }}>
      <div className="field">
        <label htmlFor="mlabel">Measure</label>
        <input id="mlabel" list="common-measures" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="1 serving spoon" />
        <datalist id="common-measures">{COMMON_MEASURES.map((c) => <option key={c} value={c} />)}</datalist>
        <div className="hint">Use your own spoon, cup or wrap size, since these vary a lot between homes.</div>
      </div>
      <div className="field"><label htmlFor="mgrams">Grams in one</label><input id="mgrams" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} /></div>
      <div className="field">
        <Chips label="How do you know the grams?" value={basis} onChange={setBasis} options={[{ value: 'weighed', label: 'I weighed it' }, { value: 'estimate', label: 'Estimate' }]} />
      </div>
      <div className="row">
        <button onClick={() => onDone(false)}>Cancel</button>
        <button className="primary grow" disabled={!ok} onClick={async () => { await db.measures.add({ foodId, label: label.trim(), grams: g, basis }); onDone(true); }}>Save measure</button>
      </div>
    </div>
  );
}

function NewFood({ onSaved }: { onSaved: (f: FoodItem) => void }) {
  const [name, setName] = useState('');
  const [basisGrams, setBasisGrams] = useState('100');
  const [vals, setVals] = useState({ kcal: '', proteinG: '', carbsG: '', fatG: '' });
  const [kind, setKind] = useState<FoodSource['kind']>('label');
  const [citation, setCitation] = useState('');
  const [measure, setMeasure] = useState({ label: '', grams: '' });

  const per = +basisGrams || 0;
  const n = (s: string) => +s.replace(',', '.');
  const ok = name.trim() && per > 0 && [vals.kcal, vals.proteinG, vals.carbsG, vals.fatG].every((v) => v !== '' && n(v) >= 0) && citation.trim();

  async function save() {
    if (!ok) return;
    const scale = 100 / per;
    const food: FoodItem = {
      id: `user-${Date.now()}`, name: name.trim(), builtIn: false,
      kcal: n(vals.kcal) * scale, proteinG: n(vals.proteinG) * scale, carbsG: n(vals.carbsG) * scale, fatG: n(vals.fatG) * scale,
      measures: measure.label && n(measure.grams) > 0 ? [{ label: measure.label, grams: n(measure.grams), basis: kind === 'user' ? 'my estimate' : 'my measurement' }] : [],
      source: { kind, citation: citation.trim() },
    };
    await db.foods.add(food);
    onSaved(food);
  }

  const num = (key: keyof typeof vals, label: string) => (
    <div className="field grow"><label htmlFor={key}>{label}</label><input id={key} inputMode="decimal" value={vals[key]} onChange={(e) => setVals({ ...vals, [key]: e.target.value })} /></div>
  );

  return (
    <>
      <div className="field"><label htmlFor="fn">Name</label><input id="fn" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Golden Penny spaghetti (dry)" /></div>
      <div className="field">
        <label htmlFor="per">Values are per … grams</label>
        <input id="per" inputMode="decimal" value={basisGrams} onChange={(e) => setBasisGrams(e.target.value)} />
        <div className="hint">Use 100 for "per 100 g", or the serving size printed on the label.</div>
      </div>
      <div className="row">{num('kcal', 'kcal')}{num('proteinG', 'Protein g')}</div>
      <div className="row">{num('carbsG', 'Carbs g')}{num('fatG', 'Fat g')}</div>
      <div className="field">
        <label>Where do these numbers come from?</label>
        <Chips label="Source type" value={kind} onChange={setKind} options={[{ value: 'label', label: 'Food label' }, { value: 'reference', label: 'Reference table' }, { value: 'user', label: 'My estimate' }]} />
      </div>
      <div className="field"><label htmlFor="cit">Source details</label><input id="cit" value={citation} onChange={(e) => setCitation(e.target.value)} placeholder={kind === 'label' ? 'Brand, pack size' : kind === 'reference' ? 'Table name and item code' : 'How you estimated it'} /></div>
      <div className="row">
        <div className="field grow"><label htmlFor="ml">Household measure (optional)</label><input id="ml" value={measure.label} onChange={(e) => setMeasure({ ...measure, label: e.target.value })} placeholder="1 cooking spoon" /></div>
        <div className="field" style={{ width: 110 }}><label htmlFor="mg">grams</label><input id="mg" inputMode="decimal" value={measure.grams} onChange={(e) => setMeasure({ ...measure, grams: e.target.value })} /></div>
      </div>
      <button className="primary block" disabled={!ok} onClick={save}>Save food</button>
    </>
  );
}
