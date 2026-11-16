export type CameraErrorKind = "insecure" | "denied" | "not-found" | "unsupported" | "other";

export class CameraError extends Error {
  constructor(
    readonly kind: CameraErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** Membuka kamera depan pada resolusi rendah; resolusi tinggi tidak membantu pelacakan dan memperlambatnya. */
export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  // Tanpa HTTPS browser menyembunyikan `mediaDevices` sama sekali (umum saat membuka alamat IP
  // laptop dari HP), jadi bedakan dari browser yang memang tidak mendukung kamera.
  if (!window.isSecureContext) {
    throw new CameraError("insecure", "Kamera hanya bisa dibuka lewat HTTPS.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("unsupported", "Browser ini tidak mendukung akses kamera.");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new CameraError("denied", "Izin kamera ditolak.");
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      throw new CameraError("not-found", "Kamera tidak ditemukan.");
    }
    throw new CameraError("other", `Kamera gagal dibuka: ${String(err)}`);
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}
