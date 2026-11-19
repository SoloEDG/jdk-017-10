import { computed, type ComputedRef } from "vue";
import type { HorizonCalibration, StudioDocument } from "../../../shared/types";
import { analyzeHorizon, type FitResult, type HorizonAnalysis } from "../lib/fit";
import { activeOrientation } from "./calibration";

interface Entry {
  analysis: ComputedRef<HorizonAnalysis>;
  method: ComputedRef<"strict" | "robust">;
  fit: ComputedRef<FitResult>;
  orientation: ComputedRef<ReturnType<typeof activeOrientation>>;
}

const cache = new WeakMap<HorizonCalibration, Entry>();

/**
 * One shared analysis per document: the panel, the viewport overlay and the
 * source strip all read the same computed result while points are edited.
 */
export function useHorizon(doc: StudioDocument): Entry {
  const key = doc.calibration;
  const existing = cache.get(key);
  if (existing) return existing;
  const analysis = computed(() =>
    analyzeHorizon(key.points, key.tolerance),
  );
  // Until the user picks a method, follow the analysis recommendation.
  const method = computed<"strict" | "robust">(() => {
    const value = analysis.value;
    if (!key.methodAuto) return key.method;
    return value.recommended ?? "strict";
  });
  const fit = computed(() =>
    method.value === "strict" ? analysis.value.strict : analysis.value.robust,
  );
  const orientation = computed(() => activeOrientation(key));
  const entry = { analysis, method, fit, orientation };
  cache.set(key, entry);
  return entry;
}
