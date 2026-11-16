import { DIFFICULTIES, type DifficultyId } from "../data/difficulty";
import type { GameSession } from "../game/session";

export type InputChoice = "hand" | "pointer";

export interface MenuHandlers {
  onStart(input: InputChoice, difficulty: DifficultyId): void;
  onTraining(): void;
}

/** Layar menu: pilih tingkat kesulitan dan cara bermain. */
export class MenuScreen {
  difficulty: DifficultyId = "normal";
  private readonly best: HTMLElement;
  private readonly startButtons: HTMLButtonElement[];

  constructor(
    private readonly root: HTMLElement,
    handlers: MenuHandlers,
    private readonly bestFor: (d: DifficultyId) => number,
  ) {
    this.best = root.querySelector("#menu-best")!;
    this.startButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-start]")];

    const group = root.querySelector("#menu-difficulty")!;
    for (const [id, d] of Object.entries(DIFFICULTIES) as Array<[DifficultyId, (typeof DIFFICULTIES)[DifficultyId]]>) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = d.label;
      button.dataset.difficulty = id;
      button.addEventListener("click", () => this.select(id));
      group.append(button);
    }
    root.querySelector("#menu-training")!.addEventListener("click", handlers.onTraining);
    for (const button of this.startButtons) {
      button.addEventListener("click", () => handlers.onStart(button.dataset.start as InputChoice, this.difficulty));
    }
    this.select(this.difficulty);
  }

  show(): void {
    this.root.hidden = false;
    this.select(this.difficulty);
  }

  hide(): void {
    this.root.hidden = true;
  }

  private select(id: DifficultyId): void {
    this.difficulty = id;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-difficulty]")) {
      button.setAttribute("aria-pressed", String(button.dataset.difficulty === id));
    }
    const best = this.bestFor(id);
    this.best.textContent = best > 0 ? `Skor tertinggi ${DIFFICULTIES[id].label}: ${best.toLocaleString("id-ID")}` : "";
  }
}

/** Layar hasil setelah menang atau kalah. */
export class ResultScreen {
  constructor(
    private readonly root: HTMLElement,
    onAgain: () => void,
    onMenu: () => void,
  ) {
    root.querySelector("#result-again")!.addEventListener("click", onAgain);
    root.querySelector("#result-menu")!.addEventListener("click", onMenu);
  }

  show(session: GameSession, best: number, isRecord: boolean): void {
    const won = session.state === "won";
    this.root.querySelector("#result-title")!.textContent = won ? "Lintasan tamat!" : "Kamu tumbang";
    this.root.dataset.result = session.state;
    const minutes = Math.floor(session.time / 60_000);
    const seconds = Math.floor((session.time % 60_000) / 1000).toString().padStart(2, "0");
    const rows: Array<[string, string]> = [
      ["Skor", session.score.toLocaleString("id-ID")],
      ["Akurasi", `${Math.round(session.accuracy * 100)}%`],
      ["Musuh dikalahkan", String(session.kills)],
      ["Beruntun terpanjang", String(session.bestCombo)],
      ["Waktu", `${minutes}:${seconds}`],
      ["Skor tertinggi", best.toLocaleString("id-ID")],
    ];
    const list = this.root.querySelector("#result-stats")!;
    list.replaceChildren(
      ...rows.flatMap(([k, v]) => {
        const dt = document.createElement("dt");
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.textContent = v;
        return [dt, dd];
      }),
    );
    (this.root.querySelector("#result-record") as HTMLElement).hidden = !isRecord;
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
