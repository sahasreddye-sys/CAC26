// Run from the repo folder with:  node --test
// Uses Node's built-in test runner, so there is nothing to install.
const test = require('node:test');
const assert = require('node:assert/strict');
const PlannerMath = require('../assets/planner-math.js');

test('parseAmount reads money the way people type it', () => {
  assert.equal(PlannerMath.parseAmount('7800'), 7800);
  assert.equal(PlannerMath.parseAmount('$7,800'), 7800);
  assert.equal(PlannerMath.parseAmount(' 1,250.50 '), 1250.5);
  assert.equal(PlannerMath.parseAmount('6.5'), 6.5);
  assert.equal(PlannerMath.parseAmount(''), null);
  assert.equal(PlannerMath.parseAmount(undefined), null);
  assert.ok(Number.isNaN(PlannerMath.parseAmount('abc')));
  assert.ok(Number.isNaN(PlannerMath.parseAmount('-50')), 'negative amounts are not allowed');
  assert.ok(Number.isNaN(PlannerMath.parseAmount('1.2.3')));
});

test('money left before housing subtracts debts and other costs', () => {
  // 7,800 - 650 - 2,450 = 4,700
  assert.equal(PlannerMath.moneyLeftBeforeHousing(7800, 650, 2450), 4700);
  // blank boxes count as 0
  assert.equal(PlannerMath.moneyLeftBeforeHousing(5000, null, null), 5000);
  // costs above income give a negative number; the form explains it
  assert.equal(PlannerMath.moneyLeftBeforeHousing(3000, 1000, 2500), -500);
});

test('comfortable housing limit keeps the chosen share of take-home pay', () => {
  // keep 20% of 7,800 (= 1,560): 7,800 - 1,560 - 650 - 2,450 = 3,140
  assert.equal(PlannerMath.comfortableHousingLimit(7800, 650, 2450, 20), 3140);
  // keep 0%: everything before housing can go to housing
  assert.equal(PlannerMath.comfortableHousingLimit(7800, 650, 2450, 0), 4700);
  // never below zero
  assert.equal(PlannerMath.comfortableHousingLimit(3000, 1000, 2500, 20), 0);
  // cutoff not decided yet
  assert.equal(PlannerMath.comfortableHousingLimit(7800, 650, 2450, null), null);
});

test('guideline amount is a share of gross income, or null if unknown', () => {
  // 28% of 10,000 = 2,800
  assert.equal(PlannerMath.guidelineHousingAmount(10000, 28), 2800);
  assert.equal(PlannerMath.guidelineHousingAmount(null, 28), null);
  assert.equal(PlannerMath.guidelineHousingAmount(10000, null), null);
});

test('address search ignores case and punctuation and matches street word forms', () => {
  const n = PlannerMath.normalizeAddress;
  assert.equal(n('5310 Berkshire Passage Way.'), n('5310 berkshire passage way'));
  assert.equal(n('120 White Pines Drive'), n('120 WHITE PINES DR'));
  assert.equal(n('966 Firethorne  Road'), '966 firethorne rd');
  assert.equal(n("St. Andrew's Court"), 'st andrews ct');
});

test('an income drop can move a home from comfortable to stretching', () => {
  // $8,200 take-home, $3,750 of bills, $2,800 for the home: $1,650 left (about 20%)
  const full = PlannerMath.leftAfterHousingPercent(8200, 650, 3100, 2800);
  assert.equal(PlannerMath.comfortLabel(full, 20, 10), 'Comfortable');
  // 25% less take-home pay ($6,150): $400 short, so stretching
  const dropped = PlannerMath.leftAfterHousingPercent(8200 * 0.75, 650, 3100, 2800);
  assert.ok(dropped < 0);
  assert.equal(PlannerMath.comfortLabel(dropped, 20, 10), 'Stretching');
});
