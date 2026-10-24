'use strict';

// Budget arithmetic for the planner. Pure functions only: nothing here touches
// the page, the network or storage, so the same file runs in the browser and
// in the Node tests (tests/planner-math.test.js).

const PlannerMath = {
  // Turns what someone typed ("$7,800", "7800.50", "") into a number.
  // Returns null for an empty box and NaN for something that isn't a number,
  // so the form can tell "not filled in" apart from "typo".
  parseAmount(text) {
    const cleaned = String(text ?? '').replace(/[$,\s]/g, '');
    if (cleaned === '') return null;
    if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return NaN;
    return Number(cleaned);
  },

  // Line 4 of the worksheet: take-home pay minus debts and other regular costs.
  moneyLeftBeforeHousing(takeHome, debts, otherCosts) {
    return takeHome - (debts || 0) - (otherCosts || 0);
  },

  // The most a family can spend on housing each month and still keep
  // `keepPercent` of take-home pay after every monthly cost.
  //   left = takeHome - debts - other - housing  >=  takeHome * keepPercent / 100
  //   so housing <= takeHome * (1 - keepPercent / 100) - debts - other
  // Returns null when the cutoff hasn't been decided yet, and never goes below 0.
  comfortableHousingLimit(takeHome, debts, otherCosts, keepPercent) {
    if (keepPercent == null) return null;
    const limit = takeHome * (1 - keepPercent / 100) - (debts || 0) - (otherCosts || 0);
    return Math.max(0, limit);
  },

  // The "housing near X% of gross income" reference line. Not used for the label.
  guidelineHousingAmount(grossMonthly, guidelinePercent) {
    if (grossMonthly == null || guidelinePercent == null) return null;
    return grossMonthly * guidelinePercent / 100;
  },

  // Monthly principal + interest payment on a fixed-rate loan (DESIGN.md section 6):
  //   M = P * r * (1 + r)^n / ((1 + r)^n - 1)
  //
  //   loanAmount         dollars borrowed (price minus down payment), e.g. 200000
  //   annualRatePercent  yearly rate as a percent, e.g. 6.5 means 6.5%
  //   termYears          whole years, e.g. 30
  //
  // Returns the payment in dollars, not rounded (the screen rounds it).
  // Returns null when the inputs can't make a real loan.
  monthlyLoanPayment(loanAmount, annualRatePercent, termYears) {
    if (loanAmount == null || annualRatePercent == null || termYears == null) return null;
    if (loanAmount < 0 || annualRatePercent < 0) return null;
    if (!Number.isInteger(termYears) || termYears <= 0) return null;

    const P = loanAmount;
    const r = annualRatePercent / 100 / 12; // yearly percent -> monthly decimal
    const n = termYears * 12;               // years -> monthly payments

    // at 0% the formula divides by zero; the loan is just split evenly
    if (r === 0) return P / n;

    const growth = (1 + r) ** n;
    return P * r * growth / (growth - 1);
  },

  // Georgia taxes an "assessed value" (a share of the price, minus any
  // exemption) at the local millage rate. One mill = $1 per $1,000.
  //   yearly tax = (price * assessmentRatio - exemption) * mills / 1000
  monthlyPropertyTax(price, assessmentRatio, mills, exemption = 0) {
    if (price == null || assessmentRatio == null || mills == null) return null;
    const assessed = Math.max(0, price * assessmentRatio - (exemption || 0));
    return assessed * mills / 1000 / 12;
  },

  monthlyHomeInsurance(price, dollarsPerThousandPerYear) {
    if (price == null || dollarsPerThousandPerYear == null) return null;
    return price / 1000 * dollarsPerThousandPerYear / 12;
  },

  // Only charged when the down payment is under `requiredBelowPercent` of the price.
  monthlyMortgageInsurance(loanAmount, price, downPayment, perHundredThousandMonthly, requiredBelowPercent) {
    if (requiredBelowPercent == null || price == null) return null;
    if (price <= 0 || loanAmount <= 0) return 0; // nothing borrowed, nothing to insure
    if (downPayment / price * 100 >= requiredBelowPercent) return 0;
    if (perHundredThousandMonthly == null) return null;
    return loanAmount / 100000 * perHundredThousandMonthly;
  },

  closingCosts(price, percentOfPrice) {
    if (price == null || percentOfPrice == null) return null;
    return price * percentOfPrice / 100;
  },

  // CFPB method: whatever cash is left after closing costs can go to the down payment.
  downPaymentFromSavings(savings, price, closingPercent) {
    const closing = PlannerMath.closingCosts(price, closingPercent);
    if (savings == null || closing == null) return null;
    return Math.min(price, Math.max(0, savings - closing));
  },

  // Everything paid each month for the home. Any piece that can't be worked out
  // (a missing rate or source) comes back null and is listed in `missing`, and
  // the total is null too, so the app never shows a total with a part left out.
  //   c = { price, downPayment, ratePercent, termYears, assessmentRatio, mills,
  //         exemption, insurancePer1000, insuranceMonthly (a typed quote, optional),
  //         pmiPer100k, pmiRequiredBelowPercent, hoaMonthly (optional, typed in) }
  monthlyHousingCost(c) {
    const loan = Math.max(0, c.price - c.downPayment);
    const parts = {
      loanPayment: PlannerMath.monthlyLoanPayment(loan, c.ratePercent, c.termYears),
      propertyTax: PlannerMath.monthlyPropertyTax(c.price, c.assessmentRatio, c.mills, c.exemption),
      homeInsurance: c.insuranceMonthly != null ? c.insuranceMonthly : PlannerMath.monthlyHomeInsurance(c.price, c.insurancePer1000),
      mortgageInsurance: PlannerMath.monthlyMortgageInsurance(loan, c.price, c.downPayment, c.pmiPer100k, c.pmiRequiredBelowPercent),
      hoa: c.hoaMonthly > 0 ? c.hoaMonthly : 0, // HOA dues are only counted when the family types them
    };
    const missing = Object.keys(parts).filter(k => parts[k] == null);
    const total = missing.length ? null : Object.values(parts).reduce((a, b) => a + b, 0);
    return { loan, ...parts, total, missing };
  },

  // Interest paid over the whole loan: every monthly payment added up, minus what was borrowed.
  totalInterest(loanAmount, annualRatePercent, termYears) {
    const payment = PlannerMath.monthlyLoanPayment(loanAmount, annualRatePercent, termYears);
    if (payment == null) return null;
    return payment * termYears * 12 - loanAmount;
  },

  // Year-by-year split of the loan payments into interest and principal, and
  // what is still owed at the end of each year. Each month, interest is the
  // balance times the monthly rate and the rest of the payment pays it down.
  amortizationByYear(loanAmount, annualRatePercent, termYears) {
    const payment = PlannerMath.monthlyLoanPayment(loanAmount, annualRatePercent, termYears);
    if (payment == null) return null;
    const r = annualRatePercent / 100 / 12;
    let balance = loanAmount;
    const years = [];
    for (let y = 1; y <= termYears; y++) {
      let interest = 0, principal = 0;
      for (let m = 0; m < 12; m++) {
        const owed = balance * r;
        const paid = Math.min(balance, payment - owed);
        interest += owed; principal += paid; balance -= paid;
      }
      years.push({ year: y, interest, principal, balance: Math.max(0, balance) });
    }
    return years;
  },

  // Share of take-home pay left after every monthly cost, as a percent.
  leftAfterHousingPercent(takeHome, debts, otherCosts, housing) {
    if (!takeHome || housing == null) return null;
    return (takeHome - (debts || 0) - (otherCosts || 0) - housing) / takeHome * 100;
  },

  // DESIGN.md section 7: comfortable at or above the first cutoff, stretching
  // below the second, tight in between.
  comfortLabel(leftPercent, comfortableMin, stretchingBelow) {
    if (leftPercent == null || comfortableMin == null || stretchingBelow == null) return null;
    if (leftPercent >= comfortableMin) return 'Comfortable';
    if (leftPercent < stretchingBelow) return 'Stretching';
    return 'Tight';
  },

  // The highest price whose full monthly cost stays at or under `targetMonthly`.
  // Cost only goes up as price goes up (bigger loan, more tax, and a smaller
  // down payment once closing costs grow), so a binary search works.
  // `costAt(price)` returns the monthly total for that price.
  maxPriceForMonthly(targetMonthly, costAt, highestPrice = 10000000) {
    if (targetMonthly == null || targetMonthly <= 0) return 0;
    if (costAt(0) == null) return null;
    let lo = 0, hi = highestPrice;
    if (costAt(hi) <= targetMonthly) return hi;
    while (hi - lo > 100) {
      const mid = (lo + hi) / 2;
      if (costAt(mid) <= targetMonthly) lo = mid; else hi = mid;
    }
    return Math.floor(lo / 100) * 100;
  },

  // Buying takes cash up front: closing costs plus at least the minimum down
  // payment. The most savings can cover is savings / (closing% + minimum down%).
  maxPriceForCash(savings, closingPercent, minDownPercent) {
    if (closingPercent == null || minDownPercent == null) return null;
    if (!savings || savings <= 0) return 0;
    return Math.floor(savings / ((closingPercent + minDownPercent) / 100) / 100) * 100;
  },

  // The model learns county values, and county values run below what homes
  // sell for. A sales check measured   estimate / sale price  (e.g. 0.78), so
  //   likely sale price = estimate / ratio
  // With no ratio set, the estimate is used as is.
  likelySalePrice(estimate, estimateToSaleRatio) {
    if (estimate == null) return null;
    if (!(estimateToSaleRatio > 0)) return estimate;
    return estimate / estimateToSaleRatio;
  },

  // Sort key for "closest to your budget": how far a home's monthly cost is from
  // the most the family can spend and stay comfortable. Smaller is closer.
  // Homes at or under the limit come first (nearest the limit first), then homes
  // over it, then homes the savings can't cover; unknown costs come last.
  budgetDistance(monthlyCost, comfortableLimit, cashOk) {
    if (monthlyCost == null || comfortableLimit == null) return Infinity;
    const gap = monthlyCost - comfortableLimit;
    return (cashOk === false ? 1e12 : 0) + (gap > 0 ? 1e9 + gap : -gap);
  },

  monthsToSave(shortfall, savedPerMonth) {
    if (shortfall == null || shortfall <= 0) return 0;
    if (!savedPerMonth) return null;
    return Math.ceil(shortfall / savedPerMonth);
  },
};

if (typeof module !== 'undefined') module.exports = PlannerMath;
