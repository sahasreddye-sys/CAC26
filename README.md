# Forsyth MarketMap

A budget-first home planner for Forsyth County, GA. You enter your monthly take-home pay, debts, regular costs and savings, and it shows which homes fit and why a home is estimated at the price it is.

![Forsyth MarketMap budget screen](docs/screenshot.jpg)

**Live site:** https://sahasreddye-sys.github.io/CAC26/

[![Tests](https://github.com/sahasreddye-sys/CAC26/actions/workflows/tests.yml/badge.svg)](https://github.com/sahasreddye-sys/CAC26/actions/workflows/tests.yml)
![Python](https://img.shields.io/badge/Python-notebooks-3776AB?logo=python&logoColor=white)
![LightGBM](https://img.shields.io/badge/model-LightGBM-2E7D32)
![License](https://img.shields.io/badge/license-MIT-blue)
![GitHub Pages](https://img.shields.io/badge/hosted%20on-GitHub%20Pages-222?logo=github)

## What it does

- Takes your budget (pay, debt payments, regular costs, savings) and works out a price range you can afford.
- Estimates a value for each home from Forsyth County tax assessor records, with a lower and upper estimate next to the point estimate.
- Shows which features pushed an estimate up or down (SHAP values).
- Shows each home's school zones.
- Runs entirely in the browser. Nothing you type is sent anywhere or saved.

The planner is a learning project. It is not financial advice, a loan offer or an appraisal.

## The model

- **Data:** Forsyth County tax assessor parcel records, tax year 2025. Other data (school zones, amenities, permits, a ZIP-level price index) is listed in `docs/data-sources.md` with where each file came from.
- **Model:** LightGBM, 600 trees, trained on log county value with 5-fold cross-validation.
- **What it predicts:** the county's assessed value, not what a home would sell for. There are no Forsyth sale prices in the open data, so estimates follow assessed value and not the market.
- **Notebooks:** `housing_model_v2.ipynb` is the current one. `Housing_Price_Model.ipynb` is the first version.

## How the site works

1. `housing_model_v2.ipynb` trains the models and saves them along with their accuracy numbers.
2. `data/forsyth.json.gz` holds every home, its estimate and lower/upper range, and the model's trees so the browser can explain an estimate. `data/summary.json` holds the accuracy numbers shown on the site.
3. `index.html` loads those files and works everything out in the browser, so there is no server.
4. `tools/build_school_zones.py` matches homes to school zones ahead of time.

## Repo layout

| Path | What is in it |
|---|---|
| `index.html` | The site |
| `housing_model_v2.ipynb` | Current model training notebook |
| `Housing_Price_Model.ipynb` | First version of the notebook |
| `data/` | Home data, the in-browser model, school zones and accuracy numbers |
| `tools/` | Script that matches homes to school zones |
| `tests/` | Tests for the budget math (run on every push by `.github/workflows/tests.yml`) |
| `docs/` | Data sources and notes on the loan payment calculation |
| `DESIGN.md` | Design notes for the site |

## Run it locally

```bash
git clone https://github.com/sahasreddye-sys/CAC26.git
cd CAC26
python -m http.server 8000
```

Then open http://localhost:8000. To run the tests, use `node --test` (Node 20 or newer). To retrain, open `housing_model_v2.ipynb` in Jupyter or Colab and run the cells in order.

## Limits

- Estimates come from assessed values, not sale prices or a home's condition.
- Only Forsyth County homes are in the planner right now.
- The ZIP-level price index is experimental data from FHFA and is by ZIP code, not by house.

## License

MIT, see `LICENSE`.
