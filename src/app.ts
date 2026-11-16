import { cuesFor } from "./audio/cues";
import { Sound } from "./audio/sound";
import { applyDifficulty, DIFFICULTIES, type DifficultyId } from "./data/difficulty";
import { LEVEL_1 } from "./data/level1";
import { HandPresence } from "./flow/handPresence";
import { TRAINING_STEPS, TrainingCoach } from "./flow/trainingCoach";
import { TrackingQuality } from "./flow/trackingQuality";
import { DEFAULT_GAME_CONFIG } from "./game/config";
import { GameSession } from "./game/session";
import { GestureInterpreter } from "./gesture/gestureInterpreter";
import { GestureIntentSource } from "./input/gestureSource";
import { IDLE_INTENT, type IntentSource, type PlayerIntent, type Weapon } from "./input/intent";
import { bindPointer, PointerIntentSource } from "./input/pointerSource";
import { Graphics } from "./render/graphics";
import { WeaponView } from "./render/weaponView";
import {
  deviceHints,
  guessQuality,
  QualityGovernor,
  readQualityPreference,
  writeQualityPreference,
  type QualityPreference,
} from "./render/quality";
import { createScene } from "./render/scene";
import { GameWorld } from "./render/world";
import { CameraError, openCamera, type CameraErrorKind } from "./tracking/camera";
import { createHandTracker } from "./tracking/handTracker";
import type { HandFrame } from "./tracking/types";
import { Crosshair } from "./ui/crosshair";
import { GestureDebug } from "./ui/gestureDebug";
import { HighScores } from "./ui/highScore";
import { Hud } from "./ui/hud";
import { PauseScreen, PermissionScreen, TrackingHint, TrainingPanel, type PauseReason } from "./ui/overlays";
import { RecorderPanel } from "./ui/recorderPanel";
import { MenuScreen, ResultScreen } from "./ui/screens";
import { WebcamPreview } from "./ui/webcamPreview";
import { RateMeter } from "./util/rateMeter";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Elemen #${id} tidak ditemukan.`);
  return node as T;
}

/** Jeda antara akhir sesi dan layar hasil, agar ledakan/kekalahan terakhir sempat terlihat. */
const RESULT_DELAY_MS = 1500;
/** Jeda setelah latihan selesai sebelum permainan dimulai, agar "Siap!" sempat terbaca. */
const TRAINING_OUTRO_MS = 900;
/** Langkah waktu terpanjang per frame; tab yang tertidur tidak membuat musuh melompat. */
const MAX_DT_MS = 50;

const CAMERA_ERROR_TEXT: Record<CameraErrorKind, string> = {
  insecure: "Kamera hanya bisa dibuka lewat alamat https://. Buka tautan HTTPS game ini, atau main dengan sentuhan.",
  denied: "Izin kamera ditolak. Izinkan lewat ikon kamera di bilah alamat lalu tekan Coba lagi, atau main dengan mouse.",
  "not-found": "Kamera tidak ditemukan. Sambungkan webcam lalu tekan Coba lagi, atau main dengan mouse.",
  unsupported: "Browser ini tidak mendukung akses kamera. Main dengan mouse, atau buka di Chrome atau Safari terbaru.",
  other: "Kamera gagal dibuka. Tutup aplikasi lain yang memakai kamera lalu tekan Coba lagi, atau main dengan mouse.",
};

const canvas = el<HTMLCanvasElement>("render-canvas");
const video = el<HTMLVideoElement>("webcam");
const previewCanvas = el<HTMLCanvasElement>("webcam-preview");
const preview = new WebcamPreview(previewCanvas);
const panel = el("panel");
const stats = el<HTMLPreElement>("stats");
const gestureDebug = new GestureDebug(el("pose"), el("gesture-detail"));
const recorder = new RecorderPanel(el("rec-scenario"), el("rec-start"), el("rec-info"), el("rec-cue"));
const crosshair = new Crosshair(el("crosshair"));
const hud = new Hud(el("hud"), el("vignette"));
const hint = new TrackingHint(el("tracking-hint"));
const highScores = new HighScores();
const interpreter = new GestureInterpreter();
const presence = new HandPresence();
const quality = new TrackingQuality();

const pointerSource = new PointerIntentSource();
const gestureSource = new GestureIntentSource();
let source: IntentSource = pointerSource;
let cameraOpen = false;
let cameraReady = false;

const renderMeter = new RateMeter();
const trackMeter = new RateMeter();
let lastFrame: HandFrame | null = null;
let delegate = "-";

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
const { engine, scene, camera } = createScene(canvas);
const device = deviceHints(engine);
const guessedQuality = guessQuality(device);
let qualityPref: QualityPreference = readQualityPreference(storage);
const graphics = new Graphics(engine, scene, camera, qualityPref === "auto" ? guessedQuality : qualityPref);
/** HP cukup 30 fps (layar kecil, baterai); desktop dituntut 50. */
const governorOptions = { targetFps: device.mobile ? 30 : 50 };
/** Penurun kualitas otomatis; hanya bekerja saat pilihan "Otomatis" dan sedang bermain. */
let governor = new QualityGovernor(graphics.level, governorOptions);
const sound = new Sound();
const world = new GameWorld(scene, camera, LEVEL_1, graphics);
const weaponView = new WeaponView(scene, camera);
/** Sesi yang tidak pernah berjalan: hanya untuk posisi kamera di belakang menu dan latihan. */
const idleSession = new GameSession(LEVEL_1);

type Phase = "menu" | "permission" | "training" | "playing" | "paused" | "result";
let phase: Phase = "menu";
let session: GameSession | null = null;
let difficulty: DifficultyId = "normal";
let endedAt: number | null = null;
let trainedThisPage = false;
/** Yang dilakukan setelah kamera siap: bermain (dengan latihan pertama kali) atau latihan saja. */
let afterCamera: "play" | "training" = "play";
let coach: TrainingCoach | null = null;
let trainingThenPlay = false;
let trainingDoneAt: number | null = null;

const menu = new MenuScreen(
  el("menu"),
  {
    onStart: (input, d) => {
      difficulty = d;
      if (input === "pointer") return startPointerGame();
      afterCamera = "play";
      if (cameraReady) afterHandReady();
      else showPermission();
    },
    onTraining: () => {
      afterCamera = "training";
      if (cameraReady) startTraining(false);
      else showPermission();
    },
  },
  (d) => highScores.get(d),
);
const permission = new PermissionScreen(el("permission"), {
  onAllow: () => void allowCamera(),
  onPointer: startPointerGame,
  onBack: showMenu,
});
const trainingPanel = new TrainingPanel(el("training"), TRAINING_STEPS, () => coach?.skip());
const pause = new PauseScreen(el("pause"), { onResume: resume, onQuit: showMenu });
const result = new ResultScreen(el("result"), () => beginSession(), showMenu);

const qualitySelect = el<HTMLSelectElement>("menu-quality");
qualitySelect.value = qualityPref;
qualitySelect.addEventListener("change", () => {
  qualityPref = qualitySelect.value as QualityPreference;
  writeQualityPreference(storage, qualityPref);
  graphics.apply(qualityPref === "auto" ? guessedQuality : qualityPref);
  governor = new QualityGovernor(graphics.level, governorOptions);
});
// HP: sentuhan jadi pilihan utama. Gestur tetap bisa dicoba, tapi pelacakan tangan di HP belum
// terbukti 30 fps (rencana tahap 8).
if (device.mobile) {
  const hand = document.querySelector<HTMLButtonElement>('[data-start="hand"]');
  const touch = document.querySelector<HTMLButtonElement>('[data-start="pointer"]');
  if (hand && touch) {
    touch.textContent = "Main dengan sentuhan";
    touch.className = "primary";
    hand.className = "secondary";
    hand.textContent = "Coba gestur tangan";
    hand.before(touch);
  }
}
const soundButton = el<HTMLButtonElement>("menu-sound");
function syncSoundButton(): void {
  soundButton.textContent = sound.muted ? "Mati" : "Nyala";
  soundButton.setAttribute("aria-pressed", String(!sound.muted));
}
syncSoundButton();
soundButton.addEventListener("click", () => {
  sound.toggleMute();
  syncSoundButton();
});
// Konteks audio hanya boleh dibuat setelah gestur pengguna.
window.addEventListener("pointerdown", () => sound.unlock(), { capture: true });
window.addEventListener("keydown", () => sound.unlock(), { capture: true });

if (import.meta.env.DEV) {
  // Pegangan untuk memeriksa permainan dari konsol saat pengembangan; tidak ada di build produksi.
  Object.assign(window, {
    __game: {
      engine,
      scene,
      graphics,
      world,
      interpreter,
      gestureSource,
      weaponView,
      sound,
      /** Frame tangan buatan untuk memeriksa panel diagnostik tanpa kamera. */
      setFrame: (frame: HandFrame | null) => (lastFrame = frame),
      session: () => session,
      phase: () => phase,
      // Menjalankan alur tangan tanpa kamera, dengan GestureState buatan lewat gestureSource.push.
      training: () => startTraining(false),
      handGame: () => {
        trainedThisPage = true;
        afterHandReady();
      },
    },
  });
}

bindPointer(canvas, pointerSource);
for (const button of document.querySelectorAll<HTMLButtonElement>("#weapons button")) {
  button.addEventListener("click", () => pointerSource.selectWeapon(button.dataset.weapon as Weapon));
}
window.addEventListener("keydown", (e) => {
  if (e.key === "`") panel.hidden = !panel.hidden;
  if (e.key === "m" || e.key === "M") {
    sound.toggleMute();
    syncSoundButton();
  }
  if (e.key === "Escape") {
    if (phase === "playing") pauseGame("user");
    else if (phase === "paused" && pause.reason !== "hand") resume();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && phase === "playing") pauseGame("tab");
});

/** Bantuan bidik diterapkan pada crosshair dan tembakan sekaligus, agar yang terlihat sama dengan yang ditembak. */
function assisted(s: GameSession, intent: PlayerIntent): PlayerIntent {
  return {
    ...intent,
    aim: intent.aim && s.assistAim(intent.aim),
    fire: intent.fire && { aim: s.assistAim(intent.fire.aim) },
  };
}

engine.runRenderLoop(() => {
  const now = performance.now();
  renderMeter.tick(now);
  const dt = Math.min(engine.getDeltaTime(), MAX_DT_MS);
  const raw = source.read(now);
  const handMode = source === gestureSource;

  let charge = 0;
  /** Masukan yang menggerakkan senjata di layar: sama dengan yang dipakai game frame ini. */
  let shown: PlayerIntent = raw;
  if (phase === "training" && coach) {
    // Latihan tanpa sesi: suara langsung dari gestur, agar pemain mengenal bunyinya.
    if (raw.fire) sound.play(raw.weapon === "shotgun" ? "shotgun" : "pistol");
    if (raw.blast) sound.play("blast");
    if (raw.weapon === "blast") charge = raw.chargeMs;
    const progress = coach.update(raw, dt);
    trainingPanel.update(progress);
    crosshair.update(raw);
    if (progress.done) trainingDoneAt ??= now;
    if (trainingDoneAt !== null && now - trainingDoneAt > TRAINING_OUTRO_MS) finishTraining();
    syncIdle();
  } else if (phase === "paused" && session) {
    world.sync(session, [], now);
    crosshair.update(IDLE_INTENT);
    if (pause.reason === "hand" && presence.update(raw.active, now) && presence.present) resume();
  } else if (session && (phase === "playing" || phase === "result")) {
    session.view.aspect = engine.getAspectRatio(camera);
    const intent = assisted(session, raw);
    shown = intent;
    const events = session.update(dt, intent);
    for (const cue of cuesFor(events)) sound.play(cue);
    if (phase === "playing" && intent.weapon === "blast" && session.weapons.blastCooldownLeft(session.time) <= 0) charge = intent.chargeMs;
    world.sync(session, events, now);
    hud.update(session, intent, events);
    crosshair.update(phase === "playing" ? intent : IDLE_INTENT);
    if (session.state !== "playing") endedAt ??= now;
    if (phase === "playing" && endedAt !== null && now - endedAt > RESULT_DELAY_MS) showResult(session);
    else if (phase === "playing" && handMode && presence.update(raw.active, now) && !presence.present) pauseGame("hand");
  } else {
    syncIdle();
  }

  const handPhase = handMode && (phase === "playing" || phase === "training");
  hint.update(quality.issue(now), now, handPhase);
  weaponView.update(shown, phase === "playing" || (phase === "training" && handMode), now, dt, Math.tan(camera.fov / 2), engine.getAspectRatio(camera));
  sound.setCharge(charge, DEFAULT_GAME_CONFIG.blast.fullChargeMs);
  sound.setMusic(phase === "playing");
  if (phase === "playing" && qualityPref === "auto") {
    const lower = governor.frame(now);
    if (lower) graphics.apply(lower);
  } else {
    governor.pause();
  }
  graphics.update();
  scene.render();

  function syncIdle(): void {
    idleSession.view.aspect = engine.getAspectRatio(camera);
    world.sync(idleSession, [], now);
  }
});

/** Selesai saat semua shader dan tekstur siap, agar menu tidak muncul di atas layar yang masih tersendat. */
export const ready: Promise<void> = scene.whenReadyAsync();

setInterval(() => {
  if (panel.hidden) return;
  const now = performance.now();
  stats.textContent = [
    `render   ${renderMeter.rate(now).toFixed(0)} fps`,
    `lacak    ${trackMeter.rate(now).toFixed(0)} fps (${delegate})`,
    `tangan   ${lastFrame ? lastFrame.handedness : "tidak terlihat"}`,
    `masukan  ${source === gestureSource ? "tangan" : "mouse/sentuh"}`,
    `mutu     ${quality.issue(now) ?? "baik"}`,
  ].join("\n");
}, 250);

function useSource(next: IntentSource): void {
  source = next;
  canvas.classList.toggle("pointer-mode", next === pointerSource);
  previewCanvas.hidden = next !== gestureSource;
}

function hideOverlays(): void {
  menu.hide();
  permission.hide();
  trainingPanel.hide();
  pause.hide();
  result.hide();
}

function showMenu(): void {
  phase = "menu";
  session = null;
  world.reset();
  hideOverlays();
  hud.visible = false;
  crosshair.update(IDLE_INTENT);
  menu.show();
}

function showPermission(): void {
  phase = "permission";
  hideOverlays();
  permission.show();
}

function startPointerGame(): void {
  useSource(pointerSource);
  beginSession();
}

/** Kamera siap untuk bermain: latihan dulu bila belum pernah di halaman ini. */
function afterHandReady(): void {
  useSource(gestureSource);
  if (trainedThisPage) beginSession();
  else startTraining(true);
}

function startTraining(thenPlay: boolean): void {
  useSource(gestureSource);
  phase = "training";
  coach = new TrainingCoach(TRAINING_STEPS, DEFAULT_GAME_CONFIG.blast.minChargeMs);
  trainingThenPlay = thenPlay;
  trainingDoneAt = null;
  session = null;
  world.reset();
  hideOverlays();
  hud.visible = false;
  trainingPanel.show();
}

function finishTraining(): void {
  trainedThisPage = true;
  coach = null;
  trainingPanel.hide();
  if (trainingThenPlay) beginSession();
  else showMenu();
}

function beginSession(): void {
  const config = applyDifficulty(DEFAULT_GAME_CONFIG, DIFFICULTIES[difficulty]);
  session = new GameSession(LEVEL_1, { config, seed: Math.floor(Math.random() * 2 ** 31) });
  endedAt = null;
  presence.reset();
  world.reset();
  hideOverlays();
  hud.visible = true;
  phase = "playing";
}

function pauseGame(reason: PauseReason): void {
  if (phase !== "playing") return;
  phase = "paused";
  presence.reset();
  if (reason === "hand") presence.present = false;
  pause.show(reason);
}

function resume(): void {
  if (phase !== "paused") return;
  pause.hide();
  presence.reset();
  phase = "playing";
}

function showResult(s: GameSession): void {
  phase = "result";
  const isRecord = highScores.submit(difficulty, s.score);
  result.show(s, highScores.get(difficulty), isRecord);
  hud.visible = false;
  crosshair.update(IDLE_INTENT);
}

async function allowCamera(): Promise<void> {
  if (!(await startCamera())) return;
  permission.hide();
  if (afterCamera === "training") startTraining(false);
  else afterHandReady();
}

/**
 * Membuka kamera lalu memuat model, masing-masing sekali. Bila model gagal setelah kamera terbuka,
 * "Coba lagi" hanya memuat ulang model tanpa meminta izin kamera lagi.
 */
async function startCamera(): Promise<boolean> {
  if (cameraReady) return true;
  try {
    if (!cameraOpen) {
      permission.setState("busy", "Membuka kamera...");
      await openCamera(video);
      cameraOpen = true;
    }
    permission.setState("busy", "Memuat model pelacakan tangan...");
    const tracker = await createHandTracker(video);
    delegate = tracker.delegate;
    cameraReady = true;
    el("recorder").hidden = false;
    tracker.start((frame) => {
      const now = performance.now();
      trackMeter.tick(now);
      quality.push(frame !== null, now);
      lastFrame = frame;
      preview.draw(video, frame);
      recorder.push(frame);
      const state = interpreter.update(frame, now);
      gestureSource.push(state);
      if (!panel.hidden) gestureDebug.update(state, frame, now);
    });
    return true;
  } catch (err) {
    if (err instanceof CameraError) {
      permission.setState("failed", CAMERA_ERROR_TEXT[err.kind]);
    } else {
      console.error(err);
      permission.setState("failed", "Model pelacakan tangan gagal dimuat. Periksa koneksi lalu tekan Coba lagi, atau main dengan mouse.");
    }
    return false;
  }
}
