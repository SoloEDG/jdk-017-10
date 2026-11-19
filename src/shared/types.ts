export interface Projection {
  mode: "planet" | "tunnel";
  zoom: number;
  yaw: number;
  pitch: number;
  roll: number;
}
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
/** w + xi + yj + zk, rotates asset directions into the leveled frame. */
export interface Orientation {
  w: number;
  x: number;
  y: number;
  z: number;
}
export interface HorizonPoint {
  id: string;
  u: number;
  v: number;
  enabled: boolean;
}
export interface HorizonCalibration {
  points: HorizonPoint[];
  /** Asset orientation transform on/off. Creative rotation stays separate. */
  enabled: boolean;
  /** Solved asset -> leveled rotation, null until a fit is applied. */
  applied: Orientation | null;
  appliedMethod: "strict" | "robust" | null;
  appliedTilt: number;
  /** Signature of the point set used for the applied solution. */
  appliedKey: string;
  /** Robust inlier tolerance in degrees. */
  tolerance: number;
  /** Explicitly chosen fit; ignored while `methodAuto` is true. */
  method: "strict" | "robust";
  /** Follow the analysis recommendation until the user picks a method. */
  methodAuto: boolean;
  /** UI: marking mode is active on the viewport and source strip. */
  marking: boolean;
  /** UI: which mark is highlighted for editing/removal. */
  selectedId: string | null;
  /** Transient note about how marks were handled when the asset changed. */
  rebindNotice: string;
}
export interface Edge {
  seam: number;
  feather: number;
  background: string;
  transparent: boolean;
}
export interface Asset {
  id: string;
  name: string;
  width: number;
  height: number;
  data: ImageData;
  thumbnail: string;
  /** Coarse luminance fingerprint used to re-bind calibration across sizes. */
  signature: string;
}
export interface StudioDocument {
  asset: Asset | null;
  projection: Projection;
  edge: Edge;
  calibration: HorizonCalibration;
}
export interface ExportSettings {
  size: number;
  format: "png" | "jpeg";
  quality: number;
}
export interface RenderSnapshot {
  asset: Asset;
  projection: Projection;
  edge: Edge;
  /** Calibration orientation, null when the asset transform is disabled. */
  orientation: Orientation | null;
}
