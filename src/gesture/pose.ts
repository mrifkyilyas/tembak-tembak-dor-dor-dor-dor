import type { FingerName } from "./handGeometry";

export type Pose = "none" | "pistol" | "shotgun" | "shield" | "fist";

/**
 * Menentukan pola dari jari mana yang lurus. Ibu jari tidak dipakai: pelacakannya tidak andal
 * dengan satu kamera. Pistol dan shotgun hanya ditentukan telunjuk dan jari tengah, karena pada
 * pistol jari yang wajar jari manis sering hanya setengah menekuk (rekaman asli: 55–93°).
 */
export function classifyPose(straight: Record<FingerName, boolean>): Pose {
  const { index, middle, ring, pinky } = straight;
  if (index && middle && ring && pinky) return "shield";
  if (!index && !middle && !ring && !pinky) return "fist";
  if (index && !middle) return "pistol";
  if (index && middle) return "shotgun"; // jari manis dan kelingking tidak lurus bersamaan (itu perisai)
  return "none";
}
