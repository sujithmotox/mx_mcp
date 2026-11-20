/** Browser-side helpers for reference images attached in the chat. */

export const MAX_IMAGES = 4;
const MAX_SIDE = 1568; // larger images are scaled down by the API anyway
const THUMB_SIDE = 240;
const ACCEPT = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export type Attachment = {
  id: string;
  name: string;
  thumb: string; // small data: URL, kept with the chat for display
  status: "uploading" | "ready" | "error";
  fileId?: string;
  error?: string;
};

async function loadBitmap(file: Blob) {
  return await createImageBitmap(file);
}

function draw(bitmap: ImageBitmap, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { canvas, scaled: scale < 1 };
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't read the image."))), type, q));

/** Shrink big images (screenshots stay PNG so text stays sharp) and make a thumbnail. */
export async function prepareImage(file: File): Promise<{ blob: Blob; thumb: string; name: string }> {
  if (!ACCEPT.includes(file.type)) throw new Error("Only PNG, JPG, GIF or WebP images can be attached.");
  const bitmap = await loadBitmap(file);
  try {
    const { canvas, scaled } = draw(bitmap, MAX_SIDE);
    let blob: Blob = file;
    if (scaled || file.type === "image/gif" || file.size > 3.5 * 1024 * 1024) {
      blob = await toBlob(canvas, file.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.9);
      if (blob.size > 4.5 * 1024 * 1024) blob = await toBlob(canvas, "image/jpeg", 0.85);
    }
    if (blob.size > 5 * 1024 * 1024) throw new Error("This image is too large (over 5 MB even after shrinking).");
    const thumb = draw(bitmap, THUMB_SIDE).canvas.toDataURL("image/jpeg", 0.75);
    return { blob, thumb, name: file.name || "image.png" };
  } finally {
    bitmap.close();
  }
}

export async function uploadImage(blob: Blob, name: string): Promise<string> {
  const form = new FormData();
  form.append("file", blob, name);
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { fileId?: string; error?: string };
  if (!res.ok || !body.fileId) throw new Error(body.error || `Upload failed (${res.status})`);
  return body.fileId;
}

/** Images from a paste or drop event. */
export function imagesFrom(list: DataTransferItemList | FileList | null | undefined): File[] {
  if (!list) return [];
  const files: File[] = [];
  for (const item of Array.from(list as ArrayLike<DataTransferItem | File>)) {
    const f = item instanceof File ? item : item.kind === "file" ? item.getAsFile() : null;
    if (f && f.type.startsWith("image/")) files.push(f);
  }
  return files;
}
