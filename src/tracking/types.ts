/** Satu titik tangan dalam koordinat gambar kamera ternormalisasi (0–1), z relatif terhadap pergelangan. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/** Hasil pelacakan satu frame kamera. Bebas dari tipe MediaPipe agar lapis lain tidak bergantung padanya. */
export interface HandFrame {
  /** 21 titik dengan urutan standar MediaPipe (0 = pergelangan, 4 = ujung ibu jari, 8 = ujung telunjuk, ...). */
  landmarks: Landmark[];
  /**
   * 21 titik yang sama dalam meter, berpusat di tangan. Dipakai untuk sudut dan jarak
   * karena tidak terdistorsi rasio aspek kamera maupun jarak tangan ke kamera.
   */
  worldLandmarks: Landmark[];
  /** Tangan subjek menurut model, dari gambar yang tidak dicerminkan. */
  handedness: "Left" | "Right";
  /** Waktu performance.now() saat frame diproses. */
  timestamp: number;
  /** Lebar/tinggi gambar kamera. Tidak ada di rekaman lama; anggap 4:3. */
  aspect?: number;
}

/** Pasangan indeks titik yang membentuk tulang tangan, untuk digambar. */
export const HAND_BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
