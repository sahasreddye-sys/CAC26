// Checks that keep the planner honest about its numbers.
// Run from the repo folder with:  node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

const repo = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(repo, 'planner-config.json'), 'utf8'));
const summary = JSON.parse(fs.readFileSync(path.join(repo, 'data', 'summary.json'), 'utf8'));
const setting = p => p.split('.').reduce((node, key) => node && node[key], config);

// Every number the cost math or the labels can't work without.
// The homestead exemption is left out on purpose: it is not set yet (see NEEDS_OWNER.md)
// and the app says "not set yet" instead of guessing.
const REQUIRED = [
  'loan.default_interest_rate', 'loan.default_term_years', 'loan.minimum_down_payment_percent',
  'market.estimate_to_sale_price_ratio',
  'property_tax.assessment_ratio', 'property_tax.millage.forsyth_county',
  'insurance.homeowners_rate_per_1000',
  'mortgage_insurance.monthly_per_100k', 'mortgage_insurance.required_below_down_payment_percent',
  'closing_costs.percent_of_price', 'guidelines.housing_share_of_gross_income',
  'comfort.comfortable_min_left_percent', 'comfort.stretching_below_left_percent', 'comfort.what_if_income_drop_percent',
];

test('every required number has a value, a source and a date', () => {
  for (const p of REQUIRED) {
    const e = setting(p);
    assert.ok(e, `${p} is missing`);
    assert.notEqual(e.value, null, `${p} has no value`);
    assert.ok(e.source && e.source !== 'TODO', `${p} has no source`);
    assert.ok(e.as_of && e.as_of !== 'TODO', `${p} has no date`);
  }
});

test('the comfort cutoffs make sense and say why', () => {
  const comfortable = setting('comfort.comfortable_min_left_percent');
  const stretching = setting('comfort.stretching_below_left_percent');
  assert.ok(stretching.value < comfortable.value, 'stretching cutoff below comfortable cutoff');
  assert.ok(comfortable.reason && comfortable.reason.length > 40, 'comfortable cutoff has a written reason');
});

test('the home count matches the model summary', () => {
  const raw = zlib.gunzipSync(fs.readFileSync(path.join(repo, 'data', 'forsyth.json.gz')));
  const homes = JSON.parse(raw).homes;
  assert.equal(homes.id.length, summary.metrics.rows.forsyth);
  assert.equal(summary.forsyth.n, summary.metrics.rows.forsyth);
});

test('assets/site-data.js and the script versions are up to date (python tools/build.py)', () => {
  execFileSync('python3', [path.join(repo, 'tools', 'build.py'), '--check'], { stdio: 'pipe' });
});
