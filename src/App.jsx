import { useEffect, useState } from "react";
import MapView from "./components/MapView";
import Sidebar from "./components/Sidebar";
import TimeControl from "./components/TimeControl";
import Legend from "./components/Legend";
import PointsPanel from "./components/PointsPanel";
import ChartModal from "./components/ChartModal";
import { getGrid, sampleGrid, findNearestIndex, formatProductValue } from "./utils/grid";
import "./App.css";

const PLAY_INTERVAL_MS = 700;
const MANIFEST_POLL_MS = 20000; // odswieza katalog warstw co 20s - nowe dane wrzucone do dane/ pojawia sie same
const MAX_PINS = 10; // powyzej tego liczba punktow na liscie robi sie nieczytelna - najstarszy odpada

// Manifest trzyma sciezki wzgledne ("data/sst/xxx.png") - trzeba je doklejac
// do BASE_URL (na GitHub Pages to "/nazwa-repo/", lokalnie "/"), zeby dzialaly
// zarowno w dev, jak i po wdrozeniu na subpath.
function resolveManifestUrls(manifest) {
  const base = import.meta.env.BASE_URL;
  const products = Object.fromEntries(
    Object.entries(manifest.products).map(([key, p]) => [
      key,
      {
        ...p,
        legend: base + p.legend,
        timestamps: p.timestamps.map((t) => ({ ...t, png: base + t.png, grid: base + t.grid })),
      },
    ])
  );
  return { ...manifest, products };
}

function makePinId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function App() {
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState(null);
  const [product, setProduct] = useState("sst");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [gridData, setGridData] = useState(null);
  const [hover, setHover] = useState(null); // { lat, lon, value } | null
  const [pins, setPins] = useState([]); // [{ id, lat, lon }]
  const [pinMode, setPinMode] = useState(false); // czy klik na mapie dodaje punkt (jawnie wlaczane przyciskiem)
  const [chartPinId, setChartPinId] = useState(null); // ktory punkt ma otwarty wykres w czasie

  function loadManifest(isFirstLoad) {
    return fetch(`${import.meta.env.BASE_URL}data/manifest.json?t=${Date.now()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`manifest.json: HTTP ${r.status}`);
        return r.json();
      })
      .then((raw) => {
        const m = resolveManifestUrls(raw);
        setManifest((prev) => {
          if (isFirstLoad || !prev) {
            const timestamps = m.products.sst?.timestamps ?? [];
            setIndex(Math.max(0, timestamps.length - 1));
            return m;
          }
          // dotarly nowe dane w tle - zostajemy przy tym samym produkcie/momencie w czasie
          if (prev.generated_at !== m.generated_at) {
            const nextEntries = m.products[product]?.timestamps ?? [];
            const currentT = prev.products[product]?.timestamps[index]?.t;
            setIndex(findNearestIndex(nextEntries, currentT));
            return m;
          }
          return prev;
        });
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    loadManifest(true);
    const id = setInterval(() => loadManifest(false), MANIFEST_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = manifest?.products[product]?.timestamps ?? [];
  const currentEntry = entries[index];

  // Ladowanie siatki wartosci dla aktualnej warstwy (do odczytu pod kursorem i w punktach)
  useEffect(() => {
    if (!currentEntry) return;
    let cancelled = false;
    getGrid(currentEntry.grid).then((arr) => {
      if (!cancelled) setGridData(arr);
    });
    return () => {
      cancelled = true;
    };
  }, [currentEntry]);

  // Podglad nastepnej klatki w tle - animacja gra plynnie bez czekania na fetch
  useEffect(() => {
    if (!entries.length) return;
    const next = entries[(index + 1) % entries.length];
    if (next) getGrid(next.grid);
  }, [entries, index]);

  // Animacja odtwarzania
  useEffect(() => {
    if (!playing || entries.length < 2) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % entries.length);
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [playing, entries.length]);

  function handleSelectProduct(nextProduct) {
    setPlaying(false);
    setChartPinId(null); // wykres pokazuje aktywna warstwe - przy zmianie warstwy staje sie nieaktualny
    const nextEntries = manifest.products[nextProduct].timestamps;
    const nearest = findNearestIndex(nextEntries, currentEntry?.t);
    setProduct(nextProduct);
    setIndex(nearest);
  }

  function handleHover(lat, lon) {
    if (lat == null || !gridData || !manifest) {
      setHover(null);
      return;
    }
    const value = sampleGrid(gridData, manifest.grid, manifest.bbox, lat, lon);
    setHover({ lat, lon, value });
  }

  function handleAddPin(lat, lon) {
    setPins((prev) => {
      const next = [...prev, { id: makePinId(), lat, lon }];
      return next.length > MAX_PINS ? next.slice(next.length - MAX_PINS) : next;
    });
  }

  function handleRemovePin(id) {
    setPins((prev) => prev.filter((p) => p.id !== id));
    setChartPinId((cur) => (cur === id ? null : cur));
  }

  if (error) {
    return (
      <div className="state-message">
        Nie udało się wczytać danych ({error}). Uruchom najpierw{" "}
        <code>npm run process-data</code>.
      </div>
    );
  }
  if (!manifest) {
    return <div className="state-message">Wczytywanie…</div>;
  }

  const activeProduct = manifest.products[product];
  const hoverLabel = hover ? (formatProductValue(activeProduct, hover.value) ?? "brak danych") : null;
  const pointsWithValues = pins.map((p) => {
    const value = gridData ? sampleGrid(gridData, manifest.grid, manifest.bbox, p.lat, p.lon) : null;
    return { ...p, label: formatProductValue(activeProduct, value) };
  });

  return (
    <div className="layout">
      <aside className="sidebar">
        <header className="sidebar-header">
          <h1 className="brand">
            <span className="brand-highlight">Bentos</span>
            <span className="brand-rest">SatBałtyk</span>
          </h1>
          <p>Zatoka Gdańska · Trójmiasto</p>
        </header>

        <Sidebar products={manifest.products} activeProduct={product} onSelect={handleSelectProduct} />

        <section className="panel">
          <h2>{activeProduct.label}</h2>
          <Legend product={activeProduct} />
          <TimeControl
            timestamps={entries}
            index={index}
            onChange={(i) => {
              setPlaying(false);
              setIndex(i);
            }}
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
          />
        </section>

        <PointsPanel
          points={pointsWithValues}
          pinMode={pinMode}
          onTogglePinMode={() => setPinMode((v) => !v)}
          onRemove={handleRemovePin}
          onClear={() => {
            setPins([]);
            setChartPinId(null);
          }}
          onShowChart={setChartPinId}
        />

        <footer className="sidebar-footer">
          Dane: SatBałtyk (satbaltyk.pl) · wygenerowano {new Date(manifest.generated_at).toLocaleString("pl-PL")}
          <br />
          Część projektu{" "}
          <a href="https://bentos.info" target="_blank" rel="noreferrer">
            Bentos
          </a>{" "}
          — dofinansowanego ze środków Funduszy Europejskich dla Pomorza, Unii Europejskiej oraz Urzędu
          Marszałkowskiego Województwa Pomorskiego.
        </footer>
      </aside>

      <main className="map-wrap">
        <MapView
          bbox={manifest.bbox}
          imageUrl={currentEntry?.png}
          productKey={product}
          hoverLabel={hoverLabel}
          pins={pins}
          pinMode={pinMode}
          onHover={handleHover}
          onPinClick={handleRemovePin}
          onMapClick={handleAddPin}
        />
      </main>

      {chartPinId &&
        (() => {
          const idx = pins.findIndex((p) => p.id === chartPinId);
          if (idx === -1) return null;
          return (
            <ChartModal
              point={pins[idx]}
              pointIndex={idx}
              product={activeProduct}
              entries={entries}
              grid={manifest.grid}
              bbox={manifest.bbox}
              onClose={() => setChartPinId(null)}
            />
          );
        })()}
    </div>
  );
}
