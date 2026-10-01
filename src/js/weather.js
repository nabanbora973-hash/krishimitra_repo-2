// Live weather via Open-Meteo (no API key needed). Cached so the app
// degrades to "last known conditions" — never to blank screens.
import { state } from "./state.js";
import { liveBadge, clockStr, timeAgo } from "./ui.js";

const CACHE_KEY = 'km_weather_cache';

export async function fetchWeather(lat, lng){
  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${lat}&longitude=${lng}`
    + "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max"
    + "&timezone=auto&forecast_days=7";
  const r = await fetch(url);
  if (!r.ok) throw new Error('Weather service unavailable (' + r.status + ')');
  const data = await r.json();
  const payload = { fetchedAt: Date.now(), data };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch(e){}
  return { ...payload, cached: false };
}

export function getCachedWeather(){
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return { ...p, cached: true };
  } catch(e){ return null; }
}

export async function getWeather(lat, lng){
  try { return await fetchWeather(lat, lng); }
  catch (e){
    const c = getCachedWeather();
    if (c) return c;      // degraded: last known conditions
    throw e;              // nothing cached yet — caller shows the error
  }
}

const ICONS = [[0,'☀️'],[1,'🌤️'],[2,'⛅'],[3,'☁️'],[45,'🌫️'],[48,'🌫️'],
  [51,'🌦️'],[53,'🌦️'],[55,'🌦️'],[61,'🌧️'],[63,'🌧️'],[65,'🌧️'],
  [71,'🌨️'],[73,'🌨️'],[75,'🌨️'],[80,'🌦️'],[81,'🌧️'],[82,'🌧️'],[95,'⛈️'],[96,'⛈️'],[99,'⛈️']];
export function weatherIcon(code){
  let best = '🌤️';
  for (const [c, ic] of ICONS){ if (code >= c) best = ic; }
  return best;
}

export function renderWeatherBlock(){
  if (!state.weather){
    return state.profile
      ? `<p class="empty">Weather unavailable right now — check your connection. The rest of the app keeps working.</p>`
      : `<p class="empty">Set up your farm profile to see live weather.</p>`;
  }
  const w = state.weather;
  const d = w.data;
  const cur = d.current;
  const dateStr = ts => new Date(ts).toLocaleDateString('en-IN', { weekday:'short' });
  return `
    <p style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
      <span class="stat">${Math.round(cur.temperature_2m)}°C</span>
      <span>${weatherIcon(cur.weather_code)} now</span>
      <span class="statlabel">humidity ${cur.relative_humidity_2m}% · rain now ${cur.precipitation} mm</span>
      ${liveBadge()}
    </p>
    <div class="days" style="margin-top:12px">
      ${d.daily.time.map((t, i) => `
        <div class="day">
          <div class="dt">${dateStr(t + 'T00:00:00')}</div>
          <div class="ic">${weatherIcon(d.daily.weather_code[i])}</div>
          <div class="tp">${Math.round(d.daily.temperature_2m_max[i])}° / ${Math.round(d.daily.temperature_2m_min[i])}°</div>
          <div class="rn">💧 ${d.daily.precipitation_probability_max[i] ?? 0}%</div>
        </div>`).join('')}
    </div>
    ${w.cached
      ? `<p class="caveat">Showing last known conditions — fetched ${timeAgo(w.fetchedAt)} (${clockStr(w.fetchedAt)}). Live refresh failed; the app keeps working.</p>`
      : `<p class="sourcenote">Live from Open-Meteo · updated ${clockStr(w.fetchedAt)}${d.timezone ? ' · ' + d.timezone : ''}</p>`}`;
}
