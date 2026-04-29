const DATA_ROOT = "./data";

const DATA_PATHS = {
  estates: `${DATA_ROOT}/estate_district_factors_formatted.json`,
  districtFactors: `${DATA_ROOT}/district_factors.csv`,
  amenities: `${DATA_ROOT}/amenities.json`,
};

const DEFAULT_ESTATE_PER_DISTRICT = 3;
const DEFAULT_GLOBAL_RESULT_LIMIT = 100;
const AMENITY_GRID_DEGREES = 0.01;
const MIN_AMENITY_RADIUS_METERS = 50;
const MAX_AMENITY_RADIUS_METERS = 3000;

const DISTRICT_TRANSLATION = {
  "中西區": "Central & Western",
  "九龍城區": "Kowloon City",
  "元朗區": "Yuen Long",
  "北區": "North",
  "南區": "Southern",
  "大埔區": "Tai Po",
  "將軍澳 (西貢區)": "Sai Kung",
  "屯門區": "Tuen Mun",
  "東區": "Eastern",
  "沙田區": "Sha Tin",
  "油尖旺區": "Yau Tsim Mong",
  "深水埗區": "Sham Shui Po",
  "灣仔區": "Wan Chai",
  "荃灣區": "Tsuen Wan",
  "華景 | 荔灣 (葵青區)": "Kwai Tsing",
  "葵青區": "Kwai Tsing",
  "西貢區": "Sai Kung",
  "觀塘區": "Kwun Tong",
  "離島區": "Islands",
  "黃大仙區": "Wong Tai Sin",
};

const RENT_WEIGHTS = {
    "restaurants / population": 0.065870,
    "kindergarten / children": 0.042750,
    "open space / city": 0.027993,
    "primary school / children": 0.024533,
    "mtr_station_count": 0.023982,
    "clinics / population": -0.094243,
    "lcsd / population": -0.097300,
    "primary school ranking": -0.110684,
    "supermarkets / population": -0.154571,
    "work travelling distance": -0.184001,
}

const PURCHASE_WEIGHTS = {
    "open space / city": 0.084244,
    "lcsd / population": 0.030129,
    "restaurants / population": 0.028478,
    "work travelling distance": 0.024989,
    "supermarkets / population": 0.024287,
    "primary school ranking": 0.013086,
    "clinics / population": -0.093943,
    "primary school / children": -0.097730,
    "mtr_station_count": -0.130257,
    "kindergarten / children": -0.254339,
}

// Demo-only weights added by the frontend. These are created for demonstration purposes to surface the amenity score more prominently, and are not derived from the notebook model. Adjust as needed for different emphasis in the demo or based on future model updates.
const DEMO_ESTATE_WEIGHTS = {
  mtrDistance: 0,
  affordability: 0,
};

// Notebook field names do not perfectly match the available frontend columns.
const FIELD_ALIASES = {
  "restaurants / population": ["restaurantNearbyCount"],
  "supermarkets / population": ["supermarketNearbyCount"],
  "lcsd / population": ["lcsdNearbyCount"],
  "clinics / population": ["clinicNearbyCount"],
  "mtr_station_count": ["mtrNearbyCount"],
  "work travelling distance": ["distance"],
};

const state = {
  estates: [],
  amenities: [],
  amenityIndex: null,
  amenityCountCache: new Map(),
  ranked: [],
  displayedEstates: [],
  districtFactors: new Map(),
  selectedDistricts: new Set(),
  mode: "rent",
  amenityRadius: 500,
  amenityLayerMode: "none",
  shownAmenityTypes: new Set(["restaurant", "supermarket", "lcsd", "mtr", "clinic"]),
  perDistrictLimit: DEFAULT_ESTATE_PER_DISTRICT,
  globalResultLimit: DEFAULT_GLOBAL_RESULT_LIMIT,
  selectedEstateId: null,
  map: null,
  markerLayer: null,
  amenityLayer: null,
  radiusLayer: null,
  markersById: new Map(),
};

let rankingDebounce = null;

const elements = {
  districtOptions: document.querySelector("#district-options"),
  selectAllDistricts: document.querySelector("#select-all-districts"),
  clearDistricts: document.querySelector("#clear-districts"),
  budgetMin: document.querySelector("#budget-min"),
  budgetMax: document.querySelector("#budget-max"),
  budgetMinInput: document.querySelector("#budget-min-input"),
  budgetMaxInput: document.querySelector("#budget-max-input"),
  budgetOutput: document.querySelector("#budget-output"),
  amenityRadius: document.querySelector("#amenity-radius"),
  radiusPresets: document.querySelectorAll(".radius-preset"),
  perDistrictLimit: document.querySelector("#per-district-limit"),
  globalResultLimit: document.querySelector("#global-result-limit"),
  amenityLayerMode: document.querySelector("#amenity-layer-mode"),
  showRestaurants: document.querySelector("#show-restaurants"),
  showSupermarkets: document.querySelector("#show-supermarkets"),
  showLcsd: document.querySelector("#show-lcsd"),
  showMtr: document.querySelector("#show-mtr"),
  showClinics: document.querySelector("#show-clinics"),
  nearMtr: document.querySelector("#near-mtr"),
  runRanking: document.querySelector("#run-ranking"),
  resultSummary: document.querySelector("#result-summary"),
  rankingList: document.querySelector("#ranking-list"),
  rankingCount: document.querySelector("#ranking-count"),
  mapCount: document.querySelector("#map-count"),
  criteriaPanel: document.querySelector("#criteria-panel"),
};

async function init() {
  state.map = L.map("map", {
    preferCanvas: true,
    zoomControl: true,
  }).setView([22.34, 114.16], 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(state.map);

  state.markerLayer = L.layerGroup().addTo(state.map);
  state.amenityLayer = L.layerGroup().addTo(state.map);
  state.radiusLayer = L.layerGroup().addTo(state.map);

  const [estates, districtFactorsCsv, amenities] = await Promise.all([
    fetchJson(DATA_PATHS.estates),
    fetchText(DATA_PATHS.districtFactors),
    fetchJson(DATA_PATHS.amenities),
  ]);

  state.districtFactors = new Map(
    parseCsv(districtFactorsCsv).map((row) => [
      row.District,
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toNumber(value)])),
    ]),
  );

  state.estates = estates
    .filter((estate) => Number.isFinite(estate.lat) && Number.isFinite(estate.lng))
    .map((estate, index) => normalizeEstate(estate, index));
  state.amenities = amenities.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
  state.amenityIndex = buildAmenityIndex(state.amenities);

  renderDistrictOptions();
  bindEvents();
  configureBudgetRange();
  applyRanking();
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

async function fetchText(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.text();
}

function normalizeEstate(estate, index) {
  const sourceDistrict = estate.scope?.db ?? "Unknown";
  const district = DISTRICT_TRANSLATION[sourceDistrict] ?? sourceDistrict;
  return {
    ...estate,
    id: `${estate.typeCode || "estate"}-${index}`,
    district,
    displayName: estate.phaseName ? `${estate.estateName} ${estate.phaseName}` : estate.estateName,
    addressText: [estate.address, estate.scope?.hma].filter(Boolean).join(" · "),
    rentMin: toNumber(estate.rent?.postMinPrice),
    rentMax: toNumber(estate.rent?.postMaxPrice),
    purchaseMin: toNumber(estate.sale?.postMinPrice),
    purchaseMax: toNumber(estate.sale?.postMaxPrice),
    mtrDistance: toNumber(estate.mtrDistance),
    spu_count: toNumber(estate.spu_count),
    restaurantCount500m: toNumber(estate.restaurantCount500m),
    supermarketCount500m: toNumber(estate.supermarketCount500m),
    restaurantCount1000m: toNumber(estate.restaurantCount1000m),
    supermarketCount1000m: toNumber(estate.supermarketCoun1000m ?? estate.supermarketCount1000m),
  };
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

function parseCsv(csvText) {
  const rows = csvText.trim().split(/\r?\n/);
  const headers = rows.shift().split(",");
  return rows.map((row) => {
    const values = row.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function renderDistrictOptions() {
  const districts = [...new Set(state.estates.map((estate) => estate.district))].sort((a, b) =>
    a.localeCompare(b),
  );
  state.selectedDistricts = new Set(districts);

  elements.districtOptions.innerHTML = districts
    .map(
      (district) => `
        <label class="district-option" title="${district}">
          <input type="checkbox" value="${district}" checked />
          <span>${district}</span>
        </label>
      `,
    )
    .join("");
}

function bindEvents() {
  document.querySelectorAll('input[name="listing-mode"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.mode = input.value;
      configureBudgetRange();
      applyRanking();
    });
  });

  elements.amenityRadius.addEventListener("input", () => {
    if (syncAmenityRadius(false)) scheduleApplyRanking();
  });
  elements.amenityRadius.addEventListener("change", () => {
    if (syncAmenityRadius(true)) applyRanking();
  });
  elements.radiusPresets.forEach((button) => {
    button.addEventListener("click", () => {
      elements.amenityRadius.value = button.dataset.radius;
      syncAmenityRadius(true);
      applyRanking();
    });
  });

  elements.districtOptions.addEventListener("change", () => {
    state.selectedDistricts = new Set(
      [...elements.districtOptions.querySelectorAll("input:checked")].map((input) => input.value),
    );
  });

  elements.selectAllDistricts.addEventListener("click", () => {
    elements.districtOptions.querySelectorAll("input").forEach((input) => {
      input.checked = true;
    });
    state.selectedDistricts = new Set(
      [...elements.districtOptions.querySelectorAll("input")].map((input) => input.value),
    );
  });

  elements.clearDistricts.addEventListener("click", () => {
    elements.districtOptions.querySelectorAll("input").forEach((input) => {
      input.checked = false;
    });
    state.selectedDistricts.clear();
  });

  [elements.budgetMin, elements.budgetMax].forEach((input) => {
    input.addEventListener("input", () => syncBudgetInputs("slider"));
  });
  [elements.budgetMinInput, elements.budgetMaxInput].forEach((input) => {
    input.addEventListener("input", () => syncBudgetInputs("text"));
    input.addEventListener("change", () => syncBudgetInputs("text", true));
  });

  elements.nearMtr.addEventListener("change", applyRanking);
  elements.perDistrictLimit.addEventListener("change", () => {
    state.perDistrictLimit =
      elements.perDistrictLimit.value === "all" ? "all" : Number(elements.perDistrictLimit.value);
    applyRanking();
  });
  elements.globalResultLimit.addEventListener("change", () => {
    state.globalResultLimit =
      elements.globalResultLimit.value === "all" ? "all" : Number(elements.globalResultLimit.value);
    applyRanking();
  });
  elements.amenityLayerMode.addEventListener("change", () => {
    state.amenityLayerMode = elements.amenityLayerMode.value;
    renderAmenities();
  });
  [
    elements.showRestaurants,
    elements.showSupermarkets,
    elements.showLcsd,
    elements.showMtr,
    elements.showClinics,
  ].forEach((input) => {
    input.addEventListener("change", () => {
      state.shownAmenityTypes = new Set(
        [
          elements.showRestaurants.checked ? "restaurant" : null,
          elements.showSupermarkets.checked ? "supermarket" : null,
          elements.showLcsd.checked ? "lcsd" : null,
          elements.showMtr.checked ? "mtr" : null,
          elements.showClinics.checked ? "clinic" : null,
        ].filter(Boolean),
      );
      renderAmenities();
    });
  });
  elements.runRanking.addEventListener("click", applyRanking);
}

function configureBudgetRange() {
  const priceKey = state.mode === "rent" ? ["rentMin", "rentMax"] : ["purchaseMin", "purchaseMax"];
  const values = state.estates
    .flatMap((estate) => [estate[priceKey[0]], estate[priceKey[1]]])
    .filter((value) => Number.isFinite(value) && value > 0);
  const max = Math.ceil(Math.max(...values) / budgetStep()) * budgetStep();

  elements.budgetMin.min = 0;
  elements.budgetMin.max = max;
  elements.budgetMin.step = budgetStep();
  elements.budgetMin.value = 0;
  elements.budgetMax.min = 0;
  elements.budgetMax.max = max;
  elements.budgetMax.step = budgetStep();
  elements.budgetMax.value = state.mode === "rent" ? Math.min(max, 100000) : Math.min(max, 15000000);
  [elements.budgetMinInput, elements.budgetMaxInput].forEach((input) => {
    input.min = 0;
    input.max = max;
    input.step = budgetStep();
  });
  syncBudgetInputs("slider", false);
}

function budgetStep() {
  return state.mode === "rent" ? 1000 : 500000;
}

function syncBudgetInputs(source = "slider", shouldApply = true) {
  const sourceMin = source === "text" ? elements.budgetMinInput : elements.budgetMin;
  const sourceMax = source === "text" ? elements.budgetMaxInput : elements.budgetMax;
  const maxAllowed = Number(elements.budgetMax.max);
  let min = clampNumber(Number(sourceMin.value), 0, maxAllowed);
  let max = clampNumber(Number(sourceMax.value), 0, maxAllowed);
  if (min > max) {
    [min, max] = [max, min];
  }

  elements.budgetMin.value = min;
  elements.budgetMax.value = max;
  elements.budgetMinInput.value = min;
  elements.budgetMaxInput.value = max;
  elements.budgetOutput.textContent = `${formatCurrency(min)} - ${formatCurrency(max)}`;
  if (shouldApply) applyRanking();
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function syncAmenityRadius(commitInputValue) {
  const nextValue = Number(elements.amenityRadius.value);
  if (!Number.isFinite(nextValue)) return false;

  state.amenityRadius = Math.round(
    Math.min(MAX_AMENITY_RADIUS_METERS, Math.max(MIN_AMENITY_RADIUS_METERS, nextValue)),
  );
  if (state.amenityCountCache.size > 200000) state.amenityCountCache.clear();
  if (commitInputValue) elements.amenityRadius.value = state.amenityRadius;
  updateRadiusPresetState();
  return true;
}

function updateRadiusPresetState() {
  elements.radiusPresets.forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.radius) === state.amenityRadius);
  });
}

function scheduleApplyRanking() {
  clearTimeout(rankingDebounce);
  rankingDebounce = setTimeout(applyRanking, 180);
}

function applyRanking() {
  const minBudget = Number(elements.budgetMin.value);
  const maxBudget = Number(elements.budgetMax.value);
  const priceMinKey = state.mode === "rent" ? "rentMin" : "purchaseMin";
  const priceMaxKey = state.mode === "rent" ? "rentMax" : "purchaseMax";
  const weights = state.mode === "rent" ? RENT_WEIGHTS : PURCHASE_WEIGHTS;

  const districtFiltered = state.estates.filter((estate) => {
    const districtOk = state.selectedDistricts.has(estate.district);
    const validPrice = hasValidPriceRange(estate[priceMinKey], estate[priceMaxKey]);
    const budgetOk = validPrice && rangesOverlap(estate[priceMinKey], estate[priceMaxKey], minBudget, maxBudget);
    const mtrOk = !elements.nearMtr.checked || estate.mtrDistance <= 1;
    return districtOk && budgetOk && mtrOk;
  });
  const estatesWithAmenityCounts = addAmenityCounts(districtFiltered).map((estate) => ({
    ...estate,
    affordabilityPrice: getEstateMidPrice(estate),
  }));
  const scoreStats = buildScoreStats(estatesWithAmenityCounts, weights);

  const scored = estatesWithAmenityCounts.map((estate) => ({
    ...estate,
    scoreRaw: calculateScore(estate, weights, scoreStats),
  }));
  const scoreRange = getValueRange(scored.map((estate) => estate.scoreRaw));

  state.ranked = scored
    .map((estate) => ({
      ...estate,
      score: normalizeValue(estate.scoreRaw, scoreRange),
    }))
    .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));

  if (!state.ranked.some((estate) => estate.id === state.selectedEstateId)) {
    state.selectedEstateId = state.ranked[0]?.id ?? null;
  }
  state.displayedEstates = displayRankedEstates();

  renderRankingList();
  renderMarkers({ fitToResults: true });
  renderAmenities();
  renderCriteria();
  updateSummary();
}

function getValueRange(values) {
  const finiteValues = values.filter(Number.isFinite);
  if (!finiteValues.length) return { min: 0, max: 0 };
  return {
    min: Math.min(...finiteValues),
    max: Math.max(...finiteValues),
  };
}

function normalizeValue(value, range, { inverse = false } = {}) {
  if (!Number.isFinite(value)) return 0;
  if (range.max === range.min) return range.max > 0 ? 1 : 0;
  const normalized = (value - range.min) / (range.max - range.min);
  return inverse ? 1 - normalized : normalized;
}

function calculateScore(estate, weights, scoreStats) {
  const district = state.districtFactors.get(estate.district) ?? {};
  const modelScore = Object.entries(weights).reduce((sum, [key, weight]) => {
    return sum + getNormalizedFeatureValue(estate, district, key, scoreStats) * weight;
  }, 0);
  const mtrDistanceScore =
    normalizeValue(estate.mtrDistance, scoreStats.mtrDistance, { inverse: true }) *
    DEMO_ESTATE_WEIGHTS.mtrDistance;
  const affordabilityScore =
    normalizeValue(estate.affordabilityPrice, scoreStats.affordabilityPrice, { inverse: true }) *
    DEMO_ESTATE_WEIGHTS.affordability;
  return modelScore + mtrDistanceScore + affordabilityScore;
}

function getFeatureValue(estate, district, key) {
  const aliases = FIELD_ALIASES[key] ?? [key];
  for (const alias of aliases) {
    if (Number.isFinite(district[alias])) return district[alias];
    if (Number.isFinite(estate[alias])) return estate[alias];
  }
  return 0;
}

function getNormalizedFeatureValue(estate, district, key, scoreStats) {
  const rawValue = getFeatureValue(estate, district, key);
  // return normalizeValue(rawValue, scoreStats[key]);
  return rawValue
}

function buildScoreStats(estates, weights) {
  const keys = [...Object.keys(weights), "mtrDistance", "affordabilityPrice"];
  return Object.fromEntries(
    keys.map((key) => {
      const values = estates
        .map((estate) => {
          const district = state.districtFactors.get(estate.district) ?? {};
          return key in estate ? estate[key] : getFeatureValue(estate, district, key);
        });
      return [key, getValueRange(values)];
    }),
  );
}

function getEstateMidPrice(estate) {
  const minKey = state.mode === "rent" ? "rentMin" : "purchaseMin";
  const maxKey = state.mode === "rent" ? "rentMax" : "purchaseMax";
  return (estate[minKey] + estate[maxKey]) / 2;
}

function addAmenityCounts(estates) {
  return estates.map((estate) => ({
    ...estate,
    restaurantNearbyCount: cachedAmenityCount(estate, "restaurant"),
    supermarketNearbyCount: cachedAmenityCount(estate, "supermarket"),
    lcsdNearbyCount: cachedAmenityCount(estate, "lcsd"),
    mtrNearbyCount: cachedAmenityCount(estate, "mtr"),
    clinicNearbyCount: cachedAmenityCount(estate, "clinic"),
  }));
}

function cachedAmenityCount(estate, type) {
  const key = `${estate.id}:${type}:${state.amenityRadius}`;
  if (!state.amenityCountCache.has(key)) {
    state.amenityCountCache.set(
      key,
      queryAmenityCount(type, estate.lat, estate.lng, state.amenityRadius),
    );
  }
  return state.amenityCountCache.get(key);
}

function buildAmenityIndex(amenities) {
  const index = {};

  amenities.forEach((item) => {
    if (!index[item.type]) index[item.type] = new Map();
    const typeIndex = index[item.type];
    const key = amenityGridKey(item.lat, item.lng);
    if (!typeIndex.has(key)) typeIndex.set(key, []);
    typeIndex.get(key).push(item);
  });

  return index;
}

function queryAmenityCount(type, lat, lng, radiusMeters) {
  if (!state.amenityIndex?.[type]) return 0;
  return queryAmenityMatches(type, lat, lng, radiusMeters, () => undefined);
}

function queryAmenities(type, lat, lng, radiusMeters) {
  const results = [];
  queryAmenityMatches(type, lat, lng, radiusMeters, (item) => {
    results.push(item);
  });
  return results;
}

function queryAmenityMatches(type, lat, lng, radiusMeters, onMatch) {
  const typeIndex = state.amenityIndex?.[type];
  if (!typeIndex) return 0;

  const radiusKm = radiusMeters / 1000;
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.max(Math.cos(degreesToRadians(lat)), 0.15));
  const minLatCell = Math.floor((lat - latDelta) / AMENITY_GRID_DEGREES);
  const maxLatCell = Math.floor((lat + latDelta) / AMENITY_GRID_DEGREES);
  const minLngCell = Math.floor((lng - lngDelta) / AMENITY_GRID_DEGREES);
  const maxLngCell = Math.floor((lng + lngDelta) / AMENITY_GRID_DEGREES);
  let count = 0;

  for (let latCell = minLatCell; latCell <= maxLatCell; latCell += 1) {
    for (let lngCell = minLngCell; lngCell <= maxLngCell; lngCell += 1) {
      const candidates = typeIndex.get(`${latCell}:${lngCell}`) ?? [];
      candidates.forEach((item) => {
        if (distanceKm(lat, lng, item.lat, item.lng) <= radiusKm) {
          count += 1;
          onMatch(item);
        }
      });
    }
  }

  return count;
}

function amenityGridKey(lat, lng) {
  return `${Math.floor(lat / AMENITY_GRID_DEGREES)}:${Math.floor(lng / AMENITY_GRID_DEGREES)}`;
}

function hasValidPriceRange(sourceMin, sourceMax) {
  return Number.isFinite(sourceMin) && Number.isFinite(sourceMax) && sourceMin > 0 && sourceMax > 0;
}

function rangesOverlap(sourceMin, sourceMax, filterMin, filterMax) {
  return sourceMax >= filterMin && sourceMin <= filterMax;
}

function renderRankingList() {
  const visible = state.displayedEstates;
  elements.rankingCount.textContent = `${visible.length} shown · ${limitLabel()} · ${globalLimitLabel()}`;

  if (!visible.length) {
    elements.rankingList.innerHTML = `<div class="empty-state">No estates match the selected filters.</div>`;
    state.amenityLayer.clearLayers();
    state.radiusLayer.clearLayers();
    return;
  }

  elements.rankingList.innerHTML = visible
    .map((estate, index) => {
      const price = state.mode === "rent"
        ? `${formatCurrency(estate.rentMin)} - ${formatCurrency(estate.rentMax)} rent`
        : `${formatCurrency(estate.purchaseMin)} - ${formatCurrency(estate.purchaseMax)} purchase`;
      return `
        <button class="ranking-row ${estate.id === state.selectedEstateId ? "is-active" : ""}" type="button" data-id="${estate.id}">
          <span class="rank-number">${index + 1}</span>
          <span class="estate-name">
            ${escapeHtml(estate.displayName)}
            <span>${escapeHtml(estate.district)} · ${price}</span>
          </span>
        </button>
      `;
    })
    .join("");

  elements.rankingList.querySelectorAll(".ranking-row").forEach((row) => {
    row.addEventListener("click", () => selectEstate(row.dataset.id, true));
  });
}

function renderMarkers({ fitToResults = false } = {}) {
  state.markerLayer.clearLayers();
  state.markersById.clear();

  const visible = state.displayedEstates;
  elements.mapCount.textContent = `${visible.length} estates`;

  visible.forEach((estate) => {
    const marker = L.marker([estate.lat, estate.lng], {
      icon: markerIcon(estate.id === state.selectedEstateId),
      title: estate.displayName,
    });
    marker.bindPopup(`
      <div class="popup-title">${escapeHtml(estate.displayName)}</div>
      <div class="popup-meta">${escapeHtml(estate.district)} · Score ${formatScore(estate.score)}</div>
    `);
    marker.on("click", () => selectEstate(estate.id, false));
    marker.addTo(state.markerLayer);
    state.markersById.set(estate.id, marker);
  });

  if (fitToResults) fitMapToRanked(visible);
}

function markerIcon(selected) {
  return L.divIcon({
    className: "",
    html: `<span class="marker-pin ${selected ? "is-selected" : ""}"></span>`,
    iconSize: selected ? [19, 19] : [14, 14],
    iconAnchor: selected ? [9, 9] : [7, 7],
  });
}

function fitMapToRanked(estates) {
  if (!estates.length) return;
  const bounds = L.latLngBounds(estates.map((estate) => [estate.lat, estate.lng]));
  state.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
}

function selectEstate(id, panToMarker) {
  state.selectedEstateId = id;
  const estate = state.ranked.find((item) => item.id === id);
  state.displayedEstates = displayRankedEstates();
  renderRankingList();
  renderMarkers();
  renderAmenities();
  renderCriteria();

  const marker = state.markersById.get(id);
  if (marker) {
    if (panToMarker && estate) focusSelectedEstate(estate);
    marker.openPopup();
  }
}

function focusSelectedEstate(estate) {
  const latLng = L.latLng(estate.lat, estate.lng);
  const currentZoom = state.map.getZoom();
  const isVisible = state.map.getBounds().pad(-0.12).contains(latLng);

  if (isVisible) {
    state.map.panTo(latLng, {
      animate: true,
      duration: 0.45,
      easeLinearity: 0.25,
    });
    return;
  }

  state.map.flyTo(latLng, currentZoom, {
    animate: true,
    duration: 0.75,
    easeLinearity: 0.25,
  });
}

function renderAmenities() {
  state.amenityLayer.clearLayers();
  state.radiusLayer.clearLayers();

  if (state.amenityLayerMode === "none" || state.shownAmenityTypes.size === 0) return;

  const selectedEstate = state.ranked.find((item) => item.id === state.selectedEstateId);
  if (state.amenityLayerMode === "selected" && selectedEstate) {
    L.circle([selectedEstate.lat, selectedEstate.lng], {
      radius: state.amenityRadius,
      color: "#1f78d1",
      weight: 2,
      fillColor: "#1f78d1",
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(state.radiusLayer);
  }

  const amenities =
    state.amenityLayerMode === "selected" && selectedEstate
      ? [...state.shownAmenityTypes].flatMap((type) =>
          queryAmenities(type, selectedEstate.lat, selectedEstate.lng, state.amenityRadius),
        )
      : state.amenities.filter((item) => state.shownAmenityTypes.has(item.type));

  const overlappingAmenityGroups = groupAmenitiesByCoordinate(amenities);

  amenities.forEach((item) => {
    const group = overlappingAmenityGroups.get(amenityCoordinateKey(item));
    const displayLatLng = getAmenityDisplayLatLng(item, group);
    const marker = L.circleMarker(displayLatLng, {
      radius: amenityMarkerRadius(item.type),
      color: amenityColor(item.type),
      weight: 1,
      fillColor: amenityColor(item.type),
      fillOpacity: 0.72,
    });
    marker.bindPopup(`
      <div class="popup-title">${escapeHtml(item.name || amenityLabel(item.type))}</div>
      <div class="popup-meta">${amenityLabel(item.type)}${item.address ? ` · ${escapeHtml(item.address)}` : ""}</div>
    `);
    marker.addTo(state.amenityLayer);
  });
}

function groupAmenitiesByCoordinate(amenities) {
  const groups = new Map();
  amenities.forEach((item) => {
    const key = amenityCoordinateKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
}

function amenityCoordinateKey(item) {
  return `${item.type}:${item.lat.toFixed(7)}:${item.lng.toFixed(7)}`;
}

function getAmenityDisplayLatLng(item, group) {
  if (!group || group.length <= 1) return [item.lat, item.lng];

  const index = group.indexOf(item);
  const angle = (Math.PI * 2 * index) / group.length;
  const offsetMeters = 8;
  const latOffset = (Math.sin(angle) * offsetMeters) / 111320;
  const lngOffset =
    (Math.cos(angle) * offsetMeters) /
    (111320 * Math.max(Math.cos(degreesToRadians(item.lat)), 0.15));
  return [item.lat + latOffset, item.lng + lngOffset];
}

function displayRankedEstates() {
  const groupedRanked = state.perDistrictLimit === "all" ? state.ranked : topPerDistrictRankedEstates();
  if (state.globalResultLimit === "all") return groupedRanked;
  return groupedRanked.slice(0, state.globalResultLimit);
}

function topPerDistrictRankedEstates() {
  const grouped = new Map();
  state.ranked.forEach((estate) => {
    if (!grouped.has(estate.district)) grouped.set(estate.district, []);
    const group = grouped.get(estate.district);
    if (group.length < state.perDistrictLimit) group.push(estate);
  });
  return [...grouped.values()]
    .flat()
    .sort((a, b) => b.score - a.score || a.district.localeCompare(b.district));
}

function limitLabel() {
  return state.perDistrictLimit === "all" ? "all matched" : `top ${state.perDistrictLimit}/district`;
}

function globalLimitLabel() {
  return state.globalResultLimit === "all" ? "no total cap" : `limit ${state.globalResultLimit}`;
}

function renderCriteria() {
  const estate = state.ranked.find((item) => item.id === state.selectedEstateId);
  if (!estate) {
    elements.criteriaPanel.innerHTML = `
      <div class="criteria-empty">Select an estate from the ranked list or map to view criteria.</div>
    `;
    return;
  }

  const district = state.districtFactors.get(estate.district) ?? {};
  const priceRange =
    state.mode === "rent"
      ? `${formatCurrency(estate.rentMin)} - ${formatCurrency(estate.rentMax)}`
      : `${formatCurrency(estate.purchaseMin)} - ${formatCurrency(estate.purchaseMax)}`;
  const radiusLabel = `${state.amenityRadius} m`;

  elements.criteriaPanel.innerHTML = `
    <div class="criteria-layout">
      <article class="estate-card">
        ${estate.thumbnailPath ? `<img src="${estate.thumbnailPath}" alt="">` : ""}
        <div>
          <h3>${escapeHtml(estate.displayName)}</h3>
          <p>${escapeHtml(estate.addressText || estate.district)}</p>
        </div>
        <p>Match score ${formatScore(estate.score)} · ${escapeHtml(estate.district)}</p>
      </article>
      <div>
        <div class="metric-grid">
          ${metric("Budget range", priceRange)}
          ${metric("Affordability midpoint", formatCurrency(estate.affordabilityPrice))}
          ${metric("MTR distance", `${formatNumber(estate.mtrDistance, 2)} km`)}
          ${metric("Work travelling distance (District)", `${formatNumber(district["distance"], 2)} km`)}
          ${metric("Kindergartens availability (per 10,000 people) (District)", formatNumber(district["kindergarten / children"] * 10000, 2) + " / 10k people")}
          ${metric("Primary schools availability (per 10,000 people) (District)", formatNumber(district["primary school / children"] * 10000, 2) + " / 10k people")}
          ${metric(`Restaurants within ${radiusLabel}`, formatNumber(estate.restaurantNearbyCount, 0))}
          ${metric(`Supermarkets within ${radiusLabel}`, formatNumber(estate.supermarketNearbyCount, 0))}
          ${metric(`LCSD / parks within ${radiusLabel}`, formatNumber(estate.lcsdNearbyCount, 0))}
          ${metric(`MTR stations within ${radiusLabel}`, formatNumber(estate.mtrNearbyCount, 0))}
          ${metric(`Clinics within ${radiusLabel}`, formatNumber(estate.clinicNearbyCount, 0))}
          ${metric("Open space ratio (District)", formatNumber(district["open space / city"] * 100, 2) + "%")}
          ${metric("Units", formatNumber(estate.unitCount, 0))}
        </div>
        <p class="criteria-note">
          Features marked (District) come from district-level statistics shared by estates in the same district.
        </p>
      </div>
    </div>
  `;
}

function metric(label, value) {
  return `
    <div class="metric">
      <span class="metric-label">${label}</span>
      <span class="metric-value">${value}</span>
    </div>
  `;
}

function amenityColor(type) {
  const colors = {
    restaurant: "#7a3db8",
    supermarket: "#0b8f6a",
    lcsd: "#2e7d32",
    mtr: "#1f78d1",
    clinic: "#c74375",
  };
  return colors[type] ?? "#627181";
}

function amenityMarkerRadius(type) {
  const radii = {
    restaurant: 3,
    supermarket: 4,
    lcsd: 5,
    mtr: 5,
    clinic: 4,
  };
  return radii[type] ?? 4;
}

function amenityLabel(type) {
  const labels = {
    restaurant: "Restaurant",
    supermarket: "Supermarket",
    lcsd: "LCSD / park facility",
    mtr: "MTR station",
    clinic: "Clinic",
  };
  return labels[type] ?? "Amenity";
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = degreesToRadians(lat2 - lat1);
  const dLng = degreesToRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(degreesToRadians(lat1)) *
      Math.cos(degreesToRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function updateSummary() {
  const modeLabel = state.mode === "rent" ? "rent" : "purchase";
  const districtCopy =
    state.selectedDistricts.size === elements.districtOptions.querySelectorAll("input").length
      ? "all"
      : state.selectedDistricts.size;
  elements.resultSummary.textContent = `${state.ranked.length.toLocaleString()} estates matched · ${districtCopy} districts · ${modeLabel} · ${state.amenityRadius} m amenities`;
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) return "N/A";
  return new Intl.NumberFormat("en-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return "N/A";
  return new Intl.NumberFormat("en-HK", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatScore(score) {
  if (!Number.isFinite(score)) return "N/A";
  return `${Math.round(score * 1000) / 10} / 100`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

init().catch((error) => {
  console.error(error);
  elements.resultSummary.textContent = "Failed to load demo data";
  elements.rankingList.innerHTML = `
    <div class="empty-state">
      ${escapeHtml(error.message)}. Serve this folder from the repository root so ../data is available.
    </div>
  `;
});
