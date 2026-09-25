import { useEffect, useRef, useState } from "react";
import BuoyCamera from "./BuoyCamera";
import { simulateBuoyReading } from "../utils/simulate";
import { degToCompass, formatTimestamp } from "../utils/grid";

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export default function BuoyModal({ buoy, timestampIso, onClose }) {
  const [pos, setPos] = useState(null); // null = domyslna pozycja z CSS (top-right); po przeciagnieciu {x,y}
  const dragRef = useRef({ dragging: false, offsetX: 0, offsetY: 0 });
  const panelRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current.dragging) return;
      const panelRect = panelRef.current.getBoundingClientRect();
      const mapEl = document.querySelector(".map-wrap");
      const bounds = mapEl
        ? mapEl.getBoundingClientRect()
        : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };

      let x = e.clientX - dragRef.current.offsetX;
      let y = e.clientY - dragRef.current.offsetY;
      // nie pozwalamy wyciagnac panelu poza widoczny obszar mapy
      x = Math.min(Math.max(x, bounds.left), Math.max(bounds.left, bounds.right - panelRect.width));
      y = Math.min(Math.max(y, bounds.top), Math.max(bounds.top, bounds.bottom - panelRect.height));
      setPos({ x, y });
    }
    function onUp() {
      dragRef.current.dragging = false;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  function handleDragStart(e) {
    const rect = panelRef.current.getBoundingClientRect();
    dragRef.current = { dragging: true, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    e.preventDefault();
  }

  const r = simulateBuoyReading(buoy.id, timestampIso);

  const tiles = [
    { label: "Temp. wody", value: r.waterTemp.toFixed(1), unit: "°C", frac: clamp01(r.waterTemp / 25) },
    { label: "Wys. fali", value: r.waveHeight.toFixed(2), unit: "m", frac: clamp01(r.waveHeight / 3) },
    {
      label: "Wiatr",
      value: r.windSpeed.toFixed(0),
      unit: `km/h ${degToCompass(r.windDir)}`,
      frac: clamp01(r.windSpeed / 40),
    },
    { label: "Ciśnienie", value: r.pressure.toFixed(0), unit: "hPa", frac: clamp01((r.pressure - 970) / 70) },
    { label: "Bateria", value: r.battery, unit: "%", frac: clamp01(r.battery / 100) },
    { label: "Sygnał", value: r.signal, unit: "/5", frac: clamp01(r.signal / 5) },
  ];

  return (
    <div
      className="buoy-panel"
      ref={panelRef}
      style={pos ? { left: pos.x, top: pos.y, right: "auto" } : undefined}
    >
      <div className="modal-header buoy-panel-handle" onMouseDown={handleDragStart}>
        <div>
          <span className="modal-title">{buoy.name}</span>
          <span className="buoy-sim-tag">symulacja</span>
          <div className="modal-subtitle">{buoy.lat.toFixed(4)}, {buoy.lon.toFixed(4)}</div>
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Zamknij">
          ×
        </button>
      </div>

      <BuoyCamera timestampIso={timestampIso} />

      <div className="stream-eyebrow">
        <span className="stream-eyebrow-highlight">Podgląd strumienia danych</span>
      </div>
      <div className="buoy-stream">
        <div className="buoy-stream-header">
          <span className="buoy-stream-live">
            <span className="buoy-live-dot" />
            SYMULACJA · BOJA
          </span>
          <span className="buoy-stream-time">{timestampIso ? formatTimestamp(timestampIso) : "—"}</span>
        </div>

        <div className="buoy-telemetry">
          {tiles.map((t) => (
            <div className="buoy-stat" key={t.label}>
              <span className="buoy-stat-label">{t.label}</span>
              <span className="buoy-stat-value">
                {t.value} <small>{t.unit}</small>
              </span>
              <span className="buoy-stat-bar">
                <span className="buoy-stat-bar-fill" style={{ width: `${t.frac * 100}%` }} />
              </span>
            </div>
          ))}
        </div>

        <div className="buoy-stream-footer">Symulacja · 6 parametrów</div>
      </div>

      <p className="buoy-disclaimer">
        Boja jest demonstracją koncepcji — dane, zdjęcie i lokalizacja są symulowane, nie pochodzą z
        rzeczywistego urządzenia.
      </p>
    </div>
  );
}
