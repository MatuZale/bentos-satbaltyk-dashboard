// Cache promisow pobranych siatek float32, zeby przewijanie suwaka czasu / animacja
// nie odpytywaly serwera ponownie o juz zaladowane klatki.
const gridCache = new Map();

export function getGrid(url) {
  if (!gridCache.has(url)) {
    const promise = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => new Float32Array(buf));
    // nieudane pobranie nie moze zostac w cache - kolejna proba ma szanse sie udac
    promise.catch(() => gridCache.delete(url));
    gridCache.set(url, promise);
  }
  return gridCache.get(url);
}

function mercatorY(lat) {
  const radians = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

function gridCell(grid, bbox, lat, lon) {
  const [lonMin, latMin, lonMax, latMax] = bbox;
  if (lon < lonMin || lon > lonMax || lat < latMin || lat > latMax) return null;

  const col = Math.floor(((lon - lonMin) / (lonMax - lonMin)) * grid.width);
  const north = mercatorY(latMax);
  const south = mercatorY(latMin);
  const row = Math.floor(((north - mercatorY(lat)) / (north - south)) * grid.height);
  return col < 0 || col >= grid.width || row < 0 || row >= grid.height ? null : { col, row };
}

// Odczytuje wartosc z siatki ulozonej tak samo jak ImageOverlay w Leaflet.
// Zwraca null poza zasiegiem albo dla NoData (lad / brak danych).
export function sampleGrid(floatArray, grid, bbox, lat, lon) {
  const cell = gridCell(grid, bbox, lat, lon);
  if (!cell) return null;

  const value = floatArray[cell.row * grid.width + cell.col];
  return Number.isNaN(value) ? null : value;
}

// Punkty przybrzezne (np. boja obok mola) moga po zaokragleniu trafic w
// komorke ladowa. Do ocen lokalnych bierzemy wtedy najblizsza poprawna
// komorke morska z niewielkiego sasiedztwa rastra.
export function sampleGridNearby(floatArray, grid, bbox, lat, lon, maxRadius = 5) {
  const cell = gridCell(grid, bbox, lat, lon);
  if (!cell) return null;
  const centerCol = cell.col;
  const centerRow = cell.row;

  for (let radius = 0; radius <= maxRadius; radius += 1) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
      for (let colOffset = -radius; colOffset <= radius; colOffset += 1) {
        if (radius > 0 && Math.max(Math.abs(rowOffset), Math.abs(colOffset)) !== radius) continue;
        const row = centerRow + rowOffset;
        const col = centerCol + colOffset;
        if (row < 0 || row >= grid.height || col < 0 || col >= grid.width) continue;
        const value = floatArray[row * grid.width + col];
        if (!Number.isFinite(value)) continue;
        const distance = rowOffset * rowOffset + colOffset * colOffset;
        if (distance < nearestDistance) {
          nearest = value;
          nearestDistance = distance;
        }
      }
    }
    if (nearest != null) return nearest;
  }
  return null;
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

export function formatTimestamp(iso, locale = "pl-PL") {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Warsaw",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Krotszy format do etykiet na osi wykresu (bez dnia tygodnia).
export function formatTimestampShort(iso, locale = "pl-PL") {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Pobiera (z cache) siatki dla wszystkich podanych znacznikow czasu i probkuje
// jedna wspolrzedna z kazdej z nich - do wykresu punktu w czasie.
export async function loadPointSeries(entries, grid, bbox, lat, lon) {
  const arrays = await Promise.all(entries.map((e) => getGrid(e.grid)));
  return entries.map((e, i) => ({ t: e.t, value: sampleGrid(arrays[i], grid, bbox, lat, lon) }));
}
