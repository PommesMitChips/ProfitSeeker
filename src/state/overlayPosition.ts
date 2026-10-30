import { Point, LAUNCHER_SIZE } from "./launcherPosition";
export function overlayPosition(
  launcher: Point,
  viewport: { width: number; height: number },
  height: number,
): Point {
  const width = Math.min(360, Math.max(0, viewport.width - 32)),
    h = Math.min(height, Math.max(0, viewport.height - 32));
  const right = Math.max(16, viewport.width - width - 16),
    bottom = Math.max(16, viewport.height - h - 16),
    top = Math.min(96, bottom);
  const candidates = [
    { x: right, y: top },
    { x: 16, y: top },
    { x: right, y: bottom },
    { x: 16, y: bottom },
  ];
  const overlaps = (p: Point) =>
    p.x < launcher.x + LAUNCHER_SIZE + 8 &&
    p.x + width > launcher.x - 8 &&
    p.y < launcher.y + LAUNCHER_SIZE + 8 &&
    p.y + h > launcher.y - 8;
  return candidates.find((p) => !overlaps(p)) ?? candidates[0];
}
