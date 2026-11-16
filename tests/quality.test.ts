import { describe, expect, it } from "vitest";
import { guessQuality, QualityGovernor, readQualityPreference, writeQualityPreference } from "../src/render/quality";

function run(g: QualityGovernor, fps: number, ms: number, start = 0) {
  const changes: string[] = [];
  for (let t = start; t <= start + ms; t += 1000 / fps) {
    const next = g.frame(t);
    if (next) changes.push(next);
  }
  return changes;
}

describe("tebakan kualitas awal", () => {
  it("HP dan GPU perangkat lunak mulai di rendah", () => {
    expect(guessQuality({ mobile: true, cores: 8, gpu: "Apple M2" })).toBe("low");
    expect(guessQuality({ mobile: false, cores: 8, gpu: "Google SwiftShader" })).toBe("low");
  });

  it("GPU diskret atau Apple Silicon mulai di tinggi, sisanya sedang", () => {
    expect(guessQuality({ mobile: false, cores: 8, gpu: "ANGLE (Apple, Apple M1 Pro)" })).toBe("high");
    expect(guessQuality({ mobile: false, cores: 8, gpu: "NVIDIA GeForce RTX 3060" })).toBe("high");
    expect(guessQuality({ mobile: false, cores: 8, gpu: "Intel(R) UHD Graphics 620" })).toBe("medium");
  });

  it("memori atau inti sedikit mulai di rendah", () => {
    expect(guessQuality({ mobile: false, cores: 2, gpu: "Intel" })).toBe("low");
    expect(guessQuality({ mobile: false, cores: 8, memory: 2 })).toBe("low");
  });
});

describe("pilihan kualitas tersimpan", () => {
  it("menyimpan dan membaca pilihan; nilai asing atau penyimpanan rusak jadi otomatis", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(readQualityPreference(storage)).toBe("auto");
    writeQualityPreference(storage, "low");
    expect(readQualityPreference(storage)).toBe("low");
    data.set("gestur.grafik", "ultra");
    expect(readQualityPreference(storage)).toBe("auto");
    const broken = {
      getItem: () => {
        throw new Error("diblokir");
      },
      setItem: () => {
        throw new Error("diblokir");
      },
    };
    expect(readQualityPreference(broken)).toBe("auto");
    expect(() => writeQualityPreference(broken, "high")).not.toThrow();
  });
});

describe("penurunan kualitas otomatis", () => {
  it("tidak berubah selama fps cukup", () => {
    expect(run(new QualityGovernor("high"), 60, 10_000)).toEqual([]);
  });

  it("turun satu tingkat setelah dua jendela lambat, lalu turun lagi bila tetap lambat", () => {
    const g = new QualityGovernor("high");
    expect(run(g, 30, 4100)).toEqual(["medium"]);
    expect(run(g, 30, 4100, 4200)).toEqual(["low"]);
    expect(run(g, 30, 10_000, 8400)).toEqual([]);
  });

  it("satu jendela lambat saja tidak menurunkan", () => {
    const g = new QualityGovernor("high");
    run(g, 30, 2100);
    expect(run(g, 60, 6000, 2200)).toEqual([]);
  });

  it("celah waktu jeda tidak dihitung", () => {
    const g = new QualityGovernor("high");
    run(g, 60, 1000);
    g.pause();
    expect(run(g, 60, 6000, 60_000)).toEqual([]);
  });
});
