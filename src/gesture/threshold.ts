/**
 * Ambang ganda (hysteresis): aktif saat nilai turun di bawah `enterBelow`,
 * baru nonaktif lagi saat naik di atas `exitAbove`. Nilai di antaranya mempertahankan status.
 */
export class Threshold {
  private state: boolean | null = null;

  constructor(
    private readonly enterBelow: number,
    private readonly exitAbove: number,
  ) {}

  update(value: number): boolean {
    if (value < this.enterBelow) this.state = true;
    else if (value > this.exitAbove) this.state = false;
    // Nilai pertama yang jatuh di zona tengah diputuskan oleh titik tengahnya.
    else if (this.state === null) this.state = value < (this.enterBelow + this.exitAbove) / 2;
    return this.state;
  }

  reset(): void {
    this.state = null;
  }
}
