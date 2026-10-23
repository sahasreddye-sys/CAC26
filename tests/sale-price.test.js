// Tests for the likely sale price and the "closest to your budget" sort key.
// Run from the repo folder with:  node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const PM = require('../assets/planner-math.js');

test('likely sale price: estimate divided by the estimate / sale price ratio', () => {
  // a $500,000 estimate that runs at 0.78 of sale price: 500000 / 0.78 = $641,025.64
  assert.ok(Math.abs(PM.likelySalePrice(500000, 0.78) - 641025.64) < 0.01);
  assert.equal(PM.likelySalePrice(500000, null), 500000, 'no ratio set: use the estimate');
  assert.equal(PM.likelySalePrice(500000, 0), 500000, 'a zero ratio is ignored');
  assert.equal(PM.likelySalePrice(null, 0.78), null);
});

test('budget distance: nearest monthly cost to the comfortable limit sorts first', () => {
  const limit = 4000;
  assert.equal(PM.budgetDistance(3900, limit, true), 100, '$100 under');
  assert.equal(PM.budgetDistance(4000, limit, true), 0, 'right at the limit');
  assert.ok(PM.budgetDistance(4000.01, limit, true) > PM.budgetDistance(1000, limit, true), 'any home over the limit goes after every home under it');
  assert.ok(PM.budgetDistance(4050, limit, true) < PM.budgetDistance(4500, limit, true), 'among homes over, nearer first');
  assert.ok(PM.budgetDistance(4000, limit, false) > PM.budgetDistance(9000, limit, true), 'savings short goes after every home savings cover');
  assert.equal(PM.budgetDistance(null, limit, true), Infinity, 'cost unknown goes last');
  assert.equal(PM.budgetDistance(3900, null, true), Infinity, 'no limit yet');
});
