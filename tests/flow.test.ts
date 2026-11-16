import { describe, expect, it } from "vitest";
import { HandPresence } from "../src/flow/handPresence";
import { TRAINING_STEPS, TrainingCoach } from "../src/flow/trainingCoach";
import { TrackingQuality } from "../src/flow/trackingQuality";
import { IDLE_INTENT, type PlayerIntent } from "../src/input/intent";

const DT = 1000 / 60;
const hand = (over: Partial<PlayerIntent> = {}): PlayerIntent => ({ ...IDLE_INTENT, active: true, aim: { x: 0.5, y: 0.5 }, ...over });

function hold(coach: TrainingCoach, intent: PlayerIntent, ms: number) {
  let last = coach.update(intent, 0);
  for (let t = 0; t < ms; t += DT) last = coach.update(intent, DT);
  return last;
}

describe("latihan gestur", () => {
  it("berjalan melewati kelima langkah berurutan", () => {
    const coach = new TrainingCoach();
    expect(hold(coach, hand(), 1600).step?.id).toBe("pistol");
    for (let i = 0; i < 3; i++) coach.update(hand({ weapon: "pistol", fire: { aim: { x: 0.5, y: 0.5 } } }), DT);
    expect(coach.update(hand(), DT).step?.id).toBe("shotgun");
    for (let i = 0; i < 2; i++) coach.update(hand({ weapon: "shotgun", fire: { aim: { x: 0.5, y: 0.5 } } }), DT);
    expect(hold(coach, hand({ weapon: "shield", shieldUp: true }), 1600).step?.id).toBe("blast");
    const end = coach.update(hand({ weapon: "shield", blast: { chargeMs: 600 } }), DT);
    expect(end).toMatchObject({ done: true, completed: "blast", step: null });
  });

  it("tembakan dengan senjata yang salah tidak dihitung", () => {
    const coach = new TrainingCoach();
    hold(coach, hand(), 1600);
    const p = coach.update(hand({ weapon: "shotgun", fire: { aim: { x: 0.5, y: 0.5 } } }), DT);
    expect(p).toMatchObject({ index: 1, progress: 0 });
  });

  it("ledakan tanpa isi tenaga cukup tidak dihitung", () => {
    const coach = new TrainingCoach(TRAINING_STEPS.filter((s) => s.id === "blast"));
    expect(coach.update(hand({ blast: { chargeMs: 100 } }), DT).done).toBe(false);
    expect(coach.update(hand({ blast: { chargeMs: 400 } }), DT).done).toBe(true);
  });

  it("melaporkan kemajuan langkah tahan", () => {
    const coach = new TrainingCoach();
    expect(hold(coach, hand(), 750).progress).toBeCloseTo(0.5, 1);
    expect(hold(coach, IDLE_INTENT, 500).progress).toBeCloseTo(0.5, 1);
  });

  it("bisa dilewati", () => {
    const coach = new TrainingCoach();
    coach.skip();
    expect(coach.update(IDLE_INTENT, DT).done).toBe(true);
  });
});

describe("kehadiran tangan", () => {
  it("hilang setelah 2 detik tanpa tangan, bukan karena kedipan singkat", () => {
    const p = new HandPresence();
    p.update(false, 0);
    p.update(true, 1500);
    p.update(false, 1600);
    expect(p.update(false, 3500)).toBe(false);
    expect(p.update(false, 3600)).toBe(true);
    expect(p.present).toBe(false);
  });

  it("kembali setelah tangan terlihat 0,5 detik", () => {
    const p = new HandPresence();
    p.update(false, 0);
    p.update(false, 2000);
    expect(p.present).toBe(false);
    p.update(true, 2100);
    expect(p.update(true, 2500)).toBe(false);
    expect(p.update(true, 2600)).toBe(true);
    expect(p.present).toBe(true);
  });
});

describe("mutu pelacakan", () => {
  const feed = (q: TrackingQuality, fps: number, ms: number, visible: (i: number) => boolean) => {
    let i = 0;
    for (let t = 0; t <= ms; t += 1000 / fps, i++) q.push(visible(i), t);
    return ms;
  };

  it("pelacakan stabil tidak bermasalah", () => {
    const q = new TrackingQuality();
    const now = feed(q, 30, 3000, () => true);
    expect(q.issue(now)).toBeNull();
  });

  it("tangan yang memang tidak ada bukan masalah mutu", () => {
    const q = new TrackingQuality();
    const now = feed(q, 30, 3000, () => false);
    expect(q.issue(now)).toBeNull();
  });

  it("pelacak lambat terdeteksi setelah jendela penuh", () => {
    const early = new TrackingQuality();
    expect(early.issue(feed(early, 10, 1000, () => true))).toBeNull();
    const full = new TrackingQuality();
    expect(full.issue(feed(full, 10, 3000, () => true))).toBe("slow");
  });

  it("tangan yang berkedip ada-tidak ada terdeteksi", () => {
    const q = new TrackingQuality();
    const now = feed(q, 30, 3000, (i) => Math.floor(i / 5) % 2 === 0);
    expect(q.issue(now)).toBe("flicker");
  });
});
