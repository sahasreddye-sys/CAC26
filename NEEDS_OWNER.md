# Needs Sahas

Things the planner can't fill in without you checking a primary source or making a call. Until each one is done, the app either leaves it out or says “not set yet”.

## Numbers that are not set

| What | Why it isn't set | Where to look |
|------|------------------|---------------|
| Homestead exemption (`property_tax.homestead_exemption`) | The Forsyth County Board of Assessors pages block automated reading (checked again Oct 25, 2026, also from a regular browser), so the amount couldn't be confirmed from the county. A search summary said the regular exemption takes $8,000 off the assessed value for the county M&O and fire portions and $2,000 off the school and state portions, which the planner's single “exemption” number can't represent without a code change. | forsythco.com → Board of Assessors → Homestead Exemption, or call 770-781-2106. Then decide whether to split the tax math by millage portion. |
| City of Cumming tax rate | The data can't tell which homes are inside the city, so city homes are under-taxed. | City of Cumming millage page, plus a city-limits layer from Forsyth County GIS. |

## Numbers to double-check before the video

| What | Value now | Source used | Note |
|------|-----------|-------------|------|
| Default interest rate | 7.32%, Oct 22, 2026 | Freddie Mac PMMS (freddiemac.com/pmms) | Updates every Thursday. Change it in `planner-config.json`, then run `python tools/build.py`. |
| Comfort cutoffs | Comfortable at 20% or more left, Stretching under 10% | This app's choice; the reason is in `planner-config.json` and the (i) panel next to Section B | DESIGN.md section 7 said these had to be chosen and justified. Read the reason and change it if you'd explain it differently to a judge. |
| Likely sale price ratio | estimate ÷ 0.78 | 2025 Alpharetta sales check in `data/summary.json` | Measured in Alpharetta, not Forsyth. Replace it when the Forsyth sales records arrive (`forsyth-sales-records-request.md`). |
| Home insurance | $4.90 per $1,000 a year | Freddie Mac research, 2023 national average | National and two years old. A Georgia source would be better. |
| Forsyth millage | 24.522 mills | Forsyth County, 2025 adopted rates | The county changed its 2026 M&O rate; update once the 2026 school rate is on an official page. |
| Georgia Dream limits | $625,000 price; $137,555 / $158,188 income | Georgia DCA page, effective July 8, 2026 | The page doesn't list credit score, education class or assistance amounts, so the app doesn't either. |

## Your words and your checks

- **About page (`#/about`).** “Why I built this” and “Who it’s for” are filled from your own DESIGN.md (sections 1 and 2); rewrite them in your voice if you like. “What I learned from talking to people” is not on the page: it needs real conversations and quotes, so it is a `TODO(Sahas)` comment in `index.html` you can turn back into a section.
- **Help links.** Read on Oct 24–25, 2026 and noted in comments in `index.html`: the CFPB housing counselor search (by ZIP code), the CFPB buying-a-house steps, the CFPB debt-to-income page (it matches the glossary's definition), and Georgia Dream. A HUD “Buying a Home” link was removed because its page text couldn't be read to check it.
- **Maintenance.** Fannie Mae's rule of thumb (1% to 4% of value a year; 1% for newer homes, toward 4% for homes over 30 years old) is shown as a suggestion next to the maintenance box. Only what the family types is added to the total.
- **Accuracy numbers.** The site shows the numbers the notebook prints (cell 27 and cell 25). `data/summary.json` is from a slightly different run (R² 0.913 vs 0.912, median error 4.43% vs 4.42%); re-export it from the notebook if you want them to match.

## From the expansion branch

- **Untested for Forsyth.** A sale-price check (no open Forsyth sale data) and a whole-neighborhoods-held-out test (the notebook ran it for Alpharetta only). The Methods and About pages say so; `TODO(Sahas)` comments in `index.html` mark where to add them.
- **New computations live in `tools/build_error_tables.py`, not in the notebook.** They use the out-of-fold estimates already exported in `data/forsyth.json.gz`, so they reproduce from the notebook's output without retraining. Copy the script into a notebook cell if you want everything in one place.
- **Thresholds that are this app's choice:** “few similar homes” is under 10 homes within a mile and within 25% of the size; “odd lot” is outside the 1st–99th percentile of Forsyth lots; “older homes” notes show when a decade's median miss is at least twice the overall.
- **Tag `stable-before-expansion`** is only on this Mac until you push tags (`git push origin stable-before-expansion`).

## Left out on purpose

- **Preapproval and appraisal in “Next steps”.** The brief asked for them, but the CFPB pages checked (owning-a-home/prepare and /close) don't mention them, so only the steps those pages do mention are listed. Add them if you find an official page that covers them.
- **FHA and VA loan choices.** Their insurance and funding-fee rules would need official sources; skipped.
- **Touch tooltips on the map.** A tap opens the home right away; the list below the map has the same homes.

## Your call

- **The Method page.** You asked for methodology in small (i) panels instead of its own page, so that is how it is built. The brief had asked for a page.
- **Merging and deploying.** All of this is on the `polish` branch. Push it to `main` when you're happy: `git push origin polish:main` from the CAC26 folder.
