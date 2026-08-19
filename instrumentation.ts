export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const canvas = await import("@napi-rs/canvas");
  const globals = globalThis as typeof globalThis & Record<string, unknown>;

  if (typeof globals.DOMMatrix === "undefined") globals.DOMMatrix = canvas.DOMMatrix;
  if (typeof globals.ImageData === "undefined") globals.ImageData = canvas.ImageData;
  if (typeof globals.Path2D === "undefined") globals.Path2D = canvas.Path2D;
}
