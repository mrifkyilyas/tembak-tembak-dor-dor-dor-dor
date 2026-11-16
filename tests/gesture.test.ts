import { describe, expect, it } from "vitest";
import { GestureInterpreter, type GestureState } from "../src/gesture/gestureInterpreter";
import { fingerBend, handSizeImage } from "../src/gesture/handGeometry";
import { OneEuroFilter } from "../src/gesture/oneEuroFilter";
import { Threshold } from "../src/gesture/threshold";
import { makeFrame, POSES, seededRng, worldLandmarks, type FrameOptions, type HandSpec } from "./helpers/syntheticHand";

const FRAME_MS = 1000 / 30;

type AimPath = (msIntoStep: number) => { x: number; y: number };

/** Satu langkah: bentuk tangan (null = tangan hilang), durasi, dan lintasan pangkal telunjuk di gambar kamera. */
type Step = [HandSpec | null, number, AimPath?];

const still =
  (x = 0.5, y = 0.5): AimPath =>
  () => ({ x, y });

/** Bergerak lurus dari `from` ke `to` (koordinat gambar) selama `ms`, lalu diam di `to`. */
const move =
  (from: { x: number; y: number }, to: { x: number; y: number }, ms: number): AimPath =>
  (t) => {
    const k = Math.min(1, t / ms);
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
  };

/** Sentakan: naik `rise` (unit gambar) dalam `upMs`, lalu turun kembali dalam `downMs`. */
const kick =
  (rise = 0.15, upMs = 70, downMs = 200, x = 0.5, y = 0.5): AimPath =>
  (t) => {
    if (t < upMs) return { x, y: y - (rise * t) / upMs };
    if (t < upMs + downMs) return { x, y: y - rise + (rise * (t - upMs)) / downMs };
    return { x, y };
  };

/** Menjalankan langkah-langkah pada 30 fps dan mengembalikan semua status. */
function run(interp: GestureInterpreter, steps: Step[], opts: FrameOptions = {}): GestureState[] {
  const states: GestureState[] = [];
  let t = 0;
  for (const [spec, duration, path = still()] of steps) {
    const start = t;
    const end = t + duration;
    for (; t < end; t += FRAME_MS) {
      const frame = spec ? makeFrame(spec, t, { ...opts, aim: path(t - start) }) : null;
      states.push(interp.update(frame, t));
    }
  }
  return states;
}

const last = <T>(xs: T[]) => xs[xs.length - 1];
const count = (states: GestureState[], key: "fire" | "blast") => states.filter((s) => s[key]).length;

describe("geometri tangan", () => {
  it("membedakan jari lurus dan tertekuk", () => {
    const world = worldLandmarks(POSES.pistol);
    expect(fingerBend(world, "index")).toBeLessThan(20);
    expect(fingerBend(world, "middle")).toBeGreaterThan(140);
  });

  it("ukuran tangan di gambar mengoreksi rasio aspek", () => {
    const image = makeFrame(POSES.shield, 0).landmarks;
    const stretched = image.map((p) => ({ ...p, x: p.x * (3 / 4) }));
    expect(handSizeImage(stretched, 4 / 3)).toBeCloseTo(handSizeImage(image, 1));
  });
});

describe("klasifikasi pola", () => {
  for (const mirror of [false, true]) {
    const hand = mirror ? "kiri" : "kanan";
    for (const pose of ["pistol", "shotgun", "shield", "fist"] as const) {
      it(`mengenali ${pose} dengan tangan ${hand}`, () => {
        const states = run(new GestureInterpreter(), [[POSES[pose], 300]], { mirror });
        expect(last(states).pose).toBe(pose);
      });
    }
  }

  it("perisai tidak bergantung pada posisi ibu jari", () => {
    const states = run(new GestureInterpreter(), [[{ ...POSES.shield, thumbOut: 0 }, 300]]);
    expect(last(states).pose).toBe("shield");
  });

  it("pistol tetap pistol walau jari manis tidak menekuk penuh", () => {
    const states = run(new GestureInterpreter(), [[{ index: 10, middle: 160, ring: 60, pinky: 160, thumbOut: 0 }, 300]]);
    expect(last(states).pose).toBe("pistol");
  });

  it("tetap stabil dengan getar kecil pada titik tangan", () => {
    const states = run(new GestureInterpreter(), [[POSES.shotgun, 2000]], { jitter: 0.002, rng: seededRng(7) });
    expect(states.slice(5).every((s) => s.pose === "shotgun")).toBe(true);
    expect(count(states, "fire")).toBe(0);
  });
});

describe("penahan perpindahan pola", () => {
  it("mengabaikan kedipan pola yang lebih singkat dari 100 ms", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.pistol, 300],
      [POSES.shotgun, 60],
      [POSES.pistol, 300],
    ]);
    expect(states.slice(10).every((s) => s.pose === "pistol")).toBe(true);
  });

  it("berganti setelah pola baru bertahan 100 ms", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.pistol, 300],
      [POSES.shotgun, 200],
    ]);
    expect(last(states).pose).toBe("shotgun");
  });

  it("jari setengah tertekuk tidak membuat pola berkedip", () => {
    const interp = new GestureInterpreter();
    run(interp, [[POSES.shotgun, 300]]);
    // Jari tengah berayun di zona tengah ambang (75–88 derajat).
    const states: GestureState[] = [];
    for (let i = 0; i < 60; i++) {
      const t = 300 + i * FRAME_MS;
      const middle = 81.5 + 6 * Math.sin(i);
      states.push(interp.update(makeFrame({ ...POSES.shotgun, middle }, t), t));
    }
    expect(states.every((s) => s.pose === "shotgun")).toBe(true);
  });
});

describe("tembak dengan sentakan", () => {
  it("satu tembakan per sentakan pada pistol", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.pistol, 300],
      [POSES.pistol, 500, kick()],
      [POSES.pistol, 500, kick()],
      [POSES.pistol, 500, kick()],
    ]);
    expect(count(states, "fire")).toBe(3);
  });

  it("satu tembakan per sentakan pada shotgun", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.shotgun, 300],
      [POSES.shotgun, 500, kick()],
      [POSES.shotgun, 500, kick()],
    ]);
    expect(count(states, "fire")).toBe(2);
  });

  it("menembak dengan bidikan dari sebelum sentakan", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.pistol, 500, still(0.5, 0.6)],
      [POSES.pistol, 500, kick(0.15, 70, 200, 0.5, 0.6)],
    ]);
    const shot = states.find((s) => s.fire)!.fire!;
    const before = states[14].aim!; // akhir langkah diam
    expect(shot.aim.y).toBeCloseTo(before.y, 2);
  });

  it("crosshair ditahan di titik tembak saat tangan kembali turun", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.pistol, 500, still(0.5, 0.6)],
      [POSES.pistol, 500, kick(0.15, 70, 200, 0.5, 0.6)],
    ]);
    const i = states.findIndex((s) => s.fire);
    const held = states.slice(i, i + 6).map((s) => s.aim!.y);
    expect(new Set(held.map((y) => y.toFixed(6))).size).toBe(1);
  });

  it("sentakan panjang yang terus naik hanya menembak sekali", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.pistol, 300],
      [POSES.pistol, 500, move({ x: 0.5, y: 0.8 }, { x: 0.5, y: 0.1 }, 400)],
    ]);
    expect(count(states, "fire")).toBe(1);
  });

  it("tidak menembak saat membidik pelan ke atas", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.pistol, 300],
      [POSES.pistol, 1500, move({ x: 0.5, y: 0.8 }, { x: 0.5, y: 0.2 }, 1500)],
    ]);
    expect(count(states, "fire")).toBe(0);
  });

  it("tidak menembak saat menyentak ke bawah", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.pistol, 300],
      [POSES.pistol, 500, kick(-0.15)],
    ]);
    expect(count(states, "fire")).toBe(0);
  });

  it("tidak menembak dari perisai atau kepalan", () => {
    for (const pose of [POSES.shield, POSES.fist]) {
      const states = run(new GestureInterpreter(), [
        [pose, 300],
        [pose, 500, kick()],
      ]);
      expect(count(states, "fire")).toBe(0);
    }
  });

  it("tidak menembak saat pistol berubah menjadi kepalan", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.pistol, 300],
      [POSES.fist, 500],
    ]);
    expect(count(states, "fire")).toBe(0);
  });

  it("tidak menembak dari lonjakan posisi setelah tangan hilang", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.pistol, 300, still(0.5, 0.8)],
      [null, 200],
      [POSES.pistol, 300, still(0.5, 0.2)],
    ]);
    expect(count(states, "fire")).toBe(0);
  });
});

describe("ledakan dari kepalan", () => {
  it("membuka kepalan melepas ledakan dengan lama isi tenaga", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.fist, 1000],
      [POSES.shield, 300],
    ]);
    const blasts = states.filter((s) => s.blast);
    expect(blasts).toHaveLength(1);
    expect(blasts[0].blast!.chargeMs).toBeGreaterThan(800);
  });

  it("telapak setelah ledakan tidak langsung menjadi perisai", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.fist, 1000],
      [POSES.shield, 300],
    ]);
    expect(last(states).pose).toBe("none");
  });

  it("perisai berlaku lagi setelah jendela ledakan lewat", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.fist, 1000],
      [POSES.shield, 1000],
    ]);
    expect(last(states).pose).toBe("shield");
  });

  it("tetap meledak bila pembukaan melewati pola antara", () => {
    const halfOpen = { index: 10, middle: 10, ring: 160, pinky: 160, thumbOut: 0 };
    const states = run(new GestureInterpreter(), [
      [POSES.fist, 1000],
      [halfOpen, 150],
      [POSES.shield, 300],
    ]);
    expect(count(states, "blast")).toBe(1);
  });

  it("telapak terbuka tanpa kepalan sebelumnya adalah perisai", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.pistol, 500],
      [POSES.shield, 300],
    ]);
    expect(count(states, "blast")).toBe(0);
    expect(last(states).pose).toBe("shield");
  });

  it("kepalan yang dibuka terlalu lambat tidak meledak", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.fist, 1000],
      [POSES.pistol, 800],
      [POSES.shield, 300],
    ]);
    expect(count(states, "blast")).toBe(0);
  });
});

describe("tangan hilang", () => {
  it("menahan pola terakhir sebentar", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.pistol, 300],
      [null, 200],
    ]);
    expect(last(states)).toMatchObject({ handVisible: true, pose: "pistol", fire: null });
  });

  it("melepas pola setelah masa tenggang", () => {
    const states = run(new GestureInterpreter(), [
      [POSES.pistol, 300],
      [null, 500],
    ]);
    expect(last(states)).toMatchObject({ handVisible: false, pose: "none", aim: null });
  });

  it("celah panjang tanpa frame kosong juga melepas kepalan", () => {
    const interp = new GestureInterpreter();
    run(interp, [[POSES.fist, 1000]]);
    const resumeAt = 3000; // 2 detik setelah frame kepalan terakhir, tanpa update(null) di antaranya
    const after: GestureState[] = [];
    for (let t = resumeAt; t < resumeAt + 300; t += FRAME_MS) after.push(interp.update(makeFrame(POSES.shield, t), t));
    expect(count(after, "blast")).toBe(0);
    expect(last(after).pose).toBe("shield");
  });
});

describe("bidikan", () => {
  function aimAt(x: number, y: number) {
    return last(run(new GestureInterpreter(), [[POSES.pistol, 500, still(x, y)]])).aim!;
  }

  it("dicerminkan: tangan di kiri gambar kamera berarti bidikan di kanan layar", () => {
    expect(aimAt(0.3, 0.5).x).toBeGreaterThan(0.5);
  });

  it("area tengah kamera diperbesar ke seluruh layar", () => {
    const cases: Array<[number, number, number, number]> = [
      [0.15, 0.85, 1, 1],
      [0.85, 0.15, 0, 0],
      [0.5, 0.5, 0.5, 0.5],
    ];
    for (const [camX, camY, screenX, screenY] of cases) {
      const a = aimAt(camX, camY);
      expect(a.x).toBeCloseTo(screenX);
      expect(a.y).toBeCloseTo(screenY);
    }
  });

  it("tetap di dalam layar walau tangan di tepi gambar", () => {
    const a = aimAt(0.02, 0.98);
    expect(a.x).toBeLessThanOrEqual(1);
    expect(a.y).toBeLessThanOrEqual(1);
  });
});

describe("Threshold", () => {
  it("mempertahankan status di zona tengah", () => {
    const th = new Threshold(50, 80);
    expect(th.update(40)).toBe(true);
    expect(th.update(70)).toBe(true);
    expect(th.update(90)).toBe(false);
    expect(th.update(60)).toBe(false);
  });
});

describe("OneEuroFilter", () => {
  it("meredam getar saat diam", () => {
    const f = new OneEuroFilter(1, 1.5);
    const rng = seededRng(3);
    let maxDev = 0;
    for (let i = 0; i < 90; i++) {
      const out = f.filter(0.5 + (rng() - 0.5) * 0.02, i / 30);
      if (i > 30) maxDev = Math.max(maxDev, Math.abs(out - 0.5));
    }
    expect(maxDev).toBeLessThan(0.005);
  });

  it("mengejar gerakan cepat dalam kurang dari 200 ms", () => {
    const f = new OneEuroFilter(1, 1.5);
    for (let i = 0; i < 30; i++) f.filter(0, i / 30);
    let out = 0;
    for (let i = 30; i < 36; i++) out = f.filter((i - 29) / 6, i / 30); // 0 → 1 dalam 200 ms
    expect(out).toBeGreaterThan(0.8);
  });
});
