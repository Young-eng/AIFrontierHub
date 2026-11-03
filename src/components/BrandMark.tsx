"use client";

/**
 * Dot-matrix F with Signal pulse.
 * Defaults for light chrome (ink dots); dark rail overrides via --mark-dot.
 */
export function BrandMark({ className = "", size = 36 }: { className?: string; size?: number }) {
  const dots: Array<{ c: number; r: number; fill: string; rScale?: number }> = [
    { c: 0, r: 0, fill: "var(--mark-dot-1, #1a1c22)", rScale: 1 },
    { c: 0, r: 1, fill: "var(--mark-dot-2, #2a2c32)", rScale: 0.95 },
    { c: 0, r: 2, fill: "var(--mark-dot-3, #3a3c42)", rScale: 0.92 },
    { c: 0, r: 3, fill: "var(--mark-dot-4, #4a4c52)", rScale: 0.88 },
    { c: 0, r: 4, fill: "var(--mark-dot-5, #5a5c62)", rScale: 0.85 },
    { c: 1, r: 0, fill: "var(--mark-dot-1, #1a1c22)", rScale: 1.05 },
    { c: 2, r: 0, fill: "var(--mark-dot-0, #0a0b0f)", rScale: 1.12 },
    { c: 3, r: 0, fill: "var(--mark-dot-0, #0a0b0f)", rScale: 1.2 },
    { c: 1, r: 2, fill: "var(--mark-dot-2, #2a2c32)", rScale: 0.95 },
    { c: 2, r: 2, fill: "var(--mark-dot-3, #3a3c42)", rScale: 0.92 },
    { c: 3, r: 2, fill: "var(--mark-dot-4, #4a4c52)", rScale: 0.9 },
  ];

  const cell = 20;
  const pad = 14;
  const cols = 5;
  const rows = 5;
  const w = pad * 2 + cell * cols;
  const h = pad * 2 + cell * rows;
  // Signal sits in col 4, row 0 — keep full rings inside viewBox
  const signal = { cx: pad + cell * 4 + cell / 2, cy: pad + cell / 2 };

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={pad + d.c * cell + cell / 2}
          cy={pad + d.r * cell + cell / 2}
          r={(cell / 2) * 0.62 * (d.rScale ?? 1)}
          fill={d.fill}
        />
      ))}
      <circle cx={signal.cx} cy={signal.cy} r={cell * 0.72} stroke="#FF4F2B" strokeWidth="1.2" opacity="0.35" />
      <circle cx={signal.cx} cy={signal.cy} r={cell * 0.52} stroke="#FF4F2B" strokeWidth="1.4" opacity="0.55" />
      <circle cx={signal.cx} cy={signal.cy} r={(cell / 2) * 0.72} fill="#FF4F2B" />
    </svg>
  );
}
