// Original, hand-drawn weather icons (inline SVG) and WMO code mapping.
const SUN = (cx = 32, cy = 30, r = 11) => {
  let rays = "";
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x1 = cx + Math.cos(a) * (r + 5), y1 = cy + Math.sin(a) * (r + 5);
    const x2 = cx + Math.cos(a) * (r + 10), y2 = cy + Math.sin(a) * (r + 10);
    rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return `<g class="sun"><circle cx="${cx}" cy="${cy}" r="${r}"/><g class="rays">${rays}</g></g>`;
};
const MOON = (cx = 30, cy = 28) =>
  `<path class="moon" d="M${cx + 8} ${cy - 14} a15 15 0 1 0 9 22 a12 12 0 1 1 -9 -22z"/>`;
const CLOUD = (dx = 0, dy = 0, cls = "cloud") =>
  `<path class="${cls}" transform="translate(${dx} ${dy})" d="M18 50 h30 a10 10 0 0 0 0 -20 a14 14 0 0 0 -26 -4 a9 9 0 0 0 -4 24z"/>`;
const DROPS = `<g class="drops"><line x1="24" y1="55" x2="21" y2="62"/><line x1="33" y1="55" x2="30" y2="62"/><line x1="42" y1="55" x2="39" y2="62"/></g>`;
const FLAKES = `<g class="flakes"><circle cx="23" cy="58" r="2.4"/><circle cx="32" cy="61" r="2.4"/><circle cx="41" cy="58" r="2.4"/></g>`;
const BOLT = `<path class="bolt" d="M34 50 l-7 10 h6 l-3 8 l10 -12 h-6 l3 -6z"/>`;
const FOG = `<g class="fog"><line x1="14" y1="34" x2="50" y2="34"/><line x1="10" y1="42" x2="46" y2="42"/><line x1="18" y1="50" x2="54" y2="50"/></g>`;

const svg = (inner) => `<svg viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;

export function weatherKind(code) {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

const LABELS = {
  clear: ["Clear skies", "Clear night"],
  partly: ["Partly cloudy", "Partly cloudy"],
  cloudy: ["Cloudy", "Cloudy"],
  fog: ["Misty", "Misty"],
  rain: ["Rain", "Rain"],
  snow: ["Snow", "Snow"],
  storm: ["Thunderstorms", "Thunderstorms"],
};

export function weatherLabel(code, isDay) {
  const k = weatherKind(code);
  if (code === 51 || code === 53 || code === 55) return "Light drizzle";
  if (code >= 80 && code <= 82) return "Showers";
  return LABELS[k][isDay ? 0 : 1];
}

export function weatherIcon(code, isDay) {
  const k = weatherKind(code);
  const sky = isDay ? SUN() : MOON();
  switch (k) {
    case "clear": return svg(isDay ? SUN(32, 32, 12) : MOON(28, 32));
    case "partly": return svg((isDay ? SUN(24, 22, 9) : MOON(20, 20)) + CLOUD(4, 4));
    case "cloudy": return svg(CLOUD(-2, -8, "cloud back") + CLOUD(4, 2));
    case "fog": return svg(FOG);
    case "rain": return svg(CLOUD(0, -6) + DROPS);
    case "snow": return svg(CLOUD(0, -6) + FLAKES);
    case "storm": return svg(CLOUD(0, -8) + BOLT);
    default: return svg(sky);
  }
}

// Life with PlayStation's own Weather Channel icon set (data/world/weather/720/NN.png),
// with the same WMO-code mapping the LWP-PC port used.
export function twcIconNumber(code, isDay) {
  if (code == null) return null;
  const day = !!isDay;
  if (code === 0) return day ? 32 : 31;                 // clear
  if (code === 1) return day ? 34 : 33;                 // mainly clear
  if (code === 2) return day ? 30 : 29;                 // partly cloudy
  if (code === 3) return 26;                            // overcast
  if (code === 45 || code === 48) return 20;            // fog
  if ([51, 53, 55].includes(code)) return 9;            // drizzle
  if ([56, 57, 66, 67].includes(code)) return 8;        // freezing drizzle / rain
  if (code === 61 || code === 63) return 11;            // rain
  if (code === 65) return 12;                           // heavy rain
  if ([71, 73, 77].includes(code)) return 14;           // snow
  if (code === 75) return 16;                           // heavy snow
  if (code === 80 || code === 81) return day ? 39 : 45; // showers
  if (code === 82) return 40;                           // violent showers
  if (code === 85 || code === 86) return day ? 41 : 46; // snow showers
  if ([95, 96, 99].includes(code)) return 4;            // thunderstorm
  return 26;
}
export function twcIcon(code, isDay) {
  const n = twcIconNumber(code, isDay);
  return n == null ? "" : `<img src="data/world/weather/720/${String(n).padStart(2, "0")}.png" alt="">`;
}
