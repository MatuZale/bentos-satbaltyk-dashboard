// Minimalistyczne ikony liniowe (w duchu ikon uzywanych na bentos.info) -
// zeby nie dociagac calej biblioteki ikon dla czterech znaczkow.
const common = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
};

export function ThermometerIcon() {
  return (
    <svg {...common}>
      <path d="M12 14.5V4a2 2 0 0 0-4 0v10.5a4 4 0 1 0 4 0Z" />
      <circle cx="10" cy="17" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function DropletIcon() {
  return (
    <svg {...common}>
      <path d="M12 3c3 4 6 7.5 6 11a6 6 0 1 1-12 0c0-3.5 3-7 6-11Z" />
    </svg>
  );
}

export function WavesIcon() {
  return (
    <svg {...common}>
      <path d="M2 8c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0" />
      <path d="M2 13c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0" />
      <path d="M2 18c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0" />
    </svg>
  );
}

export function CompassIcon() {
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="m14.5 9.5-2 5-3 2 2-5 3-2Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export const PRODUCT_ICONS = {
  sst: ThermometerIcon,
  chla: DropletIcon,
  swh: WavesIcon,
  mwdir: CompassIcon,
};
