// Tests for HOA dues in the monthly total, the 20% mortgage insurance line,
// total interest and the year-by-year loan table.
// Run from the repo folder with:  node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const PM = require('../assets/planner-math.js');

const near = (actual, expected, label, within = 0.01) =>
  assert.ok(Math.abs(actual - expected) < within, `${label}: expected about ${expected}, got ${actual}`);

const forsyth = {
  ratePercent: 7, termYears: 30, assessmentRatio: 0.40, mills: 24.522,
  insurancePer1000: 4.90, pmiPer100k: 70, pmiRequiredBelowPercent: 20,
};

test('HOA dues are added to the monthly total only when typed in', () => {
  const without = PM.monthlyHousingCost({ ...forsyth, price: 500000, downPayment: 60000 });
  const withHoa = PM.monthlyHousingCost({ ...forsyth, price: 500000, downPayment: 60000, hoaMonthly: 85 });
  assert.equal(without.hoa, 0);
  assert.equal(withHoa.hoa, 85);
  near(withHoa.total - without.total, 85, 'total goes up by the dues');
  assert.equal(PM.monthlyHousingCost({ ...forsyth, price: 500000, downPayment: 60000, hoaMonthly: -5 }).hoa, 0, 'negative ignored');
});

test('mortgage insurance stops at exactly 20% down', () => {
  const at19 = PM.monthlyHousingCost({ ...forsyth, price: 500000, downPayment: 95000 });
  const at20 = PM.monthlyHousingCost({ ...forsyth, price: 500000, downPayment: 100000 });
  assert.equal(at19.mortgageInsurance, 405000 / 100000 * 70, '19% down: 4.05 * $70');
  assert.equal(at20.mortgageInsurance, 0, '20% down: none');
});

test('a bigger down payment lowers the loan payment', () => {
  const small = PM.monthlyHousingCost({ ...forsyth, price: 500000, downPayment: 25000 });
  const big = PM.monthlyHousingCost({ ...forsyth, price: 500000, downPayment: 100000 });
  assert.ok(big.loanPayment < small.loanPayment);
  // $75,000 less borrowed at 7% for 30 years is about $498.98 a month less
  near(small.loanPayment - big.loanPayment, 498.98, 'payment change', 0.05);
});

test('total interest: all payments minus the amount borrowed', () => {
  // $440,000 at 7% for 30 years: $2,927.33 * 360 = $1,053,839 paid, $613,839 of it interest
  near(PM.totalInterest(440000, 7, 30), 613839.2, 'interest', 1);
  assert.equal(PM.totalInterest(440000, 0, 30), 0, 'no interest at 0%');
  assert.equal(PM.totalInterest(440000, null, 30), null);
});

test('year-by-year table pays the loan off and adds up to the total interest', () => {
  const years = PM.amortizationByYear(440000, 7, 30);
  assert.equal(years.length, 30);
  near(years[29].balance, 0, 'paid off', 0.5);
  const interest = years.reduce((a, y) => a + y.interest, 0);
  const principal = years.reduce((a, y) => a + y.principal, 0);
  near(principal, 440000, 'principal adds up to the loan', 0.5);
  near(interest, PM.totalInterest(440000, 7, 30), 'interest matches the total', 1);
  assert.ok(years[0].interest > years[0].principal, 'early years are mostly interest');
});

test('first payment splits into interest and principal', () => {
  // $440,000 at 7%: interest $440,000 * 0.07 / 12 = $2,566.67, principal $2,927.33 - $2,566.67 = $360.66
  const split = PM.firstPaymentSplit(440000, 7, 30);
  near(split.interest, 2566.67, 'interest');
  near(split.principal, 360.66, 'principal');
  near(split.interest + split.principal, PM.monthlyLoanPayment(440000, 7, 30), 'adds up to the payment');
});

test('a maintenance reserve is added only when typed in', () => {
  const without = PM.monthlyHousingCost({ ...forsyth, price: 500000, downPayment: 100000 });
  const withReserve = PM.monthlyHousingCost({ ...forsyth, price: 500000, downPayment: 100000, maintenanceMonthly: 300 });
  assert.equal(without.maintenance, 0);
  near(withReserve.total - without.total, 300, 'total goes up by the reserve');
});
