import { getLocalHour } from "../utils/simulate";

const W = 400;
const H = 220;
const HORIZON = 132;

const STARS = [
  [30, 24], [70, 40], [110, 18], [160, 50], [200, 22], [240, 44], [280, 16], [320, 36], [360, 26], [50, 60],
  [140, 66], [230, 62], [310, 60], [90, 34], [190, 34],
];

function skyPalette(hour) {
  if (hour >= 21 || hour < 5) return { top: "#01040f", bottom: "#061225", body: "moon" };
  if (hour >= 5 && hour < 7) return { top: "#1b2a52", bottom: "#ff9a5a", body: "sun" };
  if (hour >= 17 && hour < 20) return { top: "#241a4a", bottom: "#ff7a59", body: "sun" };
  return { top: "#2e6fa8", bottom: "#a9d8e6", body: "sun" };
}

function seaPalette(hour) {
  if (hour >= 21 || hour < 5) return ["#020a17", "#050f22"];
  if ((hour >= 5 && hour < 7) || (hour >= 17 && hour < 20)) return ["#1c3450", "#2c4d63"];
  return ["#155276", "#1f7a91"];
}

export default function BuoyCamera({ timestampIso }) {
  const hour = getLocalHour(timestampIso);
  const sky = skyPalette(hour);
  const [seaTop, seaBottom] = seaPalette(hour);

  const dip = Math.min(Math.abs(hour - 12) / 8, 1);
  const bodyX = 40 + (hour / 24) * (W - 80);
  const bodyY = 30 + dip * 85;

  const uid = `${timestampIso ?? "x"}`;

  return (
    <div className="buoy-camera">
      <svg viewBox={`0 0 ${W} ${H}`} className="buoy-camera-svg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={sky.top} />
            <stop offset="100%" stopColor={sky.bottom} />
          </linearGradient>
          <linearGradient id={`sea-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={seaTop} />
            <stop offset="100%" stopColor={seaBottom} />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={W} height={HORIZON} fill={`url(#sky-${uid})`} />

        {sky.body === "moon" ? (
          <>
            {STARS.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={1.1} fill="#ffffff" opacity={0.8} />
            ))}
            <circle cx={bodyX} cy={Math.min(bodyY, 60)} r="14" fill="#eef2f6" opacity="0.95" />
          </>
        ) : (
          <circle cx={bodyX} cy={bodyY} r="16" fill="#fff2c9" opacity="0.95" />
        )}

        <rect x="0" y={HORIZON} width={W} height={H - HORIZON} fill={`url(#sea-${uid})`} />
        <path
          d={`M0,${HORIZON + 14} Q 30,${HORIZON + 6} 60,${HORIZON + 14} T 120,${HORIZON + 14} T 180,${
            HORIZON + 14
          } T 240,${HORIZON + 14} T 300,${HORIZON + 14} T 360,${HORIZON + 14} T ${W},${HORIZON + 14}`}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.5"
        />
        <path
          d={`M0,${HORIZON + 34} Q 40,${HORIZON + 26} 80,${HORIZON + 34} T 160,${HORIZON + 34} T 240,${
            HORIZON + 34
          } T 320,${HORIZON + 34} T ${W},${HORIZON + 34}`}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1.5"
        />

        {/* Ramka OSD jak w prawdziwej kamerze przemyslowej */}
        <path d="M10,10 h18 M10,10 v18" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" fill="none" />
        <path
          d={`M${W - 10},10 h-18 M${W - 10},10 v18`}
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.5"
          fill="none"
        />
        <path d="M10,210 h18 M10,210 v-18" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" fill="none" />
        <path
          d={`M${W - 10},210 h-18 M${W - 10},210 v-18`}
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>
      <div className="buoy-camera-osd">
        <span>REC ●</span>
        <span>SYMULACJA — brak rzeczywistej kamery</span>
      </div>
    </div>
  );
}
