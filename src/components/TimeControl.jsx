import { formatTimestamp } from "../utils/grid";

export default function TimeControl({ timestamps, index, onChange, playing, onTogglePlay }) {
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
    </div>
  );
}
