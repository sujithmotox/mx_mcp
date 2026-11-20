import Anthropic, { toFile } from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropic = new Anthropic();
const MAX_BYTES = 5 * 1024 * 1024;
// Uploaded images expire after 90 days; a chat older than that can't be continued.
const EXPIRES_IN_SECONDS = 90 * 24 * 3600;

/** Check the file's first bytes, not just its claimed type. */
function sniff(b: Uint8Array): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return "image/webp";
  return null;
}

/**
 * Upload one reference image to the Anthropic Files API. The chat then refers to
 * it by file id, so the image isn't re-sent with every later message.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No image received." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Images can be at most 5 MB." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) return Response.json({ error: "Only PNG, JPG, GIF or WebP images can be attached." }, { status: 415 });
  try {
    const uploaded = await anthropic.files.upload({
      file: await toFile(bytes, file.name || `image.${type.split("/")[1]}`, { type }),
      expires_in_seconds: EXPIRES_IN_SECONDS,
    });
    return Response.json({ fileId: uploaded.id, mediaType: type });
  } catch (err) {
    console.error("image upload failed", err);
    const msg = err instanceof Anthropic.APIError ? `Upload to Claude failed (${err.status ?? "network"}): ${err.message}` : (err as Error).message;
    return Response.json({ error: msg }, { status: 502 });
  }
}
