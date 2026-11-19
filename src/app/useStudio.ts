import { reactive } from "vue";
import type { StudioDocument } from "../shared/types";
import { defaultEdge, defaultProjection, identityCalibration } from "../shared/defaults";
export function useStudio() {
  return reactive<StudioDocument>({
    asset: null,
    projection: defaultProjection(),
    edge: defaultEdge(),
    calibration: identityCalibration(),
  });
}
