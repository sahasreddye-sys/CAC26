# Needs Sahas

Things the planner can't fill in without you checking a primary source or making a call. Until each one is done, the app either leaves it out or says “not set yet”.

## Numbers that are not set

| What | Why it isn't set | Where to look |
|------|------------------|---------------|
| Homestead exemption (`property_tax.homestead_exemption`) | The Forsyth County Board of Assessors pages block automated reading, so the amount couldn't be confirmed from the county. A search summary said the regular exemption takes $8,000 off the assessed value for the county M&O and fire portions and $2,000 off the school and state portions, which the planner's single “exemption” number can't represent without a code change. | forsythco.com → Board of Assessors → Homestead Exemption, or call 770-781-2106. Then decide whether to split the tax math by millage portion. |
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

## Left out on purpose

- **Preapproval and appraisal in “Next steps”.** The brief asked for them, but the CFPB pages checked (owning-a-home/prepare and /close) don't mention them, so only the steps those pages do mention are listed. Add them if you find an official page that covers them.
- **FHA and VA loan choices.** Their insurance and funding-fee rules would need official sources; skipped.
- **Touch tooltips on the map.** A tap opens the home right away; the list below the map has the same homes.

## Your call

- **The Method page.** You asked for methodology in small (i) panels instead of its own page, so that is how it is built. The brief had asked for a page.
- **Merging and deploying.** All of this is on the `polish` branch. Push it to `main` when you're happy: `git push origin polish:main` from the CAC26 folder.
