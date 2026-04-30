# Estate Ranking Frontend Demo

Static Leaflet demo for estate ranking

## Run

Run it from the repository root so the relative data paths resolve:

```bash
python3 -m http.server 5173
```

Open:

```text
http://localhost:5173/frontend/
```

## Data Paths

Data path constants are defined at the top of `frontend/src/app.js`:

```js
const DATA_ROOT = "./data";
```

Datasets loaded by the page:

- `${DATA_ROOT}/estate_district_factors_formatted.json`
- `${DATA_ROOT}/district_factors.csv`
- `${DATA_ROOT}/amenities.json`

## Amenity Data

The amenity layer is generated from:

- `raw data/FEHD_RL_converted.csv` for restaurant licences.
- `raw data/FEHD_FL_converted.csv` filtered to `Fresh Provision Shop Licence` for supermarkets / fresh provision shops.
- `raw data/PARKS_20260412.gdb_converted.csv` for parks, stored as `lcsd`.
- `raw data/download_20250624_1647_converted.csv` for LCSD facilities, using `Latitude` and `Longitude`, stored as `lcsd`.
- `raw data/MTR+LR.xlsx` for MTR stations. Light Rail rows are excluded and stations are deduplicated by MTR code.
- `data/spc_lat_lon.csv` for clinics with available `lat` and `lon`.

Parks and LCSD facilities are merged into one `lcsd` amenity type. They are deduplicated by facility name, so duplicated names keep one coordinate.

Use the amenity radius input to calculate restaurant, supermarket, LCSD / park, MTR station, and clinic counts for any radius from 50 m to 3000 m. The ranking score uses those counts in real time.

`Amenity layer -> Selected radius` shows only amenities within the active radius for the selected estate. `All amenities` draws the complete restaurant, supermarket, LCSD / park, MTR, and clinic layer.

Clinic coverage is limited by the available coordinate data. At the moment only rows in `data/spc_lat_lon.csv` with latitude and longitude are used.

Regenerate the amenity file with:

```bash
python3 frontend/scripts/build_amenities.py
```

## Scoring Weights

Notebook-derived district weights are in `RENT_WEIGHTS` in `frontend/src/app.js`.

These currently match `ranking.ipynb`:

```js
const RENT_WEIGHTS = {
  "restaurants / population": 0.368082,
  "kindergarten / children": 0.160554,
  "open space / city": 0.034545,
  "primary school / children": 0.005543,
  "mtr_station_count": 0.000917,
  "clinics / population": -0.35,
  "lcsd / population": -0.373356,
  "primary school ranking": -0.508831,
  "supermarkets / population": -0.73306,
  "work travelling distance": -0.991667,
};
```

Purchase mode uses `PURCHASE_WEIGHTS` in the same file.

Some notebook column names are redirected to frontend-calculated estate/radius values in `FIELD_ALIASES`:

```js
const FIELD_ALIASES = {
  "restaurants / population": ["restaurantNearbyCount"],
  "supermarkets / population": ["supermarketNearbyCount"],
  "lcsd / population": ["lcsdNearbyCount"],
  "clinics / population": ["clinicNearbyCount"],
  "mtr_station_count": ["mtrNearbyCount"],
  "work travelling distance": ["distance"],
  work_travelling_distance: ["distance"],
};
```

This means the restaurant, supermarket, LCSD / park, clinic, and MTR parts of the weighted score are based on counts within the selected amenity radius. District-only fields still come from `district_factors.csv`.

Every model-weighted feature is normalized over the currently filtered result set before the weight is applied:

```js
normalizedValue = (rawValue - filteredMin) / (filteredMax - filteredMin)
score += normalizedValue * weight
```

This keeps different units, such as primary-school ranking, work-travel distance, district ratios, and live amenity counts, comparable before weighting. The sign of the model weight controls direction. A positive weight rewards larger normalized values; a negative weight penalizes larger normalized values. The frontend does not invert model fields such as `work travelling distance`, because the negative model weight already represents the penalty.

Frontend-added demo weights are in `DEMO_ESTATE_WEIGHTS`:

```js
const DEMO_ESTATE_WEIGHTS = {
  mtrDistance: 0,
};
```

These are explicit demo assumptions. Amenity boosts are not duplicated here because amenity counts already enter through the notebook weight aliases above.

The `mtrDistance` demo term is separate from `mtr_station_count`. `mtr_station_count` is the number of stations inside the selected radius. `mtrDistance` is the estate's nearest-station distance, scored with inverse min-max scaling so smaller distance contributes more:

```js
mtrDistanceScore = (1 - (mtrDistance - filteredMin) / (filteredMax - filteredMin)) * DEMO_ESTATE_WEIGHTS.mtrDistance
```

Affordability is not added to the score. It is used only as a tie-breaker when two estates have the same displayed match score. The app uses the midpoint of the estate's active listing range:

```js
midPrice = (minPrice + maxPrice) / 2
```

Rent mode uses `rentMin` / `rentMax`; purchase mode uses `purchaseMin` / `purchaseMax`. The budget slider still acts as a hard filter first. If displayed scores tie, the lower midpoint price ranks first.

Because the model weights can be negative, the combined raw score can also be negative. The UI display converts that final combined raw score to a 0-100 match score using min-max scaling over the currently filtered results:

```js
displayScore = (rawScore - filteredRawMin) / (filteredRawMax - filteredRawMin)
```


## Result Display Controls

`Show top` limits results per district first.

`Limit` then caps the total displayed results. The final displayed result set is shared by both the right ranking list and the map markers.
