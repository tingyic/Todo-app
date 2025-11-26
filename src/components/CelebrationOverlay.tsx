import { useEffect, useRef, useState } from "react";

type Particle = {
  id: number;
  emoji: string | null;
  color: string;
  size: number;
  startX: number;
  startY: number;
  duration: number;
  delay: number; 
  control: { cx: number; cy: number; ex: number; ey: number };
  rotation: number;
  rotateVel: number; 
  scale: number;
};

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
// quadratic bezier
function quadBezier(p0: number, p1: number, p2: number, t: number) {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

function makeParticles(count = 42): Particle[] {
  const emojis = ["🎉", "✨", "🥳", "🔥", "🌟", "🎊", "⭐️", "💫"];
  const colors = ["#FF6B6B", "#FFD166", "#6BCB77", "#4D96FF", "#C77DFF", "#FF9F1C", "#00C2A8", "#FF5DA2"];
  const w = window.innerWidth;
  const h = window.innerHeight;
  const centerX = w / 2;
  const centerY = h / 3;

  const arr: Particle[] = [];
  for (let i = 0; i < count; i++) {
    // wider angular spread and larger distances
    const angle = rand(-Math.PI * 0.95, Math.PI * 0.95);
    // distance scaled to viewport: up to 60% of width, min 120
    const distance = rand(150, Math.max(220, w * 0.65));
    const ex = centerX + Math.cos(angle) * distance + rand(-140, 140);
    const ey = centerY + Math.sin(angle) * distance + rand(-120, 220);

    const cx = centerX + rand(-240, 240);
    const cy = centerY - rand(10, 260);

    const p: Particle = {
      id: i,
      emoji: Math.random() > 0.44 ? pick(emojis) : null,
      color: pick(colors),
      size: Math.round(rand(18, 56)),
      startX: centerX + rand(-22, 22),
      startY: centerY + rand(-6, 18),
      duration: rand(1.4, 2.8),
      delay: rand(0, 0.5),
      control: { cx, cy, ex, ey },
      rotation: rand(-140, 140),
      rotateVel: rand(-260, 260),
      scale: rand(0.85, 1.6),
    };
    arr.push(p);
  }
  return arr;
}

const styles = `
.celebrate-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 99999;
  overflow: visible;
}
.celebrate-center {
  position: fixed;
  left: 50%;
  top: 34%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.celebrate-fire {
  font-size: 72px;
  transform-origin: center;
  animation: floaty 1600ms ease-in-out infinite;
  filter: drop-shadow(0 10px 28px rgba(0,0,0,0.12));
}
@keyframes floaty {
  0% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-14px) scale(1.06); }
  100% { transform: translateY(0) scale(1); }
}
.celebrate-p {
  position: fixed;
  left: 0;
  top: 0;
  transform-origin: center;
  will-change: transform, opacity;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}
.confetti-rect {
  border-radius: 3px;
  box-shadow: 0 8px 20px rgba(2,6,23,0.06);
}
.celebrate-shake {
  animation: celebrate-shake 620ms cubic-bezier(.22,.9,.31,1);
}
@keyframes celebrate-shake {
  0% { transform: translateY(0) rotate(0deg); }
  12% { transform: translateY(-6px) rotate(-1deg); }
  36% { transform: translateY(8px) rotate(0.8deg); }
  60% { transform: translateY(-3px) rotate(-0.6deg); }
  100% { transform: translateY(0) rotate(0deg); }
}
`;

export default function CelebrateOverlay({ duration = 2600 }: { duration?: number }) {
  const [particles] = useState<Particle[]>(() => makeParticles());
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // short screen shake
    document.documentElement.classList.add("celebrate-shake");
    const shakeT = window.setTimeout(() => document.documentElement.classList.remove("celebrate-shake"), 420);

    const step = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;

      particles.forEach((p) => {
        const el = document.getElementById(`celebrate-p-${p.id}`);
        if (!el) return;
        const localT = Math.max(0, Math.min(1, (elapsed / 1000 - p.delay) / p.duration));
        const t = easeOutCubic(localT);

        // bezier animation
        const x = quadBezier(p.startX, p.control.cx, p.control.ex, t);
        const y = quadBezier(p.startY, p.control.cy, p.control.ey, t);

        const rot = p.rotation + p.rotateVel * (elapsed / 1000);
        const scale = p.scale * (1 + 0.12 * Math.sin(t * Math.PI * 2));

        // slower fade: keep visible until late in animation (opacity falls as (t^0.55))
        const fade = Math.max(0, 1 - Math.pow(t, 0.55));

        (el as HTMLElement).style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`;
        (el as HTMLElement).style.opacity = String(fade);
      });

      if (elapsed < duration + 900) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setVisible(false);
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(shakeT);
      document.documentElement.classList.remove("celebrate-shake");
    };
  }, [particles, duration]);

  if (!visible) return null;

  return (
    <div aria-hidden className="celebrate-overlay" style={{ pointerEvents: "none" }}>
      <style>{styles}</style>

      {/* center hero */}
      <div className="celebrate-center" role="img" aria-hidden>
        <div className="celebrate-fire">🔥</div>
      </div>

      {/* particles */}
      {particles.map((p) => {
        const baseStyle: React.CSSProperties = {
          width: p.emoji ? p.size : Math.max(8, Math.round(p.size * 0.65)),
          height: p.emoji ? p.size : Math.max(10, Math.round(p.size * 0.38)),
          left: 0,
          top: 0,
          transform: `translate(${p.startX}px, ${p.startY}px) rotate(${p.rotation}deg) scale(${p.scale})`,
          opacity: 0,
          zIndex: 100000,
          color: p.color,
          fontSize: p.emoji ? p.size : undefined,
        };

        if (p.emoji) {
          return (
            <div
              id={`celebrate-p-${p.id}`}
              className="celebrate-p"
              key={p.id}
              style={baseStyle}
            >
              <span aria-hidden>{p.emoji}</span>
            </div>
          );
        }

        return (
          <div
            id={`celebrate-p-${p.id}`}
            className="celebrate-p confetti-rect"
            key={p.id}
            style={{
              ...baseStyle,
              background: p.color,
              borderRadius: 4,
            }}
          />
        );
      })}
    </div>
  );
}
