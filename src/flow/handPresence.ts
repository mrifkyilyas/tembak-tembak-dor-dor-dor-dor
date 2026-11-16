/**
 * Menentukan kapan tangan dianggap hilang (untuk jeda otomatis) dan kapan kembali.
 * Hilang setelah tidak terlihat terus-menerus `lostAfterMs`; kembali setelah terlihat terus-menerus
 * `backAfterMs`, agar jeda tidak berkedip saat pelacakan tersendat.
 */
export class HandPresence {
  present = true;
  private changedSince: number | null = null;

  constructor(
    private readonly lostAfterMs = 2000,
    private readonly backAfterMs = 500,
  ) {}

  /** Dipanggil tiap frame; mengembalikan true bila status berubah. */
  update(visible: boolean, now: number): boolean {
    if (visible === this.present) {
      this.changedSince = null;
      return false;
    }
    this.changedSince ??= now;
    if (now - this.changedSince < (this.present ? this.lostAfterMs : this.backAfterMs)) return false;
    this.present = visible;
    this.changedSince = null;
    return true;
  }

  reset(): void {
    this.present = true;
    this.changedSince = null;
  }
}
