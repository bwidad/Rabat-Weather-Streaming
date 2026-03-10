/* =========================================================
 * Dashboard Météo Rabat — Front-end pur (Azure-powered)
 * =========================================================
 * ✅ Configurez votre Azure Function (HTTP GET) qui retourne un JSON:
 * {
 *   current: {
 *     tempC, tempF, feelsLikeC, feelsLikeF, iconCode, description,
 *     humidity, pressureHpa, windKph, windDir, uvIndex, visibilityKm,
 *     cloudPct, observationTime
 *   },
 *   hourly: [ { time, tempC, tempF, precipMm, precipProbPct, windKph }, ...x24 ],
 *   daily:  [ { date, minC, maxC, precipMm, iconCode, description }, ...x7 ],
 *   aqi: { index, category, pm25, pm10, o3, no2 },
 *   location: { name, lat, lon, country }
 * }
 * ---------------------------------------------------------
 * NOTE : Le front ne contacte que votre Function => pas d'exposition
 * de la clé Azure Maps côté client. (Recommandé en production)
 * ======================================================= */

const CONFIG = {
  // Remplacez par votre endpoint Function (CORS autorisé)
  functionEndpoint: "https://YOUR_FUNCTION_NAME.azurewebsites.net/api/rabat-weather",

  // (Optionnel) clé Azure Maps pour afficher la carte
  azureMapsKey: "", // "AZURE_MAPS_SUBSCRIPTION_KEY"
  autoRefreshMs: 5 * 60 * 1000, // 5 min
};

const state = {
  unit: "C", // "C" | "F"
  lastData: null,
  charts: { temp: null, rainWind: null },
  map: null,
  mapReady: false,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

document.addEventListener("DOMContentLoaded", () => {
  // Init UI
  $("#year").textContent = new Date().getFullYear();
  bindUI();
  // Première charge
  loadWeather();
  // Auto refresh
  setInterval(loadWeather, CONFIG.autoRefreshMs);
});

/* ---------- UI bindings ---------- */
function bindUI() {
  $("#themeToggle").addEventListener("click", toggleTheme);
  // Préférence persistée
  const prefTheme = localStorage.getItem("theme") || "dark";
  if (prefTheme === "light") document.documentElement.classList.add("light");
  else document.documentElement.classList.remove("light");

  $("#toC").addEventListener("click", () => setUnit("C"));
  $("#toF").addEventListener("click", () => setUnit("F"));
  $("#refreshBtn").addEventListener("click", loadWeather);
}

function toggleTheme() {
  document.documentElement.classList.toggle("light");
  const isLight = document.documentElement.classList.contains("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
}

function setUnit(u) {
  if (state.unit === u) return;
  state.unit = u;
  $("#toC").classList.toggle("active", u === "C");
  $("#toF").classList.toggle("active", u === "F");
  // Réaffiche si des données existent
  if (state.lastData) render(state.lastData);
}

/* ---------- Fetch météo ---------- */
async function loadWeather() {
  showBanner("Chargement des données météo…", "success");
  setLastUpdate("…");

  try {
    const res = await fetch(CONFIG.functionEndpoint, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.lastData = data;
    hideBanner();
    render(data);
    toast("Données mises à jour ✅");
  } catch (err) {
    console.error(err);
    showBanner("Impossible de récupérer les données en direct. Affichage de données de démonstration.", "warn");
    const demo = getDemoData();
    state.lastData = demo;
    render(demo);
    toast("Mode démonstration (offline)");
  }
}

/* ---------- Render ---------- */
function render(data) {
  const { current, hourly, daily, aqi, location } = data;

  // En-tête carte & localisation
  $("#locName").textContent = location?.name || "Rabat, MA";
  $("#obsTime").textContent = current?.observationTime
    ? `Observation — ${formatLocalTime(current.observationTime)}`
    : "Observation —";

  // Température principale
  const temp = pickUnit(current?.tempC, current?.tempF);
  const feels = pickUnit(current?.feelsLikeC, current?.feelsLikeF);
  $("#tempNow").textContent = fmtTemp(temp);
  $("#feelsLike").textContent = feels != null ? fmtTemp(feels) : "—";

  // Humidité, vent, pression
  $("#humidity").textContent = current?.humidity != null ? `${current.humidity}%` : "—";
  const wind = current?.windKph != null ? `${Math.round(current.windKph)} km/h ${current?.windDir || ""}` : "—";
  $("#wind").textContent = wind;
  $("#pressure").textContent = current?.pressureHpa != null ? `${current.pressureHpa} hPa` : "—";
  $("#uv").textContent = current?.uvIndex != null ? current.uvIndex : "—";
  $("#visibility").textContent = current?.visibilityKm != null ? `${current.visibilityKm} km` : "—";
  $("#cloud").textContent = current?.cloudPct != null ? `${current.cloudPct}%` : "—";

  // Description & icône
  const desc = current?.description || "—";
  $("#descNow").textContent = capitalize(desc);
  $("#iconNow").textContent = emojiFrom(desc);

  // KPI min/max aujourd’hui & pluie 24h
  if (daily && daily.length) {
    const today = daily[0];
    $("#minmaxToday").textContent = `${fmtTemp(pickUnit(today.minC, toF(today.minC)))} / ${fmtTemp(pickUnit(today.maxC, toF(today.maxC)))}`;
  } else {
    $("#minmaxToday").textContent = "—";
  }
  const rain24 = sum((hourly || []).map(h => h.precipMm || 0));
  $("#rain24").textContent = `${rain24 ? rain24.toFixed(1) : "0.0"} mm`;

  // AQI
  $("#aqi").textContent = aqi?.index != null ? `${aqi.index} (${aqi.category || catAQI(aqi.index)})` : "—";

  // Graphiques
  renderCharts(hourly || []);

  // Jours
  renderDaily(daily || []);

  // Carte Azure (optionnel)
  initMapIfNeeded(location);
  setLastUpdate(new Date());
}

/* ---------- Charts ---------- */
function renderCharts(hourly) {
  const labels = hourly.map(h => formatHour(h.time));
  const temps = hourly.map(h => pickUnit(h.tempC, h.tempF));
  const rain = hourly.map(h => h.precipMm || 0);
  const wind = hourly.map(h => h.windKph || 0);

  // Temp chart
  if (!state.charts.temp) {
    const ctxT = $("#chartTemp");
    state.charts.temp = new Chart(ctxT, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Température",
          data: temps,
          borderColor: "#4cc9f0",
          backgroundColor: "rgba(76,201,240,0.15)",
          tension: 0.35,
          fill: true,
          pointRadius: 0,
        }]
      },
      options: chartOptions("%s°")
    });
  } else {
    const c = state.charts.temp;
    c.data.labels = labels;
    c.data.datasets[0].data = temps;
    c.update();
  }

  // Rain & Wind chart (bar + line)
  if (!state.charts.rainWind) {
    const ctxRW = $("#chartRainWind");
    state.charts.rainWind = new Chart(ctxRW, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Pluie (mm)",
            data: rain,
            backgroundColor: "rgba(167,139,250,0.45)",
            borderRadius: 6,
            yAxisID: "y"
          },
          {
            type: "line",
            label: "Vent (km/h)",
            data: wind,
            borderColor: "#34d399",
            backgroundColor: "rgba(52,211,153,0.15)",
            yAxisID: "y1",
            tension: 0.35,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        ...chartOptions(),
        scales: {
          y: { grid: { color: "rgba(255,255,255,0.06)" }, ticks: { color: "#cfe3ff" }, title: { display: true, text: "mm", color: "#cfe3ff" } },
          y1: { position: "right", grid: { drawOnChartArea: false }, ticks: { color: "#bff3de" }, title: { display: true, text: "km/h", color: "#bff3de" } }
        }
      }
    });
  } else {
    const c = state.charts.rainWind;
    c.data.labels = labels;
    c.data.datasets[0].data = rain;
    c.data.datasets[1].data = wind;
    c.update();
  }
}

function chartOptions(fmt = "%s") {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#eaf0ff" } },
      tooltip: {
        backgroundColor: "#0f1b30",
        borderColor: "rgba(255,255,255,0.1)",
        borderWidth: 1,
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed.y;
            return typeof v === "number" ? `${ctx.dataset.label}: ${fmt.replace("%s", v.toFixed(1))}` : ctx.dataset.label;
          }
        }
      }
    },
    scales: {
      x: { grid: { color: "rgba(255,255,255,0.06)" }, ticks: { color: "#a8b3c7", maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
      y: { grid: { color: "rgba(255,255,255,0.06)" }, ticks: { color: "#eaf0ff" } }
    }
  };
}

/* ---------- Daily forecast ---------- */
function renderDaily(days) {
  const root = $("#daily");
  root.innerHTML = "";
  if (!days.length) {
    root.innerHTML = `<div class="muted">Aucune donnée</div>`;
    return;
  }
  const fmtDay = new Intl.DateTimeFormat("fr-MA", { weekday: "short" });
  days.forEach(d => {
    const el = document.createElement("div");
    el.className = "day";
    el.innerHTML = `
      <div class="d-name">${fmtDay.format(new Date(d.date))}</div>
      <div class="d-emoji">${emojiFrom(d.description)}</div>
      <div class="d-range">${fmtTemp(pickUnit(d.minC, toF(d.minC)))} / ${fmtTemp(pickUnit(d.maxC, toF(d.maxC)))}</div>
      <div class="d-rain">🌧️ ${d.precipMm ? d.precipMm.toFixed(1) : 0} mm</div>
      <small class="muted">${capitalize(d.description || "")}</small>
    `;
    root.appendChild(el);
  });
}

/* ---------- Azure Maps (optionnel) ---------- */
function initMapIfNeeded(location) {
  if (!CONFIG.azureMapsKey || typeof atlas === "undefined") return; // pas de carte
  if (state.map) {
    // Mettre à jour centre si dispo
    if (location?.lon && location?.lat) {
      state.map.setCamera({ center: [location.lon, location.lat], zoom: 11 });
    }
    return;
  }
  try {
    state.map = new atlas.Map("map", {
      center: [location?.lon ?? -6.84165, location?.lat ?? 34.020882], // Rabat
      zoom: 11,
      style: "road",
      authOptions: {
        authType: "subscriptionKey",
        subscriptionKey: CONFIG.azureMapsKey
      }
    });
    state.map.events.add("ready", () => {
      state.mapReady = true;
      const center = state.map.getCamera().center;
      const ds = new atlas.source.DataSource();
      state.map.sources.add(ds);
      const pin = new atlas.Shape(new atlas.data.Point(center), null, { title: "Rabat" });
      ds.add(pin);
      state.map.layers.add(new atlas.layer.SymbolLayer(ds, null, {
        iconOptions: { image: "pin-round-blue", allowOverlap: true, size: 1.0 },
        textOptions: { textField: ["get", "title"], offset: [0, 1.2], color: "#eaf0ff" }
      }));
    });
  } catch (e) {
    console.warn("Azure Maps non initialisé:", e);
  }
}

/* ---------- Helpers ---------- */
function fmtTemp(v) { return v != null ? `${Math.round(v)}°` : "—"; }
function toF(c) { return (c * 9) / 5 + 32; }
function toC(f) { return ((f - 32) * 5) / 9; }
function pickUnit(c, f) { return state.unit === "C" ? c : f; }
function formatLocalTime(iso) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("fr-MA", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return fmt.format(d);
}
function formatHour(iso) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("fr-MA", { hour: "2-digit" }).format(d);
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
function sum(arr) { return arr.reduce((a, b) => a + (Number(b) || 0), 0); }
function catAQI(i) {
  if (i == null) return "—";
  if (i <= 50) return "Bon";
  if (i <= 100) return "Modéré";
  if (i <= 150) return "Sensible";
  if (i <= 200) return "Mauvais";
  if (i <= 300) return "Très mauvais";
  return "Dangereux";
}
function emojiFrom(desc = "") {
  const s = desc.toLowerCase();
  if (s.includes("orage")) return "⛈️";
  if (s.includes("pluie") || s.includes("averse")) return "🌧️";
  if (s.includes("bruine")) return "🌦️";
  if (s.includes("neige")) return "❄️";
  if (s.includes("nuage") || s.includes("couvert")) return "☁️";
  if (s.includes("brume") || s.includes("brouillard")) return "🌫️";
  if (s.includes("vent")) return "🌬️";
  if (s.includes("soleil") || s.includes("dégagé")) return "☀️";
  return "⛅";
}

function showBanner(msg, kind = "success") {
  const el = $("#banner");
  el.textContent = msg;
  el.className = `banner ${kind}`;
  el.hidden = false;
}
function hideBanner() { const el = $("#banner"); el.hidden = true; el.textContent = ""; }
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 2200);
}
function setLastUpdate(d) {
  const el = $("#lastUpdate");
  if (d === "…") { el.textContent = "—"; return; }
  const dt = d instanceof Date ? d : new Date(d);
  const fmt = new Intl.DateTimeFormat("fr-MA", { hour: "2-digit", minute: "2-digit" });
  el.textContent = fmt.format(dt);
}

/* ---------- Données de démo (fallback) ---------- */
function getDemoData() {
  const now = new Date();
  const hours = Array.from({ length: 24 }, (_, i) => new Date(now.getTime() + i * 3600e3));
  const baseC = 18;
  const hourly = hours.map((t, i) => ({
    time: t.toISOString(),
    tempC: baseC + Math.sin(i / 3) * 4 + (Math.random() * 1.2 - 0.6),
    tempF: toF(baseC + Math.sin(i / 3) * 4),
    precipMm: Math.max(0, (Math.sin(i / 2) + 1) * 0.4 + (Math.random() * 0.3 - 0.15)),
    precipProbPct: Math.round(Math.random() * 60),
    windKph: 10 + Math.random() * 20
  }));

  const daily = Array.from({ length: 7 }, (_, d) => {
    const min = 15 + Math.random() * 3;
    const max = min + 6 + Math.random() * 3;
    return {
      date: new Date(now.getTime() + d * 86400e3).toISOString(),
      minC: min, maxC: max, precipMm: Math.random() * 5,
      iconCode: 2, description: d % 2 ? "Partiellement nuageux" : "Ensoleillé"
    };
  });

  return {
    current: {
      tempC: baseC + 1.2, tempF: toF(baseC + 1.2),
      feelsLikeC: baseC + 1, feelsLikeF: toF(baseC + 1),
      iconCode: 2, description: "Partiellement nuageux",
      humidity: 62, pressureHpa: 1016, windKph: 18, windDir: "NE",
      uvIndex: 4, visibilityKm: 10, cloudPct: 40,
      observationTime: now.toISOString()
    },
    hourly, daily,
    aqi: { index: 42, category: "Bon", pm25: 8, pm10: 14, o3: 12, no2: 9 },
    location: { name: "Rabat", lat: 34.020882, lon: -6.84165, country: "MA" }
  };
}
