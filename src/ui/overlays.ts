import type { TrainingProgress, TrainingStep } from "../flow/trainingCoach";
import type { TrackingIssue } from "../flow/trackingQuality";

function q<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Elemen ${selector} tidak ditemukan.`);
  return node;
}

/** Layar izin kamera: menjelaskan pemakaian kamera sebelum browser meminta izin. */
export class PermissionScreen {
  private readonly allow: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly pointer: HTMLButtonElement;

  constructor(
    private readonly root: HTMLElement,
    handlers: { onAllow(): void; onPointer(): void; onBack(): void },
  ) {
    this.allow = q(root, "#permission-allow");
    this.pointer = q(root, "#permission-pointer");
    this.status = q(root, "#permission-status");
    this.allow.addEventListener("click", handlers.onAllow);
    this.pointer.addEventListener("click", handlers.onPointer);
    q(root, "#permission-back").addEventListener("click", handlers.onBack);
  }

  show(): void {
    this.root.hidden = false;
    this.setState("idle");
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** idle: belum dicoba; busy: sedang membuka; failed: gagal dengan pesan, tombol menjadi "Coba lagi". */
  setState(state: "idle" | "busy" | "failed", message = ""): void {
    this.allow.disabled = state === "busy";
    this.pointer.disabled = state === "busy";
    this.allow.textContent = state === "failed" ? "Coba lagi" : "Izinkan kamera";
    this.status.textContent = message;
    this.status.classList.toggle("error", state === "failed");
  }
}

/** Kartu latihan gestur di atas layar. */
export class TrainingPanel {
  private readonly title: HTMLElement;
  private readonly instruction: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly dots: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly steps: TrainingStep[],
    onSkip: () => void,
  ) {
    this.title = q(root, "#training-title");
    this.instruction = q(root, "#training-instruction");
    this.bar = q(root, "#training-progress > span");
    this.dots = q(root, "#training-steps");
    this.dots.replaceChildren(
      ...steps.map((s) => {
        const dot = document.createElement("li");
        dot.textContent = s.title;
        return dot;
      }),
    );
    q(root, "#training-skip").addEventListener("click", onSkip);
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  update(p: TrainingProgress): void {
    if (p.step) {
      this.title.textContent = `Latihan ${p.index + 1}/${this.steps.length} · ${p.step.title}`;
      this.instruction.textContent = p.step.instruction;
    } else {
      this.title.textContent = "Siap!";
      this.instruction.textContent = "Permainan dimulai sebentar lagi.";
    }
    this.bar.style.width = `${p.progress * 100}%`;
    [...this.dots.children].forEach((dot, i) => {
      dot.classList.toggle("done", i < p.index);
      dot.classList.toggle("current", i === p.index);
    });
    if (p.completed) {
      this.root.classList.remove("cheer");
      void this.root.offsetWidth; // putar ulang animasi
      this.root.classList.add("cheer");
    }
  }
}

export type PauseReason = "user" | "tab" | "hand";

const PAUSE_TEXT: Record<PauseReason, { title: string; body: string }> = {
  user: { title: "Jeda", body: "Tekan Esc atau Lanjut untuk kembali bermain." },
  tab: { title: "Jeda", body: "Permainan berhenti saat tab tidak terlihat. Tekan Lanjut untuk kembali." },
  hand: {
    title: "Tangan tidak terlihat",
    body: "Angkat satu tangan ke depan kamera, sekitar 40–60 cm dari layar. Permainan lanjut sendiri begitu tanganmu terlihat.",
  },
};

/** Layar jeda dengan alasan; jeda karena tangan hilang lanjut sendiri, jadi tanpa tombol Lanjut. */
export class PauseScreen {
  reason: PauseReason | null = null;
  private readonly resume: HTMLButtonElement;

  constructor(
    private readonly root: HTMLElement,
    handlers: { onResume(): void; onQuit(): void },
  ) {
    this.resume = q(root, "#pause-resume");
    this.resume.addEventListener("click", handlers.onResume);
    q(root, "#pause-quit").addEventListener("click", handlers.onQuit);
  }

  show(reason: PauseReason): void {
    this.reason = reason;
    q(this.root, "#pause-title").textContent = PAUSE_TEXT[reason].title;
    q(this.root, "#pause-body").textContent = PAUSE_TEXT[reason].body;
    this.resume.hidden = reason === "hand";
    this.root.dataset.reason = reason;
    this.root.hidden = false;
  }

  hide(): void {
    this.reason = null;
    this.root.hidden = true;
  }
}

const ISSUE_TEXT: Record<Exclude<TrackingIssue, null>, string> = {
  slow: "Pelacakan tangan lambat. Tutup tab atau aplikasi berat lain.",
  flicker: "Tangan sulit dikenali. Tambah cahaya, hindari latar ramai, dan jaga tangan di tengah kamera.",
};

/** Petunjuk singkat di layar tentang mutu pelacakan; tetap tampil sebentar agar tidak berkedip. */
export class TrackingHint {
  private shownUntil = 0;

  constructor(private readonly el: HTMLElement) {}

  update(issue: TrackingIssue, now: number, allowed: boolean): void {
    if (allowed && issue) {
      this.el.textContent = ISSUE_TEXT[issue];
      this.shownUntil = now + 3000;
    }
    this.el.hidden = !allowed || now > this.shownUntil;
  }
}
