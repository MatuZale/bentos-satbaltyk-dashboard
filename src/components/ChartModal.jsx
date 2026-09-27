import { useEffect } from "react";
import PointChart from "./PointChart";
import { useI18n } from "../i18n";

const PIN_LETTERS = "ABCDEFGHIJ";

export default function ChartModal({ point, pointIndex, product, entries, grid, bbox, onClose }) {
  const { t } = useI18n();
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="points-letter modal-letter">{PIN_LETTERS[pointIndex] ?? "?"}</span>
            <span className="modal-title">{product.label}</span>
            <div className="modal-subtitle">
              {point.lat.toFixed(3)}, {point.lon.toFixed(3)} · {entries.length}{" "}
              {t(entries.length === 1 ? "chart.frame.one" : "chart.frame.many")} {t("chart.range")}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
            ×
          </button>
        </div>

        <PointChart point={point} product={product} entries={entries} grid={grid} bbox={bbox} />
      </div>
    </div>
  );
}
