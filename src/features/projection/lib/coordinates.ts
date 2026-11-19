import type { Projection, Orientation, Vec3 } from "../../../shared/types";
import { radians } from "../../../shared/math";
import { fromUV, rotate, uvFromDirection } from "../../../shared/sphere";

export interface UV {
  u: number;
  v: number;
}

/**
 * Creative-frame viewing ray for image-space (x, y). Roll and pitch are part
 * of the user's framing; yaw and the asset calibration are applied later.
 */
export function viewRay(
  x: number,
  y: number,
  width: number,
  height: number,
  p: Projection,
): Vec3 {
  const unit = Math.min(width, height) / 2;
  const a = (x - width / 2) / unit / p.zoom,
    b = (y - height / 2) / unit / p.zoom;
  const theta = 2 * Math.atan(Math.hypot(a, b));
  const angle = Math.atan2(b, a) + radians(p.roll);
  const vy0 = Math.cos(theta) * (p.mode === "planet" ? -1 : 1);
  const vz0 = Math.sin(theta) * Math.sin(angle);
  const tilt = radians(p.pitch);
  return {
    x: Math.sin(theta) * Math.cos(angle),
    y: vy0 * Math.cos(tilt) - vz0 * Math.sin(tilt),
    z: vy0 * Math.sin(tilt) + vz0 * Math.cos(tilt),
  };
}

/** Inverse of viewRay: creative-frame direction -> image position. */
export function creativeToScreen(
  d: Vec3,
  width: number,
  height: number,
  p: Projection,
): { x: number; y: number } | null {
  const tilt = radians(p.pitch);
  const vy0 = d.y * Math.cos(tilt) + d.z * Math.sin(tilt);
  const vz0 = -d.y * Math.sin(tilt) + d.z * Math.cos(tilt);
  const cosTheta = p.mode === "planet" ? -vy0 : vy0;
  const sinTheta = Math.hypot(d.x, vz0);
  if (sinTheta < 1e-9) return cosTheta > 0 ? { x: width / 2, y: height / 2 } : null;
  const theta = Math.atan2(sinTheta, cosTheta);
  const angle = Math.atan2(vz0, d.x) - radians(p.roll);
  const unit = Math.min(width, height) / 2;
  const r = Math.tan(theta / 2) * unit * p.zoom;
  return {
    x: width / 2 + r * Math.cos(angle),
    y: height / 2 + r * Math.sin(angle),
  };
}

/** Camera yaw, then the asset's calibration: creative ray -> asset ray. */
export function assetFromViewRay(
  ray: Vec3,
  p: Projection,
  orientation: Orientation | null,
): Vec3 {
  const yaw = radians(p.yaw);
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  const x = ray.x * c - ray.z * s,
    z = ray.x * s + ray.z * c;
  const y = ray.y;
  if (orientation)
    return rotate(
      {
        w: orientation.w,
        x: -orientation.x,
        y: -orientation.y,
        z: -orientation.z,
      },
      { x, y, z },
    );
  return { x, y, z };
}

/** Asset-space direction -> equirectangular coordinates. */
export function directionToUV(d: Vec3): UV {
  return uvFromDirection(d);
}

export function projectRay(
  ray: Vec3,
  p: Projection,
  orientation: Orientation | null,
): UV {
  return directionToUV(assetFromViewRay(ray, p, orientation));
}

export function projectPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  p: Projection,
  orientation: Orientation | null = null,
) {
  return projectRay(viewRay(x, y, width, height, p), p, orientation);
}

/** Asset equirect coordinates -> creative-frame ray (inverse of projectRay). */
export function assetToViewRay(
  u: number,
  v: number,
  p: Projection,
  orientation: Orientation | null,
): Vec3 {
  const leveled = orientation ? rotate(orientation, fromUV(u, v)) : fromUV(u, v);
  const yaw = radians(p.yaw);
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw);
  return {
    x: leveled.x * cy + leveled.z * sy,
    y: leveled.y,
    z: -leveled.x * sy + leveled.z * cy,
  };
}

/** Leveled (calibrated) direction, with the user's yaw applied, to screen. */
export function leveledToScreen(
  d: Vec3,
  width: number,
  height: number,
  p: Projection,
) {
  const yaw = radians(p.yaw);
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw);
  return creativeToScreen(
    { x: d.x * cy + d.z * sy, y: d.y, z: -d.x * sy + d.z * cy },
    width,
    height,
    p,
  );
}

/**
 * Screen position of an asset equirectangular point, or null when the point
 * is behind the projection (not visible in the current framing).
 */
export function assetToScreen(
  u: number,
  v: number,
  width: number,
  height: number,
  p: Projection,
  orientation: Orientation | null,
): { x: number; y: number } | null {
  return leveledToScreen(
    orientation ? rotate(orientation, fromUV(u, v)) : fromUV(u, v),
    width,
    height,
    p,
  );
}

/** Screen point -> asset equirectangular point, for marking. */
export function screenToAssetUV(
  x: number,
  y: number,
  width: number,
  height: number,
  p: Projection,
  orientation: Orientation | null,
): UV {
  return projectRay(viewRay(x, y, width, height, p), p, orientation);
}
