import type { HandFrame, Landmark } from "../../src/tracking/types";

/** Tekukan PIP+DIP (derajat) tiap jari, dan seberapa terbuka ibu jari (0 = menempel telunjuk, 1 = tegak). */
export interface HandSpec {
  index: number;
  middle: number;
  ring: number;
  pinky: number;
  thumbOut: number;
}

export const STRAIGHT = 10;
export const CURLED = 160;

export const POSES = {
  pistol: { index: STRAIGHT, middle: CURLED, ring: CURLED, pinky: CURLED, thumbOut: 1 },
  shotgun: { index: STRAIGHT, middle: STRAIGHT, ring: CURLED, pinky: CURLED, thumbOut: 1 },
  shield: { index: STRAIGHT, middle: STRAIGHT, ring: STRAIGHT, pinky: STRAIGHT, thumbOut: 1 },
  fist: { index: CURLED, middle: CURLED, ring: CURLED, pinky: CURLED, thumbOut: 0 },
} satisfies Record<string, HandSpec>;

const MCP_BASE: Record<"index" | "middle" | "ring" | "pinky", Landmark> = {
  index: { x: 0.025, y: 0.09, z: 0 },
  middle: { x: 0, y: 0.09, z: 0 },
  ring: { x: -0.02, y: 0.085, z: 0 },
  pinky: { x: -0.038, y: 0.075, z: 0 },
};
const SEGMENTS = [0.04, 0.025, 0.02];

function add(a: Landmark, d: Landmark, s: number): Landmark {
  return { x: a.x + d.x * s, y: a.y + d.y * s, z: a.z + d.z * s };
}

function normalize(v: Landmark): Landmark {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** Jari lurus ke +y, menekuk ke arah telapak (-z); 60% tekukan di PIP, 40% di DIP. */
function finger(base: Landmark, bendDeg: number): Landmark[] {
  const pip = (bendDeg * 0.6 * Math.PI) / 180;
  const dip = (bendDeg * 0.4 * Math.PI) / 180;
  const p1 = add(base, { x: 0, y: 1, z: 0 }, SEGMENTS[0]);
  const p2 = add(p1, { x: 0, y: Math.cos(pip), z: -Math.sin(pip) }, SEGMENTS[1]);
  const p3 = add(p2, { x: 0, y: Math.cos(pip + dip), z: -Math.sin(pip + dip) }, SEGMENTS[2]);
  return [base, p1, p2, p3];
}

function thumb(out: number): Landmark[] {
  const cmc = { x: 0.02, y: 0.025, z: 0 };
  const tucked = normalize({ x: 0.005, y: 0.065, z: -0.02 });
  const open = normalize({ x: 1, y: 0.6, z: 0 });
  const d = normalize({
    x: tucked.x + (open.x - tucked.x) * out,
    y: tucked.y + (open.y - tucked.y) * out,
    z: tucked.z + (open.z - tucked.z) * out,
  });
  const mcp = add(cmc, d, 0.035);
  const ip = add(mcp, d, 0.03);
  return [cmc, mcp, ip, add(ip, d, 0.025)];
}

/** 21 titik dunia (meter). `mirror` membalik sumbu x untuk meniru tangan kiri. */
export function worldLandmarks(spec: HandSpec, mirror = false): Landmark[] {
  const pts = [
    { x: 0, y: 0, z: 0 },
    ...thumb(spec.thumbOut),
    ...finger(MCP_BASE.index, spec.index),
    ...finger(MCP_BASE.middle, spec.middle),
    ...finger(MCP_BASE.ring, spec.ring),
    ...finger(MCP_BASE.pinky, spec.pinky),
  ];
  return mirror ? pts.map((p) => ({ ...p, x: -p.x })) : pts;
}

export interface FrameOptions {
  mirror?: boolean;
  /** Posisi pangkal telunjuk di gambar kamera (0–1, belum dicerminkan). */
  aim?: { x: number; y: number };
  /** Getar acak (meter) pada tiap titik dunia, untuk menguji ketahanan. */
  jitter?: number;
  rng?: () => number;
}

export function makeFrame(spec: HandSpec, timestamp: number, opts: FrameOptions = {}): HandFrame {
  const { mirror = false, aim = { x: 0.5, y: 0.5 }, jitter = 0, rng = Math.random } = opts;
  const world = worldLandmarks(spec, mirror).map((p) =>
    jitter === 0
      ? p
      : { x: p.x + (rng() - 0.5) * 2 * jitter, y: p.y + (rng() - 0.5) * 2 * jitter, z: p.z + (rng() - 0.5) * 2 * jitter },
  );
  const anchor = world[5];
  // Gambar kamera: y ke bawah, skala kasar 2 unit gambar per meter.
  const image = world.map((p) => ({ x: aim.x + (p.x - anchor.x) * 2, y: aim.y - (p.y - anchor.y) * 2, z: p.z }));
  return { landmarks: image, worldLandmarks: world, handedness: mirror ? "Left" : "Right", timestamp };
}

/** PRNG deterministik agar uji dengan getar selalu sama hasilnya. */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
