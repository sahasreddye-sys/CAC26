'use strict';

// Budget screen (DESIGN.md 5.1).
// Privacy rule: the family's numbers live only in `familyBudget`, in this
// page's memory. Nothing here writes to localStorage, cookies, the URL or the
// network, so a refresh or closing the tab clears everything.

const familyBudget = {
  takeHome: null,      // required
  debts: null,
  otherCosts: null,
  savings: null,
  ratePercent: null,
  termYears: null,
  grossMonthly: null,  // optional, only for the guideline line
  monthlySaving: null, // optional, only for months-to-save
};

// planner-config.json, delivered by assets/site-data.js (made by tools/build.py)
let plannerConfig = window.PLANNER_CONFIG || null;

// Reads one entry from planner-config.json, e.g. plannerSetting('loan.default_interest_rate').
function plannerSetting(path) {
  let node = plannerConfig;
  for (const key of path.split('.')) node = node && node[key];
  return node || { value: null, source: 'TODO' };
}

// "2026-10-22" -> "October 22, 2026" (as_of dates in the config)
function longDate(iso) {
  const d = new Date(String(iso) + 'T00:00:00');
  return isNaN(d) ? String(iso || '') : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// A made-up family for first-time visitors and the demo. Not real data.
const EXAMPLE_FAMILY = { takeHome: 8200, debts: 650, otherCosts: 3100, savings: 70000, grossMonthly: 11000, monthlySaving: 900 };

// Everything the monthly cost needs besides the price and down payment.
// The family's own rate and loan length win over the config defaults.
function homeCostSettings(market) {
  const v = path => plannerSetting(path).value;
  return {
    ratePercent: familyBudget.ratePercent ?? v('loan.default_interest_rate'),
    termYears: familyBudget.termYears ?? v('loan.default_term_years'),
    assessmentRatio: v('property_tax.assessment_ratio'),
    mills: v('property_tax.millage.forsyth_county'),
    exemption: v('property_tax.homestead_exemption') || 0,
    insurancePer1000: v('insurance.homeowners_rate_per_1000'),
    pmiPer100k: v('mortgage_insurance.monthly_per_100k'),
    pmiRequiredBelowPercent: v('mortgage_insurance.required_below_down_payment_percent'),
    closingPercent: v('closing_costs.percent_of_price'),
    minDownPercent: v('loan.minimum_down_payment_percent'),
  };
}

// True when the family's savings cover closing costs plus the minimum down payment.
function savingsCoverPrice(market, price) {
  const s = homeCostSettings(market);
  const cap = PlannerMath.maxPriceForCash(familyBudget.savings, s.closingPercent, s.minDownPercent);
  return cap == null ? null : price <= cap;
}

// Monthly cost of one home for this family, with the down payment taken from
// their savings after closing costs unless a down payment is given.
function familyHomeCost(market, price, downPayment) {
  const s = homeCostSettings(market);
  const down = downPayment ?? PlannerMath.downPaymentFromSavings(familyBudget.savings || 0, price, s.closingPercent) ?? 0;
  return PlannerMath.monthlyHousingCost({ ...s, price, downPayment: down });
}

function budgetIsFilledIn() { return familyBudget.takeHome != null; }

// Other screens listen for this to redraw when the budget or config changes.
function announceBudgetChange() { window.dispatchEvent(new Event('budgetchange')); }

// Upper limits catch an extra zero, not real families.
const MONTHLY_MAX = { max: 200000, message: 'That is more than $200,000 a month. Check for an extra zero.' };
const BUDGET_FIELDS = {
  takeHome: MONTHLY_MAX,
  debts: MONTHLY_MAX,
  otherCosts: MONTHLY_MAX,
  savings: { max: 20000000, message: 'That is more than $20 million. Check for an extra zero.' },
  ratePercent: { max: 100, message: 'Rate: enter a yearly rate under 100%, like 6.5' },
  termYears: { wholeNumber: true, min: 1, max: 50, message: 'Length: enter whole years from 1 to 50' },
  grossMonthly: MONTHLY_MAX,
  monthlySaving: MONTHLY_MAX,
};

(function budgetWorksheet() {
  const byId = id => document.getElementById(id);
  const form = byId('budgetForm');
  const money = v => '$' + Math.round(v).toLocaleString('en-US');

  // Browsers can refill form boxes after a refresh or the back button.
  // Clear them so old numbers never come back on their own.
  form.reset();
  window.addEventListener('pageshow', e => { if (e.persisted) clearBudget(); });

  function readField(name) {
    const input = byId('b-' + name);
    const rule = BUDGET_FIELDS[name];
    const value = PlannerMath.parseAmount(input.value);
    let problem = '';
    if (Number.isNaN(value)) problem = 'Use numbers only, like 2450';
    else if (value != null && rule.wholeNumber && !Number.isInteger(value)) problem = rule.message;
    else if (value != null && rule.min != null && value < rule.min) problem = rule.message;
    else if (value != null && rule.max != null && value > rule.max) problem = rule.message;
    else if (name === 'takeHome' && value === 0) problem = 'Take-home pay needs to be more than $0';
    input.closest('[data-field]').classList.toggle('invalid', !!problem);
    byId('b-' + name + '-err').textContent = problem;
    familyBudget[name] = problem ? null : value;
    return !problem;
  }

  const configValue = plannerSetting;

  function sourceLine(label, entry, unitText) {
    if (entry.value == null) return `${label}: not set yet. Type your own.`;
    return `${label} starts at ${entry.value}${unitText}, as of ${longDate(entry.as_of)}. Source: ${entry.cite || entry.source}.`;
  }

  function applyDefaults() {
    const rate = configValue('loan.default_interest_rate');
    const term = configValue('loan.default_term_years');
    byId('b-ratePercent').value = rate.value ?? '';
    byId('b-termYears').value = term.value ?? '';
    byId('b-ratePercent-src').textContent = sourceLine('Rate', rate, '%');
    byId('b-termYears-src').textContent = sourceLine('Length', term, ' years');
  }

  function render() {
    const fieldOk = {};
    for (const name of Object.keys(BUDGET_FIELDS)) fieldOk[name] = readField(name);
    const b = familyBudget;
    const keepPercent = configValue('comfort.comfortable_min_left_percent').value;
    byId('r-cutoffTag').textContent = keepPercent == null ? 'Cutoff not set' : `Keep ${keepPercent}% left`;
    renderGuideline();

    // a typo in the first three boxes would otherwise count as $0 and overstate what's left
    const linesOk = fieldOk.takeHome && fieldOk.debts && fieldOk.otherCosts;
    if (b.takeHome == null || !linesOk) {
      const waitText = linesOk ? 'Fill in take-home pay' : 'Fix the marked box';
      setText('r-takeHome', '—');
      setText('r-leftBeforeHousing', waitText);
      setText('r-comfortLimit', '—');
      byId('r-comfortNote').textContent = keepPercent == null ? 'Needs a comfort cutoff' : waitText;
      byId('r-narrativeWrap').hidden = true;
      byId('r-headline').textContent = linesOk
        ? 'Fill in take-home pay, debts and other costs to see what you could spend on housing.'
        : 'Fix the marked box to see what you could spend on housing.';
      renderSplit(null);
      renderMaxPrice(null);
      announceBudgetChange();
      return;
    }

    const costs = (b.debts || 0) + (b.otherCosts || 0);
    const left = PlannerMath.moneyLeftBeforeHousing(b.takeHome, b.debts, b.otherCosts);
    const limit = PlannerMath.comfortableHousingLimit(b.takeHome, b.debts, b.otherCosts, keepPercent);
    setText('r-takeHome', money(b.takeHome) + ' / mo');
    setText('r-leftBeforeHousing', left > 0 ? money(left) + ' / mo' : '$0 / mo');

    const narrative = byId('r-narrative');
    if (left <= 0) {
      setText('r-comfortLimit', '$0 / mo');
      byId('r-comfortNote').textContent = 'Regular costs use up all of take-home pay';
      narrative.textContent = 'Your regular costs are at or above your take-home pay, so this plan has no room for a housing payment.';
    } else if (limit == null) {
      setText('r-comfortLimit', '—');
      byId('r-comfortNote').textContent = 'Needs a comfort cutoff (placeholder in planner-config.json)';
      narrative.innerHTML = `Before housing, you have <strong>${money(left)}</strong> left each month. How much of that should stay unspent is the comfort cutoff, which hasn’t been chosen yet.`;
    } else {
      setText('r-comfortLimit', 'up to ' + money(limit) + ' / mo');
      byId('r-comfortNote').textContent = `Keeps ${keepPercent}% of take-home pay left after every bill`;
      narrative.innerHTML = limit === 0
        ? `Keeping <strong>${keepPercent}%</strong> of your take-home pay after every bill leaves nothing for housing with your current costs.`
        : `With a <strong>${money(limit)}</strong> housing payment, you would still have <strong>${money(b.takeHome - costs - limit)} (${keepPercent}%)</strong> left each month after every bill, including housing.`;
    }
    byId('r-narrativeWrap').hidden = false;
    renderSplit(b.takeHome, Math.min(costs, b.takeHome), left > 0 ? limit : 0);
    const price = renderMaxPrice(left > 0 ? limit : 0);
    byId('r-headline').innerHTML = left <= 0 || limit == null || limit === 0
      ? (limit == null ? `You have <b>${money(Math.max(0, left))}</b> a month left before housing.` : 'With these numbers there is no room for a housing payment yet.')
      : `You could comfortably spend up to <b>${money(limit)}</b> a month on housing` + (price ? `, which points to a home around <b>${money(price)}</b>.` : '.');
    clearTimeout(render.say);
    render.say = setTimeout(() => {
      byId('budgetAnnounce').textContent = `Housing that leaves you comfortable: ${byId('r-comfortLimit').textContent}. Price you could carry: ${byId('r-maxPrice').textContent}.`;
    }, 700);
    announceBudgetChange();
  }

  // The most a Forsyth home could cost. Two limits apply and the lower one wins:
  //   1. the monthly cost has to stay within the comfortable housing amount
  //   2. savings have to cover closing costs plus the minimum down payment
  function renderMaxPrice(limit) {
    const s = homeCostSettings('forsyth');
    const note = byId('r-maxPriceNote');
    const show = (price, text) => { setText('r-maxPrice', price); note.textContent = text; };
    if (limit == null) return show('—', 'Needs take-home pay and a comfort cutoff'), null;
    if (s.ratePercent == null || s.termYears == null) return show('—', 'Needs an interest rate and loan length'), null;
    const byMonthly = PlannerMath.maxPriceForMonthly(limit, price => familyHomeCost('forsyth', price).total);
    const byCash = PlannerMath.maxPriceForCash(familyBudget.savings, s.closingPercent, s.minDownPercent);
    if (byMonthly == null || byCash == null) return show('—', 'A cost source is still missing in planner-config.json'), null;
    const blanks = familyBudget.debts == null && familyBudget.otherCosts == null
      ? ' Debts and other costs are blank, so they count as $0.' : '';
    if (byCash === 0) {
      return show('$0', `Buying needs cash up front: closing costs (about ${s.closingPercent}%) plus at least ${s.minDownPercent}% down. Add your savings above.` + blanks), null;
    }
    if (byMonthly === 0) return show('$0', 'No room for a housing payment with these numbers.' + blanks), null;
    const price = Math.min(byMonthly, byCash);
    const down = PlannerMath.downPaymentFromSavings(familyBudget.savings, price, s.closingPercent);
    const terms = `${money(down)} down (${(down / price * 100).toFixed(1)}%) after closing costs, ${s.ratePercent}% for ${s.termYears} years`;
    show('about ' + money(price), byCash < byMonthly
      ? `Held back by savings: closing costs plus at least ${s.minDownPercent}% down. The monthly budget alone would allow about ${money(byMonthly)}. ${terms}.` + blanks
      : `Held back by the monthly budget. ${terms}, Forsyth taxes and insurance.` + blanks);
    return price;
  }

  function setText(id, text) { byId(id).textContent = text; }

  // The one chart (DESIGN.md section 4): take-home pay split into bills and
  // debt, housing, and what is left. Before a comfort cutoff exists there is
  // no housing amount, so that part stays empty and "left over" is everything
  // after bills.
  function renderSplit(takeHome, costs, housing) {
    const parts = { costs: 0, housing: 0, left: 0 };
    if (takeHome) {
      parts.costs = costs;
      parts.housing = housing || 0;
      parts.left = Math.max(0, takeHome - costs - parts.housing);
    }
    const pct = a => takeHome ? a / takeHome * 100 : 0;
    for (const key of Object.keys(parts)) {
      byId('bar-' + key).style.width = pct(parts[key]).toFixed(2) + '%';
      const unknownHousing = key === 'housing' && takeHome && housing == null;
      byId('leg-' + key).textContent = !takeHome || unknownHousing ? '—' : money(parts[key]);
      byId('leg-' + key + '-pct').textContent = !takeHome || unknownHousing ? '' : Math.round(pct(parts[key])) + '%';
    }
    byId('splitBar').setAttribute('aria-label', takeHome
      ? `Take-home pay split: bills and debt ${Math.round(pct(parts.costs))}%, housing ${Math.round(pct(parts.housing))}%, left over ${Math.round(pct(parts.left))}%`
      : 'Take-home pay split will show once take-home pay is filled in');
  }

  function renderGuideline() {
    const guide = configValue('guidelines.housing_share_of_gross_income');
    const row = byId('r-guidelineRow');
    row.hidden = familyBudget.grossMonthly == null;
    if (row.hidden) return;
    if (guide.value == null) {
      setText('r-guideline', '—');
      byId('r-guidelineNote').textContent = 'Housing-to-pay guideline still needs a source (TODO)';
      return;
    }
    setText('r-guideline', money(PlannerMath.guidelineHousingAmount(familyBudget.grossMonthly, guide.value)) + ' / mo');
    byId('r-guidelineNote').textContent = `${guide.value}% of pay before taxes. A guideline, not a rule (${guide.cite || guide.source})`;
  }

  // Money boxes show thousands separators (9500 -> 9,500) once you leave them.
  // parseAmount already ignores commas, so the math reads them the same way.
  const withCommas = n => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  form.addEventListener('focusout', e => {
    if (!e.target.matches('.money-row input')) return;
    const value = PlannerMath.parseAmount(e.target.value);
    if (Number.isFinite(value)) e.target.value = withCommas(value);
  });

  // The +/- buttons next to each money box. Holding one down keeps stepping.
  function step(btn) {
    const input = byId(btn.dataset.for);
    const current = PlannerMath.parseAmount(input.value);
    const base = Number.isFinite(current) ? current : 0;
    input.value = withCommas(Math.max(0, base + Number(btn.dataset.step)));
    render();
  }
  let holdTimer = 0;
  const stopHold = () => clearTimeout(holdTimer);
  form.addEventListener('pointerdown', e => {
    const btn = e.target.closest('button[data-step]');
    if (!btn || e.button > 0) return;
    e.preventDefault();
    step(btn);
    holdTimer = setTimeout(function again() { step(btn); holdTimer = setTimeout(again, 80); }, 450);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => form.addEventListener(t, stopHold));
  // keyboard presses (Enter or Space on the button) arrive as clicks with detail 0
  form.addEventListener('click', e => {
    const btn = e.target.closest('button[data-step]');
    if (btn && e.detail === 0) step(btn);
  });

  // Enter moves to the next box instead of doing nothing
  form.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    const boxes = [...form.querySelectorAll('input')];
    const next = boxes[boxes.indexOf(e.target) + 1];
    if (next) next.focus(); else e.target.blur();
  });

  function clearBudget() {
    form.reset();
    for (const name of Object.keys(familyBudget)) familyBudget[name] = null;
    if (plannerConfig) applyDefaults();
    byId('exampleNote').hidden = true;
    render();
    byId('clearNote').textContent = 'Cleared.';
    setTimeout(() => { byId('clearNote').textContent = ''; }, 2000);
    byId('b-takeHome').focus();
  }

  function fillExample() {
    for (const [name, value] of Object.entries(EXAMPLE_FAMILY)) byId('b-' + name).value = withCommas(value);
    byId('exampleNote').hidden = false;
    render();
  }

  form.addEventListener('input', render);
  form.addEventListener('submit', e => e.preventDefault());
  byId('clearBudget').addEventListener('click', clearBudget);
  byId('tryExample').addEventListener('click', fillExample);

  if (plannerConfig) applyDefaults();
  else {
    // site-data.js didn't load: fall back to a 30-year loan and let the family type a rate
    byId('b-termYears').value = 30;
    byId('b-ratePercent-src').textContent = 'The planner’s starting numbers didn’t load. Type your own rate; costs that need a source show “not set yet”.';
    byId('b-termYears-src').textContent = 'Length: 30 years.';
    byId('configNotice').hidden = false;
  }
  render();
})();
