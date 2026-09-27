import { useEffect, useRef } from "react";

const BASE = import.meta.env.BASE_URL;
const RAYS = [
  { left: "6%", delay: 0, duration: 12 },
  { left: "40%", delay: 3.4, duration: 14 },
  { left: "72%", delay: 5.1, duration: 16 },
];

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Drobinki dryfujace w toni - ta sama mechanika co canvas w hero bentos.info.
function startParticles(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let particles = [];
  let raf = 0;

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(40, Math.floor((w * h) / 6000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.5 + Math.random() * 1.6,
      vy: 0.06 + Math.random() * 0.25,
      vx: (Math.random() - 0.5) * 0.12,
      a: 0.2 + Math.random() * 0.45,
    }));
  }

  function frame() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.y += p.vy;
      p.x += p.vx + Math.sin((p.y + p.x) * 0.01) * 0.08;
      if (p.y > h + 4) {
        p.y = -4;
        p.x = Math.random() * w;
      }
      if (p.x < -4) p.x = w + 4;
      if (p.x > w + 4) p.x = -4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220, 240, 255, ${p.a})`;
      ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  frame();
  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
  };
}

// Tlo gornej czesci panelu: tafla wody (wideo z hero bentos.info) + promienie
// i drobinki, wygaszane maska w jednolity gradient panelu. `active` = panel
// widoczny; schowany nie zjada CPU/GPU na niewidoczna animacje.
export default function SidebarWater({ active }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (active && !prefersReducedMotion()) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [active]);

  useEffect(() => {
    if (!active || prefersReducedMotion()) return;
    return startParticles(canvasRef.current);
  }, [active]);

  return (
    <div className="sidebar-water" aria-hidden="true">
      <video
        ref={videoRef}
        className="sidebar-water-video"
        src={`${BASE}brand/sidebar-water.mp4`}
        poster={`${BASE}brand/sidebar-water.jpg`}
        muted
        loop
        playsInline
        preload="metadata"
      />
      <div className="sidebar-water-tint" />
      <div className="sidebar-water-rays">
        {RAYS.map((ray) => (
          <span
            key={ray.left}
            className="sidebar-water-ray"
            style={{ left: ray.left, animationDelay: `${ray.delay}s`, animationDuration: `${ray.duration}s` }}
          />
        ))}
      </div>
      <canvas ref={canvasRef} className="sidebar-water-particles" />
    </div>
  );
}
