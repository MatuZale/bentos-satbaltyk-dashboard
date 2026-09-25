import { useEffect, useRef, useState } from "react";
import { loadPointSeries, formatTimestampShort, degToCompass } from "../utils/grid";

const WIDTH = 620;
const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 34, left: 46 };
const INNER_W = WIDTH - PAD.left - PAD.right;
const INNER_H = HEIGHT - PAD.top - PAD.bottom;

function splitSegments(series) {
  const segments = [];
  let current = [];
  for (const d of series) {
    if (d.value == null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(d);
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

function pickTickIndices(n, count) {
  if (n <= 1) return [0];
  const step = (n - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}

export default function PointChart({ point, product, entries, grid, bbox }) {
  const [series, setSeries] = useState(null); // null = ladowanie
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setSeries(null);
    loadPointSeries(entries, grid, bbox, point.lat, point.lon).then((s) => {
      if (!cancelled) setSeries(s);
    });
    return () => {
      cancelled = true;
    };
  }, [entries, grid, bbox, point.lat, point.lon]);

  if (series === null) {
    return <p className="chart-status">Ładowanie {entries.length} klatek…</p>;
  }

  const valid = series.filter((d) => d.value != null);
  if (valid.length === 0) {
    return <p className="chart-status">Brak danych dla tego punktu w dostępnym zakresie czasu.</p>;
  }

  const times = series.map((d) => new Date(d.t).getTime());
  const tMin = times[0];
  const tMax = times[times.length - 1];
  const span = tMax - tMin || 1;

  let vMin, vMax;
  if (product.circular) {
    vMin = 0;
    vMax = 360;
  } else {
    const values = valid.map((d) => d.value);
    vMin = Math.min(...values);
    vMax = Math.max(...values);
    if (vMin === vMax) {
      vMin -= 1;
      vMax += 1;
    } else {
      const pad = (vMax - vMin) * 0.12;
      vMin -= pad;
      vMax += pad;
    }
  }

  const xFor = (t) => PAD.left + ((t - tMin) / span) * INNER_W;
  const yFor = (v) => PAD.top + INNER_H - ((v - vMin) / (vMax - vMin)) * INNER_H;

  const points = series.map((d, i) => ({
    ...d,
    x: xFor(times[i]),
    y: d.value == null ? null : yFor(d.value),
  }));

  const segments = product.circular ? [] : splitSegments(points);

  const yTicks = product.circular
    ? [0, 90, 180, 270, 360]
    : Array.from({ length: 4 }, (_, i) => vMin + ((vMax - vMin) * i) / 3);

  const xTickIdx = pickTickIndices(series.length, Math.min(5, series.length));

  function handleMove(evt) {
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((evt.clientX - rect.left) / rect.width) * WIDTH;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - svgX);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHoverIdx(best);
  }

  const hover = hoverIdx != null ? points[hoverIdx] : null;

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="chart-svg"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {yTicks.map((v, i) => {
          const y = yFor(v);
          return (
            <g key={i}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} className="chart-gridline" />
              <text x={PAD.left - 8} y={y} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
                {product.circular ? degToCompass(v) : v.toFixed(1)}
              </text>
            </g>
          );
        })}

        {xTickIdx.map((i) => (
          <text
            key={i}
            x={points[i].x}
            y={HEIGHT - PAD.bottom + 18}
            className="chart-axis-label"
            textAnchor="middle"
          >
            {formatTimestampShort(series[i].t)}
          </text>
        ))}

        {product.circular
          ? points
              .filter((p) => p.value != null)
              .map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3.5} className="chart-dot" />)
          : segments.map((seg, i) => (
              <g key={i}>
                <path
                  d={`M${seg.map((d) => `${xFor(new Date(d.t).getTime())},${yFor(d.value)}`).join(" L")}`}
                  fill="none"
                  className="chart-line"
                />
                <path
                  d={`M${seg
                    .map((d) => `${xFor(new Date(d.t).getTime())},${yFor(d.value)}`)
                    .join(" L")} L${xFor(new Date(seg[seg.length - 1].t).getTime())},${PAD.top + INNER_H} L${xFor(
                    new Date(seg[0].t).getTime()
                  )},${PAD.top + INNER_H} Z`}
                  className="chart-area"
                />
              </g>
            ))}

        {hover && (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={PAD.top}
            y2={PAD.top + INNER_H}
            className="chart-crosshair"
          />
        )}
        {hover && hover.value != null && <circle cx={hover.x} cy={hover.y} r={4.5} className="chart-hover-dot" />}
      </svg>

      {hover && (
        <div className="chart-tooltip" style={{ left: `${(hover.x / WIDTH) * 100}%` }}>
          <div className="chart-tooltip-time">{formatTimestampShort(hover.t)}</div>
          <div className="chart-tooltip-value">
            {hover.value == null
              ? "brak danych"
              : product.circular
              ? `${hover.value.toFixed(0)}° (${degToCompass(hover.value)})`
              : `${hover.value.toFixed(2)} ${product.unit}`}
          </div>
        </div>
      )}
    </div>
  );
}
