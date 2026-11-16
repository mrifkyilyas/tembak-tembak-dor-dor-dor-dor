import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { IntervalGate } from "../util/intervalGate";
import type { HandFrame } from "./types";

export interface HandTrackerOptions {
  /** Frekuensi pelacakan maksimum, terpisah dari frekuensi render. */
  hz?: number;
}

export interface HandTracker {
  /** "GPU" atau "CPU", tergantung delegasi yang berhasil dimuat. */
  readonly delegate: "GPU" | "CPU";
  /** onFrame dipanggil tiap frame kamera yang diproses; null berarti tidak ada tangan. */
  start(onFrame: (frame: HandFrame | null) => void): void;
  stop(): void;
}

const base = import.meta.env.BASE_URL;

async function createLandmarker(delegate: "GPU" | "CPU"): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${base}models/hand_landmarker.task`, delegate },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
}

function toHandFrame(result: HandLandmarkerResult, timestamp: number, aspect: number): HandFrame | null {
  const landmarks = result.landmarks[0];
  const worldLandmarks = result.worldLandmarks[0];
  if (!landmarks || !worldLandmarks) return null;
  const label = result.handedness[0]?.[0]?.categoryName;
  return {
    landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
    worldLandmarks: worldLandmarks.map(({ x, y, z }) => ({ x, y, z })),
    handedness: label === "Left" ? "Left" : "Right",
    timestamp,
    aspect,
  };
}

/** Memuat model dan menyiapkan loop pelacakan; mencoba GPU dulu, lalu CPU bila gagal. */
export async function createHandTracker(
  video: HTMLVideoElement,
  { hz = 30 }: HandTrackerOptions = {},
): Promise<HandTracker> {
  let delegate: "GPU" | "CPU" = "GPU";
  let landmarker: HandLandmarker;
  try {
    landmarker = await createLandmarker("GPU");
  } catch (err) {
    console.warn("Delegasi GPU gagal, beralih ke CPU.", err);
    delegate = "CPU";
    landmarker = await createLandmarker("CPU");
  }

  const gate = new IntervalGate(hz);
  let rafId = 0;
  let lastVideoTime = -1;

  return {
    delegate,
    start(onFrame) {
      const loop = (now: number) => {
        rafId = requestAnimationFrame(loop);
        // Lewati bila belum waktunya atau kamera belum memberi frame baru.
        if (video.readyState < 2 || video.currentTime === lastVideoTime || !gate.ready(now)) return;
        lastVideoTime = video.currentTime;
        onFrame(toHandFrame(landmarker.detectForVideo(video, now), now, video.videoWidth / video.videoHeight));
      };
      rafId = requestAnimationFrame(loop);
    },
    stop() {
      cancelAnimationFrame(rafId);
      landmarker.close();
    },
  };
}
