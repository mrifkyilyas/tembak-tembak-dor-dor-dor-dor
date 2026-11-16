import { describe, expect, it } from "vitest";
import { IntervalGate } from "../src/util/intervalGate";
import { RateMeter } from "../src/util/rateMeter";

describe("RateMeter", () => {
  it("menghitung kejadian per detik dalam jendela", () => {
    const meter = new RateMeter(1000);
    for (let t = 0; t < 1000; t += 1000 / 30) meter.tick(t);
    expect(meter.rate(999)).toBe(30);
  });

  it("membuang kejadian yang sudah keluar dari jendela", () => {
    const meter = new RateMeter(1000);
    meter.tick(0);
    meter.tick(500);
    expect(meter.rate(1200)).toBe(1);
    expect(meter.rate(2000)).toBe(0);
  });
});

describe("IntervalGate", () => {
  function countRuns(gateHz: number, loopHz: number, durationMs: number): number {
    const gate = new IntervalGate(gateHz);
    let runs = 0;
    const ticks = (durationMs * loopHz) / 1000;
    for (let i = 0; i < ticks; i++) {
      if (gate.ready((i * 1000) / loopHz)) runs++;
    }
    return runs;
  }

  it("menurunkan loop 60 Hz menjadi 30 Hz", () => {
    expect(countRuns(30, 60, 1000)).toBe(30);
  });

  it("menurunkan loop 120 Hz menjadi 30 Hz", () => {
    expect(countRuns(30, 120, 1000)).toBe(30);
  });

  it("tidak melebihi frekuensi loop bila loop lebih lambat", () => {
    expect(countRuns(30, 20, 1000)).toBe(20);
  });
});
