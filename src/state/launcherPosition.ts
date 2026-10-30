export const LAUNCHER_POSITION_KEY = "afnm-profitseeker.launcherPosition";
export const LAUNCHER_SIZE = 48;
const EDGE = 8;
export interface Point {
  x: number;
  y: number;
}
const clamp = (n: number, max = 1) => Math.max(0, Math.min(max, n));

export function readLauncherPosition(
  storage: Pick<Storage, "getItem">,
): Point | null {
  try {
    const p = JSON.parse(storage.getItem(LAUNCHER_POSITION_KEY) ?? "null");
    return p &&
      typeof p.x === "number" &&
      Number.isFinite(p.x) &&
      typeof p.y === "number" &&
      Number.isFinite(p.y)
      ? { x: clamp(p.x), y: clamp(p.y) }
      : null;
  } catch {
    return null;
  }
}

function bounds(width: number, height: number) {
  const x = Math.min(EDGE, Math.max(0, width - LAUNCHER_SIZE));
  const y = Math.min(EDGE, Math.max(0, height - LAUNCHER_SIZE));
  return {
    x,
    y,
    w: Math.max(0, width - LAUNCHER_SIZE - 2 * x),
    h: Math.max(0, height - LAUNCHER_SIZE - 2 * y),
  };
}
export function launcherPixels(
  p: Point | null,
  width: number,
  height: number,
): Point {
  const b = bounds(width, height);
  return p
    ? { x: b.x + clamp(p.x) * b.w, y: b.y + clamp(p.y) * b.h }
    : {
        x: b.x + clamp(width - LAUNCHER_SIZE - 24 - b.x, b.w),
        y: b.y + clamp(height - LAUNCHER_SIZE - 24 - b.y, b.h),
      };
}
export function launcherFraction(
  p: Point,
  width: number,
  height: number,
): Point {
  const b = bounds(width, height);
  return {
    x: b.w ? clamp((p.x - b.x) / b.w) : 0,
    y: b.h ? clamp((p.y - b.y) / b.h) : 0,
  };
}
export function saveLauncherPosition(
  storage: Pick<Storage, "setItem">,
  p: Point,
): void {
  try {
    storage.setItem(LAUNCHER_POSITION_KEY, JSON.stringify(p));
  } catch {
    /* Moving still works if storage is unavailable. */
  }
}
