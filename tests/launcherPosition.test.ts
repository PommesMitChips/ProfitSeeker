import {
  launcherFraction,
  launcherPixels,
  readLauncherPosition,
  saveLauncherPosition,
  LAUNCHER_POSITION_KEY,
} from "../src/state/launcherPosition";

test("position persists and stays proportionally placed after a resolution change", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const p = launcherFraction({ x: 300, y: 200 }, 1280, 720);
  saveLauncherPosition(storage, p);
  expect(launcherPixels(readLauncherPosition(storage), 1280, 720)).toEqual({
    x: 300,
    y: 200,
  });
  const resized = launcherPixels(readLauncherPosition(storage), 640, 360);
  expect(resized.x).toBeGreaterThanOrEqual(8);
  expect(resized.x + 48).toBeLessThanOrEqual(632);
  expect(resized.y).toBeGreaterThanOrEqual(8);
  expect(resized.y + 48).toBeLessThanOrEqual(352);
  expect(values.has(LAUNCHER_POSITION_KEY)).toBe(true);
});

test("off-screen coordinates are clamped and missing positions use the bottom right", () => {
  expect(launcherPixels(null, 1280, 720)).toEqual({ x: 1208, y: 648 });
  expect(
    launcherPixels(launcherFraction({ x: -100, y: 9999 }, 640, 360), 640, 360),
  ).toEqual({ x: 8, y: 304 });
  expect(launcherPixels({ x: 1, y: 1 }, 40, 40)).toEqual({ x: 0, y: 0 });
});

test("malformed or unavailable storage cannot break the launcher", () => {
  for (const value of ["null", "{", '{"x":"1","y":0}', '{"x":1e999,"y":0}'])
    expect(readLauncherPosition({ getItem: () => value })).toBeNull();
  expect(readLauncherPosition({ getItem: () => '{"x":-5,"y":6}' })).toEqual({
    x: 0,
    y: 1,
  });
  expect(
    readLauncherPosition({
      getItem: () => {
        throw new Error("blocked");
      },
    }),
  ).toBeNull();
  expect(() =>
    saveLauncherPosition(
      {
        setItem: () => {
          throw new Error("full");
        },
      },
      { x: 0, y: 0 },
    ),
  ).not.toThrow();
});
