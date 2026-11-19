import type { HorizonCalibration } from "../../../shared/types";
import { clamp, wrap } from "../../../shared/math";

export const identityCalibration = (): HorizonCalibration => ({
  points: [],
  enabled: true,
  applied: null,
  appliedMethod: null,
  appliedTilt: 0,
  appliedKey: "",
  tolerance: 1.2,
  method: "robust",
  methodAuto: true,
  marking: false,
  selectedId: null,
  rebindNotice: "",
});

export function pointKey(points: { u: number; v: number }[]) {
  return points
    .map((p) => `${p.u.toFixed(5)},${p.v.toFixed(5)}`)
    .sort()
    .join("|");
}

export function addPoint(
  calibration: HorizonCalibration,
  u: number,
  v: number,
): string {
  const id = crypto.randomUUID();
  calibration.points.push({
    id,
    u: wrap(u),
    v: clamp(v, 0, 1),
    enabled: true,
  });
  return id;
}

export function removePoint(calibration: HorizonCalibration, id: string) {
  calibration.points = calibration.points.filter((p) => p.id !== id);
  if (calibration.selectedId === id) calibration.selectedId = null;
}

export function togglePoint(calibration: HorizonCalibration, id: string) {
  const point = calibration.points.find((p) => p.id === id);
  if (point) point.enabled = !point.enabled;
}

/** Re-enable every mark the user had excluded. */
export function includeAll(calibration: HorizonCalibration) {
  for (const point of calibration.points) point.enabled = true;
}

/** The capacity limit keeps the exhaustive robust search pleasant. */
export const MAX_POINTS = 12;

export function canAddPoint(calibration: HorizonCalibration) {
  return calibration.points.length < MAX_POINTS;
}

export function movePoint(
  calibration: HorizonCalibration,
  id: string,
  u: number,
  v: number,
) {
  const point = calibration.points.find((p) => p.id === id);
  if (!point) return;
  point.u = wrap(u);
  point.v = clamp(v, 0, 1);
}

/** The orientation rendering should actually use (null = calibration off). */
export function activeOrientation(calibration: HorizonCalibration) {
  return calibration.enabled ? calibration.applied : null;
}

export function setTolerance(calibration: HorizonCalibration, value: number) {
  if (!Number.isFinite(value)) return;
  calibration.tolerance = clamp(value, 0.2, 10);
}

export function clearCalibration(calibration: HorizonCalibration) {
  calibration.applied = null;
  calibration.appliedMethod = null;
  calibration.appliedTilt = 0;
  calibration.appliedKey = "";
}

export function clearPoints(calibration: HorizonCalibration) {
  calibration.points = [];
  calibration.selectedId = null;
  clearCalibration(calibration);
}
