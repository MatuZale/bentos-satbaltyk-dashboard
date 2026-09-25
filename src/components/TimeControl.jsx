import { formatTimestamp } from "../utils/grid";

const SPEEDS = [0.5, 1, 2, 4];

export default function TimeControl({ timestamps, index, onChange, playing, onTogglePlay, speed, onSpeedChange }) {
  const entry = timestamps[index];

  return (
    <div className="time-control">
      <div className="time-control-row">
        <button
          className="play-btn"
          onClick={onTogglePlay}
          aria-label={playing ? "Zatrzymaj animację" : "Odtwórz animację"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={timestamps.length - 1}
          value={index}
          onChange={(e) => onChange(Number(e.target.value))}
          className="time-slider"
        />
      </div>
      <div className="time-label">
        {entry ? formatTimestamp(entry.t) : "—"}
        <span className="time-label-tz"> (czas lokalny)</span>
      </div>
      <div className="speed-row">
        <span className="speed-label">Tempo</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`speed-btn${speed === s ? " is-active" : ""}`}
            onClick={() => onSpeedChange(s)}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
