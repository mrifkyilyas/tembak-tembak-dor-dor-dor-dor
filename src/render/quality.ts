export type QualityLevel = "high" | "medium" | "low";

export const QUALITY_LEVELS: QualityLevel[] = ["high", "medium", "low"];

export interface QualitySettings {
  label: string;
  /** Batas atas rasio piksel perangkat yang dirender (1 = satu piksel render per piksel CSS). */
  maxPixelRatio: number;
  /** Skala resolusi render terhadap piksel CSS (< 1 = lebih kasar, lebih ringan). */
  renderScale: number;
  /** Ukuran peta bayangan; 0 = tanpa bayangan. */
  shadowMapSize: number;
  bloom: boolean;
  glow: boolean;
  fxaa: boolean;
  /** Pengali jumlah partikel. */
  particles: number;
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  // 1,5 bukan 2: pada M1 rasio 2 butuh ±21 ms per frame, 1,5 masih tajam dan di bawah 16 ms.
  high: { label: "Tinggi", maxPixelRatio: 1.5, renderScale: 1, shadowMapSize: 2048, bloom: true, glow: true, fxaa: true, particles: 1 },
  medium: { label: "Sedang", maxPixelRatio: 1, renderScale: 1, shadowMapSize: 1024, bloom: true, glow: true, fxaa: true, particles: 0.6 },
  low: { label: "Rendah", maxPixelRatio: 1, renderScale: 0.67, shadowMapSize: 0, bloom: false, glow: false, fxaa: false, particles: 0.3 },
};

/** Pilihan pemain di menu: "auto" = tebak dari perangkat lalu turunkan sendiri bila lambat. */
export type QualityPreference = "auto" | QualityLevel;

const QUALITY_KEY = "gestur.grafik";

export function readQualityPreference(storage: Pick<Storage, "getItem"> | null): QualityPreference {
  try {
    const v = storage?.getItem(QUALITY_KEY);
    return v === "high" || v === "medium" || v === "low" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function writeQualityPreference(storage: Pick<Storage, "setItem"> | null, pref: QualityPreference): void {
  try {
    storage?.setItem(QUALITY_KEY, pref);
  } catch {
    // Penyimpanan diblokir: pilihan berlaku sampai halaman ditutup.
  }
}

export interface DeviceHints {
  mobile: boolean;
  cores: number;
  /** GB, bila browser memberi tahu. */
  memory?: number;
  /** String renderer GPU, bila tersedia. */
  gpu?: string;
}

/** Petunjuk perangkat dari browser. `engine` hanya perlu `getGlInfo` untuk nama GPU. */
export function deviceHints(engine: { getGlInfo(): { renderer: string } }): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    mobile: /Android|iPhone|iPad|iPod/i.test(nav.userAgent) || (nav.maxTouchPoints > 1 && /Macintosh/.test(nav.userAgent)),
    cores: nav.hardwareConcurrency || 4,
    memory: nav.deviceMemory,
    gpu: engine.getGlInfo().renderer,
  };
}

/** Tebakan tingkat awal dari perangkat; penurunan otomatis membetulkan tebakan yang terlalu tinggi. */
export function guessQuality(d: DeviceHints): QualityLevel {
  if (d.mobile) return "low";
  const gpu = d.gpu?.toLowerCase() ?? "";
  if (/swiftshader|llvmpipe|software/.test(gpu)) return "low";
  if ((d.memory !== undefined && d.memory < 4) || d.cores < 4) return "low";
  if (/apple m\d|nvidia|geforce|radeon rx|rtx/.test(gpu)) return "high";
  return "medium";
}

export interface GovernorOptions {
  /** fps yang dituju. */
  targetFps?: number;
  /** Lama satu jendela pengukuran. */
  windowMs?: number;
  /** Jumlah jendela berturut-turut di bawah target sebelum turun. */
  badWindows?: number;
}

/**
 * Menurunkan kualitas satu tingkat bila fps rata-rata di bawah target beberapa jendela berturut-turut.
 * Tidak pernah menaikkan sendiri, agar kualitas tidak naik-turun bergantian; pemain bisa memilih manual.
 */
export class QualityGovernor {
  private windowStart: number | null = null;
  private frames = 0;
  private bad = 0;
  private readonly targetFps: number;
  private readonly windowMs: number;
  private readonly badWindows: number;

  constructor(
    public level: QualityLevel,
    { targetFps = 50, windowMs = 2000, badWindows = 2 }: GovernorOptions = {},
  ) {
    this.targetFps = targetFps;
    this.windowMs = windowMs;
    this.badWindows = badWindows;
  }

  /** Dipanggil tiap frame saat bermain. Mengembalikan tingkat baru bila turun, atau null. */
  frame(now: number): QualityLevel | null {
    if (this.windowStart === null) {
      this.windowStart = now;
      this.frames = 0;
      return null;
    }
    this.frames++;
    const elapsed = now - this.windowStart;
    if (elapsed < this.windowMs) return null;
    const fps = (this.frames * 1000) / elapsed;
    this.windowStart = now;
    this.frames = 0;
    this.bad = fps < this.targetFps ? this.bad + 1 : 0;
    if (this.bad < this.badWindows) return null;
    this.bad = 0;
    const next = QUALITY_LEVELS[QUALITY_LEVELS.indexOf(this.level) + 1];
    if (!next) return null;
    this.level = next;
    return next;
  }

  /** Jeda, menu, atau tab tersembunyi: jangan hitung celah waktu itu sebagai frame lambat. */
  pause(): void {
    this.windowStart = null;
    this.bad = 0;
  }
}
