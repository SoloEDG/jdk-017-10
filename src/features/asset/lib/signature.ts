const COLS = 16;
const ROWS = 8;

/**
 * A tiny normalized luminance fingerprint. Re-exporting the same panorama at
 * another size keeps the same signature, so calibration points can be reused.
 * Cell means are stored relative to the image mean, which makes the match
 * insensitive to a slightly different exposure in the re-export.
 */
export function fingerprint(data: ImageData) {
  const cells: number[] = [];
  let total = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x0 = Math.floor((col * data.width) / COLS);
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) * data.width) / COLS));
      const y0 = Math.floor((row * data.height) / ROWS);
      const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * data.height) / ROWS));
      let sum = 0,
        count = 0;
      const stepX = Math.max(1, Math.floor((x1 - x0) / 12));
      const stepY = Math.max(1, Math.floor((y1 - y0) / 12));
      for (let y = y0; y < y1; y += stepY)
        for (let x = x0; x < x1; x += stepX) {
          const at = (y * data.width + x) * 4;
          sum +=
            data.data[at] * 0.299 +
            data.data[at + 1] * 0.587 +
            data.data[at + 2] * 0.114;
          count++;
        }
      const value = sum / Math.max(count, 1);
      cells.push(value);
      total += value;
    }
  }
  const mean = total / Math.max(cells.length, 1);
  return cells.map((value) => Math.round(value - mean)).join(".");
}

export function signatureDistance(a: string, b: string) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  if (!left.length || left.length !== right.length) return Infinity;
  let total = 0;
  for (let i = 0; i < left.length; i++) total += Math.abs(left[i] - right[i]);
  return total / left.length;
}

/** Mean per-cell luminance difference (0–255) accepted as the same content. */
export const SAME_CONTENT_DISTANCE = 6;

export function sameAspect(a: { width: number; height: number }, b: { width: number; height: number }) {
  const left = a.width / Math.max(a.height, 1);
  const right = b.width / Math.max(b.height, 1);
  return Math.abs(left - right) <= Math.max(0.02, left * 0.02);
}

/** True when an existing calibration still describes the incoming asset. */
export function sameContent(
  previous: { signature: string; width: number; height: number },
  next: { signature: string; width: number; height: number },
) {
  if (!previous.signature || !next.signature) return false;
  if (!sameAspect(previous, next)) return false;
  return (
    signatureDistance(previous.signature, next.signature) <=
    SAME_CONTENT_DISTANCE
  );
}
