#!/usr/bin/env python3
"""
Przetwarza eksporty GeoTIFF z SatBaltyk (satbaltyk.pl) do postaci gotowej
dla dashboardu webowego: przycina do obszaru Zatoki Gdanskiej / Trojmiasta,
przeprojektowuje na EPSG:4326, koloruje wg skali fizycznej i zapisuje jako
PNG (do wyswietlenia na mapie) + surowa siatka float32 (do odczytu wartosci
pod kursorem) + manifest.json (katalog wszystkich dostepnych warstw).

Wejscie: dane/<dowolna_nazwa>/snapshots/<produkt>/*.tiff
         (np. dane/export20261010_120000/snapshots/sst/...) - wystarczy wrzucic
         nowy folder eksportu z SatBaltyk do dane/, struktura wewnatrz nie
         musi sie zmieniac.
Wyjscie: public/data/<produkt>/<timestamp>.png + .f32 + public/data/manifest.json

Uruchomienie:
    python3 scripts/process_data.py            # jednorazowo
    python3 scripts/process_data.py --watch     # pilnuje dane/ i przetwarza na biezaco

Skrypt jest idempotentny/przyrostowy - pomija pliki, ktore juz maja gotowy
PNG+f32 w katalogu wyjsciowym, wiec mozna go bezpiecznie odpalac ponownie po
dorzuceniu kolejnego folderu eksportu do dane/. Nierozpoznane produkty
(foldery snapshots/<x> bez wpisu w PRODUCTS) i uszkodzone/nieczytelne pliki
sa raportowane, ale nie przerywaja przetwarzania reszty.
"""
import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from osgeo import gdal
from PIL import Image
import matplotlib.cm as cm
import matplotlib.colors as mcolors

gdal.UseExceptions()
gdal.SetConfigOption("CPL_LOG", "/dev/null")

ROOT = Path(__file__).resolve().parent.parent
DANE_DIR = ROOT / "dane"
OUT_DIR = ROOT / "public" / "data"

# Obszar Zatoki Gdanskiej / Trojmiasta (lon_min, lat_min, lon_max, lat_max, EPSG:4326)
BBOX = (18.0, 54.2, 19.5, 55.0)
GRID_WIDTH = 240
GRID_HEIGHT = 128
SRC_NODATA = -999.0
WATCH_POLL_SECONDS = 5

FNAME_RE = re.compile(r"^(\d{8})_(\d{6})-")

# Kolormapy: wylacznie perceptualnie jednorodne, bezpieczne dla daltonizmu
# (rodzina matplotlib viridis/plasma/cividis + twilight dla wielkosci katowych) -
# zadnej "teczowej" skali (jet/hsv/turbo), zeby odczyt nie zalezal od percepcji barw.
PRODUCTS = {
    "sst": {
        "label": "Temperatura powierzchni morza (SST)",
        "unit": "°C",
        "vmin": 2.0,
        "vmax": 22.0,
        "cmap": "plasma",
        "circular": False,
    },
    "chla": {
        "label": "Chlorofil a",
        "unit": "mg/m³",
        "vmin": 0.0,
        "vmax": 8.0,
        "cmap": "viridis",
        "circular": False,
    },
    "swh": {
        "label": "Wysokość fali (SWH)",
        "unit": "m",
        "vmin": 0.0,
        "vmax": 2.5,
        "cmap": "cividis",
        "circular": False,
    },
    "mwdir": {
        "label": "Kierunek fali",
        "unit": "° (od północy, zgodnie z ruchem wskazówek)",
        "vmin": 0.0,
        "vmax": 360.0,
        "cmap": "twilight_shifted",
        "circular": True,
    },
}


def find_source_dirs():
    """Kazdy folder bezposrednio w dane/, ktory zawiera podfolder snapshots/,
    jest traktowany jako jeden eksport SatBaltyk - niezaleznie od nazwy."""
    if not DANE_DIR.is_dir():
        return []
    return sorted(d for d in DANE_DIR.iterdir() if d.is_dir() and (d / "snapshots").is_dir())


def scan_products(source_dirs):
    """Zwraca (by_product, unknown_products):
    by_product: {produkt: {timestamp_iso: Path}} - tylko produkty znane w PRODUCTS
    unknown_products: {nazwa_produktu: [foldery, w ktorych wystapil]}
    Przy zbieznych znacznikach czasu wygrywa plik z pozniejszego (alfabetycznie) folderu."""
    by_product = {p: {} for p in PRODUCTS}
    unknown = {}
    for export_dir in source_dirs:
        snapshots_dir = export_dir / "snapshots"
        for product_dir in sorted(snapshots_dir.iterdir()):
            if not product_dir.is_dir():
                continue
            product = product_dir.name
            if product not in PRODUCTS:
                unknown.setdefault(product, []).append(export_dir.name)
                continue
            for f in product_dir.glob("*.tiff"):
                m = FNAME_RE.match(f.name)
                if not m:
                    continue
                ts = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S").replace(
                    tzinfo=timezone.utc
                )
                by_product[product][ts.isoformat()] = f
    return by_product, unknown


def warp_to_grid(src_path: Path) -> np.ndarray:
    """Przycina+reprojektuje do wspolnej siatki EPSG:4326, zwraca float32
    array (GRID_HEIGHT, GRID_WIDTH) z NaN w miejscu NoData."""
    warp_opts = gdal.WarpOptions(
        format="MEM",
        outputBounds=BBOX,
        outputBoundsSRS="EPSG:4326",
        dstSRS="EPSG:4326",
        width=GRID_WIDTH,
        height=GRID_HEIGHT,
        srcNodata=SRC_NODATA,
        dstNodata=np.nan,
        resampleAlg="near",  # dane satelitarne/modelowe 1km - bez wygladzania artefaktow na brzegu ladu
        multithread=True,
    )
    ds = gdal.Warp("", str(src_path), options=warp_opts)
    arr = ds.GetRasterBand(1).ReadAsArray().astype(np.float32)
    ds = None
    return arr


def colorize(arr: np.ndarray, cfg: dict) -> Image.Image:
    valid = ~np.isnan(arr)
    norm = mcolors.Normalize(vmin=cfg["vmin"], vmax=cfg["vmax"], clip=True)
    colormap = cm.get_cmap(cfg["cmap"])
    rgba = colormap(norm(np.nan_to_num(arr, nan=cfg["vmin"])))
    rgba = (rgba * 255).astype(np.uint8)
    rgba[..., 3] = np.where(valid, 255, 0)
    return Image.fromarray(rgba, mode="RGBA")


def make_legend(cfg: dict, path: Path, width=256, height=28):
    norm = mcolors.Normalize(vmin=cfg["vmin"], vmax=cfg["vmax"])
    colormap = cm.get_cmap(cfg["cmap"])
    gradient = np.linspace(cfg["vmin"], cfg["vmax"], width)
    rgba = colormap(norm(gradient))
    rgba = (rgba[:, :3] * 255).astype(np.uint8)
    img = np.tile(rgba, (height, 1, 1))
    Image.fromarray(img, mode="RGB").save(path)


def process_product(product: str, cfg: dict, files: dict, report: dict) -> dict:
    out_dir = OUT_DIR / product
    out_dir.mkdir(parents=True, exist_ok=True)

    make_legend(cfg, out_dir / "legend.png")

    entries = []
    for ts_iso in sorted(files):
        src = files[ts_iso]
        stamp = ts_iso.replace(":", "").replace("-", "").replace("+0000", "Z")
        png_path = out_dir / f"{stamp}.png"
        f32_path = out_dir / f"{stamp}.f32"

        if not png_path.exists() or not f32_path.exists():
            try:
                arr = warp_to_grid(src)
                if cfg["circular"]:
                    # mwdir w plikach zrodlowych jest w konwencji -180..180 -
                    # sprowadzamy do standardowych 0..360 (od polnocy, zgodnie z ruchem wskazowek)
                    arr = np.where(np.isnan(arr), arr, (arr + 360.0) % 360.0)
                colorize(arr, cfg).save(png_path)
                arr.astype("<f4").tofile(f32_path)
            except Exception as exc:  # noqa: BLE001 - chcemy przetworzyc reszte mimo bledu jednego pliku
                report["failed"].append(f"{product}/{src.name}: {exc}")
                png_path.unlink(missing_ok=True)
                f32_path.unlink(missing_ok=True)
                continue
            report["new"].append(f"{product}/{stamp}")
            print(f"  [{product}] {stamp} <- {src.name}")

        valid = np.fromfile(f32_path, dtype="<f4")
        valid = valid[~np.isnan(valid)]
        stats = (
            {"min": float(valid.min()), "max": float(valid.max()), "mean": float(valid.mean())}
            if valid.size
            else None
        )

        entries.append(
            {
                "t": ts_iso,
                "png": f"data/{product}/{stamp}.png",
                "grid": f"data/{product}/{stamp}.f32",
                "stats": stats,
            }
        )

    return {
        "label": cfg["label"],
        "unit": cfg["unit"],
        "vmin": cfg["vmin"],
        "vmax": cfg["vmax"],
        "circular": cfg["circular"],
        "legend": f"data/{product}/legend.png",
        "timestamps": entries,
    }


def run_once() -> dict:
    """Pojedynczy przebieg: skanuje dane/, dopisuje brakujace warstwy,
    zapisuje manifest.json. Zwraca raport (do wypisania w main/watch)."""
    source_dirs = find_source_dirs()
    report = {"new": [], "failed": [], "unknown": {}, "source_dirs": len(source_dirs)}

    if not source_dirs:
        return report

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    by_product, unknown = scan_products(source_dirs)
    report["unknown"] = unknown

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "bbox": list(BBOX),
        "grid": {"width": GRID_WIDTH, "height": GRID_HEIGHT},
        "products": {},
    }
    for product, cfg in PRODUCTS.items():
        manifest["products"][product] = process_product(product, cfg, by_product[product], report)

    manifest_path = OUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    report["manifest_path"] = str(manifest_path)
    return report


def print_report(report: dict):
    if report["source_dirs"] == 0:
        print(f"Brak folderow eksportu w {DANE_DIR} (oczekuje sie */snapshots/<produkt>/*.tiff).", file=sys.stderr)
        return

    for name, seen_in in report["unknown"].items():
        print(
            f"  UWAGA: nieznany produkt '{name}' w {', '.join(seen_in)} - pominięto. "
            f"Dodaj wpis do PRODUCTS w scripts/process_data.py, żeby go przetwarzać.",
            file=sys.stderr,
        )
    for msg in report["failed"]:
        print(f"  UWAGA: nie udało się przetworzyć {msg} - pominięto.", file=sys.stderr)

    if report["new"]:
        print(f"Nowe klatki: {len(report['new'])}")
    else:
        print("Brak nowych klatek (wszystko już przetworzone).")
    if report.get("manifest_path"):
        print(f"Manifest: {report['manifest_path']}")


def dane_fingerprint():
    """Lekki 'odcisk palca' zawartosci dane/ - do wykrywania zmian w trybie --watch
    bez ciaglego przeliczania danych od nowa."""
    if not DANE_DIR.is_dir():
        return ()
    return tuple(
        sorted(
            (str(f.relative_to(DANE_DIR)), f.stat().st_mtime_ns, f.stat().st_size)
            for f in DANE_DIR.rglob("*.tiff")
        )
    )


def watch():
    print(f"Obserwuję {DANE_DIR} (co {WATCH_POLL_SECONDS}s) - Ctrl+C żeby zakończyć.", flush=True)
    last_fp = None
    try:
        while True:
            fp = dane_fingerprint()
            if fp != last_fp:
                print(
                    f"\n[{datetime.now().strftime('%H:%M:%S')}] Wykryto zmianę w {DANE_DIR}, przetwarzam...",
                    flush=True,
                )
                print_report(run_once())
                sys.stdout.flush()
                last_fp = fp
            time.sleep(WATCH_POLL_SECONDS)
    except KeyboardInterrupt:
        print("\nZatrzymano.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--watch",
        action="store_true",
        help="nie kończ po jednym przebiegu - pilnuj dane/ i przetwarzaj nowe pliki na bieżąco",
    )
    args = parser.parse_args()

    if args.watch:
        watch()
        return

    print_report(run_once())


if __name__ == "__main__":
    main()
