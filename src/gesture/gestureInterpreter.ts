import type { HandFrame } from "../tracking/types";
import { FINGERS, fingerBend, handSizeImage, type FingerName } from "./handGeometry";
import { OneEuroFilter } from "./oneEuroFilter";
import { classifyPose, type Pose } from "./pose";
import { Threshold } from "./threshold";

export interface GestureConfig {
  /** Pola mentah harus bertahan selama ini sebelum berlaku. */
  stableMs: number;
  /** Telapak terbuka sampai selama ini setelah kepalan dibaca sebagai pelepasan ledakan, bukan perisai. */
  blastWindowMs: number;
  /** Tangan yang hilang selama ini masih dianggap ada (pola terakhir ditahan). */
  lostGraceMs: number;
  /** Tekukan PIP+DIP (derajat): di bawah ini jari menjadi lurus, di atas `fingerCurledAbove` menjadi tertekuk. */
  fingerStraightBelow: number;
  fingerCurledAbove: number;
  /** Kecepatan naik tangan (ukuran tangan per detik) yang dihitung sebagai sentakan tembak. */
  kickFireAbove: number;
  /** Setelah menembak, kecepatan naik harus turun di bawah ini sebelum bisa menembak lagi. */
  kickRearmBelow: number;
  /** Jarak minimum antar-tembakan. */
  kickMinIntervalMs: number;
  /** Tembakan memakai bidikan sejauh ini sebelum sentakan terdeteksi, yaitu sebelum tangan mulai naik. */
  kickAimLookbackMs: number;
  /** Crosshair ditahan di titik tembak selama ini, agar tidak ikut memantul saat tangan kembali. */
  kickAimHoldMs: number;
  /** Bagian tepi gambar kamera yang dipotong agar area tengah memenuhi layar. */
  aimMargin: number;
  aimMinCutoff: number;
  aimBeta: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  stableMs: 100,
  blastWindowMs: 500,
  lostGraceMs: 300,
  // Dari rekaman tangan asli: jari lurus menekuk sampai ±67°, jari tertekuk paling sedikit ±96°.
  fingerStraightBelow: 75,
  fingerCurledAbove: 88,
  // Rekaman tanpa sentakan paling cepat naik ±0,84 ukuran tangan per detik.
  kickFireAbove: 2.5,
  kickRearmBelow: 0.5,
  kickMinIntervalMs: 200,
  kickAimLookbackMs: 100,
  kickAimHoldMs: 250,
  aimMargin: 0.15,
  aimMinCutoff: 1,
  aimBeta: 1.5,
};

export interface Aim {
  x: number;
  y: number;
}

export interface GestureState {
  handVisible: boolean;
  /** Pola yang berlaku setelah penahan; inilah yang dipakai game. */
  pose: Pose;
  /** Pola frame ini sebelum penahan, untuk debug. */
  rawPose: Pose;
  /** Posisi crosshair di layar (0–1, sudah dicerminkan dan dihaluskan); null bila tangan tidak terlihat. */
  aim: Aim | null;
  /** Kecepatan naik tangan saat ini (ukuran tangan per detik), untuk debug dan penyetelan. */
  liftSpeed: number;
  /** Lama kepalan sudah ditahan; 0 bila pola bukan kepalan. */
  fistHeldMs: number;
  /** Kejadian satu frame: sentakan saat pistol atau shotgun, dengan bidikan sebelum sentakan. */
  fire: { aim: Aim } | null;
  /** Kejadian satu frame: kepalan baru dibuka. */
  blast: { chargeMs: number } | null;
}

const AIM_LANDMARK = 5; // pangkal telunjuk: titik bidik, tidak banyak bergerak saat sentakan
// Ujung telunjuk: sentakan pergelangan memutar tangan, jadi ujung jari naik jauh lebih cepat
// daripada pangkalnya. Rekaman asli: ujung 3,9–5,7 vs pangkal 0,8–1,4 ukuran tangan/detik.
const KICK_LANDMARK = 8;
const MAX_FRAME_GAP_MS = 100; // di atas ini, kecepatan dihitung ulang dari awal
const DEFAULT_ASPECT = 4 / 3;

/** Mengubah aliran HandFrame menjadi pola senjata, bidikan, dan kejadian tembak/ledakan. */
export class GestureInterpreter {
  private readonly config: GestureConfig;
  private readonly fingerThresholds: Record<FingerName, Threshold>;
  private readonly aimX: OneEuroFilter;
  private readonly aimY: OneEuroFilter;

  private candidate: Pose = "none";
  private candidateSince = 0;
  private stable: Pose = "none";
  private stableSince = 0;
  private fistEndedAt = Number.NEGATIVE_INFINITY;
  private fistEndedHeldMs = 0;
  private shieldSuppressedUntil = Number.NEGATIVE_INFINITY;
  private lastSeen = Number.NEGATIVE_INFINITY;

  private prevAnchor: { y: number; t: number } | null = null;
  private prevRawLift = 0;
  private kickArmed = true;
  private lastFireAt = Number.NEGATIVE_INFINITY;
  private aimHistory: Array<{ t: number; aim: Aim }> = [];
  private heldAim: { aim: Aim; until: number } | null = null;

  private last: GestureState = emptyState();

  constructor(config: Partial<GestureConfig> = {}) {
    this.config = { ...DEFAULT_GESTURE_CONFIG, ...config };
    const c = this.config;
    this.fingerThresholds = {
      index: new Threshold(c.fingerStraightBelow, c.fingerCurledAbove),
      middle: new Threshold(c.fingerStraightBelow, c.fingerCurledAbove),
      ring: new Threshold(c.fingerStraightBelow, c.fingerCurledAbove),
      pinky: new Threshold(c.fingerStraightBelow, c.fingerCurledAbove),
    };
    this.aimX = new OneEuroFilter(c.aimMinCutoff, c.aimBeta);
    this.aimY = new OneEuroFilter(c.aimMinCutoff, c.aimBeta);
  }

  /** now dalam milidetik, dengan jam yang sama seperti HandFrame.timestamp. */
  update(frame: HandFrame | null, now: number): GestureState {
    if (!frame) return this.handleMissing(now);
    // Celah panjang tanpa laporan "tangan hilang" (pelacak tersendat, rekaman tanpa frame kosong)
    // diperlakukan sama seperti tangan yang hilang, agar kepalan sebelum celah tidak dianggap ditahan.
    if (now - this.lastSeen > this.config.lostGraceMs) this.reset();
    this.lastSeen = now;

    const straight = {} as Record<FingerName, boolean>;
    for (const finger of FINGERS) {
      straight[finger] = this.fingerThresholds[finger].update(fingerBend(frame.worldLandmarks, finger));
    }
    const rawPose = classifyPose(straight);

    const previousStable = this.stable;
    this.updateStable(rawPose, now);

    let blast: GestureState["blast"] = null;
    if (previousStable !== this.stable) {
      if (previousStable === "fist") {
        this.fistEndedAt = now;
        this.fistEndedHeldMs = now - this.stableSince;
      }
      this.stableSince = now;
      if (this.stable === "shield" && now - this.fistEndedAt <= this.config.blastWindowMs) {
        blast = { chargeMs: this.fistEndedHeldMs };
        this.fistEndedAt = Number.NEGATIVE_INFINITY;
        this.shieldSuppressedUntil = now + this.config.blastWindowMs;
      }
    }

    const pose = this.stable === "shield" && now < this.shieldSuppressedUntil ? "none" : this.stable;
    const smoothAim = this.updateAim(frame, now);
    const liftSpeed = this.updateLift(frame, now);

    let fire: GestureState["fire"] = null;
    const c = this.config;
    // Pola mentah juga harus senjata yang sama: telunjuk yang sedang menekuk (pistol → kepalan)
    // menggerakkan ujung jari dengan cepat, padahal pola yang berlaku masih pistol.
    const armedWeapon = (pose === "pistol" || pose === "shotgun") && rawPose === pose;
    if (this.kickArmed && liftSpeed > c.kickFireAbove && armedWeapon) {
      if (now - this.lastFireAt >= c.kickMinIntervalMs) {
        const aim = this.aimBefore(now - c.kickAimLookbackMs) ?? smoothAim;
        fire = { aim };
        this.heldAim = { aim, until: now + c.kickAimHoldMs };
        this.lastFireAt = now;
      }
      this.kickArmed = false;
    } else if (!this.kickArmed && liftSpeed < c.kickRearmBelow) {
      this.kickArmed = true;
    }

    const aim = this.heldAim && now < this.heldAim.until ? this.heldAim.aim : smoothAim;
    this.last = {
      handVisible: true,
      pose,
      rawPose,
      aim,
      liftSpeed,
      fistHeldMs: pose === "fist" ? now - this.stableSince : 0,
      fire,
      blast,
    };
    return this.last;
  }

  reset(): void {
    for (const finger of FINGERS) this.fingerThresholds[finger].reset();
    this.aimX.reset();
    this.aimY.reset();
    this.candidate = "none";
    this.stable = "none";
    this.fistEndedAt = Number.NEGATIVE_INFINITY;
    this.shieldSuppressedUntil = Number.NEGATIVE_INFINITY;
    this.prevAnchor = null;
    this.prevRawLift = 0;
    this.kickArmed = true;
    this.aimHistory = [];
    this.heldAim = null;
    this.last = emptyState();
  }

  private updateStable(rawPose: Pose, now: number): void {
    if (rawPose !== this.candidate) {
      this.candidate = rawPose;
      this.candidateSince = now;
    }
    if (this.candidate !== this.stable && now - this.candidateSince >= this.config.stableMs) {
      this.stable = this.candidate;
    }
  }

  private handleMissing(now: number): GestureState {
    if (this.last.handVisible && now - this.lastSeen <= this.config.lostGraceMs) {
      // Tahan status terakhir sebentar; kejadian satu frame tidak diulang.
      return { ...this.last, fire: null, blast: null };
    }
    if (this.last.handVisible) this.reset();
    return this.last;
  }

  /**
   * Kecepatan naik ujung telunjuk dalam ukuran tangan per detik, dirata-rata dua frame
   * agar getar pelacakan yang berbalik arah tiap frame saling meniadakan.
   */
  private updateLift(frame: HandFrame, now: number): number {
    const y = frame.landmarks[KICK_LANDMARK].y;
    const prev = this.prevAnchor;
    this.prevAnchor = { y, t: now };
    if (!prev || now - prev.t > MAX_FRAME_GAP_MS || now <= prev.t) {
      this.prevRawLift = 0;
      return 0;
    }
    const size = handSizeImage(frame.landmarks, frame.aspect ?? DEFAULT_ASPECT);
    if (size === 0) return 0;
    // y gambar mengarah ke bawah, jadi naik berarti y mengecil.
    const rawLift = (prev.y - y) / ((now - prev.t) / 1000) / size;
    const lift = (rawLift + this.prevRawLift) / 2;
    this.prevRawLift = rawLift;
    return lift;
  }

  private updateAim(frame: HandFrame, now: number): Aim {
    const p = frame.landmarks[AIM_LANDMARK];
    const m = this.config.aimMargin;
    const zoom = (v: number) => Math.min(1, Math.max(0, (v - m) / (1 - 2 * m)));
    const t = now / 1000;
    const aim = {
      x: this.aimX.filter(zoom(1 - p.x), t), // dicerminkan: tangan ke kanan, bidikan ke kanan
      y: this.aimY.filter(zoom(p.y), t),
    };
    this.aimHistory.push({ t: now, aim });
    const keepFrom = now - 2 * this.config.kickAimLookbackMs;
    while (this.aimHistory.length > 0 && this.aimHistory[0].t < keepFrom) this.aimHistory.shift();
    return aim;
  }

  /** Bidikan terakhir yang tercatat pada atau sebelum waktu t. */
  private aimBefore(t: number): Aim | null {
    for (let i = this.aimHistory.length - 1; i >= 0; i--) {
      if (this.aimHistory[i].t <= t) return this.aimHistory[i].aim;
    }
    return this.aimHistory[0]?.aim ?? null;
  }
}

function emptyState(): GestureState {
  return {
    handVisible: false,
    pose: "none",
    rawPose: "none",
    aim: null,
    liftSpeed: 0,
    fistHeldMs: 0,
    fire: null,
    blast: null,
  };
}
