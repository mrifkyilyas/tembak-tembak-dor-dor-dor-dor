export type TrackingIssue = "slow" | "flicker" | null;

export interface TrackingQualityOptions {
  windowMs?: number;
  /** Di bawah ini pelacakan dianggap lambat (frame kamera per detik yang diproses). */
  minFps?: number;
  /** Tangan muncul-hilang sebanyak ini dalam jendela berarti pelacakan tidak stabil (cahaya, latar). */
  maxFlips?: number;
}

/**
 * Menilai mutu pelacakan dari hasil tiap frame pelacak dalam jendela waktu terakhir.
 * Tangan yang memang tidak ada bukan masalah mutu (itu urusan `HandPresence`); yang dicari
 * adalah pelacak yang lambat atau tangan yang berkedip ada-tidak ada.
 */
export class TrackingQuality {
  private samples: Array<{ t: number; visible: boolean }> = [];
  private readonly windowMs: number;
  private readonly minFps: number;
  private readonly maxFlips: number;

  constructor({ windowMs = 3000, minFps = 15, maxFlips = 6 }: TrackingQualityOptions = {}) {
    this.windowMs = windowMs;
    this.minFps = minFps;
    this.maxFlips = maxFlips;
  }

  push(visible: boolean, now: number): void {
    this.samples.push({ t: now, visible });
    const from = now - this.windowMs;
    while (this.samples.length > 0 && this.samples[0].t < from) this.samples.shift();
  }

  issue(now: number): TrackingIssue {
    const recent = this.samples.filter((s) => s.t >= now - this.windowMs);
    if (recent.length < 2) return null;
    const spanMs = recent[recent.length - 1].t - recent[0].t;
    // Kecepatan baru dinilai setelah jendela hampir penuh, agar awal pelacakan tidak salah dinilai.
    if (spanMs >= this.windowMs * 0.8 && (recent.length - 1) / (spanMs / 1000) < this.minFps) return "slow";
    return this.flicker(recent);
  }

  reset(): void {
    this.samples = [];
  }

  private flicker(recent: Array<{ visible: boolean }>): TrackingIssue {
    let flips = 0;
    for (let i = 1; i < recent.length; i++) if (recent[i].visible !== recent[i - 1].visible) flips++;
    return flips >= this.maxFlips ? "flicker" : null;
  }
}
