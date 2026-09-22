// Central app state — single source of truth. No imports = no cycles.
export const state = {
  demo: false,          // ?demo=1 → offline demo mode (no login, no Firebase)
  user: null,
  profile: null,        // { village, lat, lng, acres, soil, irrigation }
  season: null,         // { crop, variety, sowingDate, stage, quantityQtl }
  weather: null,        // { data, cached, fetchedAt }
  markets: [],          // rows from compareMarkets()
  risks: [],
  guidance: null
};

export function resetData() {
  state.profile = null; state.season = null; state.weather = null;
  state.markets = []; state.risks = []; state.guidance = null;
}
