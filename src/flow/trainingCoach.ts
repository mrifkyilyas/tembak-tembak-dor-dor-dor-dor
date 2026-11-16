import type { PlayerIntent } from "../input/intent";

export type TrainingStepId = "aim" | "pistol" | "shotgun" | "shield" | "blast";

export interface TrainingStep {
  id: TrainingStepId;
  title: string;
  instruction: string;
  /** Jumlah yang harus dicapai: milidetik untuk langkah tahan, hitungan untuk langkah kejadian. */
  goal: number;
}

export const TRAINING_STEPS: TrainingStep[] = [
  { id: "aim", title: "Membidik", instruction: "Angkat satu tangan ke depan kamera dan gerakkan crosshair.", goal: 1500 },
  { id: "pistol", title: "Pistol", instruction: "Luruskan telunjuk, lalu sentakkan tangan ke atas 3 kali.", goal: 3 },
  { id: "shotgun", title: "Shotgun", instruction: "Luruskan telunjuk dan jari tengah, lalu sentak 2 kali.", goal: 2 },
  { id: "shield", title: "Perisai", instruction: "Buka telapak tangan dan tahan.", goal: 1500 },
  { id: "blast", title: "Ledakan", instruction: "Kepalkan tangan sebentar, lalu buka telapak.", goal: 1 },
];

export interface TrainingProgress {
  index: number;
  step: TrainingStep | null;
  /** 0–1 untuk langkah sekarang. */
  progress: number;
  done: boolean;
  /** Langkah yang baru selesai pada pembaruan ini, untuk umpan balik. */
  completed: TrainingStepId | null;
}

/**
 * Latihan gestur: tiap langkah selesai setelah pola diperagakan cukup lama atau cukup kali.
 * Membaca niat pemain, jadi bebas DOM dan bisa diuji dengan niat buatan.
 */
export class TrainingCoach {
  private index = 0;
  private amount = 0;

  constructor(
    private readonly steps: TrainingStep[] = TRAINING_STEPS,
    /** Isi tenaga minimum agar ledakan latihan dihitung (sama dengan permainan). */
    private readonly minBlastChargeMs = 300,
  ) {}

  get done(): boolean {
    return this.index >= this.steps.length;
  }

  skip(): void {
    this.index = this.steps.length;
  }

  update(intent: PlayerIntent, dtMs: number): TrainingProgress {
    let completed: TrainingStepId | null = null;
    const step = this.steps[this.index];
    if (step) {
      this.amount += this.contribution(step.id, intent, dtMs);
      if (this.amount >= step.goal) {
        completed = step.id;
        this.index++;
        this.amount = 0;
      }
    }
    const current = this.steps[this.index] ?? null;
    return {
      index: this.index,
      step: current,
      progress: current ? Math.min(1, this.amount / current.goal) : 1,
      done: this.done,
      completed,
    };
  }

  private contribution(id: TrainingStepId, intent: PlayerIntent, dtMs: number): number {
    switch (id) {
      case "aim":
        return intent.active && intent.aim ? dtMs : 0;
      case "pistol":
      case "shotgun":
        return intent.fire && intent.weapon === id ? 1 : 0;
      case "shield":
        return intent.weapon === "shield" && intent.shieldUp ? dtMs : 0;
      case "blast":
        return intent.blast && intent.blast.chargeMs >= this.minBlastChargeMs ? 1 : 0;
    }
  }
}
