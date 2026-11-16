import { describe, expect, it } from "vitest";
import { GestureInterpreter } from "../src/gesture/gestureInterpreter";
import type { GestureRecording } from "../src/gesture/recording";

// Rekaman titik tangan asli dari perekam di halaman debug, disimpan ke tests/fixtures/.
const files = import.meta.glob<GestureRecording>("./fixtures/*.json", { eager: true, import: "default" });
const entries = Object.entries(files);
// Rekaman yang di luar batas kemampuan pengenal (lihat fixtures/sulit/README.md): hanya diperiksa
// agar tidak menembak atau meledak lebih dari yang diharapkan.
const hardFiles = import.meta.glob<GestureRecording>("./fixtures/sulit/*.json", { eager: true, import: "default" });
const hardEntries = Object.entries(hardFiles);

/** Frame awal diabaikan untuk pemeriksaan pola, karena penahan butuh waktu untuk berlaku. */
const WARMUP_MS = 300;
/** Porsi minimum frame (dengan tangan terlihat) yang harus menunjukkan pola yang diharapkan. */
const MIN_POSE_SHARE = 0.9;

function replay(rec: GestureRecording) {
  const interp = new GestureInterpreter();
  const start = rec.frames[0]?.timestamp ?? 0;
  let fires = 0;
  let blasts = 0;
  let visible = 0;
  let matching = 0;
  const poses: Record<string, number> = {};

  for (const frame of rec.frames) {
    const s = interp.update(frame, frame.timestamp);
    if (s.fire) fires++;
    if (s.blast) blasts++;
    if (frame.timestamp - start >= WARMUP_MS && s.handVisible) {
      visible++;
      poses[s.pose] = (poses[s.pose] ?? 0) + 1;
      if (s.pose === rec.expect.pose) matching++;
    }
  }
  return { fires, blasts, visible, matching, poses };
}

describe.runIf(entries.length > 0)("rekaman tangan asli", () => {
  for (const [path, rec] of entries) {
    it(path.replace("./fixtures/", ""), () => {
      const { fires, blasts, visible, matching, poses } = replay(rec);
      if (rec.expect.pose) {
        expect(matching / visible, `sebaran pola: ${JSON.stringify(poses)}`).toBeGreaterThanOrEqual(MIN_POSE_SHARE);
      }
      if (rec.expect.fires !== undefined) expect(fires, "jumlah tembakan").toBe(rec.expect.fires);
      if (rec.expect.blasts !== undefined) expect(blasts, "jumlah ledakan").toBe(rec.expect.blasts);
    });
  }
});

describe.runIf(hardEntries.length > 0)("rekaman tangan sulit (tanpa kejadian palsu)", () => {
  for (const [path, rec] of hardEntries) {
    it(path.replace("./fixtures/sulit/", ""), () => {
      const { fires, blasts } = replay(rec);
      expect(fires, "jumlah tembakan").toBeLessThanOrEqual(rec.expect.fires ?? 0);
      expect(blasts, "jumlah ledakan").toBeLessThanOrEqual(rec.expect.blasts ?? 0);
    });
  }
});
