// Prosty, deterministyczny generator liczb pseudolosowych (mulberry32) -
// zeby symulowane odczyty boi byly stabilne dla danego (boja, znacznik czasu)
// zamiast migotac losowo przy kazdym renderze, ale i tak zmienialy sie
// w czasie tak jak prawdziwy sensor by sie zmienial.
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRandom(seedStr) {
  const rng = mulberry32(hashSeed(seedStr));
  return (min, max) => min + rng() * (max - min);
}

// Symulowane odczyty "telemetrii" boi - nie pochodza z rzeczywistego czujnika,
// to demonstracja tego, jakiego rodzaju dane taka boja mogłaby przesyłać.
export function simulateBuoyReading(buoyId, timestampIso) {
  const rand = seededRandom(`${buoyId}::${timestampIso ?? "now"}`);
  return {
    waterTemp: rand(11, 19),
    waveHeight: rand(0.1, 1.3),
    windDir: rand(0, 360),
    windSpeed: rand(3, 28),
    pressure: rand(995, 1030),
    battery: Math.round(rand(58, 100)),
    signal: Math.max(1, Math.round(rand(1, 5))),
  };
}

export function getLocalHour(iso) {
  if (!iso) return 12;
  return Number(
    new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", hour12: false }).format(
      new Date(iso)
    )
  );
}
