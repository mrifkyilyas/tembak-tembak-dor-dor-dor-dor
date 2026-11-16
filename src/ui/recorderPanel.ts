import { RECORDING_SCENARIOS, type GestureRecording } from "../gesture/recording";
import type { HandFrame } from "../tracking/types";

const COUNTDOWN_S = 3;
const DURATION_MS = 4000;

/**
 * Merekam HandFrame mentah selama beberapa detik untuk satu skenario, lalu mengunduhnya
 * sebagai JSON. Berkasnya disalin ke tests/fixtures/ untuk dijadikan data uji.
 */
export class RecorderPanel {
  private frames: HandFrame[] | null = null;

  constructor(
    private readonly select: HTMLSelectElement,
    private readonly button: HTMLButtonElement,
    private readonly info: HTMLElement,
    private readonly cue: HTMLElement,
  ) {
    for (const s of RECORDING_SCENARIOS) {
      select.add(new Option(s.label, s.id));
    }
    select.addEventListener("change", () => this.showInstruction());
    button.addEventListener("click", () => void this.record());
    this.showInstruction();
  }

  /** Dipanggil tiap frame pelacakan; hanya menyimpan saat sedang merekam. */
  push(frame: HandFrame | null): void {
    if (this.frames && frame) this.frames.push(frame);
  }

  private get scenario() {
    return RECORDING_SCENARIOS.find((s) => s.id === this.select.value) ?? RECORDING_SCENARIOS[0];
  }

  private showInstruction(): void {
    this.info.textContent = this.scenario.instruction;
  }

  private async record(): Promise<void> {
    const scenario = this.scenario;
    this.button.disabled = true;
    this.select.disabled = true;
    try {
      for (let i = COUNTDOWN_S; i > 0; i--) {
        this.info.textContent = `${scenario.instruction} Mulai dalam ${i}...`;
        await sleep(1000);
      }
      this.info.textContent = "Merekam...";
      this.frames = [];
      const pressCues: number[] = [];
      const cueTimers = (scenario.pressCuesS ?? []).map((s) =>
        setTimeout(() => {
          pressCues.push(performance.now());
          this.showCue();
        }, s * 1000),
      );
      await sleep(DURATION_MS);
      cueTimers.forEach(clearTimeout);
      const frames = this.frames;
      this.frames = null;

      if (frames.length === 0) {
        this.info.textContent = "Tidak ada tangan terekam. Coba lagi.";
        return;
      }
      const recording: GestureRecording = { version: 1, scenario: scenario.id, expect: scenario.expect, frames };
      if (pressCues.length > 0) recording.pressCues = pressCues;
      const hand = frames[0].handedness === "Left" ? "kiri" : "kanan";
      download(`${scenario.id}-${hand}-${Date.now()}.json`, JSON.stringify(recording));
      this.info.textContent = `Tersimpan ke Downloads: ${frames.length} frame.`;
    } finally {
      this.frames = null;
      this.button.disabled = false;
      this.select.disabled = false;
    }
  }

  /** Aba-aba "TEMBAK!" di tengah layar beserta bunyi pendek. */
  private showCue(): void {
    this.cue.hidden = false;
    setTimeout(() => (this.cue.hidden = true), 300);
    beep();
  }
}

let audio: AudioContext | null = null;

function beep(): void {
  try {
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.15);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.15);
  } catch {
    // Bunyi hanya pelengkap; aba-aba visual tetap tampil.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Beri waktu browser memulai unduhan sebelum URL dicabut.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
