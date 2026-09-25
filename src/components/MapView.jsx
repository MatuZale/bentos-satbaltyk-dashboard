import { MapContainer, TileLayer, ImageOverlay, Marker, useMapEvents } from "react-leaflet";
import { useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { PRODUCT_ICONS, BuoyIcon } from "./icons";
import { BUOYS } from "../data/buoys";

const PIN_LETTERS = "ABCDEFGHIJ";

function buildPinIcon(Icon, letter) {
  const html = renderToStaticMarkup(
    <div className="pin-marker">
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

const BUOY_ICON = L.divIcon({
  html: renderToStaticMarkup(
    <div className="buoy-marker">
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
  pinMode,
  buoysVisible,
  onHover,
  onPinClick,
  onMapClick,
  onBuoyClick,
}) {
  const bounds = useMemo(() => {
    const [lonMin, latMin, lonMax, latMax] = bbox;
    return [
      [latMin, lonMin],
      [latMax, lonMax],
    ];
  }, [bbox]);

  // Nieco szersze niz same dane granice panoramowania - widac odrobine
  // kontekstu wokol obszaru zainteresowania, ale nie da sie "zgubic" gdzies
  // w otwartym Baltyku daleko od Trojmiasta.
  const maxBounds = useMemo(() => {
    const [lonMin, latMin, lonMax, latMax] = bbox;
    const padLon = (lonMax - lonMin) * 0.3;
    const padLat = (latMax - latMin) * 0.3;
    return [
      [latMin - padLat, lonMin - padLon],
      [latMax + padLat, lonMax + padLon],
    ];
  }, [bbox]);

  const [cursor, setCursor] = useState(null); // {x,y} w pikselach kontenera mapy
  const Icon = PRODUCT_ICONS[productKey];

  const pinIcons = useMemo(
    () => pins.map((_, i) => buildPinIcon(PRODUCT_ICONS[productKey], PIN_LETTERS[i] ?? "?")),
    [pins, productKey]
  );

  return (
    <MapContainer
      center={[54.5, 18.7]}
      zoom={10}
      minZoom={8}
      maxZoom={13}
      maxBounds={maxBounds}
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
            icon={BUOY_ICON}
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

      {pinMode && <div className="pin-mode-hint">Kliknij na mapę, aby dodać punkt pomiarowy</div>}

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
