# Bentos: SatBałtyk — dashboard dla Trójmiasta

🔗 **Live:** https://matuzale.github.io/bentos-satbaltyk-dashboard/

Prosty dashboard webowy (React + Vite + Leaflet) do wizualizacji
danych z eksportu [SatBałtyk](https://satbaltyk.pl) na obszarze Zatoki
Gdańskiej / Trójmiasta. Identyfikacja wizualna (kolory, fonty) nawiązuje do
[bentos.info](https://bentos.info) — projektu monitoringu jakości wody w
Zatoce Gdańskiej, w ramach którego powstaje ten dashboard.

## Jak to działa

Dane wejściowe (GeoTIFF, cała siatka Bałtyku 1280×1408 px / 1 km, projekcja
LAEA SatBałtyk) nie nadają się do bezpośredniego wrzucenia do przeglądarki:
są duże (>1 GB na eksport), niepotrzebnie obejmują cały Bałtyk i wymagają
reprojekcji. Dlatego jest tu krok przetwarzania:

```
dane/<cokolwiek>/snapshots/<produkt>/*.tiff   ← tu wrzucasz nowe eksporty z SatBałtyk
        │
        ▼
scripts/process_data.py   (Python + GDAL)
        │
        │  1. skanuje dane/ i wykrywa, co jest nowe / nieznane / uszkodzone
        │  2. przycina każdy GeoTIFF do obszaru Zatoki Gdańskiej (bbox w konfiguracji)
        │  3. przeprojektowuje z LAEA SatBałtyk → EPSG:4326 (WGS84)
        │  4. maskuje NoData (w plikach źródłowych to -999, nieotagowane w metadanych)
        │  5. koloruje wg stałej skali fizycznej (perceptualnie jednorodne
        │     kolormapy: plasma/viridis/cividis/twilight — bez "tęczy")
        ▼
public/data/<produkt>/<znacznik_czasu>.png   — nakładka na mapę
public/data/<produkt>/<znacznik_czasu>.f32   — surowa siatka (do odczytu wartości pod kursorem)
public/data/manifest.json                    — katalog wszystkich dostępnych warstw/czasów
        │
        ▼
   React + Vite + Leaflet (src/)  ← czyta wyłącznie public/data/*, nic więcej
                                     (co ~20s sam sprawdza, czy manifest się zmienił)
```

Frontend nigdy nie dotyka oryginalnych GeoTIFF-ów — tylko wygenerowanych
plików w `public/data/`.

## Wdrożenie

Każdy push na `main` (`.github/workflows/deploy.yml`) buduje frontend
(`npm run build`) i publikuje go na GitHub Pages. **`public/data/` jest
commitowane do repo** (to jedyne dane, jakich potrzebuje strona — surowe
GeoTIFF-y z `dane/` zostają tylko lokalnie, są w `.gitignore`, ważą za dużo
i nie są do niczego potrzebne po wygenerowaniu warstw). Żeby zaktualizować
dane na żywej stronie: `npm run process-data` lokalnie, `git add public/data`,
commit, push — reszta dzieje się sama.

## Uruchomienie

```bash
npm install                    # raz
npm run process-data           # generuje public/data/ z dane/ (wymaga gdal + python3-gdal, matplotlib, pillow, numpy)
npm run dev                    # http://localhost:5173
```

## Dokładanie nowych danych

Wrzuć folder eksportu z SatBałtyk (dokładnie taki, jaki eksportuje strona —
`exportYYYYMMDD_HHMMSS/snapshots/<produkt>/*.tiff`, nazwa folderu dowolna) do
`dane/`, np.:

```
dane/
  export20260925_062942/   (już jest)
  export20261010_120000/   (nowy eksport — po prostu wklejony folder)
```

Dalej masz dwie opcje:

- **Jednorazowo:** `npm run process-data` — doda tylko to, czego jeszcze nie
  ma w `public/data/` (pliki już przetworzone są pomijane), i wypisze co
  znalazł.
- **Na bieżąco:** `npm run process-data:watch` — zostaje w tle, pilnuje
  `dane/` i przetwarza nowe pliki w chwilę po ich wrzuceniu, bez ręcznego
  odpalania. Dashboard sam dopyta o nowy manifest (odświeża go co ~20s), więc
  nowa warstwa pojawi się w przeglądarce bez przeładowania strony.

Skrypt **raportuje, a nie tylko cicho pomija**:

- nierozpoznany folder produktu pod `snapshots/` (np. dorzucisz `gpp` albo
  `rsds`, których jeszcze nie ma w konfiguracji) → ostrzeżenie z podpowiedzią,
  żeby dodać wpis do `PRODUCTS` w `scripts/process_data.py`;
- uszkodzony / nieczytelny plik `.tiff` → ostrzeżenie, plik pomijany, reszta
  przetwarza się dalej.

## Dostępne warstwy

| Produkt | Źródło SatBałtyk | Zakres skali | Uwagi |
|---|---|---|---|
| SST | `x_ss_sst_merge` | 2–22 °C | temperatura powierzchni morza |
| Chlorofil a | `x_ss_modis_ecosat_v2` | 0–8 mg/m³ | tylko 2 zdjęcia w bieżącym eksporcie |
| Wysokość fali (SWH) | `m_io_WP_BaltWave2sb` | 0–2.5 m | model falowania |
| Kierunek fali (mwdir) | `m_io_WP_BaltWave2sb` | 0–360° | patrz uwaga niżej |

**Uwaga o kierunku fali:** w plikach źródłowych `mwdir` jest zakodowany w
konwencji -180°..180°, a nie kompasowej 0°..360° — skrypt przelicza to
automatycznie (`(deg + 360) % 360`). Ponadto kierunek bywa zamaskowany
(NoData) tam, gdzie wysokość fali jest bliska zeru — to najpewniej celowe
zachowanie modelu (kierunek fali jest niezdefiniowany przy braku fali), nie
błąd przetwarzania.

Żeby dodać kolejny produkt (np. gpp, rsds): wrzuć jego pliki do
`dane/<eksport>/snapshots/<produkt>/`, uruchom raz `npm run process-data` —
skrypt zgłosi go jako nieznany — i dopisz wpis w `PRODUCTS` w
`scripts/process_data.py` (etykieta, jednostka, zakres skali, kolormapa).

## Identyfikacja wizualna

Paleta i fonty są ściągnięte wprost z arkusza CSS bentos.info (nie z oka):
tło `#00051f`/`#0f1c51` (głęboki granat), akcent `#aaff00` (limonka),
`Open Sauce Sans` na tekst, `Space Mono` na etykiety/dane liczbowe. Mapa
bazowa to standardowe kafle OSM przyciemnione filtrem CSS (`.leaflet-tile-pane`
w `App.css`) — bez zależności od płatnych/kluczowanych usług kafli (CARTO
Dark Matter obecnie wymaga klucza API). Nakładka z danymi jest w osobnej
warstwie Leaflet, więc filtr jej nie dotyka.

## Czego brakuje / do ustalenia

- Eksport nie zawiera produktów **gpp** (`c_ap_desambem`) ani **rsds**
  (`m_ug_solrad_mtg`), mimo że były w oryginalnym żądaniu eksportu — jest za
  to `mwdir`, o który nie proszono (patrz sekcja wyżej, jak je dodać).
- Format **Macierz SatBałtyk** nie był dostępny w projekcie w momencie
  budowy tego dashboardu — cały pipeline działa na GeoTIFF. Gdyby macierz
  się pojawiła, warto ją porównać z GeoTIFF (m.in. czy niesie własną
  georeferencję, czy trzeba dorobić osobny parser siatki).

## Struktura projektu

```
dane/                       dane źródłowe z SatBałtyk (bez zmian, tylko odczyt)
scripts/process_data.py     pipeline przetwarzania + wykrywanie nowych/nieznanych danych (GDAL + matplotlib)
public/data/                 wygenerowane warstwy (PNG + f32 + manifest.json)
src/                          aplikacja React
  App.jsx                     stan główny, dobór warstwy/czasu, odczyt wartości, odpytywanie manifestu
  components/MapView.jsx      mapa Leaflet + nakładka + przyciemnione kafle OSM
  components/Sidebar.jsx      wybór produktu (ikony + liczba dostępnych zdjęć)
  components/icons.jsx        minimalne ikony SVG dla produktów
  components/TimeControl.jsx  suwak czasu + odtwarzanie
  components/Legend.jsx       pasek skali kolorów
  utils/grid.js                odczyt siatki f32, formatowanie czasu/kompasu
```
