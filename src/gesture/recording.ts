import type { HandFrame } from "../tracking/types";
import type { Pose } from "./pose";

/** Harapan yang diuji terhadap satu rekaman; field yang kosong tidak diperiksa. */
export interface RecordingExpectation {
  /** Pola yang harus berlaku di sebagian besar frame setelah pemanasan. */
  pose?: Pose;
  /** Jumlah tembakan yang harus terdeteksi tepat. */
  fires?: number;
  /** Jumlah ledakan yang harus terdeteksi tepat. */
  blasts?: number;
}

export interface GestureRecording {
  version: 1;
  scenario: string;
  expect: RecordingExpectation;
  /** Waktu (jam yang sama dengan HandFrame.timestamp) saat aba-aba tembak muncul. */
  pressCues?: number[];
  frames: HandFrame[];
}

export interface RecordingScenario {
  id: string;
  label: string;
  instruction: string;
  expect: RecordingExpectation;
  /** Detik sejak rekaman mulai saat pemain diberi aba-aba menembak. */
  pressCuesS?: number[];
}

const PRESS_CUES_S = [1, 2, 3];

export const RECORDING_SCENARIOS: readonly RecordingScenario[] = [
  { id: "pistol-diam", label: "Pistol diam", instruction: "Tahan pistol jari, gerakkan bidikan pelan.", expect: { pose: "pistol", fires: 0 } },
  { id: "pistol-sentak-3", label: "Pistol sentak 3x", instruction: "Pistol jari. Sentakkan tangan ke atas setiap muncul TEMBAK!, lalu kembali ke posisi semula.", expect: { pose: "pistol", fires: 3 }, pressCuesS: PRESS_CUES_S },
  { id: "bidik-cepat", label: "Bidik cepat (tanpa tembak)", instruction: "Pistol jari. Pindahkan bidikan secepat mungkin ke atas, bawah, kiri, kanan, seperti mengejar musuh. Jangan menyentak.", expect: { pose: "pistol", fires: 0 } },
  { id: "shotgun-diam", label: "Shotgun diam", instruction: "Telunjuk dan jari tengah lurus.", expect: { pose: "shotgun", fires: 0 } },
  { id: "shotgun-sentak-3", label: "Shotgun sentak 3x", instruction: "Shotgun. Sentakkan tangan ke atas setiap muncul TEMBAK!, lalu kembali ke posisi semula.", expect: { pose: "shotgun", fires: 3 }, pressCuesS: PRESS_CUES_S },
  { id: "perisai", label: "Perisai", instruction: "Buka kelima jari menghadap kamera.", expect: { pose: "shield", fires: 0 } },
  { id: "kepalan", label: "Kepalan", instruction: "Kepalkan tangan dan tahan.", expect: { pose: "fist", fires: 0 } },
  { id: "ledakan", label: "Kepalan lalu buka", instruction: "Kepalkan sekitar 1 detik, lalu buka tangan lebar sekali.", expect: { blasts: 1, fires: 0 } },
  { id: "pistol-ke-kepalan", label: "Pistol → kepalan", instruction: "Pistol jari, lalu kepalkan tangan dengan wajar. Ulangi 2 kali.", expect: { fires: 0 } },
  { id: "ganti-pistol-shotgun", label: "Ganti pistol ↔ shotgun", instruction: "Bergantian pistol dan shotgun beberapa kali tanpa menyentak.", expect: { fires: 0 } },
];
