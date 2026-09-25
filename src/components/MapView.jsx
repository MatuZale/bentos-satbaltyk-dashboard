import { MapContainer, TileLayer, ImageOverlay, useMapEvents } from "react-leaflet";
import { useMemo } from "react";
import "leaflet/dist/leaflet.css";

function HoverLayer({ onHover }) {
  useMapEvents({
    mousemove(e) {
      onHover(e.latlng.lat, e.latlng.lng);
    },
    mouseout() {
      onHover(null, null);
    },
  });
  return null;
}

export default function MapView({ bbox, imageUrl, onHover }) {
  const bounds = useMemo(() => {
    const [lonMin, latMin, lonMax, latMax] = bbox;
    return [
      [latMin, lonMin],
      [latMax, lonMax],
    ];
  }, [bbox]);

  return (
    <MapContainer
      center={[54.5, 18.7]}
      zoom={10}
      minZoom={7}
      maxZoom={13}
      className="map"
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
      <HoverLayer onHover={onHover} />
    </MapContainer>
  );
}
