import type { HorizonPoint, Orientation, Vec3 } from "../../../shared/types";
import { clamp } from "../../../shared/math";
import {
  cross,
  dot,
  directionFromUV,
  normalize,
  orientationFromAxisAngle,
  orientationAngle,
  toDeg,
} from "../../../shared/sphere";

export type FitMethod = "strict" | "robust";

/**
 * Below this confidence the solution is too weakly constrained to justify
 * changing the framing; the panel keeps the current view instead.
 */
export const MIN_APPLY_CONFIDENCE = 0.18;

export interface FitResult {
  method: FitMethod;
  normal: Vec3;
  orientation: Orientation;
  tilt: number;
  residuals: Record<string, number>;
  inlierIds: string[];
  inliers: number;
  total: number;
  rms: number;
  /** RMS over points inside the tolerance band only. */
  inlierRms: number;
  maxAbs: number;
  spread: number;
  confidence: number;
  valid: boolean;
  reason: string;
}

export interface HorizonAnalysis {
  enabled: number;
  strict: FitResult;
  robust: FitResult;
  recommended: FitMethod | null;
  /** Strict-fit RMS measured only on the robust fit's inlier region. */
  strictRmsOnRobustInliers: number;
  strictRobustDelta: number;
  enough: boolean;
  /** Enabled points outside the robust fit's tolerance band. */
  outliers: number;
  /** Whether the outliers look like isolated mistakes rather than a split. */
  sparse: boolean;
  reason: string;
}

const IDENTITY: Orientation = { w: 1, x: 0, y: 0, z: 0 };

function covariance(dirs: Vec3[]): number[][] {
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const d of dirs) {
    const a = [d.x, d.y, d.z];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) m[i][j] += a[i] * a[j];
  }
  return m;
}

/** Smallest-eigenvector fit: the normal of the best great circle. */
function smallestEigenvector(m: number[][]): Vec3 {
  const a = m.map((row) => row.slice());
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let iter = 0; iter < 48; iter++) {
    let p = 0,
      q = 1,
      max = Math.abs(a[0][1]);
    for (const [i, j] of [
      [0, 2],
      [1, 2],
    ])
      if (Math.abs(a[i][j]) > max) {
        max = Math.abs(a[i][j]);
        p = i;
        q = j;
      }
    if (max < 1e-15) break;
    const theta = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(theta),
      s = Math.sin(theta);
    for (let k = 0; k < 3; k++) {
      const kp = a[k][p],
        kq = a[k][q];
      a[k][p] = c * kp - s * kq;
      a[k][q] = s * kp + c * kq;
    }
    for (let k = 0; k < 3; k++) {
      const pk = a[p][k],
        qk = a[q][k];
      a[p][k] = c * pk - s * qk;
      a[q][k] = s * pk + c * qk;
    }
    for (let k = 0; k < 3; k++) {
      const kp = v[k][p],
        kq = v[k][q];
      v[k][p] = c * kp - s * kq;
      v[k][q] = s * kp + c * kq;
    }
  }
  let idx = 0;
  for (let i = 1; i < 3; i++) if (a[i][i] < a[idx][idx]) idx = i;
  return normalize({ x: v[0][idx], y: v[1][idx], z: v[2][idx] });
}

function normalOfTriple(a: Vec3, b: Vec3, c: Vec3): Vec3 | null {
  const n = cross(
    { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
    { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z },
  );
  const len = Math.hypot(n.x, n.y, n.z);
  // Points strung along a tiny arc define a vanishingly thin triangle.
  if (len < 1e-4) return null;
  return normalize(n);
}

function upNormal(n: Vec3): Vec3 {
  return n.y < 0 ? { x: -n.x, y: -n.y, z: -n.z } : n;
}

/** Signed angular elevation of a direction above the fitted horizon, degrees. */
export function residualDegrees(normal: Vec3, d: Vec3) {
  return Math.asin(clamp(dot(normal, d), -1, 1)) * toDeg;
}

export function orientationFromNormal(normal: Vec3): Orientation {
  const n = upNormal(normal);
  const axis = cross(n, { x: 0, y: 1, z: 0 });
  const len = Math.hypot(axis.x, axis.y, axis.z);
  if (len < 1e-12) return { ...IDENTITY };
  return orientationFromAxisAngle(axis, Math.acos(clamp(n.y, -1, 1)));
}

function spreadOf(dirs: Vec3[]) {
  let max = 0;
  for (let i = 0; i < dirs.length; i++)
    for (let j = i + 1; j < dirs.length; j++)
      max = Math.max(
        max,
        Math.acos(clamp(dot(dirs[i], dirs[j]), -1, 1)) * toDeg,
      );
  return max;
}

function summarize(
  method: FitMethod,
  normal: Vec3,
  points: HorizonPoint[],
  dirs: Vec3[],
  tolerance: number,
): FitResult {
  const residuals: Record<string, number> = {};
  const abs: number[] = [];
  const inlierIds: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const r = residualDegrees(normal, dirs[i]);
    residuals[points[i].id] = r;
    abs.push(Math.abs(r));
    if (Math.abs(r) <= tolerance) inlierIds.push(points[i].id);
  }
  const inlierDirs = points
    .map((p, i) => (inlierIds.includes(p.id) ? dirs[i] : null))
    .filter((d): d is Vec3 => d !== null);
  const spread = spreadOf(inlierDirs);
  const rms = Math.sqrt(
    abs.reduce((sum, r) => sum + r * r, 0) / Math.max(abs.length, 1),
  );
  const inlierAbs = abs.filter((r) => r <= tolerance);
  const inlierRms = Math.sqrt(
    inlierAbs.reduce((sum, r) => sum + r * r, 0) / Math.max(inlierAbs.length, 1),
  );
  const orientation = orientationFromNormal(normal);
  const tilt = Math.acos(clamp(upNormal(normal).y, -1, 1)) * toDeg;

  const total = points.length;
  // Any three points sit exactly on some great circle, so redundancy matters:
  // three marks only become trustworthy once they span a wide arc.
  const population = clamp((inlierIds.length - 2) / 4, 0, 1);
  const coverage = clamp((spread - 4) / 26, 0, 1);
  const accuracy = Math.exp(-Math.pow(inlierRms / Math.max(tolerance, 0.6), 2));
  const keep = total ? inlierIds.length / total : 0;
  const confidence = clamp(
    population * (0.35 + 0.65 * coverage) * (0.55 + 0.45 * accuracy) * (0.6 + 0.4 * keep),
    0,
    1,
  );

  let valid = true,
    reason = "";
  if (total < 3) {
    valid = false;
    reason = "至少需要 3 个有效标点";
  } else if (inlierDirs.length < 3) {
    valid = false;
    reason = "内点不足 3 个，无法确定地平线";
  } else if (spread < 4) {
    valid = false;
    reason = "点位过于集中，地平线方向不稳定";
  }

  return {
    method,
    normal: upNormal(normal),
    orientation,
    tilt,
    residuals,
    inlierIds,
    inliers: inlierIds.length,
    total,
    rms,
    inlierRms,
    maxAbs: abs.length ? Math.max(...abs) : 0,
    spread,
    confidence,
    valid,
    reason,
  };
}

function normalOfIds(dirs: Vec3[], ids: number[]): Vec3 | null {
  if (ids.length < 3) return null;
  const n = smallestEigenvector(covariance(ids.map((i) => dirs[i])));
  return upNormal(n);
}

/** Truncated least-squares cost; outliers cost the same as sitting on the edge. */
function truncatedCost(normal: Vec3, dirs: Vec3[], tolerance: number) {
  let cost = 0;
  for (const d of dirs) {
    const r = residualDegrees(normal, d);
    cost += Math.min(r * r, tolerance * tolerance);
  }
  return cost;
}

function refine(
  seed: Vec3,
  points: HorizonPoint[],
  dirs: Vec3[],
  tolerance: number,
) {
  let normal = upNormal(seed);
  let inlierIdx = points
    .map((_, i) => i)
    .filter((i) => Math.abs(residualDegrees(normal, dirs[i])) <= tolerance);
  if (inlierIdx.length < 3) return null;
  for (let iter = 0; iter < 10; iter++) {
    const next = normalOfIds(dirs, inlierIdx);
    if (!next) return null;
    normal = next;
    const updated = points
      .map((_, i) => i)
      .filter((i) => Math.abs(residualDegrees(normal, dirs[i])) <= tolerance);
    if (updated.length < 3) break;
    const same =
      updated.length === inlierIdx.length &&
      updated.every((i) => inlierIdx.includes(i));
    inlierIdx = updated;
    if (same) break;
  }
  return {
    normal,
    inlierIdx: [...inlierIdx].sort((a, b) => a - b),
    cost: truncatedCost(normal, dirs, tolerance),
  };
}

/**
 * Strict least-squares over every enabled point, and a robust truncated-cost
 * fit that tolerates a few mistaken marks. Both are returned so the UI can
 * compare them before anything is applied.
 */
export function analyzeHorizon(
  allPoints: HorizonPoint[],
  tolerance: number,
): HorizonAnalysis {
  const points = allPoints.filter((p) => p.enabled);
  const dirs = points.map((p) => directionFromUV(p.u, p.v));
  const tol = clamp(tolerance, 0.2, 10);
  if (points.length < 3) {
    const fallback = (method: FitMethod): FitResult => ({
      method,
      normal: { x: 0, y: 1, z: 0 },
      orientation: { ...IDENTITY },
      tilt: 0,
      residuals: {},
      inlierIds: [],
      inliers: 0,
      total: points.length,
      rms: 0,
      inlierRms: 0,
      maxAbs: 0,
      spread: 0,
      confidence: 0,
      valid: false,
      reason: "至少需要 3 个有效标点",
    });
    const strict = fallback("strict"),
      robust = fallback("robust");
    return {
      enabled: points.length,
      strict,
      robust,
      recommended: null,
      strictRmsOnRobustInliers: 0,
      strictRobustDelta: 0,
      enough: false,
      outliers: 0,
      sparse: false,
      reason: "至少需要 3 个有效标点",
    };
  }

  const strictNormal = smallestEigenvector(covariance(dirs));
  const strict = summarize("strict", strictNormal, points, dirs, tol);

  // Minimal samples plus the global fit as a seed. Deterministic order keeps
  // repeated analyses stable while the user edits points.
  const seeds: { normal: Vec3; cost: number }[] = [
    { normal: upNormal(strictNormal), cost: Number.POSITIVE_INFINITY },
  ];
  const limit = 2600;
  let tried = 0;
  outer: for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      for (let k = j + 1; k < points.length; k++) {
        if (++tried > limit) break outer;
        const n = normalOfTriple(dirs[i], dirs[j], dirs[k]);
        if (!n) continue;
        const up = upNormal(n);
        seeds.push({ normal: up, cost: truncatedCost(up, dirs, tol) });
      }
  seeds.sort((a, b) => a.cost - b.cost);

  const refined: { normal: Vec3; inlierIdx: number[]; cost: number }[] = [];
  for (const seed of seeds) {
    if (refined.length >= 6) break;
    if (
      refined.some(
        (r) => Math.abs(dot(r.normal, seed.normal)) > 0.9999,
      )
    )
      continue;
    const result = refine(seed.normal, points, dirs, tol);
    if (result) refined.push(result);
  }
  refined.sort(
    (a, b) => a.cost - b.cost || b.inlierIdx.length - a.inlierIdx.length,
  );

  let robustNormal = strictNormal;
  if (refined.length) robustNormal = refined[0].normal;
  const robust = summarize("robust", robustNormal, points, dirs, tol);

  const robustInlierSet = new Set(robust.inlierIds);
  const strictOnInliers = points
    .map((p) => strict.residuals[p.id])
    .filter((_, i) => robustInlierSet.has(points[i].id));
  const strictRmsOnRobustInliers = Math.sqrt(
    strictOnInliers.reduce((sum, r) => sum + r * r, 0) /
      Math.max(strictOnInliers.length, 1),
  );
  const strictRobustDelta = orientationAngle(
    strict.orientation,
    robust.orientation,
  );

  // "A few" wrong marks: at most a quarter of the enabled points (and at
  // least one). A bigger split means two competing interpretations rather
  // than isolated mistakes, so neither is applied automatically.
  const outliers = points.length - robust.inliers;
  const sparse = outliers >= 1 && outliers <= Math.max(1, Math.floor(points.length / 4));
  const reliableRegionMoved =
    strictRmsOnRobustInliers >= 0.5 &&
    strictRmsOnRobustInliers >= Math.max(robust.inlierRms, 0.1) * 2;

  let recommended: FitMethod | null = null;
  let reason = "";
  if (!strict.valid && !robust.valid) {
    reason = strict.reason || robust.reason;
  } else if (!strict.valid) {
    recommended = robust.valid && sparse ? "robust" : null;
    reason = recommended
      ? "严格拟合被离群点带偏，稳健方案保住了可靠区域"
      : "标点分成互相矛盾的多组，请手动排除错误点";
  } else if (strict.inliers === points.length) {
    recommended = "strict";
    reason = "所有标点都在容差内，严格拟合已足够";
  } else if (!sparse) {
    recommended = "strict";
    reason = "超出容差的点较多，稳健方案可能只是在另一组点里自洽；请核对后手动排除";
  } else if (
    robust.valid &&
    robust.inliers >= 3 &&
    robust.inlierRms <= tol &&
    reliableRegionMoved
  ) {
    recommended = "robust";
    reason = "稳健方案剔除了离群点，且可靠区域比严格拟合更接近水平";
  } else {
    recommended = "strict";
    reason = "离群点对可靠区域影响很小，严格拟合已足够";
  }

  return {
    enabled: points.length,
    strict,
    robust,
    recommended,
    strictRmsOnRobustInliers,
    strictRobustDelta,
    enough: recommended !== null && (strict.valid || (robust.valid && sparse)),
    outliers,
    sparse,
    reason,
  };
}

export function confidenceLabel(confidence: number) {
  if (confidence >= 0.66) return "可信度高";
  if (confidence >= 0.4) return "可信度中";
  if (confidence >= 0.22) return "可信度低";
  return "约束不足";
}
