import { HAND_BONES, type HandFrame } from "../tracking/types";

/** Pratinjau webcam kecil di pojok, dicerminkan seperti cermin, dengan titik tangan di atasnya. */
export class WebcamPreview {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D tidak tersedia.");
    this.ctx = ctx;
  }

  draw(video: HTMLVideoElement, frame: HandFrame | null): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);

    if (frame) {
      const pts = frame.landmarks;
      ctx.strokeStyle = "rgba(80, 220, 255, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const [a, b] of HAND_BONES) {
        ctx.moveTo(pts[a].x * w, pts[a].y * h);
        ctx.lineTo(pts[b].x * w, pts[b].y * h);
      }
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
