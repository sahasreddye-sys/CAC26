# Raw data sources for Forsyth MarketMap

Downloaded 2026-10-01. The original files are kept outside this repo (some are large). The website only uses smaller files built from them, like `data/forsyth_schools.json.gz` (made by `tools/build_school_zones.py`).

| File | What it is | Where it came from | Data date | Terms |
|------|-----------|--------------------|-----------|-------|
| `forsyth_school_zones.geojson` | Attendance zone shapes: 22 elementary, 11 middle, 7 high | Forsyth County GIS open data, "School Districts" layer: https://services2.arcgis.com/StQaZGYzUARPnrpL/arcgis/rest/services/School_Districts/FeatureServer/0 | Layer last edited 2026-03-27 | Forsyth County open data, free to use |
| `forsyth_schools.geojson` | 40 public schools: name, grades, address, website, capacity | Forsyth County GIS open data, "Public School" layer: https://services2.arcgis.com/StQaZGYzUARPnrpL/arcgis/rest/services/Public_School/FeatureServer/0 | Layer last edited 2026-03-27 | same |
| `forsyth_residential_permits_2023on.geojson` | 4,779 residential building permits issued 2023-01-01 to 2026-09-30, including remodels, pools and additions | Forsyth County "Building Permits" layer: https://geo.forsythco.com/gis3/rest/services/Public_EnerGovPlans/Building_Permits/FeatureServer/0 (filter: PermitType = 'Building (Residential)') | Through 2026-09-30 | same |
| `fhfa_hpi_at_zip5.xlsx` | Yearly house price index for every 5-digit ZIP code | FHFA House Price Index datasets page: https://www.fhfa.gov/data/hpi/datasets, file https://www.fhfa.gov/hpi/download/annual/hpi_at_zip5.xlsx | "Last updated: March 31, 2026"; years through 2025 | U.S. government data, free; cite FHFA. FHFA calls these ZIP indexes "experimental" (see the note at the top of the file) |
| `osm_amenities.json` | 473 places: 264 parks, 111 supermarkets, 41 clinics, 35 pharmacies, 17 libraries, 5 hospitals | OpenStreetMap via the Overpass API, query in `osm_query.overpassql`, box 33.98–34.42 N, 84.40–83.92 W | OSM data as of 2026-10-01T15:09Z | ODbL: the app must show "© OpenStreetMap contributors" |

## Known gaps (checked, not guessed)

- **Permits don't cover new homes well.** The 2025 tax data lists 4,482 Forsyth homes built 2023–2026, but only 308 of them match a parcel in the permit file. Since 2023, only 149 permits are labeled "Single Family Residential Detached Structure"; most are "Residential" with no detail, plus remodels and pools. The layer probably leaves out City of Cumming permits. **Plan:** use "year built" in the tax data to find new homes, and use permits only for lots that have a permit but no house in the tax data yet.
- **No sales for Forsyth.** Neither the county's GIS nor its open data portal has sale prices. An open records request to the Forsyth County Board of Assessors is planned for this.
- **OpenStreetMap is volunteer-made.** Some places are missing. No urgent cares are tagged in this area, and many pharmacies sit inside supermarkets without their own tag. Distances should say "nearest mapped" and not claim to be complete.
- **FHFA is by ZIP code, not by house.** Homes in the parcel data don't list a ZIP yet, so each home will need one matched from its location.
- **Alpharetta schools** (Fulton County Schools) aren't downloaded yet.
