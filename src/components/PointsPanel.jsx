const PIN_LETTERS = "ABCDEFGHIJ";

export default function PointsPanel({ points, pinMode, onTogglePinMode, onRemove, onClear, onShowChart }) {
  return (
    <section className="panel points-panel">
      <div className="points-panel-head">
        <h2>Punkty pomiarowe</h2>
        {points.length > 0 && (
          <button className="points-clear" onClick={onClear}>
            wyczyść
          </button>
        )}
      </div>

      <button
        className={`points-add-btn${pinMode ? " is-armed" : ""}`}
        onClick={onTogglePinMode}
        aria-pressed={pinMode}
      >
        {pinMode ? "Kliknij na mapę… (Zakończ)" : "+ Dodaj punkt"}
      </button>

      {points.length === 0 ? (
        <p className="points-empty">
          {pinMode
            ? "Wskaż miejsce na mapie, aby dodać pierwszy punkt."
            : "Kliknij „+ Dodaj punkt”, a potem wskaż miejsce na mapie, aby porównać wartości."}
        </p>
      ) : (
        <ul className="points-list">
          {points.map((p, i) => (
            <li key={p.id} className="points-row">
              <div className="points-row-top">
                <span className="points-letter">{PIN_LETTERS[i] ?? "?"}</span>
                <span className="points-coords">
                  {p.lat.toFixed(3)}, {p.lon.toFixed(3)}
                </span>
                <button className="points-remove" onClick={() => onRemove(p.id)} aria-label="Usuń punkt">
                  ×
                </button>
              </div>
              <div className="points-row-bottom">
                <span className={`points-value${p.label ? "" : " points-value-empty"}`}>
                  {p.label ?? "brak danych"}
                </span>
                <button className="points-chart-btn" onClick={() => onShowChart(p.id)}>
                  pokaż wykres
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
