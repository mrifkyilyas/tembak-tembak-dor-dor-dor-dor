import { describe, expect, it } from "vitest";
import type { GestureState } from "../src/gesture/gestureInterpreter";
import { GestureIntentSource } from "../src/input/gestureSource";
import type { PlayerIntent } from "../src/input/intent";
import { PointerIntentSource } from "../src/input/pointerSource";

function gesture(overrides: Partial<GestureState> = {}): GestureState {
  return {
    handVisible: true,
    pose: "pistol",
    rawPose: "pistol",
    aim: { x: 0.4, y: 0.6 },
    liftSpeed: 0,
    fistHeldMs: 0,
    fire: null,
    blast: null,
    ...overrides,
  };
}

/** Bagian niat yang menentukan perilaku game, untuk membandingkan dua sumber. */
function essence(i: PlayerIntent) {
  return { weapon: i.weapon, shieldUp: i.shieldUp, fired: i.fire !== null, blasted: i.blast !== null };
}

describe("GestureIntentSource", () => {
  it("memetakan pola ke senjata", () => {
    const src = new GestureIntentSource();
    const cases = [
      ["pistol", "pistol"],
      ["shotgun", "shotgun"],
      ["shield", "shield"],
      ["fist", "blast"],
      ["none", null],
    ] as const;
    for (const [pose, weapon] of cases) {
      src.push(gesture({ pose }));
      expect(src.read().weapon).toBe(weapon);
    }
  });

  it("perisai naik selama pola perisai, isi tenaga mengikuti lama kepalan", () => {
    const src = new GestureIntentSource();
    src.push(gesture({ pose: "shield" }));
    expect(src.read().shieldUp).toBe(true);
    src.push(gesture({ pose: "fist", fistHeldMs: 700 }));
    expect(src.read()).toMatchObject({ shieldUp: false, chargeMs: 700 });
  });

  it("tembakan dibaca tepat sekali walau render lebih cepat dari pelacakan", () => {
    const src = new GestureIntentSource();
    src.push(gesture({ fire: { aim: { x: 0.2, y: 0.3 } } }));
    expect(src.read().fire).toEqual({ aim: { x: 0.2, y: 0.3 } });
    expect(src.read().fire).toBeNull();
  });

  it("dua tembakan sebelum dibaca tidak ada yang hilang", () => {
    const src = new GestureIntentSource();
    src.push(gesture({ fire: { aim: { x: 0.1, y: 0.1 } } }));
    src.push(gesture({ fire: { aim: { x: 0.9, y: 0.9 } } }));
    expect(src.read().fire?.aim.x).toBe(0.1);
    expect(src.read().fire?.aim.x).toBe(0.9);
  });

  it("tangan hilang berarti tidak aktif, tapi ledakan terakhir tetap tersampaikan", () => {
    const src = new GestureIntentSource();
    src.push(gesture({ pose: "none", blast: { chargeMs: 900 } }));
    src.push(gesture({ handVisible: false, pose: "none", aim: null }));
    const intent = src.read();
    expect(intent).toMatchObject({ active: false, aim: null, weapon: null, blast: { chargeMs: 900 } });
  });
});

describe("PointerIntentSource", () => {
  it("klik menembak di posisi penunjuk", () => {
    const src = new PointerIntentSource();
    src.move(0.3, 0.7);
    src.press(0);
    src.release(50);
    expect(src.read(50).fire).toEqual({ aim: { x: 0.3, y: 0.7 } });
    expect(src.read(60).fire).toBeNull();
  });

  it("tidak menembak sebelum penunjuk masuk layar", () => {
    const src = new PointerIntentSource();
    src.press(0);
    expect(src.read(0)).toMatchObject({ active: false, fire: null });
  });

  it("perisai naik hanya selama tombol ditahan", () => {
    const src = new PointerIntentSource();
    src.selectWeapon("shield");
    src.move(0.5, 0.5);
    expect(src.read(0).shieldUp).toBe(false);
    src.press(0);
    expect(src.read(10).shieldUp).toBe(true);
    src.release(500);
    expect(src.read(510).shieldUp).toBe(false);
  });

  it("ledakan: tahan untuk mengisi, lepas untuk meledak", () => {
    const src = new PointerIntentSource();
    src.selectWeapon("blast");
    src.move(0.5, 0.5);
    src.press(1000);
    expect(src.read(1600)).toMatchObject({ chargeMs: 600, blast: null, fire: null });
    src.release(1800);
    expect(src.read(1800).blast).toEqual({ chargeMs: 800 });
  });

  it("berganti senjata membatalkan isi tenaga", () => {
    const src = new PointerIntentSource();
    src.selectWeapon("blast");
    src.move(0.5, 0.5);
    src.press(0);
    src.selectWeapon("pistol");
    src.release(800);
    expect(src.read(800)).toMatchObject({ blast: null, chargeMs: 0 });
  });

  it("posisi di luar layar dipotong ke tepi", () => {
    const src = new PointerIntentSource();
    src.move(-0.2, 1.4);
    expect(src.read(0).aim).toEqual({ x: 0, y: 1 });
  });
});

describe("kedua sumber setara bagi game", () => {
  it("tembak pistol, perisai, dan ledakan menghasilkan niat yang sama", () => {
    const g = new GestureIntentSource();
    const p = new PointerIntentSource();
    p.move(0.5, 0.5);

    g.push(gesture({ pose: "pistol", fire: { aim: { x: 0.5, y: 0.5 } } }));
    p.selectWeapon("pistol");
    p.press(0);
    p.release(10);
    expect(essence(g.read())).toEqual(essence(p.read(10)));

    g.push(gesture({ pose: "shield" }));
    p.selectWeapon("shield");
    p.press(100);
    expect(essence(g.read())).toEqual(essence(p.read(110)));
    p.release(120);

    g.push(gesture({ pose: "none", blast: { chargeMs: 800 } }));
    p.selectWeapon("blast");
    p.press(200);
    p.release(1000);
    expect(essence(g.read()).blasted).toBe(true);
    expect(essence(p.read(1000)).blasted).toBe(true);
  });
});
