/** Menghitung berapa kali per detik sesuatu terjadi, dalam jendela geser. */
export class RateMeter {
  private readonly stamps: number[] = [];

  constructor(private readonly windowMs = 1000) {}

  tick(now: number): void {
    this.stamps.push(now);
    this.prune(now);
  }

  /** Kejadian per detik dalam jendela terakhir. */
  rate(now: number): number {
    this.prune(now);
    return (this.stamps.length * 1000) / this.windowMs;
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.stamps.length > 0 && this.stamps[0] <= cutoff) {
      this.stamps.shift();
    }
  }
}
