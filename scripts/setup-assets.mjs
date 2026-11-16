// Menyiapkan aset MediaPipe yang di-host sendiri di public/:
// - salin berkas wasm dari node_modules
// - unduh model hand_landmarker.task dari sumber resmi Google bila belum ada
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDest = join(root, "public/mediapipe/wasm");
const modelDest = join(root, "public/models/hand_landmarker.task");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// Hanya varian non-module yang dipakai FilesetResolver.forVisionTasks(basePath).
await mkdir(wasmDest, { recursive: true });
for (const file of await readdir(wasmSrc)) {
  if (file.startsWith("vision_wasm_internal.")) {
    await copyFile(join(wasmSrc, file), join(wasmDest, file));
  }
}

if (!(await exists(modelDest))) {
  console.log("Mengunduh model hand_landmarker.task ...");
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Gagal mengunduh model: HTTP ${res.status}`);
  await mkdir(dirname(modelDest), { recursive: true });
  await writeFile(modelDest, Buffer.from(await res.arrayBuffer()));
}

console.log("Aset MediaPipe siap.");
