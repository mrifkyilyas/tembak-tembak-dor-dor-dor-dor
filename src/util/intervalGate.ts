/**
 * Membatasi pekerjaan berulang ke frekuensi tertentu di dalam loop yang lebih cepat
 * (misalnya pelacakan 30 Hz di dalam requestAnimationFrame 60/120 Hz).
 */
export class IntervalGate {
  private readonly intervalMs: number;
  private last = Number.NEGATIVE_INFINITY;

  /** Toleransi agar tick rAF yang datang sedikit lebih awal tidak dilewati. */
  constructor(
    hz: number,
    private readonly toleranceMs = 2,
  ) {
    this.intervalMs = 1000 / hz;
  }

  /** true bila sudah waktunya; sekaligus mencatat waktu jalan terakhir. */
  ready(now: number): boolean {
    if (now - this.last + this.toleranceMs < this.intervalMs) return false;
    this.last = now;
    return true;
  }
}
