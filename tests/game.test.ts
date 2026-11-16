import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { describe, expect, it } from "vitest";
import { applyDifficulty, DIFFICULTIES } from "../src/data/difficulty";
import { LEVEL_1 } from "../src/data/level1";
import { DEFAULT_GAME_CONFIG, type EnemyKind } from "../src/game/config";
import { enemyCenter } from "../src/game/enemies";
import { normalize, raySphere, vec, type Vec3 } from "../src/game/math";
import { RailController, type Level, type Wave } from "../src/game/rail";
import { GameSession, type GameEvent } from "../src/game/session";
import { aimRay, effectiveFovY, MIN_ASPECT, projectToAim, type View } from "../src/game/view";
import { Weapons } from "../src/game/weapons";
import { IDLE_INTENT, type Aim, type PlayerIntent } from "../src/input/intent";
import { HighScores } from "../src/ui/highScore";
import { createBot } from "./helpers/bot";

const DT = 1000 / 60;
const CENTER: Aim = { x: 0.5, y: 0.5 };

/** Lintasan lurus 100 m dengan satu titik henti di 10 m; kamera sampai di sana dalam ±0,1 detik. */
function testLevel(waves: Wave[], timeLimitMs = 60_000): Level {
  return { name: "uji", path: [vec(0, 0, 9.6), vec(0, 0, 100)], speed: 4, stops: [{ at: 0.4, timeLimitMs, waves }] };
}

const one = (kind: EnemyKind, forward: number, right = 0): Wave => ({ delayMs: 0, spawns: [{ kind, forward, right }] });

/** Menjalankan sesi sampai titik henti pertama berisi musuh. */
function arrive(level: Level): GameSession {
  const s = new GameSession(level);
  for (let i = 0; i < 30 && s.enemies.length === 0; i++) s.update(DT, IDLE_INTENT);
  return s;
}

function step(s: GameSession, intent: Partial<PlayerIntent> = {}, ms = DT): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < ms - 1e-6; t += DT) events.push(...s.update(DT, { ...IDLE_INTENT, active: true, aim: CENTER, ...intent }));
  return events;
}

const aimAt = (s: GameSession, index = 0): Aim => {
  const e = s.enemies[index];
  return projectToAim(s.view, enemyCenter(e, s.config.enemies[e.kind]))!;
};
const pistolAt = (aim: Aim): Partial<PlayerIntent> => ({ weapon: "pistol", fire: { aim } });
const ofType = <T extends GameEvent["type"]>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe("kamera dan sinar", () => {
  const view: View = { position: vec(0, 1.6, 0), forward: vec(0, 0, 1), fovY: 0.8, aspect: 16 / 9 };

  it("tengah layar adalah arah pandang", () => {
    const ray = aimRay(view, CENTER);
    expect(ray.dir.z).toBeCloseTo(1);
  });

  it("kanan dan atas layar mengarah ke kanan dan atas dunia", () => {
    expect(aimRay(view, { x: 1, y: 0.5 }).dir.x).toBeGreaterThan(0);
    expect(aimRay(view, { x: 0.5, y: 0 }).dir.y).toBeGreaterThan(0);
  });

  it("proyeksi adalah kebalikan sinar", () => {
    const point: Vec3 = vec(3, 0.5, 12);
    const aim = projectToAim(view, point)!;
    const ray = aimRay(view, aim);
    expect(raySphere(ray, point, 0.01)).not.toBeNull();
  });

  it("proyeksi sama dengan kamera Babylon (kontrak dengan render)", () => {
    const tilted: View = { ...view, position: vec(3, 1.6, 2), forward: normalize(vec(0.6, -0.1, 0.79)) };
    const eye = new Vector3(3, 1.6, 2);
    const viewM = Matrix.LookAtLH(eye, eye.add(new Vector3(tilted.forward.x, tilted.forward.y, tilted.forward.z)), Vector3.Up());
    const transform = viewM.multiply(Matrix.PerspectiveFovLH(tilted.fovY, tilted.aspect, 0.1, 1000));
    for (const p of [vec(10, 1, 12), vec(6, 3, 15), vec(2, 0, 9)]) {
      const screen = Vector3.Project(new Vector3(p.x, p.y, p.z), Matrix.Identity(), transform, new Viewport(0, 0, 1, 1));
      const aim = projectToAim(tilted, p)!;
      expect(aim.x).toBeCloseTo(screen.x, 4);
      expect(aim.y).toBeCloseTo(screen.y, 4);
    }
  });

  it("titik di belakang kamera tidak punya posisi layar", () => {
    expect(projectToAim(view, vec(0, 1.6, -5))).toBeNull();
  });

  it("layar tegak memakai sudut pandang tegak yang dilebarkan, sama dengan kamera Babylon", () => {
    const portrait: View = { ...view, aspect: 9 / 19.5 };
    const fov = effectiveFovY(portrait);
    expect(fov).toBeGreaterThan(view.fovY);
    const eye = new Vector3(0, 1.6, 0);
    const transform = Matrix.LookAtLH(eye, eye.add(Vector3.Forward()), Vector3.Up()).multiply(
      Matrix.PerspectiveFovLH(fov, portrait.aspect, 0.1, 1000),
    );
    const p = vec(1.5, 2.5, 10);
    const screen = Vector3.Project(new Vector3(p.x, p.y, p.z), Matrix.Identity(), transform, new Viewport(0, 0, 1, 1));
    const aim = projectToAim(portrait, p)!;
    expect(aim.x).toBeCloseTo(screen.x, 4);
    expect(aim.y).toBeCloseTo(screen.y, 4);
  });

  it("HP tegak melihat musuh di samping yang terlihat di layar lebar", () => {
    const rail = new RailController(LEVEL_1);
    for (const stop of LEVEL_1.stops) {
      const eye = rail.pointAt(stop.at);
      const fwd = rail.directionAt(stop.at);
      const right = vec(fwd.z, 0, -fwd.x);
      const at = (aspect: number): View => ({ position: vec(eye.x, 1.6, eye.z), forward: fwd, fovY: 0.8, aspect });
      for (const wave of stop.waves) {
        for (const s of wave.spawns) {
          const spawn = vec(eye.x + right.x * s.right + fwd.x * s.forward, 1, eye.z + right.z * s.right + fwd.z * s.forward);
          const wide = projectToAim(at(MIN_ASPECT), spawn);
          const tall = projectToAim(at(9 / 19.5), spawn);
          expect(tall?.x).toBeCloseTo(wide!.x, 6);
        }
      }
    }
  });
});

describe("senjata", () => {
  it("pistol dibatasi jeda minimum", () => {
    const w = new Weapons(DEFAULT_GAME_CONFIG);
    expect(w.tryFire("pistol", 0)).toBe(true);
    expect(w.tryFire("pistol", 100)).toBe(false);
    expect(w.tryFire("pistol", 150)).toBe(true);
  });

  it("shotgun harus isi ulang ±1 detik", () => {
    const w = new Weapons(DEFAULT_GAME_CONFIG);
    expect(w.tryFire("shotgun", 0)).toBe(true);
    expect(w.tryFire("shotgun", 900)).toBe(false);
    expect(w.shotgunReloadLeft(900)).toBe(100);
    expect(w.tryFire("shotgun", 1000)).toBe(true);
  });

  it("perisai menguras energi, habis, lalu baru bisa naik setelah pulih", () => {
    const w = new Weapons(DEFAULT_GAME_CONFIG);
    let t = 0;
    let broke = false;
    for (; t < 5000 && !broke; t += 100) broke = w.updateShield(true, 100, t);
    expect(broke).toBe(true);
    expect(t).toBeCloseTo(4000, -2); // 100 energi / 25 per detik
    w.updateShield(true, 100, t);
    expect(w.shieldActive).toBe(false);
    for (let i = 0; i < 25; i++, t += 100) w.updateShield(false, 100, t); // 0,6 dtk jeda + 1,9 dtk isi
    expect(w.shieldEnergy).toBeGreaterThanOrEqual(30);
    w.updateShield(true, 100, t);
    expect(w.shieldActive).toBe(true);
  });

  it("ledakan butuh isi tenaga minimum, lalu cooldown 10 detik", () => {
    const w = new Weapons(DEFAULT_GAME_CONFIG);
    expect(w.tryBlast(200, 0)).toBeNull();
    const weak = w.tryBlast(300, 0)!;
    expect(weak.radius).toBe(6);
    expect(w.tryBlast(1500, 5000)).toBeNull();
    const full = w.tryBlast(2000, 10_000)!;
    expect(full).toEqual({ radius: 12, damage: 4 });
  });
});

describe("pertarungan", () => {
  it("pistol mengalahkan penembak jauh dengan dua tembakan dan memberi skor", () => {
    const s = arrive(testLevel([one("sniper", 15)]));
    const aim = aimAt(s);
    step(s, pistolAt(aim));
    step(s, {}, 200);
    const events = step(s, pistolAt(aim));
    expect(ofType(events, "enemyKilled")).toEqual([{ type: "enemyKilled", id: 1, kind: "sniper", points: 100 }]);
    expect(s.score).toBe(100);
    expect(s.accuracy).toBe(1);
  });

  it("tembakan meleset menghapus rangkaian beruntun", () => {
    const s = arrive(testLevel([one("rusher", 30)]));
    step(s, pistolAt(aimAt(s)));
    expect(s.combo).toBe(1);
    step(s, {}, 200);
    step(s, pistolAt({ x: 0.05, y: 0.05 }));
    expect(s.combo).toBe(0);
    expect(s.accuracy).toBe(0.5);
  });

  it("rangkaian lima kena menaikkan pengali skor", () => {
    const s = arrive(testLevel([{ delayMs: 0, spawns: [{ kind: "rusher", forward: 40, right: 0 }, { kind: "sniper", forward: 30, right: 6 }] }]));
    for (let i = 0; i < 4; i++) {
      step(s, pistolAt(aimAt(s, 0)));
      step(s, {}, 200);
    }
    expect(s.combo).toBe(4);
    const sniper = s.enemies.findIndex((e) => e.kind === "sniper");
    step(s, pistolAt(aimAt(s, sniper)));
    step(s, {}, 200);
    const events = step(s, pistolAt(aimAt(s, s.enemies.findIndex((e) => e.kind === "sniper"))));
    expect(s.multiplier).toBe(1.5);
    expect(ofType(events, "enemyKilled")[0].points).toBe(150);
  });

  it("shotgun dari dekat mengalahkan penyerbu dengan satu tembakan", () => {
    const s = arrive(testLevel([one("rusher", 4)]));
    const events = step(s, { weapon: "shotgun", fire: { aim: aimAt(s) } });
    expect(ofType(events, "shot")[0].rays).toHaveLength(7);
    expect(ofType(events, "enemyKilled")).toHaveLength(1);
  });

  it("shotgun tidak menjangkau lebih dari 20 m", () => {
    const s = arrive(testLevel([one("sniper", 25)]));
    const events = step(s, { weapon: "shotgun", fire: { aim: aimAt(s) } });
    expect(ofType(events, "shot")[0].hit).toBe(false);
  });

  it("tembakan shotgun saat isi ulang tidak keluar", () => {
    const s = arrive(testLevel([one("sniper", 15)]));
    step(s, { weapon: "shotgun", fire: { aim: CENTER } });
    const events = step(s, { weapon: "shotgun", fire: { aim: CENTER } });
    expect(ofType(events, "notReady")).toHaveLength(1);
    expect(s.shots).toBe(1);
  });

  it("penembak jauh memberi peringatan lalu proyektilnya melukai pemain", () => {
    const s = arrive(testLevel([one("sniper", 12)]));
    const events = step(s, {}, 6000);
    const warning = events.findIndex((e) => e.type === "warning");
    const fired = events.findIndex((e) => e.type === "projectileFired");
    const hit = events.findIndex((e) => e.type === "playerHit");
    expect(warning).toBeGreaterThanOrEqual(0);
    expect(fired).toBeGreaterThan(warning);
    expect(hit).toBeGreaterThan(fired);
    expect(s.health).toBeLessThan(100);
  });

  it("proyektil bisa ditembak jatuh", () => {
    const s = arrive(testLevel([one("sniper", 12)]));
    while (s.projectiles.length === 0) step(s);
    step(s, {}, 300);
    const aim = projectToAim(s.view, s.projectiles[0].position)!;
    const events = step(s, pistolAt(aim));
    expect(ofType(events, "projectileDestroyed")).toHaveLength(1);
    expect(s.projectiles).toHaveLength(0);
  });

  it("perisai menahan proyektil dan menguras energi", () => {
    const s = arrive(testLevel([one("sniper", 12)]));
    while (s.projectiles.length === 0) step(s);
    const events = step(s, { weapon: "shield", shieldUp: true }, 2000);
    expect(ofType(events, "blocked")).toHaveLength(1);
    expect(s.health).toBe(100);
    expect(s.weapons.shieldEnergy).toBeLessThan(100 - 10 - 25);
  });

  it("penyerbu mendekat, memberi peringatan, lalu memukul", () => {
    const s = arrive(testLevel([one("rusher", 12)]));
    const events = step(s, {}, 4000);
    const warning = events.findIndex((e) => e.type === "warning");
    const hit = events.findIndex((e) => e.type === "playerHit");
    expect(warning).toBeGreaterThanOrEqual(0);
    expect(hit).toBeGreaterThan(warning);
    expect(ofType(events, "playerHit")[0]).toMatchObject({ damage: 20, source: "rusher" });
  });

  it("kawanan menabrakkan diri lalu hilang", () => {
    const s = arrive(testLevel([one("swarm", 6)]));
    const events = step(s, {}, 5000);
    expect(ofType(events, "playerHit")).toHaveLength(1);
    expect(s.enemies).toHaveLength(0);
  });

  it("ledakan mengenai semua musuh dalam jangkauan", () => {
    const s = arrive(
      testLevel([{ delayMs: 0, spawns: [...[-2, 0, 2].map((right) => ({ kind: "swarm" as const, forward: 5, right })), { kind: "sniper", forward: 30, right: 0 }] }]),
    );
    const events = step(s, { weapon: "blast", blast: { chargeMs: 800 } });
    expect(ofType(events, "blast")[0].kills).toBe(3);
    expect(s.enemies.map((e) => e.kind)).toEqual(["sniper"]);
  });
});

describe("lintasan", () => {
  it("kamera menunggu di titik henti sampai musuh habis", () => {
    const s = arrive(testLevel([one("sniper", 15)]));
    const at = s.rail.distance;
    step(s, {}, 1000);
    expect(s.rail.distance).toBe(at);
    const aim = aimAt(s);
    step(s, pistolAt(aim));
    step(s, {}, 200);
    const events = step(s, pistolAt(aim));
    step(s, {}, 1000);
    expect(ofType(events, "stopCleared")).toEqual([{ type: "stopCleared", index: 0, timedOut: false }]);
    expect(s.rail.distance).toBeGreaterThan(at);
  });

  it("gelombang berikutnya muncul sesuai jedanya", () => {
    const s = arrive(testLevel([one("sniper", 15), { delayMs: 3000, spawns: [{ kind: "rusher", forward: 20, right: 0 }] }]));
    expect(s.enemies).toHaveLength(1);
    step(s, {}, 3100);
    expect(s.enemies.map((e) => e.kind)).toContain("rusher");
  });

  it("waktu habis: kamera lanjut dan sisa musuh mundur", () => {
    const s = arrive(testLevel([one("sniper", 40)], 2000));
    const events = step(s, { weapon: "shield", shieldUp: true }, 2500);
    expect(ofType(events, "stopCleared")[0].timedOut).toBe(true);
    expect(ofType(events, "enemiesRetreated")[0].count).toBe(1);
    expect(s.enemies).toHaveLength(0);
  });

  it("arah kamera berbelok halus mengikuti lintasan", () => {
    const level: Level = { name: "belok", path: [vec(0, 0, 0), vec(0, 0, 4), vec(4, 0, 8)], speed: 4, stops: [] };
    const s = new GameSession(level);
    step(s, {}, 1100); // baru melewati belokan
    expect(s.view.forward.x).toBeGreaterThan(0);
    expect(s.view.forward.x).toBeLessThan(Math.SQRT1_2 - 0.01);
  });
});

describe("simulasi sesi penuh", () => {
  function play(intentFor: (s: GameSession) => PlayerIntent, seed = 1) {
    const s = new GameSession(LEVEL_1, { seed });
    const ends: GameEvent[] = [];
    const timedOut: number[] = [];
    while (s.state === "playing" && s.time < 10 * 60_000) {
      for (const e of s.update(DT, intentFor(s))) {
        if (e.type === "ended") ends.push(e);
        if (e.type === "stopCleared" && e.timedOut) timedOut.push(e.index);
      }
    }
    return { s, ends, timedOut };
  }

  for (const seed of [1, 2, 3]) {
    it(`pemain yang memakai keempat senjata menamatkan lintasan dalam 2–3 menit (benih ${seed})`, () => {
      const { s, ends, timedOut } = play(createBot({ seed }), seed);
      expect(ends).toEqual([{ type: "ended", result: "won" }]);
      expect(s.health).toBeGreaterThan(0);
      expect(timedOut).toEqual([]);
      expect(s.time).toBeGreaterThan(120_000);
      expect(s.time).toBeLessThan(180_000);
    });
  }

  it("pemain yang diam saja kalah", () => {
    const { s, ends } = play(() => IDLE_INTENT);
    expect(ends).toEqual([{ type: "ended", result: "lost" }]);
    expect(s.health).toBe(0);
  });

  it("pemain yang hanya menembak, tanpa perisai dan ledakan, kalah", () => {
    expect(play(createBot({ defend: false })).ends).toEqual([{ type: "ended", result: "lost" }]);
  });

  it("benih yang sama menghasilkan sesi yang sama", () => {
    const a = play(createBot(), 7).s;
    const b = play(createBot(), 7).s;
    expect([a.score, a.time, a.health]).toEqual([b.score, b.time, b.health]);
  });
});

describe("bantuan bidik", () => {
  it("menarik bidikan yang hampir kena ke pusat musuh", () => {
    const s = arrive(testLevel([one("sniper", 15)]));
    const target = aimAt(s);
    const near = { x: target.x + 0.03, y: target.y };
    const assisted = s.assistAim(near);
    // Di setengah radius tarikannya 0,6 × 0,5 = 30% dari selisih.
    expect(assisted.x - target.x).toBeCloseTo(0.03 * 0.7, 3);
  });

  it("tidak menyentuh bidikan yang jauh dari sasaran", () => {
    const s = arrive(testLevel([one("sniper", 15)]));
    const far = { x: aimAt(s).x + 0.2, y: 0.5 };
    expect(s.assistAim(far)).toEqual(far);
  });

  it("bisa dimatikan lewat konfigurasi", () => {
    const config = structuredClone(DEFAULT_GAME_CONFIG);
    config.aimAssist.strength = 0;
    const s = new GameSession(testLevel([one("sniper", 15)]), { config });
    for (let i = 0; i < 30 && s.enemies.length === 0; i++) s.update(DT, IDLE_INTENT);
    const near = { x: aimAt(s).x + 0.02, y: 0.5 };
    expect(s.assistAim(near)).toEqual(near);
  });
});

describe("tingkat kesulitan", () => {
  it("mengubah salinan konfigurasi, bukan aslinya", () => {
    const easy = applyDifficulty(DEFAULT_GAME_CONFIG, DIFFICULTIES.mudah);
    expect(easy.enemies.rusher.damage).toBe(6);
    expect(easy.enemies.rusher.windupMs).toBeCloseTo(1260);
    expect(easy.enemies.rusher.recoverMinMs).toBeCloseTo(2500);
    expect(DEFAULT_GAME_CONFIG.enemies.rusher.damage).toBe(20);
    expect(DEFAULT_GAME_CONFIG.enemies.rusher.recoverMinMs).toBe(1000);
  });

  it("pemain biasa menang di Normal, pemula menang di Mudah", () => {
    const run = (id: keyof typeof DIFFICULTIES, bot: Parameters<typeof createBot>[0], seed: number) => {
      const s = new GameSession(LEVEL_1, { seed, config: applyDifficulty(DEFAULT_GAME_CONFIG, DIFFICULTIES[id]) });
      const play = createBot({ seed, ...bot });
      while (s.state === "playing" && s.time < 600_000) s.update(DT, play(s));
      return s;
    };
    const average = { reactionMs: 650, aimError: 0.04, fireIntervalMs: 550 };
    const beginner = { reactionMs: 900, aimError: 0.05, fireIntervalMs: 750 };
    for (const seed of [1, 2, 3, 4, 5]) {
      const normal = run("normal", average, seed);
      expect(normal.state).toBe("won");
      expect(normal.health).toBeGreaterThan(70);
      expect(run("mudah", beginner, seed).state).toBe("won");
    }
  });

  it("mudah lebih ringan daripada sulit untuk pemain yang sama", () => {
    const result = (id: keyof typeof DIFFICULTIES) => {
      const s = new GameSession(LEVEL_1, { seed: 4, config: applyDifficulty(DEFAULT_GAME_CONFIG, DIFFICULTIES[id]) });
      const bot = createBot({ seed: 4 });
      while (s.state === "playing" && s.time < 600_000) s.update(DT, bot(s));
      return s;
    };
    const easy = result("mudah");
    const hard = result("sulit");
    expect(easy.state).toBe("won");
    expect(easy.health).toBeGreaterThan(hard.state === "won" ? hard.health : 0);
  });
});

describe("skor tertinggi", () => {
  const fakeStorage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it("mencatat rekor per tingkat kesulitan", () => {
    const scores = new HighScores(fakeStorage());
    expect(scores.submit("normal", 500)).toBe(true);
    expect(scores.submit("normal", 400)).toBe(false);
    expect(scores.get("normal")).toBe(500);
    expect(scores.get("sulit")).toBe(0);
  });

  it("tetap berfungsi bila penyimpanan menolak", () => {
    const broken = { getItem: () => { throw new Error("diblokir"); }, setItem: () => { throw new Error("diblokir"); } };
    const scores = new HighScores(broken);
    expect(scores.submit("normal", 300)).toBe(true);
    expect(scores.get("normal")).toBe(300);
  });
});

describe("gerak musuh", () => {
  it("penyerbu yang datang bersamaan tidak bertumpuk", () => {
    const s = arrive(testLevel([{ delayMs: 0, spawns: [0, 0.1, -0.1].map((right) => ({ kind: "rusher" as const, forward: 12, right })) }]));
    step(s, { weapon: "shield", shieldUp: true }, 3000);
    const [a, b, c] = s.enemies.map((e) => e.position);
    for (const [p, q] of [[a, b], [a, c], [b, c]]) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(1.2);
  });
});

describe("titik tumbukan", () => {
  it("tembakan yang kena melaporkan titik di permukaan hitbox", () => {
    const s = arrive(testLevel([one("sniper", 15)]));
    const events = step(s, pistolAt(aimAt(s)));
    const [impact] = ofType(events, "shot")[0].impacts;
    const e = s.enemies[0];
    const center = enemyCenter(e, s.config.enemies.sniper);
    expect(Math.hypot(impact.x - center.x, impact.y - center.y, impact.z - center.z)).toBeCloseTo(s.config.enemies.sniper.radius, 3);
  });

  it("tembakan meleset tidak punya titik tumbukan", () => {
    const s = arrive(testLevel([one("sniper", 15)]));
    expect(ofType(step(s, pistolAt({ x: 0.02, y: 0.02 })), "shot")[0].impacts).toEqual([]);
  });
});
