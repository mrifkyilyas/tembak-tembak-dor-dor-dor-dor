const KEY_PREFIX = "gesture-rail-shooter:skor-tertinggi:";

/** Penyimpanan minimal yang dibutuhkan; `localStorage` cocok, uji memakai tiruan. */
export interface ScoreStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Skor tertinggi lokal per tingkat kesulitan. Penyimpanan browser bisa tidak tersedia
 * (jendela pribadi, data diblokir), jadi semua akses dibungkus dan gagal dengan diam.
 */
export class HighScores {
  private readonly memory = new Map<string, number>();

  constructor(private readonly storage: ScoreStorage | null = safeLocalStorage()) {}

  get(difficulty: string): number {
    const key = KEY_PREFIX + difficulty;
    try {
      const stored = Number(this.storage?.getItem(key));
      if (Number.isFinite(stored) && stored > 0) return stored;
    } catch {
      // Abaikan: pakai nilai di memori.
    }
    return this.memory.get(key) ?? 0;
  }

  /** Mencatat skor; mengembalikan true bila ini rekor baru. */
  submit(difficulty: string, score: number): boolean {
    if (score <= this.get(difficulty)) return false;
    const key = KEY_PREFIX + difficulty;
    this.memory.set(key, score);
    try {
      this.storage?.setItem(key, String(score));
    } catch {
      // Abaikan: rekor tetap berlaku selama halaman terbuka.
    }
    return true;
  }
}

function safeLocalStorage(): ScoreStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
