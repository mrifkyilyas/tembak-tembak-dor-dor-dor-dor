import { describe, expect, it } from "vitest";
import { cuesFor } from "../src/audio/cues";
import type { GameEvent } from "../src/game/session";

const shot = (weapon: "pistol" | "shotgun"): GameEvent => ({ type: "shot", weapon, rays: [], hit: true, impacts: [] });

describe("pemilihan suara", () => {
  it("tiap senjata punya bunyi sendiri, tembakan belum siap berbunyi kosong", () => {
    expect(cuesFor([shot("pistol")])).toEqual(["pistol"]);
    expect(cuesFor([shot("shotgun")])).toEqual(["shotgun"]);
    expect(cuesFor([{ type: "notReady", weapon: "blast" }])).toEqual(["dryFire"]);
  });

  it("shotgun yang mengenai banyak musuh tidak menumpuk bunyi kena", () => {
    const events: GameEvent[] = [shot("shotgun"), ...[1, 2, 3].map((id) => ({ type: "enemyHit" as const, id, damage: 1 }))];
    expect(cuesFor(events)).toEqual(["shotgun", "hit"]);
  });

  it("kena yang membunuh hanya berbunyi mati", () => {
    const events: GameEvent[] = [
      shot("pistol"),
      { type: "enemyHit", id: 1, damage: 1 },
      { type: "enemyKilled", id: 1, kind: "swarm", points: 25 },
    ];
    expect(cuesFor(events)).toEqual(["pistol", "kill"]);
  });

  it("titik henti yang habis waktu tidak dirayakan", () => {
    expect(cuesFor([{ type: "stopCleared", index: 0, timedOut: true }])).toEqual([]);
    expect(cuesFor([{ type: "stopCleared", index: 0, timedOut: false }])).toEqual(["stopCleared"]);
  });

  it("akhir permainan berbunyi menang atau kalah", () => {
    expect(cuesFor([{ type: "ended", result: "lost" }])).toEqual(["lost"]);
  });
});
