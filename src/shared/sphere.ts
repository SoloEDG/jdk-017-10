import type { Orientation, Vec3 } from "./types";
import { clamp, wrap } from "./math";

export const toRad = Math.PI / 180;
export const toDeg = 180 / Math.PI;

/** Equirectangular (u, v) to a unit direction in the asset frame. */
export function directionFromUV(u: number, v: number): Vec3 {
  const phi = wrap(u) * Math.PI * 2;
  const theta = (0.5 - clamp(v, 0, 1)) * Math.PI;
  const c = Math.cos(theta);
  return { x: c * Math.cos(phi), y: Math.sin(theta), z: c * Math.sin(phi) };
}

export const fromUV = directionFromUV;

/** Direction back to equirectangular (u, v). */
export function uvFromDirection(d: Vec3) {
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  return {
    u: wrap(Math.atan2(d.z / len, d.x / len) / (Math.PI * 2)),
    v: clamp(0.5 - Math.asin(clamp(d.y / len, -1, 1)) / Math.PI, 0, 1),
  };
}
export function orientationFromAxisAngle(
  axis: Vec3,
  angle: number,
): Orientation {
  const a = normalize(axis);
  const s = Math.sin(angle / 2);
  return { w: Math.cos(angle / 2), x: a.x * s, y: a.y * s, z: a.z * s };
}
export function rotate(q: Orientation, v: Vec3): Vec3 {
  // v' = v + 2w(qv x v) + 2 qv x (qv x v)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}
export function normalize(v: Vec3): Vec3 {
  const n = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}
export function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
/** Angular distance between two orientations, in degrees. */
export function orientationAngle(a: Orientation, b: Orientation) {
  const d = Math.abs(a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z);
  return 2 * Math.acos(clamp(d, -1, 1)) * toDeg;
}
