# Forsyth MarketMap

A budget-first home planner for Forsyth County, GA. You enter your monthly take-home pay, debts, regular costs and savings, and it shows which homes fit and why a home is estimated at the price it is.

**Live site:** https://sahasreddye-sys.github.io/house-price-evaluation-model/

![Python](https://img.shields.io/badge/Python-notebooks-3776AB?logo=python&logoColor=white)
![LightGBM](https://img.shields.io/badge/model-LightGBM-2E7D32)
![GitHub Pages](https://img.shields.io/badge/hosted%20on-GitHub%20Pages-222?logo=github)

## What it does

- Takes your budget (pay, debt payments, regular costs, savings) and works out a price range you can afford.
- Estimates a price for each home from county tax assessor data, with a lower and upper estimate next to the point estimate.
- Shows which features pushed an estimate up or down (SHAP values).
- Runs entirely in the browser. Nothing you type is sent anywhere or saved.

The planner is a learning project. It is not financial advice, a loan offer or an appraisal.

## How it works

1. Training happens in the notebooks (`Housing_Price_Model.ipynb`, `housing_model_v2.ipynb`). The models are LightGBM regressors trained on Fulton and Forsyth County tax assessor exports.
2. The trained models are exported as JSON (`model_*_point.json`, `model_*_lower.json`, `model_*_upper.json`) along with SHAP values (`shap_*.npy`).
3. `index.html` loads the exported models and scores homes in the browser, so there is no server.

## Repo layout

| Path | What is in it |
|---|---|
| `index.html` | The site |
| `housing_model_v2.ipynb` | Current model training notebook |
| `Housing_Price_Model.ipynb` | First version of the notebook |
| `model_*.json`, `shap_*.npy` | Exported models and SHAP values |
| `data/` | Home data and school zones |
| `tools/` | Script that matches homes to school zones |
| `tests/` | Tests for the budget math |
| `docs/` | Notes on the loan payment calculation |
| `DESIGN.md` | Design notes for the site |

## Run it locally

```bash
git clone https://github.com/sahasreddye-sys/house-price-evaluation-model.git
cd house-price-evaluation-model
python -m http.server 8000
```

Then open http://localhost:8000. To retrain, open `housing_model_v2.ipynb` in Jupyter or Colab and run the cells in order.

## Limits

- Estimates come from assessor data, not recent sale prices or a home's condition.
- Only Forsyth County homes are in the planner right now.
