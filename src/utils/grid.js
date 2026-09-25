// Cache promisow pobranych siatek float32, zeby przewijanie suwaka czasu / animacja
// nie odpytywaly serwera ponownie o juz zaladowane klatki.
const gridCache = new Map();

export function getGrid(url) {
  if (!gridCache.has(url)) {
    gridCache.set(
      url,
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((buf) => new Float32Array(buf))
    );
  }
  return gridCache.get(url);
}

// Odczytuje wartosc w siatce (top-to-bottom, jak w rastrze GDAL) dla podanego lat/lon.
// Zwraca null gdy punkt jest poza zasiegiem siatki albo to NoData (ląd / brak danych).
export function sampleGrid(floatArray, grid, bbox, lat, lon) {
  const [lonMin, latMin, lonMax, latMax] = bbox;
  if (lon < lonMin || lon > lonMax || lat < latMin || lat > latMax) return null;

  const col = Math.floor(((lon - lonMin) / (lonMax - lonMin)) * grid.width);
  const row = Math.floor(((latMax - lat) / (latMax - latMin)) * grid.height);
  if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) return null;

  const value = floatArray[row * grid.width + col];
  return Number.isNaN(value) ? null : value;
}

export function findNearestIndex(timestamps, targetIso) {
  if (!targetIso) return timestamps.length - 1;
  const target = new Date(targetIso).getTime();
  let bestIdx = 0;
  let bestDiff = Infinity;
  timestamps.forEach((entry, idx) => {
    const diff = Math.abs(new Date(entry.t).getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = idx;
    }
  });
  return bestIdx;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function degToCompass(deg) {
  const idx = Math.round(deg / 45) % 8;
  return COMPASS[idx];
}

// Formatuje odczyt wartosci dla danego produktu - wspolne dla celownika na
// mapie i listy przypietych punktow, zeby oba miejsca pokazywaly to samo.
export function formatProductValue(product, value) {
  if (value == null) return null;
  return product.circular
    ? `${value.toFixed(0)}° (${degToCompass(value)})`
    : `${value.toFixed(2)} ${product.unit}`;
}

export function formatTimestamp(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
