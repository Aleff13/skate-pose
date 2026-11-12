import type { Hsl, P } from "./data";
import { HEIGHT, WIDTH, hsl } from "./data";

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- fundo: malha triangulada que respira ---------- */
const COLS = 17;
const ROWS = 10;
const CW = WIDTH / (COLS - 1);
const CH = HEIGHT / (ROWS - 1);

const meshPoints = (() => {
  const r = rng(7);
  const pts: { x: number; y: number; ph: number }[] = [];
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) {
      const edgeX = i === 0 || i === COLS - 1;
      const edgeY = j === 0 || j === ROWS - 1;
      pts.push({
        x: i * CW + (edgeX ? 0 : (r() - 0.5) * CW * 0.7),
        y: j * CH + (edgeY ? 0 : (r() - 0.5) * CH * 0.7),
        ph: r() * Math.PI * 2,
      });
    }
  return pts;
})();
const meshTris = (() => {
  const r = rng(21);
  const out: { a: number; b: number; c: number; v: number; ph: number }[] = [];
  for (let j = 0; j < ROWS - 1; j++)
    for (let i = 0; i < COLS - 1; i++) {
      const p00 = j * COLS + i, p10 = p00 + 1, p01 = p00 + COLS, p11 = p01 + 1;
      const flip = (i + j) % 2 === 0;
      const tris = flip ? [[p00, p10, p11], [p00, p11, p01]] : [[p00, p10, p01], [p10, p11, p01]];
      for (const [a, b, c] of tris) out.push({ a: a!, b: b!, c: c!, v: r(), ph: r() * Math.PI * 2 });
    }
  return out;
})();

export const Mesh = ({ frame }: { frame: number }) => {
  const pos = meshPoints.map((p) => [p.x + Math.sin(frame / 70 + p.ph) * 9, p.y + Math.cos(frame / 85 + p.ph) * 9] as P);
  return (
    <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", inset: 0 }}>
      {meshTris.map((t, k) => {
        const [a, b, c] = [pos[t.a]!, pos[t.b]!, pos[t.c]!];
        const cx = (a[0] + b[0] + c[0]) / 3 / WIDTH;
        const cy = (a[1] + b[1] + c[1]) / 3 / HEIGHT;
        const hue = 228 + cx * 48 - cy * 10;
        const light = 9 + (1 - cy) * 5 + cx * 3 + t.v * 6 + Math.sin(frame / 45 + t.ph) * 1.6;
        const fill = `hsl(${hue} 55% ${light}%)`;
        return <polygon key={k} points={`${a},${b},${c}`} fill={fill} stroke={fill} strokeWidth={0.7} />;
      })}
    </svg>
  );
};

/* ---------- nó facetado ---------- */
function facets(seed: number, R: number) {
  const r = rng(seed);
  const outer = [...Array(6)].map((_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const rr = R * (0.95 + r() * 0.09);
    return [Math.cos(a) * rr, Math.sin(a) * rr] as P;
  });
  const inner = [...Array(6)].map((_, i) => {
    const a = (Math.PI / 3) * i;
    const rr = R * 0.5 * (0.9 + r() * 0.2);
    return [Math.cos(a) * rr, Math.sin(a) * rr] as P;
  });
  const c: P = [(r() - 0.5) * R * 0.12, (r() - 0.5) * R * 0.12];
  const tris: P[][] = [];
  for (let i = 0; i < 6; i++) {
    tris.push([c, inner[i]!, inner[(i + 1) % 6]!]);
    tris.push([inner[i]!, outer[i]!, outer[(i + 1) % 6]!]);
    tris.push([inner[i]!, inner[(i + 1) % 6]!, outer[(i + 1) % 6]!]);
  }
  const shaded = tris.map((t) => {
    const mx = (t[0]![0] + t[1]![0] + t[2]![0]) / 3;
    const my = (t[0]![1] + t[1]![1] + t[2]![1]) / 3;
    const ang = Math.atan2(my, mx);
    return { pts: t, f: 0.72 + 0.42 * Math.cos(ang + 2.35) + (r() - 0.5) * 0.16 };
  });
  return { shaded, outer };
}
const facetCache = new Map<string, ReturnType<typeof facets>>();
const getFacets = (key: string, seed: number, R: number) => {
  const k = `${key}-${R}`;
  if (!facetCache.has(k)) facetCache.set(k, facets(seed, R));
  return facetCache.get(k)!;
};

const Glyph = ({ id }: { id: string }) => {
  const s = { stroke: "white", strokeWidth: 3.4, fill: "none", strokeLinejoin: "round", strokeLinecap: "round" } as const;
  switch (id) {
    case "browser":
      return <g {...s}><polygon points="-28,-20 28,-20 28,20 -28,20" /><line x1={-28} y1={-8} x2={28} y2={-8} /><circle cx={-19} cy={-14} r={0.5} /><circle cx={-11} cy={-14} r={0.5} /></g>;
    case "api":
      return <g {...s}><polyline points="-8,-22 -22,0 -8,22" /><polyline points="8,-22 22,0 8,22" /></g>;
    case "cognito":
      return <g {...s}><polygon points="-20,-4 20,-4 20,24 -20,24" /><polyline points="-12,-4 -12,-16 -5,-24 5,-24 12,-16 12,-4" /></g>;
    case "ddb":
      return <g {...s}><polygon points="-24,-16 -12,-24 12,-24 24,-16 12,-8 -12,-8" /><polyline points="-24,-16 -24,16 -12,24 12,24 24,16 24,-16" /><polyline points="-24,0 -12,8 12,8 24,0" /></g>;
    case "s3":
      return <g {...s}><polygon points="-26,-16 26,-16 20,24 -20,24" /><polygon points="-26,-16 -12,-26 12,-26 26,-16 12,-8 -12,-8" /></g>;
    case "sqs":
      return <g {...s}><polygon points="-30,-10 -14,-10 -14,10 -30,10" /><polygon points="-8,-10 8,-10 8,10 -8,10" /><polygon points="14,-10 30,-10 30,10 14,10" /><polyline points="-26,22 26,22 18,16" /></g>;
    default:
      return <g {...s}><polygon points="0,-26 8,-18 18,-20 20,-10 28,-4 22,4 26,14 16,16 10,26 0,20 -10,26 -16,16 -26,14 -22,4 -28,-4 -20,-10 -18,-20 -8,-18" /><circle cx={0} cy={0} r={8} /></g>;
  }
};

export const LowPolyNode = ({ id, seed, color, scale = 1, R = 78 }: { id: string; seed: number; color: Hsl; scale?: number; R?: number }) => {
  const { shaded, outer } = getFacets(id, seed, R);
  return (
    <g transform={`scale(${scale})`}>
      {shaded.map((t, k) => {
        const fill = hsl(color, t.f);
        return <polygon key={k} points={t.pts.map((p) => p.join(",")).join(" ")} fill={fill} stroke={fill} strokeWidth={0.8} />;
      })}
      <polygon points={outer.map((p) => p.join(",")).join(" ")} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.6} />
      <Glyph id={id} />
    </g>
  );
};

/* ---------- esqueleto low poly (passo do MoveNet) ---------- */
const BONES: [string, string, "l" | "r" | "c"][] = [
  ["neck", "head", "c"], ["neck", "shL", "l"], ["neck", "shR", "r"], ["shL", "elL", "l"], ["elL", "wrL", "l"],
  ["shR", "elR", "r"], ["elR", "wrR", "r"], ["shL", "hipL", "l"], ["shR", "hipR", "r"], ["hipL", "hipR", "c"],
  ["hipL", "knL", "l"], ["knL", "anL", "l"], ["hipR", "knR", "r"], ["knR", "anR", "r"],
];
export const Skeleton = ({ frame, scale = 1 }: { frame: number; scale?: number }) => {
  const c = (Math.sin(frame / 11) + 1) / 2; // 0 = em pé, 1 = agachado/salto
  const w = Math.sin(frame / 11) * 9;
  const J: Record<string, P> = {
    head: [0, -112 + c * 8], neck: [0, -86 + c * 10], shL: [-27, -80 + c * 10], shR: [27, -80 + c * 10],
    elL: [-54 + w, -50 + c * 8], elR: [54 - w, -54 + c * 8], wrL: [-66 + w * 1.5, -20 + c * 6], wrR: [68 - w * 1.5, -28 + c * 6],
    hipL: [-16, -8 + c * 22], hipR: [16, -8 + c * 22], knL: [-30 - c * 8, 36 - c * 4], knR: [34 + c * 8, 32 - c * 4],
    anL: [-30, 82], anR: [34, 80],
  };
  const col = { l: "hsl(188 100% 62%)", r: "hsl(4 100% 66%)", c: "hsl(48 100% 60%)" };
  const lift = -c * 26;
  return (
    <g transform={`scale(${scale}) translate(0 ${lift})`}>
      <polygon points="-72,96 72,90 66,104 -66,110" fill="hsl(28 90% 52%)" />
      <polygon points="-72,96 72,90 0,100" fill="hsl(28 95% 66%)" />
      {BONES.map(([a, b, side], k) => (
        <line key={k} x1={J[a]![0]} y1={J[a]![1]} x2={J[b]![0]} y2={J[b]![1]} stroke={col[side]} strokeWidth={5} strokeLinecap="round" />
      ))}
      {Object.entries(J).map(([k, [x, y]]) => {
        const side = k.endsWith("L") ? "l" : k.endsWith("R") ? "r" : "c";
        return (
          <g key={k}>
            <polygon points={`${x},${y - 8} ${x + 8},${y} ${x},${y + 8} ${x - 8},${y}`} fill={col[side]} />
            <polygon points={`${x},${y - 8} ${x + 8},${y} ${x},${y}`} fill="rgba(255,255,255,0.35)" />
          </g>
        );
      })}
    </g>
  );
};
