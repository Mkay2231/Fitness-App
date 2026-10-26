// Meal plan views: what to eat each day (with one-tap logging and swaps),
// and the week's cook-ahead amounts and shopping list.

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { today } from '../data';
import { db } from '../db';
import { Icon } from '../icons';
import { dayPlan, logPlannedMeal, portionLabel, swapPlannedMeal, unlogPlannedMeal, weekPlan } from '../mealData';
import { addDays, weekStart } from '../rules/dates';
import { cookAhead, shoppingList, type FoodMacros, type PlannedMeal } from '../rules/mealPlan';
import { EGG_FOOD_ID, EGG_GRAMS } from '../seed/meals';
import { HelpLink } from '../tips';
import { Loading, Reasons, fmt, fmtDate } from '../ui';

const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' } as const;

/** "2 eggs", "1.2 kg", "350 g" */
export function amountText(foodId: string, grams: number) {
  if (foodId === EGG_FOOD_ID) {
    const n = Math.max(1, Math.round(grams / EGG_GRAMS));
    return `${n} egg${n === 1 ? '' : 's'}`;
  }
  return grams >= 1000 ? `${fmt(grams / 1000, 2)} kg` : `${fmt(grams)} g`;
}

function MealCard({ date, meal, logged, foods, options, canLog }: {
  date: string; meal: PlannedMeal; logged: boolean; foods: Map<string, FoodMacros>; options: PlannedMeal['recipe'][]; canLog: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(fn: () => Promise<void>, failure: string) {
    setBusy(true);
    setError('');
    try { await fn(); } catch { setError(failure); } finally { setBusy(false); }
  }
  const label = meal.extra ? 'Extra snack' : SLOT_LABEL[meal.slot];
  return (
    <section className={`panel meal-card${logged ? ' is-logged' : ''}`} aria-labelledby={`meal-${meal.key}`}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <h3 id={`meal-${meal.key}`} className="grow">{meal.recipe.name}</h3>
        <span className={`tag${logged ? ' ok' : ''}`}>{logged && <Icon name="check" size="sm" />}{label}</span>
      </div>
      <p className="small muted num" style={{ margin: '4px 0 0' }}>
        {portionLabel(meal.scale)} · about {fmt(meal.macros.kcal)} kcal · {fmt(meal.macros.proteinG)} g protein
      </p>

      <details>
        <summary className="small">Ingredients ({meal.lines.length}), raw as bought</summary>
        <ul className="ingredients">
          {meal.lines.map((l) => (
            <li key={l.foodId}><span>{foods.get(l.foodId)?.name ?? l.foodId}</span><span className="num">{amountText(l.foodId, l.grams)}</span></li>
          ))}
        </ul>
        {meal.recipe.notes.length > 0 && <Reasons items={meal.recipe.notes} />}
        <p className="hint">Typical home portions, scaled to your targets. Weigh once to make them your own.</p>
      </details>

      {error && <p className="hint error-text" role="alert">{error}</p>}
      <div className="row wrap" style={{ marginTop: 8 }}>
        {logged ? (
          <>
            <span className="small" style={{ color: 'var(--accent)', fontWeight: 600 }}>Logged in today's food</span>
            <button className="ghost" disabled={busy} onClick={() => run(() => unlogPlannedMeal(date, meal.key), "Couldn't remove it. Try again.")}>Undo</button>
          </>
        ) : !canLog ? (
          <span className="small muted">You can log this on the day.</span>
        ) : (
          <button className="primary" disabled={busy} onClick={() => run(() => logPlannedMeal(date, meal), "Couldn't log it. Try again.")}>
            <Icon name="check" size="sm" />I ate this
          </button>
        )}
        {!meal.extra && !logged && options.length > 1 && (
          <label className="swap-select">
            <span className="visually-hidden">Swap {label.toLowerCase()} for</span>
            <select value={meal.recipe.id} onChange={(e) => void run(() => swapPlannedMeal(date, meal.slot, e.target.value), "Couldn't swap. Try again.")}>
              {options.map((o) => <option key={o.id} value={o.id}>{o.id === meal.recipe.id ? `Swap ${label.toLowerCase()}…` : o.name}</option>)}
            </select>
          </label>
        )}
      </div>
    </section>
  );
}

export function DayPlanView({ date, onShowPrep }: { date: string; onShowPrep: () => void }) {
  const data = useLiveQuery(async () => ({
    ...(await dayPlan(date)),
    foods: new Map<string, FoodMacros>((await db.foods.toArray()).map((f) => [f.id, f])),
  }), [date]);
  if (!data) return <Loading label="Planning your meals" />;
  const { plan, logged, options, foods } = data;
  if (!plan) return <div className="panel soft"><h2>No targets yet</h2><p className="muted">Finish setup to get a meal plan.</p></div>;
  if (plan.meals.length === 0) {
    return (
      <div className="panel soft">
        <h2>Nothing to plan</h2>
        <p className="muted">None of the meals you picked fit the foods you eat. Choose meals in <Link to="/settings">Settings → Profile → Food</Link>.</p>
      </div>
    );
  }
  const loggedCount = plan.meals.filter((m) => logged.has(m.key)).length;
  return (
    <>
      <section className="panel" aria-labelledby="plan-h">
        <h2 id="plan-h">Planned for {fmtDate(date, { weekday: 'long' })}</h2>
        <div className="kpis" style={{ marginTop: 10 }}>
          <div className="kpi"><div className="v">{fmt(plan.totals.kcal)}</div><div className="l">kcal of {fmt(plan.targets.calories)} target</div></div>
          <div className="kpi"><div className="v">{fmt(plan.totals.proteinG)} g</div><div className="l">protein of {plan.targets.proteinG} g target</div></div>
        </div>
        <p className="hint">
          {plan.scale === 1 ? 'Standard portions reach your target.' : `Every portion is ×${fmt(plan.scale, 2)} to reach your target.`} Estimates from cited food tables. {loggedCount > 0 && `${loggedCount} of ${plan.meals.length} logged so far.`} <HelpLink term="meal-plan">How the plan works</HelpLink>
        </p>
        {plan.notes.length > 0 && <Reasons items={plan.notes} />}
      </section>

      {plan.meals.map((m) => (
        <MealCard key={m.key} date={date} meal={m} logged={logged.has(m.key)} foods={foods} options={options[m.slot]} canLog={date <= today()} />
      ))}

      <button className="block" onClick={onShowPrep}><Icon name="food" size="sm" />Shopping list and cook-ahead for this week</button>
    </>
  );
}

function shopKey(monday: string) { return `rl-shop-${monday}`; }
function readTicks(monday: string): string[] {
  try { return JSON.parse(localStorage.getItem(shopKey(monday)) ?? '[]'); } catch { return []; }
}

export function WeekPrep({ date, onBack }: { date: string; onBack: () => void }) {
  const monday = weekStart(date);
  const data = useLiveQuery(() => weekPlan(monday), [monday]);
  const [ticks, setTicks] = useState<string[]>(() => readTicks(monday));
  if (data === undefined) return <Loading label="Working out the week" />;
  if (data === null) return <div className="panel soft"><h2>No targets yet</h2></div>;
  const list = shoppingList(data.days, data.foods);
  const sessions = cookAhead(data.days);
  const toggle = (id: string) => {
    const next = ticks.includes(id) ? ticks.filter((x) => x !== id) : [...ticks, id];
    setTicks(next);
    try { localStorage.setItem(shopKey(monday), JSON.stringify(next)); } catch { /* not saved; still works this visit */ }
  };
  const name = (id: string) => data.foods.get(id)?.name ?? id;

  return (
    <>
      <button className="ghost" style={{ marginLeft: -12 }} onClick={onBack}><Icon name="back" size="sm" />Back to the day's plan</button>
      <section className="panel" aria-labelledby="prep-h">
        <h2 id="prep-h">Week of {fmtDate(monday, { day: 'numeric', month: 'long' })}</h2>
        <p className="hint">Amounts are raw, as bought, for the whole week's plan ({fmtDate(monday)} to {fmtDate(addDays(monday, 6))}). Swaps you make are included.</p>
      </section>

      <section className="panel" aria-labelledby="cook-h">
        <h2 id="cook-h">Cook ahead</h2>
        <p className="hint" style={{ marginTop: 2 }}>Cooking rice, beans, stew and soup in two batches saves time. Cool them quickly, keep them in the fridge, and reheat until steaming hot.</p>
        {sessions.map((s) => (
          <div key={s.label} style={{ marginTop: 12 }}>
            <h3>{s.label}</h3>
            {s.groups.length === 0 ? <p className="muted small">Nothing to cook ahead for these days.</p> : s.groups.map((g) => (
              <div key={g.group} className="cook-group">
                <div className="small" style={{ fontWeight: 650 }}>{g.group}</div>
                <ul className="ingredients">
                  {g.items.map((i) => <li key={i.foodId}><span>{name(i.foodId)}</span><span className="num">{amountText(i.foodId, i.grams)}</span></li>)}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="panel" aria-labelledby="shop-h">
        <div className="panel-head">
          <h2 id="shop-h">Shopping list</h2>
          <span className="muted small">{ticks.filter((t) => list.some((i) => i.foodId === t)).length} of {list.length} ticked</span>
        </div>
        <p className="hint" style={{ marginTop: 2 }}>Rounded up a little. Leave out what you already have at home.</p>
        <ul className="shop-list">
          {list.map((i) => (
            <li key={i.foodId}>
              <label className={ticks.includes(i.foodId) ? 'done' : ''}>
                <input type="checkbox" checked={ticks.includes(i.foodId)} onChange={() => toggle(i.foodId)} />
                <span className="grow">{i.name}</span>
                <span className="num">{amountText(i.foodId, i.grams)}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
