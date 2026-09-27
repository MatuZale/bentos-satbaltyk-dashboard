import { useEffect, useRef, useState } from "react";
import MapView from "./components/MapView";
import Sidebar from "./components/Sidebar";
import SidebarWater from "./components/SidebarWater";
import TimeControl from "./components/TimeControl";
import Legend from "./components/Legend";
import PointsPanel from "./components/PointsPanel";
import ChartModal from "./components/ChartModal";
import BuoyModal from "./components/BuoyModal";
import { BUOYS } from "./data/buoys";
import { getGrid, sampleGrid, sampleGridNearby, findNearestIndex, formatProductValue } from "./utils/grid";
import { useI18n } from "./i18n";
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

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function nearestEntryByTime(entries, targetIso) {
  if (!entries?.length) return null;
  if (!targetIso) return entries[entries.length - 1];
  return entries[findNearestIndex(entries, targetIso)];
}

function buildPublicSignals(manifest, currentIso, location, signalGrids, t) {
  function valueFor(productKey) {
    const entry = nearestEntryByTime(manifest.products[productKey]?.timestamps, currentIso);
    if (location && signalGrids[productKey]) {
      const localValue = sampleGridNearby(
        signalGrids[productKey],
        manifest.grid,
        manifest.bbox,
        location.lat,
        location.lon
      );
      if (Number.isFinite(localValue)) return localValue;
    }
    return entry?.stats?.mean ?? null;
  }

  const sst = valueFor("sst");
  const chla = valueFor("chla");
  const swh = valueFor("swh");

  const cyanobacteriaRisk = chla == null ? 0.34 : clamp01((chla - 0.8) / 3.2);
  const waveRisk = swh == null ? 0.25 : clamp01((swh - 0.4) / 1.4);
  const tempComfort = sst == null ? 0.45 : clamp01((sst - 12) / 8);
  const bathingScore = clamp01(0.78 - cyanobacteriaRisk * 0.38 - waveRisk * 0.28 + tempComfort * 0.12);

  return [
    {
      label: t("signal.bathing"),
      value: t(bathingScore > 0.66 ? "signal.good" : bathingScore > 0.42 ? "signal.caution" : "signal.discouraged"),
      tone: bathingScore > 0.66 ? "good" : bathingScore > 0.42 ? "warn" : "bad",
    },
    {
      label: t("signal.cyanobacteria"),
      value: t(cyanobacteriaRisk < 0.35 ? "signal.low" : cyanobacteriaRisk < 0.68 ? "signal.medium" : "signal.high"),
      tone: cyanobacteriaRisk < 0.35 ? "good" : cyanobacteriaRisk < 0.68 ? "warn" : "bad",
    },
    {
      label: t("signal.comfort"),
      value: t(tempComfort > 0.62 && waveRisk < 0.55 ? "signal.comfortHigh" : tempComfort > 0.38 ? "signal.moderate" : "signal.cold"),
      tone: tempComfort > 0.62 && waveRisk < 0.55 ? "good" : "warn",
    },
  ];
}

export default function App() {
  const { language, setLanguage, locale, t } = useI18n();
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState(null);
  const [product, setProduct] = useState("sst");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // mnoznik tempa animacji (0.5x-4x), patrz TimeControl
  const [gridData, setGridData] = useState(null);
  const [hoverLatLng, setHoverLatLng] = useState(null); // { lat, lon } | null - tylko pozycja kursora
  const [pins, setPins] = useState([]); // [{ id, lat, lon }]
  const [pinMode, setPinMode] = useState(false); // czy klik na mapie dodaje punkt (jawnie wlaczane przyciskiem)
  const [chartPinId, setChartPinId] = useState(null); // ktory punkt ma otwarty wykres w czasie
  // Na telefonie startujemy z ukrytym panelem (mapa na caly ekran) - na
  // desktopie/tablecie panel jest domyslnie widoczny.
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth > 720
  );
  const [buoysVisible, setBuoysVisible] = useState(true);
  const [openBuoyId, setOpenBuoyId] = useState(null);
  const [selectedBuoyId, setSelectedBuoyId] = useState(null);
  const [selectedPinId, setSelectedPinId] = useState(null);
  const [signalGrids, setSignalGrids] = useState({});
  const [signalsOpen, setSignalsOpen] = useState(true);

  const entries = manifest?.products[product]?.timestamps ?? [];
  const currentEntry = entries[index];

  // Polling zyje przez caly czas zycia komponentu, wiec aktualny widok czyta
  // z refa - inaczej widzialby wartosci z pierwszego renderu.
  const viewRef = useRef({});
  viewRef.current = { product, t: currentEntry?.t, generatedAt: manifest?.generated_at };

  useEffect(() => {
    let cancelled = false;

    function loadManifest(isFirstLoad) {
      fetch(`${import.meta.env.BASE_URL}data/manifest.json?t=${Date.now()}`)
        .then((r) => {
          if (!r.ok) throw new Error(`manifest.json: HTTP ${r.status}`);
          return r.json();
        })
        .then((raw) => {
          const view = viewRef.current;
          if (cancelled || raw.generated_at === view.generatedAt) return;
          // nowe dane w tle - zostajemy przy tym samym produkcie/momencie w czasie
          // (przy pierwszym ladowaniu t == null, wiec wybierana jest najnowsza klatka)
          const m = resolveManifestUrls(raw);
          const nextEntries = m.products[view.product]?.timestamps ?? [];
          setManifest(m);
          setIndex(Math.max(0, findNearestIndex(nextEntries, view.t)));
        })
        .catch((e) => {
          // nieudany polling w tle nie powinien zabijac dzialajacego widoku
          if (isFirstLoad && !cancelled) setError(e.message);
        });
    }

    loadManifest(true);
    const id = setInterval(() => loadManifest(false), MANIFEST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Ocena warunkow korzysta jednoczesnie z SST, chlorofilu i wysokosci fali,
  // niezaleznie od warstwy wybranej aktualnie w panelu bocznym.
  useEffect(() => {
    if (!manifest) return;
    let cancelled = false;
    const sources = ["sst", "chla", "swh"]
      .map((key) => [key, nearestEntryByTime(manifest.products[key]?.timestamps, currentEntry?.t)?.grid])
      .filter(([, url]) => url);

    Promise.all(
      sources.map(([key, url]) =>
        getGrid(url)
          .then((grid) => [key, grid])
          .catch(() => null)
      )
    ).then((loaded) => {
      if (!cancelled) setSignalGrids(Object.fromEntries(loaded.filter(Boolean)));
    });
    return () => {
      cancelled = true;
    };
  }, [manifest, currentEntry?.t]);

  // Ladowanie siatki wartosci dla aktualnej warstwy (do odczytu pod kursorem i w punktach)
  useEffect(() => {
    if (!currentEntry) return;
    let cancelled = false;
    getGrid(currentEntry.grid)
      .then((arr) => {
        if (!cancelled) setGridData(arr);
      })
      .catch(() => {
        if (!cancelled) setGridData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentEntry]);

  // Podglad nastepnej klatki w tle - animacja gra plynnie bez czekania na fetch
  useEffect(() => {
    if (!entries.length) return;
    const next = entries[(index + 1) % entries.length];
    if (next) getGrid(next.grid).catch(() => {});
  }, [entries, index]);

  // Animacja odtwarzania - predkosc ustawiana przez uzytkownika (patrz TimeControl)
  useEffect(() => {
    if (!playing || entries.length < 2) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % entries.length);
    }, PLAY_INTERVAL_MS / speed);
    return () => clearInterval(id);
  }, [playing, entries.length, speed]);

  function handleSelectProduct(nextProduct) {
    setPlaying(false);
    setChartPinId(null); // wykres pokazuje aktywna warstwe - przy zmianie warstwy staje sie nieaktualny
    const nextEntries = manifest.products[nextProduct].timestamps;
    const nearest = findNearestIndex(nextEntries, currentEntry?.t);
    setProduct(nextProduct);
    setIndex(nearest);
  }

  function handleHover(lat, lon) {
    setHoverLatLng(lat == null ? null : { lat, lon });
  }

  function clearSelection() {
    setSelectedPinId(null);
    setSelectedBuoyId(null);
    setOpenBuoyId(null);
  }

  function selectPin(id) {
    clearSelection();
    setSelectedPinId(id);
  }

  function selectBuoy(id) {
    clearSelection();
    setSelectedBuoyId(id);
    setOpenBuoyId(id);
  }

  function handleAddPin(lat, lon) {
    const id = makePinId();
    setPins((prev) => {
      const next = [...prev, { id, lat, lon }];
      return next.length > MAX_PINS ? next.slice(next.length - MAX_PINS) : next;
    });
    selectPin(id);
  }

  // Klik w puste miejsce mapy: w trybie dodawania stawia punkt, poza nim
  // "wychodzi" z zaznaczenia - bez boi/punktu nie ma tez oceny warunkow.
  function handleMapClick(lat, lon) {
    if (pinMode) handleAddPin(lat, lon);
    else clearSelection();
  }

  function handleRemovePin(id) {
    setPins((prev) => prev.filter((p) => p.id !== id));
    setChartPinId((cur) => (cur === id ? null : cur));
    setSelectedPinId((cur) => (cur === id ? null : cur));
  }

  if (error) {
    return (
      <div className="state-message">
        {t("app.loadError", { error })}{" "}
        <code>npm run process-data</code>.
      </div>
    );
  }
  if (!manifest) {
    return <div className="state-message">{t("app.loading")}</div>;
  }

  const activeProduct = { ...manifest.products[product], label: t(`product.${product}`) };
  const hoverValue =
    hoverLatLng && gridData ? sampleGrid(gridData, manifest.grid, manifest.bbox, hoverLatLng.lat, hoverLatLng.lon) : null;
  const hoverLabel = hoverLatLng ? (formatProductValue(activeProduct, hoverValue) ?? t("common.noData")) : null;
  const pointsWithValues = pins.map((p) => {
    const value = gridData ? sampleGrid(gridData, manifest.grid, manifest.bbox, p.lat, p.lon) : null;
    return { ...p, label: formatProductValue(activeProduct, value) };
  });
  const selectedPinIndex = pins.findIndex((p) => p.id === selectedPinId);
  const selectedPin = selectedPinIndex >= 0 ? pins[selectedPinIndex] : null;
  const selectedBuoy = BUOYS.find((b) => b.id === selectedBuoyId) ?? null;
  const signalLocation = selectedBuoy ?? selectedPin;
  const signalScope = selectedBuoy
    ? t("signal.scopeBuoy", { name: selectedBuoy.name, place: language === "en" ? selectedBuoy.placeEn : selectedBuoy.place })
    : selectedPin
      ? t("signal.scopePoint", { letter: "ABCDEFGHIJ"[selectedPinIndex] ?? "?", lat: selectedPin.lat.toFixed(3), lon: selectedPin.lon.toFixed(3) })
      : null;
  const publicSignals = signalLocation
    ? buildPublicSignals(manifest, currentEntry?.t, signalLocation, signalGrids, t)
    : [];

  return (
    <div className={`layout${sidebarOpen ? "" : " sidebar-collapsed"}${signalsOpen ? "" : " signals-collapsed"}`}>
      <aside className={`sidebar${sidebarOpen ? "" : " is-collapsed"}`}>
        <SidebarWater active={sidebarOpen} />
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
            speed={speed}
            onSpeedChange={setSpeed}
          />
        </section>

        <section className="panel buoys-toggle-panel">
          <div className="switch-row">
            <span className="switch-label">
              {t("sidebar.buoys")}
              <span className="buoy-sim-tag">{t("common.simulation")}</span>
            </span>
            <button
              className={`switch${buoysVisible ? " is-on" : ""}`}
              role="switch"
              aria-checked={buoysVisible}
              onClick={() => {
                // chowamy boje - zamykamy tez ewentualny otwarty panel
                if (buoysVisible) {
                  setOpenBuoyId(null);
                  setSelectedBuoyId(null);
                }
                setBuoysVisible(!buoysVisible);
              }}
            >
              <span className="switch-thumb" />
            </button>
          </div>
        </section>

        <PointsPanel
          points={pointsWithValues}
          selectedPointId={selectedPinId}
          pinMode={pinMode}
          onTogglePinMode={() => setPinMode((v) => !v)}
          onRemove={handleRemovePin}
          onClear={() => {
            setPins([]);
            setChartPinId(null);
            setSelectedPinId(null);
          }}
          onSelect={selectPin}
          onShowChart={(id) => {
            selectPin(id);
            setChartPinId(id);
          }}
        />

        <footer className="sidebar-footer">
          {t("footer.data", { date: new Date(manifest.generated_at).toLocaleString(locale) })}
          <br />
          {t("footer.projectBefore")}{" "}
          <a href="https://bentos.info" target="_blank" rel="noreferrer">
            Bentos
          </a>{" "}
          {t("footer.projectAfter")}
          <div className="sidebar-footer-legal">© 2026 BENTOS · EmbeddedSystems.do × IOPAN</div>
        </footer>
      </aside>

      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label={t(sidebarOpen ? "sidebar.hide" : "sidebar.show")}
      >
        <span className="sidebar-toggle-chevron">{sidebarOpen ? "‹" : "›"}</span>
        <span className="sidebar-toggle-label">{sidebarOpen ? t("common.close") : `☰ ${t("sidebar.layersButton")}`}</span>
      </button>

      <main className="map-wrap">
        <div className="brand-badge">
          <div className="brand-badge-id">
            <img src={`${import.meta.env.BASE_URL}brand/bentos-logo.png`} alt="Bentos" className="brand-badge-logo" />
            <span className="brand-badge-location">{t("brand.location")}</span>
          </div>
          <div className={`language-switch is-${language}`} role="group" aria-label={t("language.label")}>
            <span className="language-switch-thumb" aria-hidden="true" />
            {["pl", "en"].map((lang) => (
              <button
                key={lang}
                className={language === lang ? "is-active" : ""}
                onClick={() => setLanguage(lang)}
                aria-pressed={language === lang}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Ocena pojawia sie tylko dla wybranej boi/punktu i zostaje tez przy
            otwartym panelu boi (key na zakresie odpala krotkie podswietlenie,
            zeby bylo widac, ze sie przeliczyla). */}
        {signalLocation && (
          <div
            className={`public-signals${signalsOpen ? "" : " is-collapsed"}`}
            aria-label={t("signal.aria")}
          >
            <div className="public-signals-head">
              <span>{t("signal.title")}</span>
              <div className="public-signals-head-actions">
                <strong>{t("signal.demo")}</strong>
                <button
                  className="public-signals-toggle"
                  onClick={() => setSignalsOpen((open) => !open)}
                  aria-expanded={signalsOpen}
                  aria-label={t(signalsOpen ? "signal.hide" : "signal.show")}
                  title={t(signalsOpen ? "signal.hide" : "signal.show")}
                >
                  {signalsOpen ? "−" : "+"}
                </button>
              </div>
            </div>
            {signalsOpen && (
              <>
                <div className="public-signals-scope" title={signalScope}>{signalScope}</div>
                <div className="public-signals-grid" key={signalScope}>
                  {publicSignals.map((signal) => (
                    <div className={`public-signal is-${signal.tone}`} key={signal.label}>
                      <span>{signal.label}</span>
                      <strong>{signal.value}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="alpha-badge">
          <span className="alpha-badge-dot" />
          <span className="alpha-badge-text">
            <strong>ALPHA</strong> — {t("app.alpha")}
          </span>
        </div>

        <MapView
          bbox={manifest.bbox}
          imageUrl={currentEntry?.png}
          productKey={product}
          hoverLabel={hoverLabel}
          pins={pins}
          selectedPinId={selectedPinId}
          pinMode={pinMode}
          buoysVisible={buoysVisible}
          selectedBuoyId={selectedBuoyId}
          onHover={handleHover}
          onPinClick={selectPin}
          onMapClick={handleMapClick}
          onBuoyClick={selectBuoy}
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

      {openBuoyId &&
        (() => {
          const buoy = BUOYS.find((b) => b.id === openBuoyId);
          if (!buoy) return null;
          return (
            <BuoyModal
              buoy={buoy}
              timestampIso={currentEntry?.t}
              entries={entries}
              onClose={() => setOpenBuoyId(null)}
            />
          );
        })()}
    </div>
  );
}
