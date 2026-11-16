import type { Cue } from "./cues";

const MUTE_KEY = "gestur.bisu";
const MUSIC_BPM = 96;
/** Seberapa jauh ke depan not musik dijadwalkan (detik); penjadwal berjalan tiap 50 ms. */
const LOOKAHEAD_S = 0.15;
/** Bas 16 langkah (semitone dari A1, null = diam), berulang dengan perubahan akor tiap 4 putaran. */
const BASS: Array<number | null> = [0, null, 0, null, 0, 3, null, 0, null, 0, 7, null, 5, null, 3, null];
const CHORD_SHIFT = [0, 0, -2, -4];
const A1 = 55;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function readMuted(storage: Storage | null): boolean {
  try {
    return storage?.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Efek suara dan musik yang disintesis dengan Web Audio: tanpa berkas suara, jadi tidak menambah unduhan.
 * Konteks audio baru dibuat pada gestur pengguna pertama (aturan putar-otomatis browser).
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private hum: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;
  private musicOn = false;
  private nextStep = 0;
  private step = 0;
  private scheduler: number | null = null;
  muted: boolean;

  constructor(private readonly storage: Storage | null = safeLocalStorage()) {
    this.muted = readMuted(storage);
  }

  /** Dipanggil dari penangan klik/tombol. Aman dipanggil berulang. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      // Pembatas lembut: banyak ledakan sekaligus tidak pecah.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 8;
      this.master.connect(limiter).connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.master);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      this.storage?.setItem(MUTE_KEY, this.muted ? "1" : "0");
    } catch {
      // Penyimpanan diblokir: pilihan berlaku sampai halaman ditutup.
    }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  play(cue: Cue): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    switch (cue) {
      case "pistol":
        this.noiseHit(t, 0.12, 0.7, "bandpass", 2500, 600, 0.8);
        this.tone(t, "sine", 180, 50, 0.1, 0.6);
        break;
      case "shotgun":
        this.noiseHit(t, 0.35, 1, "lowpass", 4000, 300, 0.5);
        this.tone(t, "sine", 120, 35, 0.25, 0.9);
        break;
      case "dryFire":
        this.tone(t, "square", 300, 250, 0.03, 0.15);
        break;
      case "hit":
        this.tone(t, "square", 1400, 900, 0.05, 0.12);
        break;
      case "kill":
        this.noiseHit(t, 0.45, 0.6, "lowpass", 1800, 120, 0.7);
        this.tone(t, "triangle", 220, 40, 0.4, 0.5);
        break;
      case "warning":
        this.tone(t, "square", 880, 880, 0.07, 0.12);
        this.tone(t + 0.11, "square", 880, 880, 0.07, 0.12);
        break;
      case "projectile":
        this.tone(t, "sawtooth", 300, 900, 0.18, 0.08);
        break;
      case "hurt":
        this.noiseHit(t, 0.25, 0.9, "lowpass", 900, 200, 1);
        this.tone(t, "sine", 90, 40, 0.3, 0.9);
        break;
      case "block":
        this.tone(t, "sine", 1500, 1400, 0.35, 0.3);
        this.tone(t, "sine", 2260, 2200, 0.25, 0.15);
        break;
      case "shieldBreak":
        this.tone(t, "sawtooth", 900, 120, 0.4, 0.25);
        this.noiseHit(t, 0.3, 0.4, "highpass", 3000, 1500, 0.5);
        break;
      case "blast":
        this.noiseHit(t, 1.2, 1, "lowpass", 3000, 80, 0.4);
        this.tone(t, "sine", 160, 30, 1, 1);
        break;
      case "stopCleared":
        [523, 659, 784].forEach((f, i) => this.tone(t + i * 0.09, "triangle", f, f, 0.25, 0.2));
        break;
      case "won":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.14, "triangle", f, f, 0.5, 0.25));
        break;
      case "lost":
        [392, 311, 233].forEach((f, i) => this.tone(t + i * 0.22, "triangle", f, f * 0.97, 0.5, 0.25));
        break;
    }
  }

  /** Dengung isi tenaga ledakan; 0 = diam. Nada naik sampai tenaga penuh. */
  setCharge(chargeMs: number, fullMs: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.hum) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(this.sfx);
      osc.start();
      osc2.start();
      this.hum = { osc, osc2, gain };
    }
    const k = Math.min(1, chargeMs / fullMs);
    const t = ctx.currentTime;
    const f = 70 + 200 * k;
    this.hum.osc.frequency.setTargetAtTime(f, t, 0.03);
    this.hum.osc2.frequency.setTargetAtTime(f * 2.01, t, 0.03);
    this.hum.gain.gain.setTargetAtTime(chargeMs > 0 ? 0.06 + 0.1 * k : 0, t, 0.04);
  }

  /** Musik latar menyala saat bermain, memudar saat menu atau jeda. */
  setMusic(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx || on === this.musicOn) return;
    this.musicOn = on;
    this.musicBus.gain.setTargetAtTime(on ? 0.22 : 0, ctx.currentTime, 0.4);
    if (on && this.scheduler === null) {
      this.nextStep = ctx.currentTime + 0.05;
      this.scheduler = window.setInterval(() => this.scheduleMusic(), 50);
    }
    if (!on && this.scheduler !== null) {
      // Penjadwal berhenti setelah musik memudar, agar tidak terdengar terpotong. Bila musik dinyalakan
      // lagi sebelum itu, penjadwal baru memakai `nextStep` yang sama, jadi tidak ada not ganda.
      const id = this.scheduler;
      this.scheduler = null;
      window.setTimeout(() => window.clearInterval(id), 1500);
    }
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const stepS = 60 / MUSIC_BPM / 4;
    while (this.nextStep < ctx.currentTime + LOOKAHEAD_S) {
      const t = this.nextStep;
      const i = this.step % 16;
      const shift = CHORD_SHIFT[Math.floor(this.step / 64) % CHORD_SHIFT.length];
      const note = BASS[i];
      if (note !== null) this.musicTone(t, A1 * 2 ** ((note + shift) / 12), stepS * 1.6);
      if (i % 4 === 0) this.kick(t);
      if (i % 2 === 1) this.hat(t, i % 4 === 3 ? 0.05 : 0.025);
      this.nextStep += stepS;
      this.step++;
    }
  }

  // ---- Bahan suara ----

  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, out: AudioNode = this.sfx): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseHit(t: number, dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, q: number, out: AudioNode = this.sfx): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private musicTone(t: number, f: number, dur: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(gain).connect(this.musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private kick(t: number): void {
    this.tone(t, "sine", 140, 45, 0.25, 0.9, this.musicBus);
  }

  private hat(t: number, vol: number): void {
    this.noiseHit(t, 0.05, vol * 4, "highpass", 8000, 7000, 0.7, this.musicBus);
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
