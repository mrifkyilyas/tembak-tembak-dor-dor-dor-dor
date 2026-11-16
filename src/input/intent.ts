/** Posisi di layar, 0–1 dari kiri atas. */
export interface Aim {
  x: number;
  y: number;
}

export type Weapon = "pistol" | "shotgun" | "shield" | "blast";

/**
 * Satu-satunya bentuk masukan yang dibaca game. Gestur tangan dan mouse/sentuh sama-sama
 * menghasilkan ini, sehingga inti game tidak tahu dari mana masukan berasal.
 */
export interface PlayerIntent {
  /** Ada masukan yang bisa dipakai (tangan terlihat / penunjuk di layar). */
  active: boolean;
  aim: Aim | null;
  /** Senjata yang sedang dipegang; null bila tidak ada pola yang dikenali. */
  weapon: Weapon | null;
  shieldUp: boolean;
  /** Sedang mengisi tenaga ledakan, dan sudah berapa lama. */
  chargeMs: number;
  /** Kejadian: satu tembakan, dengan titik bidiknya. */
  fire: { aim: Aim } | null;
  /** Kejadian: ledakan dilepas, dengan lama isi tenaga. */
  blast: { chargeMs: number } | null;
}

export interface IntentSource {
  /**
   * Dibaca sekali per frame render. Kejadian yang belum dibaca diantrekan dan dikeluarkan
   * satu per pembacaan, sehingga tidak ada tembakan yang hilang walau frekuensi sumber
   * dan render berbeda.
   */
  read(now: number): PlayerIntent;
}

export const IDLE_INTENT: PlayerIntent = {
  active: false,
  aim: null,
  weapon: null,
  shieldUp: false,
  chargeMs: 0,
  fire: null,
  blast: null,
};
