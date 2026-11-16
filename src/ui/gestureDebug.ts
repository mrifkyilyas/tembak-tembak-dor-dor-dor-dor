import { DEFAULT_GESTURE_CONFIG, type GestureState } from "../gesture/gestureInterpreter";
import { FINGERS, fingerBend } from "../gesture/handGeometry";
import type { Pose } from "../gesture/pose";
import type { HandFrame } from "../tracking/types";

const POSE_LABEL: Record<Pose, string> = {
  none: "—",
  pistol: "PISTOL",
  shotgun: "SHOTGUN",
  shield: "PERISAI",
  fist: "KEPALAN",
};

/** Kecepatan naik puncak ditahan selama ini agar sentakan singkat sempat terbaca. */
const PEAK_HOLD_MS = 1000;

/** Menampilkan hasil penafsir gestur: pola aktif, angka mentah, dan hitungan kejadian. */
export class GestureDebug {
  private fires = 0;
  private blasts = 0;
  private lastBlastCharge = 0;
  private peakLift = 0;
  private peakAt = 0;

  constructor(
    private readonly poseEl: HTMLElement,
    private readonly detailEl: HTMLElement,
  ) {}

  /** `frame` opsional; bila ada, tekukan jari ikut ditampilkan. */
  update(s: GestureState, frame: HandFrame | null = null, now = performance.now()): void {
    if (s.fire) this.fires++;
    if (s.blast) {
      this.blasts++;
      this.lastBlastCharge = s.blast.chargeMs;
    }
    if (s.liftSpeed > this.peakLift || now - this.peakAt > PEAK_HOLD_MS) {
      this.peakLift = Math.max(0, s.liftSpeed);
      this.peakAt = now;
    }

    this.poseEl.textContent = s.handVisible ? POSE_LABEL[s.pose] : "tangan tidak terlihat";
    this.poseEl.dataset.pose = s.pose;

    const threshold = DEFAULT_GESTURE_CONFIG.kickFireAbove;
    const lines = [
      `mentah    ${s.rawPose}`,
      `naik      ${s.liftSpeed.toFixed(1).padStart(5)} ${bar(s.liftSpeed, threshold)}`,
      `puncak    ${this.peakLift.toFixed(1).padStart(5)} ${bar(this.peakLift, threshold)}`,
      `kepalan   ${(s.fistHeldMs / 1000).toFixed(1)} dtk`,
      `tembakan  ${this.fires}`,
      `ledakan   ${this.blasts} (isi ${(this.lastBlastCharge / 1000).toFixed(1)} dtk)`,
    ];
    if (frame) {
      const bends = FINGERS.map((f) => fingerBend(frame.worldLandmarks, f).toFixed(0).padStart(4)).join("");
      lines.push(`tekukan  ${bends}  (telunjuk tengah manis kelingking)`);
    }
    this.detailEl.textContent = lines.join("\n");
  }
}

/** Batang teks dengan tanda | di posisi ambang tembak, agar mudah melihat seberapa dekat sentakan ke ambang. */
function bar(value: number, threshold: number): string {
  const scale = 20 / (threshold * 2);
  const filled = Math.round(Math.min(threshold * 2, Math.max(0, value)) * scale);
  const mark = Math.round(threshold * scale);
  let out = "";
  for (let i = 0; i < 20; i++) out += i === mark ? "|" : i < filled ? "█" : "·";
  return out;
}
