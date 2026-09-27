import { MapContainer, TileLayer, ImageOverlay, Marker, useMapEvents } from "react-leaflet";
import { useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { PRODUCT_ICONS, BuoyIcon } from "./icons";
import { BUOYS } from "../data/buoys";
import { useI18n } from "../i18n";

const PIN_LETTERS = "ABCDEFGHIJ";
const BALTIC_CENTER = [58.7, 20.4];
const BALTIC_MAX_BOUNDS = [
  [53.0, 9.0],
  [66.5, 31.5],
];

function buildPinIcon(Icon, letter, isSelected) {
  const html = renderToStaticMarkup(
    <div className={`pin-marker${isSelected ? " is-selected" : ""}`}>
      <span className="pin-marker-ring" />
      <span className="pin-marker-icon">
        <Icon />
      </span>
      <span className="pin-marker-letter">{letter}</span>
    </div>
  );
  return L.divIcon({
    html,
    className: "pin-marker-wrap",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function buildBuoyIcon(isSelected) {
  return L.divIcon({
    html: renderToStaticMarkup(
      <div className={`buoy-marker${isSelected ? " is-selected" : ""}`}>
        <span className="buoy-marker-ring" />
        <span className="buoy-marker-icon">
          <BuoyIcon />
        </span>
      </div>
    ),
    className: "pin-marker-wrap",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

// Jeden nasluch zdarzen mapy: mousemove karmi "celownik" (pozycja w pikselach
// kontenera + wartosc pod kursorem zamiast golego kursora), klik dodaje/usuwa
// przypiety punkt. Nie renderuje nic sam - stan wystawia do rodzica.
function MapInteractions({ onCursorMove, onHover, onMapClick }) {
  useMapEvents({
    mousemove(e) {
      onCursorMove(e.containerPoint);
      onHover(e.latlng.lat, e.latlng.lng);
    },
    mouseout() {
      onCursorMove(null);
      onHover(null, null);
    },
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapView({
  bbox,
  imageUrl,
  productKey,
  hoverLabel,
  pins,
  selectedPinId,
  pinMode,
  buoysVisible,
  selectedBuoyId,
  onHover,
  onPinClick,
  onMapClick,
  onBuoyClick,
}) {
  const { t } = useI18n();
  const bounds = useMemo(() => {
    const [lonMin, latMin, lonMax, latMax] = bbox;
    return [
      [latMin, lonMin],
      [latMax, lonMax],
    ];
  }, [bbox]);

  const [cursor, setCursor] = useState(null); // {x,y} w pikselach kontenera mapy
  const Icon = PRODUCT_ICONS[productKey];

  const pinIcons = useMemo(
    () => pins.map((pin, i) => buildPinIcon(PRODUCT_ICONS[productKey], PIN_LETTERS[i] ?? "?", pin.id === selectedPinId)),
    [pins, productKey, selectedPinId]
  );

  const buoyIcons = useMemo(
    () => Object.fromEntries(BUOYS.map((b) => [b.id, buildBuoyIcon(b.id === selectedBuoyId)])),
    [selectedBuoyId]
  );

  return (
    <MapContainer
      center={BALTIC_CENTER}
      zoom={5}
      minZoom={5}
      maxZoom={13}
      maxBounds={BALTIC_MAX_BOUNDS}
      maxBoundsViscosity={1.0}
      className={`map${pinMode ? " map-armed" : ""}`}
      preferCanvas
    >
      {/* Standardowe kafle OSM przyciemnione filtrem CSS (patrz .map .leaflet-tile-pane w App.css) -
          zeby paleta nakladki nie gryzla sie z jasna mapa, bez zaleznosci od platnych/kluczowanych
          uslug kafli. Filtr dziala tylko na warstwie kafli, nie na ImageOverlay z danymi. */}
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {imageUrl && <ImageOverlay url={imageUrl} bounds={bounds} opacity={0.88} />}

      {pins.map((p, i) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lon]}
          icon={pinIcons[i]}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              onPinClick(p.id);
            },
          }}
        />
      ))}

      {buoysVisible &&
        BUOYS.map((b) => (
          <Marker
            key={b.id}
            position={[b.lat, b.lon]}
            icon={buoyIcons[b.id]}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onBuoyClick(b.id);
              },
            }}
          />
        ))}

      <MapInteractions
        onCursorMove={setCursor}
        onHover={onHover}
        onMapClick={pinMode ? onMapClick : () => {}}
      />

      {pinMode && <div className="pin-mode-hint">{t("map.addHint")}</div>}

      {cursor && (
        <div className="measure-cursor" style={{ left: cursor.x, top: cursor.y }}>
          <span className="measure-cursor-dot">
            <Icon />
          </span>
          {hoverLabel && <span className="measure-cursor-label">{hoverLabel}</span>}
        </div>
      )}
    </MapContainer>
  );
}
