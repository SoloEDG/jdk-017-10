import { watch, onBeforeUnmount, type Ref, ref } from "vue";
import type { StudioDocument } from "../../../shared/types";
import { renderPreview } from "../../projection";
import { activeOrientation } from "../../horizon/model/calibration";
export function usePreview(
  doc: StudioDocument,
  canvas: Ref<HTMLCanvasElement | undefined>,
) {
  const rendering = ref(false);
  let frame = 0;
  watch(
    () => [
      canvas.value,
      doc.asset,
      JSON.stringify(doc.projection),
      JSON.stringify(doc.edge),
      JSON.stringify(doc.calibration.applied),
      doc.calibration.enabled,
    ],
    () => {
      cancelAnimationFrame(frame);
      rendering.value = true;
      frame = requestAnimationFrame(() => {
        if (canvas.value && doc.asset)
          renderPreview(
            canvas.value,
            {
              asset: doc.asset,
              projection: { ...doc.projection },
              edge: { ...doc.edge },
              orientation: activeOrientation(doc.calibration),
            },
            600,
          );
        rendering.value = false;
      });
    },
    { immediate: true, flush: "post" },
  );
  onBeforeUnmount(() => cancelAnimationFrame(frame));
  return { rendering };
}
