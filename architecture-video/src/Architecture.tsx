import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import {
  EDGES, FPS, HEIGHT, INTRO, NODES, OUTRO_START, OVERVIEW, PIPELINE, R, STACK, STEPS, STEP_START, WIDTH,
  edge, hsl, node, quad,
  type EdgeDef, type Leg, type NodeDef, type NodeId, type P,
} from "./data";
import { LowPolyNode, Mesh, Skeleton } from "./lowpoly";

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
const MONO = '"SF Mono", Menlo, Consolas, monospace';
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = Easing.inOut(Easing.cubic);
const nodeColor = (id: NodeId) => node(id).color;

/** Em que fase do vídeo estamos. */
function phaseOf(frame: number) {
  if (frame < INTRO) return { kind: "intro" as const };
  if (frame < INTRO + OVERVIEW) return { kind: "overview" as const, local: frame - INTRO };
  if (frame >= OUTRO_START) return { kind: "outro" as const, local: frame - OUTRO_START };
  let k = STEPS.length - 1;
  while (STEP_START[k]! > frame) k--;
  return { kind: "step" as const, index: k, local: frame - STEP_START[k]! };
}

const chamfer = (c: number) =>
  `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;

const Panel = ({ style, children, accent = "rgba(255,255,255,0.28)" }: { style: CSSProperties; children: ReactNode; accent?: string }) => (
  <div style={{ position: "absolute", clipPath: chamfer(26), background: accent, padding: 2, ...style }}>
    <div style={{ width: "100%", height: "100%", clipPath: chamfer(25), background: "linear-gradient(160deg, rgba(14,20,52,0.9), rgba(8,12,34,0.88))", padding: "26px 30px", color: "white" }}>
      {children}
    </div>
  </div>
);

export const Architecture = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ph = phaseOf(frame);

  // ----- visibilidade do diagrama -----
  const diagramIn = interpolate(frame, [INTRO - 22, INTRO + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const outroDim = ph.kind === "outro" ? interpolate(ph.local, [0, 25], [1, 0.07], { extrapolateRight: "clamp" }) : 1;
  const diagramOpacity = diagramIn * outroDim;

  // ----- nós: quando aparecem -----
  const appearAt = (id: NodeId) => INTRO + 10 + NODES.findIndex((n) => n.id === id) * 26;
  const step = ph.kind === "step" ? STEPS[ph.index]! : null;
  const activeNodes = new Set<NodeId>(step?.nodes ?? []);
  const activeEdges = new Map<string, Leg[]>();
  step?.legs.forEach((l) => activeEdges.set(l.edge, [...(activeEdges.get(l.edge) ?? []), l]));

  return (
    <AbsoluteFill style={{ background: "#0a0f26", fontFamily: FONT, overflow: "hidden" }}>
      <Mesh frame={frame} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 40%, rgba(2,4,18,0.55) 100%)" }} />

      {/* ================= diagrama ================= */}
      <AbsoluteFill style={{ opacity: diagramOpacity }}>
        <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", inset: 0 }}>
          {/* contêiner do emulador */}
          <EmulatorFrame frame={frame} />

          {/* arestas */}
          {EDGES.map((e) => {
            const from = node(e.from).pos, to = node(e.to).pos;
            const drawAt = Math.max(appearAt(e.from), appearAt(e.to)) + 8;
            const draw = clamp01((frame - drawAt) / 26);
            const legs = activeEdges.get(e.id);
            const on = !!legs && ph.kind === "step";
            const tone = legs ? nodeColor(legs[0]!.tone ?? (legs[0]!.rev ? e.to : e.from)) : null;
            const d = `M ${from[0]} ${from[1]} Q ${e.ctrl[0]} ${e.ctrl[1]} ${to[0]} ${to[1]}`;
            const dimmed = ph.kind === "step" && !on;
            return (
              <g key={e.id} opacity={dimmed ? 0.45 : 1}>
                <path d={d} fill="none" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - draw} stroke="rgba(255,255,255,0.2)" strokeWidth={3.5} strokeLinecap="round" />
                {on && tone && (
                  <>
                    <path d={d} fill="none" stroke={hsl(tone, 1, 0.22)} strokeWidth={13} strokeLinecap="round" />
                    <path d={d} fill="none" stroke={hsl(tone, 1.15)} strokeWidth={4} strokeLinecap="round" strokeDasharray="16 12" strokeDashoffset={-frame * 1.6} />
                  </>
                )}
              </g>
            );
          })}

          {/* nós */}
          {NODES.map((n, i) => {
            const a = spring({ frame: frame - appearAt(n.id), fps, config: { damping: 13, stiffness: 110 } });
            const isOn = activeNodes.has(n.id);
            const act = step && ph.kind === "step" ? spring({ frame: ph.local, fps, config: { damping: 14, stiffness: 130 } }) * (isOn ? 1 : 0) : 0;
            const dim = step && !isOn ? 0.48 : 1;
            const bob = Math.sin(frame / 26 + i * 1.7) * 4;
            const s = (0.25 + 0.75 * a) * (1 + act * 0.1);
            return (
              <g key={n.id} transform={`translate(${n.pos[0]} ${n.pos[1] + bob})`} opacity={clamp01(a * 1.4) * dim}>
                {act > 0.01 && <circle r={R * 1.9} fill={hsl(n.color, 1, 0.16 * act)} />}
                <LowPolyNode id={n.id} seed={100 + i * 13} color={n.color} scale={s} R={R} />
              </g>
            );
          })}

          {/* pulsos de chegada e pacotes */}
          {step && ph.kind === "step" && step.legs.map((l, k) => <PacketGfx key={k} leg={l} local={ph.local} />)}

          {/* esqueleto (passo do MoveNet) */}
          {step?.pipeline && ph.kind === "step" && (
            <g transform="translate(790 850)" opacity={interpolate(ph.local, [4, 24], [0, 1], { extrapolateRight: "clamp" })}>
              <Skeleton frame={ph.local} scale={0.95} />
            </g>
          )}
        </svg>

        {/* rótulos dos nós */}
        {NODES.map((n, i) => <NodeLabel key={n.id} n={n} frame={frame} appear={appearAt(n.id)} fps={fps} dim={step && !activeNodes.has(n.id) ? 0.55 : 1} i={i} />)}

        {/* etiquetas dos pacotes */}
        {step && ph.kind === "step" && step.legs.map((l, k) => <PacketLabel key={k} leg={l} local={ph.local} />)}

        {/* rótulo do contêiner */}
        <div style={{ position: "absolute", left: 952, top: 748, color: "rgba(255,255,255,0.78)", fontSize: 20, letterSpacing: 2, fontWeight: 700, opacity: clamp01((frame - INTRO - 20) / 20) }}>
          AWS EMULATOR <span style={{ opacity: 0.6, fontWeight: 500 }}>· Docker · :9297</span>
        </div>

        {/* esteira do pipeline */}
        {step?.pipeline && ph.kind === "step" && <PipelineStrip local={ph.local} />}
      </AbsoluteFill>

      {/* ================= textos de cada fase ================= */}
      {frame < INTRO + 12 && <Intro frame={frame} />}
      {ph.kind === "overview" && <Caption key="ov" k="ov" local={ph.local} badge="★" title="Visão geral" desc="O AWS Emulator (Docker) simula Cognito, DynamoDB, S3 e SQS. A API em Node/TypeScript orquestra tudo; um worker separado faz o trabalho pesado de visão computacional." code="navegador → API → serviços AWS ← worker" />}
      {ph.kind === "step" && step && <Caption key={ph.index} k={String(ph.index)} local={ph.local} badge={String(ph.index + 1)} title={step.title} desc={step.desc} code={step.code} progress={ph.index} />}
      {ph.kind === "outro" && <Outro local={ph.local} fps={fps} />}

      <TopBar frame={frame} />
    </AbsoluteFill>
  );
};

/* ---------- peças ---------- */
const EmulatorFrame = ({ frame }: { frame: number }) => {
  const x0 = 920, y0 = 110, x1 = 1880, y1 = 800, c = 46;
  const pts = `${x0 + c},${y0} ${x1},${y0} ${x1},${y1 - c} ${x1 - c},${y1} ${x0},${y1} ${x0},${y0 + c}`;
  const a = clamp01((frame - INTRO - 4) / 24);
  return (
    <g opacity={a}>
      <polygon points={pts} fill="rgba(255,255,255,0.045)" />
      <polygon points={pts} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={2.5} strokeDasharray="14 10" strokeDashoffset={-frame * 0.5} />
    </g>
  );
};

const NodeLabel = ({ n, frame, appear, fps, dim, i }: { n: NodeDef; frame: number; appear: number; fps: number; dim: number; i: number }) => {
  const a = spring({ frame: frame - appear - 6, fps, config: { damping: 18, stiffness: 120 } });
  const bob = Math.sin(frame / 26 + i * 1.7) * 4;
  const [x, y] = n.pos;
  const pos: CSSProperties =
    n.label === "above" ? { left: x, top: y - R - 12 + bob, transform: "translate(-50%, -100%)", textAlign: "center" }
    : n.label === "right" ? { left: x + R + 20, top: y + bob, transform: "translate(0, -50%)", textAlign: "left" }
    : { left: x, top: y + R + 12 + bob, transform: "translate(-50%, 0)", textAlign: "center" };
  return (
    <div style={{ position: "absolute", ...pos, opacity: clamp01(a) * dim, color: "white", textShadow: "0 2px 12px rgba(0,0,0,0.85)", whiteSpace: "nowrap" }}>
      <div style={{ fontSize: 32, fontWeight: 800, color: hsl(n.color, 1.25) }}>{n.name}</div>
      <div style={{ fontSize: 20, opacity: 0.78, marginTop: 2 }}>{n.sub}</div>
    </div>
  );
};

const legPos = (leg: Leg, t: number): P => {
  const e: EdgeDef = edge(leg.edge);
  const a = node(e.from).pos, b = node(e.to).pos;
  return leg.rev ? quad(b, e.ctrl, a, t) : quad(a, e.ctrl, b, t);
};
const legTone = (leg: Leg) => nodeColor(leg.tone ?? (leg.rev ? edge(leg.edge).to : edge(leg.edge).from));
const legDest = (leg: Leg): NodeId => (leg.rev ? edge(leg.edge).from : edge(leg.edge).to);

const PacketGfx = ({ leg, local }: { leg: Leg; local: number }) => {
  const t = ease(clamp01((local - leg.at) / leg.dur));
  const tone = legTone(leg);
  const out: ReactNode[] = [];
  if (local >= leg.at && local < leg.at + leg.dur + 10) {
    const fade = local > leg.at + leg.dur ? 1 - (local - leg.at - leg.dur) / 10 : 1;
    // rastro
    for (let k = 5; k >= 1; k--) {
      const [tx, ty] = legPos(leg, Math.max(0, t - k * 0.022));
      out.push(<polygon key={`t${k}`} points={`${tx},${ty - 7} ${tx + 7},${ty} ${tx},${ty + 7} ${tx - 7},${ty}`} fill={hsl(tone, 1.1, 0.12 * (6 - k) * fade)} />);
    }
    const [x, y] = legPos(leg, t);
    out.push(
      <g key="p" transform={`translate(${x} ${y}) rotate(${t * 220})`} opacity={fade}>
        <polygon points="0,-17 17,0 0,17 -17,0" fill={hsl(tone, 1.15)} stroke="white" strokeWidth={2} />
        <polygon points="0,-17 17,0 0,0" fill="rgba(255,255,255,0.45)" />
        <polygon points="0,17 -17,0 0,0" fill="rgba(0,0,0,0.22)" />
      </g>,
    );
  }
  // pulso na chegada
  const p = (local - (leg.at + leg.dur)) / 22;
  if (p > 0 && p < 1) {
    const [dx, dy] = node(legDest(leg)).pos;
    out.push(<circle key="pulse" cx={dx} cy={dy} r={R * (1.05 + p * 0.75)} fill="none" stroke={hsl(tone, 1.2, (1 - p) * 0.9)} strokeWidth={5 * (1 - p) + 1} />);
  }
  return <>{out}</>;
};

const PacketLabel = ({ leg, local }: { leg: Leg; local: number }) => {
  if (local < leg.at - 4 || local > leg.at + leg.dur + 14) return null;
  const t = ease(clamp01((local - leg.at) / leg.dur));
  const [x, y] = legPos(leg, t);
  const tone = legTone(leg);
  const a = Math.min(clamp01((local - leg.at + 4) / 8), local > leg.at + leg.dur ? 1 - (local - leg.at - leg.dur) / 14 : 1);
  const w = leg.label.length * 11.2 + 34;
  const left = Math.max(w / 2 + 16, Math.min(WIDTH - w / 2 - 16, x));
  return (
    <div style={{
      position: "absolute", left, top: y - 82, transform: "translate(-50%, 0)", opacity: a, whiteSpace: "nowrap",
      background: "rgba(8,12,34,0.92)", border: `2px solid ${hsl(tone, 1.15)}`, color: "white", fontFamily: MONO, fontSize: 20,
      padding: "5px 14px", clipPath: chamfer(9), boxShadow: `0 0 24px ${hsl(tone, 1, 0.35)}`,
    }}>
      {leg.label}
    </div>
  );
};

const PipelineStrip = ({ local }: { local: number }) => {
  const W = 118, G = 8, x0 = 612;
  return (
    <>
      {PIPELINE.map((label, i) => {
        const start = 8 + i * 22;
        const on = clamp01((local - start) / 10);
        const done = local > start + 22;
        const c = node("worker").color;
        return (
          <div key={label} style={{
            position: "absolute", left: x0 + i * (W + G), top: 1004, width: W, height: 44, display: "grid", placeItems: "center",
            clipPath: chamfer(10), fontSize: 15, fontWeight: 700, textAlign: "center", lineHeight: 1.1, padding: "0 6px",
            background: on > 0 ? hsl(c, done ? 0.7 : 1.1, 0.25 + 0.75 * on) : "rgba(255,255,255,0.1)", color: "white", opacity: 0.35 + 0.65 * Math.max(on, 0),
          }}>
            {label}
          </div>
        );
      })}
    </>
  );
};

const Caption = ({ k, local, badge, title, desc, code, progress }: { k: string; local: number; badge: string; title: string; desc: string; code: string; progress?: number }) => {
  const a = clamp01(local / 14);
  return (
    <Panel style={{ left: 60, top: 640, width: 520, height: 390, opacity: a, transform: `translateY(${(1 - a) * 14}px)` }}>
      <div key={k} style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 54, height: 54, display: "grid", placeItems: "center", fontSize: 28, fontWeight: 800, background: "hsl(211 100% 62%)", clipPath: "polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%)" }}>{badge}</div>
        <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.1 }}>{title}</div>
      </div>
      <div style={{ fontSize: 23, lineHeight: 1.42, marginTop: 18, color: "rgba(255,255,255,0.88)" }}>{desc}</div>
      <div style={{ fontFamily: MONO, fontSize: 18, marginTop: 16, color: "hsl(188 100% 68%)" }}>{code}</div>
      {progress !== undefined && (
        <div style={{ position: "absolute", left: 30, bottom: 22, display: "flex", gap: 8 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ width: 14, height: 14, transform: "rotate(45deg)", background: i === progress ? "hsl(48 100% 62%)" : i < progress ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.2)" }} />
          ))}
        </div>
      )}
    </Panel>
  );
};

const TopBar = ({ frame }: { frame: number }) => (
  <div style={{ position: "absolute", left: 60, top: 40, display: "flex", alignItems: "center", gap: 14, opacity: clamp01((frame - 20) / 25) * (frame < INTRO ? 0 : 1) }}>
    <svg width={34} height={34} viewBox="0 0 32 32"><polygon points="16,1 29,8.5 29,23.5 16,31 3,23.5 3,8.5" fill="hsl(211 100% 62%)" /><polygon points="16,1 29,8.5 16,16" fill="rgba(255,255,255,0.35)" /><polygon points="13,10.5 22,16 13,21.5" fill="white" /></svg>
    <div style={{ color: "white", fontSize: 26, fontWeight: 800, letterSpacing: 1 }}>SKATE POSE <span style={{ fontWeight: 500, opacity: 0.6 }}>· arquitetura</span></div>
  </div>
);

const Intro = ({ frame }: { frame: number }) => {
  const { fps } = useVideoConfig();
  const a = spring({ frame, fps, config: { damping: 15, stiffness: 90 } });
  const out = interpolate(frame, [INTRO - 22, INTRO + 10], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ display: "grid", placeContent: "center", textAlign: "center", opacity: out, color: "white" }}>
      <svg width={220} height={220} viewBox="-110 -110 220 220" style={{ margin: "0 auto", transform: `scale(${0.4 + 0.6 * a}) rotate(${(1 - a) * 40}deg)` }}>
        <LowPolyNode id="browser" seed={5} color={[211, 100, 66]} R={100} />
      </svg>
      <div style={{ fontSize: 124, fontWeight: 900, letterSpacing: -3, marginTop: 8, opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>Skate Pose</div>
      <div style={{ fontSize: 38, opacity: 0.8 * a, marginTop: 6 }}>Do upload ao esqueleto de movimento: como a arquitetura funciona hoje</div>
    </AbsoluteFill>
  );
};

const Outro = ({ local, fps }: { local: number; fps: number }) => {
  const titleA = clamp01((local - 8) / 18);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: 120, textAlign: "center", color: "white", fontSize: 70, fontWeight: 900, letterSpacing: -1.5, opacity: titleA, transform: `translateY(${(1 - titleA) * 20}px)` }}>
        Stack em resumo
      </div>
      {STACK.map((g, i) => {
        const a = spring({ frame: local - 24 - i * 14, fps, config: { damping: 16, stiffness: 100 } });
        return (
          <Panel key={g.title} accent={hsl(g.color, 1, 0.9)} style={{ left: 100 + i * 440, top: 290, width: 410, height: 440, opacity: clamp01(a), transform: `translateY(${(1 - a) * 50}px)` }}>
            <div style={{ width: 70, height: 70, margin: "6px 0 18px", clipPath: "polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%)", background: hsl(g.color) }} />
            <div style={{ fontSize: 38, fontWeight: 800, color: hsl(g.color, 1.25), marginBottom: 18 }}>{g.title}</div>
            {g.items.map((it) => (
              <div key={it} style={{ fontSize: 24, lineHeight: 1.35, marginBottom: 14, display: "flex", gap: 12 }}>
                <span style={{ color: hsl(g.color, 1.2), flex: "none" }}>◆</span>
                <span>{it}</span>
              </div>
            ))}
          </Panel>
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 110, textAlign: "center", color: "rgba(255,255,255,0.8)", fontSize: 30, opacity: clamp01((local - 100) / 20) }}>
        Tudo rodando localmente no AWS Emulator · pronto para trocar o endpoint pela AWS real
      </div>
    </AbsoluteFill>
  );
};
