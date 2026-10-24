# Design document: family home-buying planner (v3)

App name: Forsyth MarketMap. This builds on the earlier House Price Evaluation Model (v2).

## 1. What the app is for

A family enters what they earn and spend each month. The app shows which homes in Forsyth County fit that budget without leaving them short, and what each home would really cost per month.

The question the app answers is "what can we afford comfortably?" It is not "what is the biggest loan we qualify for?"

It is a planning tool. It is not financial advice, an appraisal, or a loan offer. This is stated on the page, in plain words.

## 2. Who uses it

- Families in or near Forsyth County thinking about buying a first or next home.
- People who have already looked at listing sites and want to check whether a price is reasonable and whether they can carry it.

## 3. Design principles

1. **Budget first, homes second.** The first screen asks about the family, not the house.
2. **Show the whole monthly cost.** Loan payment, property tax, insurance, and mortgage insurance if it applies.
3. **Show uncertainty.** Every estimate is a range. The app says where the model is weaker.
4. **Nothing leaves the browser.** Budget numbers are never sent to a server or saved. Say this on the budget screen.
5. **Plain language.** No jargon without a one-line explanation next to it.
6. **No pressure.** The app never uses urgency language or tells a family to buy.

## 4. Visual direction

The app should feel like a worksheet a housing counselor would hand you, not a dashboard.

- Mostly text, tables, and one simple chart. No stacks of cards, gradients, glass effects, pills, or badges.
- One typeface family, one accent color, existing light/dark modes kept.
- The existing map stays, but it is secondary. The budget and the monthly breakdown are the main content.
- The only chart that matters: a single horizontal bar showing take-home pay split into housing, other bills, and what is left.
- Copy is written in a student's plain voice. No marketing words ("seamless," "powerful," "unlock").
- Keep the current logo.

## 5. Screens

### 5.1 Budget (first screen)

A single-column form, like a paper worksheet.

Fields:
- Monthly take-home income (after tax)
- Monthly debt payments (car, student loans, credit cards)
- Other regular monthly costs (childcare, insurance, phone, groceries, etc.)
- Savings available for a down payment and closing costs
- Interest rate and loan term (defaults shown, editable)

Below the form, live: "Money left each month before housing: $X" and "Housing amount that leaves you comfortable: up to $Y" (see section 7).

A short line under the form: "These numbers stay on this device."

### 5.2 Homes that fit

- A list (sortable) and the map, filtered to homes whose full monthly cost lands in the family's comfortable range.
- Each row: address, estimated value range, monthly cost, comfort label, money left each month.
- A toggle to include homes that are "tight."
- Homes outside the range are hidden by default, not removed. Show a count ("312 more homes are above your range").

### 5.3 Home detail

In this order:
1. **Price check.** The family types in an asking price. Show it next to the model's estimated range, the county value, and a plain-language reason for the gap (from SHAP).
2. **Monthly cost breakdown.** A table: loan payment, property tax, home insurance, mortgage insurance, total. Then the same bar as 5.1 with this home included.
3. **Cash needed up front.** Down payment plus estimated closing costs, and a rough "months to save" from the savings entered.
4. **What if.** Controls for interest rate, down payment, and a drop in income. The monthly cost and comfort label update live.
5. **How sure we are.** The tested range for this area and a note if the home is somewhere the model is less reliable (for example, an unusual home or a neighborhood test result).

### 5.4 Compare

Two or three homes side by side using the same rows as 5.3. **Built:** “Add to compare” on a home, a Compare homes table on Detail, and a share link that holds parcel IDs only.

### 5.5 How this works

Data sources, how the model was built, accuracy and where it is wrong, how the comfort label is calculated, and what the app cannot do. **Built as small (i) panels next to the sections they explain**, not as its own page: the privacy notice (what's different, privacy, limits), Section B (comfort label and every rate behind the price), the Homes list (sources), the Detail estimate (model and accuracy) and “Can your family pay for it?” (sale-price step, cost math, every rate).

## 6. Calculations

Monthly loan payment, standard formula:

    M = P * r * (1 + r)^n / ((1 + r)^n - 1)

- P = loan amount (price minus down payment)
- r = monthly interest rate (annual rate / 12)
- n = number of monthly payments

Total monthly housing cost = M + property tax / 12 + insurance / 12 + mortgage insurance (if the down payment is under 20%).

Property tax, insurance, and mortgage insurance rates must come from checked sources. Do not use guessed numbers. See the verification list in section 10.

## 7. Comfort label

The label is based on what is left after all monthly costs, not on a single ratio.

    left = take-home income - other bills and debts - total monthly housing cost
    buffer = left / take-home income

Labels (chosen October 24, 2026; the reason is stored with them in `planner-config.json` and shown in the app):

| Label | Rule |
|-------|------|
| Comfortable | buffer at or above 20% |
| Tight | buffer between 10% and 20% |
| Stretching | buffer below 10% |

These are this app's choice, not a lender rule. 20% left leaves room to save and absorb a surprise bill; under 10% means one repair or a short drop in pay could leave the family short.

Also show the common guideline of keeping housing near 28% of gross income as a reference line, and say that it is a guideline, not a rule. Check the exact figures against a source such as HUD or CFPB before citing them.

The label should also answer: "What if income drops 10%?" using the same rule.

## 8. Estimates for buyers

The model predicts the county's assessed value. Buyers care about sale price, and the existing page says both the county and the model come in under recent sale prices.

- Show a price range, not one number.
- Adjust toward sale price using the sales-ratio results from the accuracy section. Only Alpharetta sales were tested, so for Forsyth, say plainly that the adjustment is less certain, or show only the county-based estimate. **Built:** homes are judged at estimate ÷ 0.78 (the 2025 Alpharetta median), and the app says the ratio comes from Alpharetta.
- Homes not in the Forsyth dataset (80,306 homes in the 2025 tax records; new construction and recent splits are missing) are not supported. Say so when an address is not found.
- Listings are entered by the user (address plus asking price). Do not scrape listing sites.

## 9. Privacy

- All budget inputs are processed in the browser. No storage, no analytics on those fields, no cookies for them.
- Clear button that wipes all entries.
- No account or login.

## 10. Verify before building (do not assume)

Status October 24, 2026: verified and in `planner-config.json` with sources: Forsyth millage (2025), Georgia's 40% assessment, insurance and mortgage insurance, closing costs, the default rate (Freddie Mac, Oct 22, 2026) and Georgia Dream limits (DCA, July 8, 2026). Not verified: the homestead exemption and the Fulton/City of Cumming rates (see `NEEDS_OWNER.md`).

- Property tax: millage rates for Forsyth and Fulton, and how assessed value turns into a tax bill in Georgia.
- Homestead and other exemptions, and who qualifies.
- Typical homeowner insurance and mortgage insurance ranges, with a source.
- Closing cost estimate method, with a source.
- Any assistance programs mentioned (for example Georgia Dream): check official pages for current rules.
- Current typical interest rate to use as the default, with a date shown.

## 11. Build plan (Oct 1 to Oct 26, noon ET)

| Dates | Work |
|-------|------|
| Oct 1-4 | Verify the numbers in section 10. Decide comfort cutoffs. |
| Oct 5-10 | Budget screen and monthly cost calculation, with tests against known payments. |
| Oct 11-16 | Homes-that-fit list and map filter. Home detail page. |
| Oct 17-20 | What-if controls. How-this-works page. Fix bugs. |
| Oct 21-23 | Disclosure text, video, final testing on phone and desktop. |
| Oct 24-25 | Submit. Do not wait until the last morning. |

Cut order if time runs short: Compare first, then the what-if income drop. **Status October 24:** both are built. What is still open is listed in `NEEDS_OWNER.md` (homestead exemption, City of Cumming rate, Forsyth sale prices).

## 12. Submission notes (CAC)

- Confirm the first GitHub commit date. Only work created after October 30, 2025 is eligible, and for a 2.0 only the new work is judged.
- Disclose all AI use in the submission materials. Be clear about which parts are your own work (data cleaning, model, validation, financial logic) and which parts AI helped with, and be ready to explain the code.
- Video, 1-3 minutes: enter a sample family budget, open one home, show the monthly cost and comfort label, then show the what-if and one limitation.
- Do not claim the app prevents money stress. Say it helps families plan.
