import { ref, markRaw } from "vue";
import type { StudioDocument } from "../../../shared/types";
import { decodeAsset } from "../lib/decode";
import { loadDemo } from "../lib/demo";
import { sameContent } from "../lib/signature";
export function useAssets(doc: StudioDocument) {
  const busy = ref(false),
    error = ref("");
  let revision = 0;
  async function load(file?: File) {
    const ticket = ++revision;
    busy.value = true;
    error.value = "";
    try {
      const asset = file
        ? await decodeAsset(file, file.name)
        : await loadDemo();
      if (ticket !== revision) return;
      const previous = doc.asset;
      if (previous && !sameContent(previous, asset)) {
        // Different content: old normalized marks and their transform do not apply.
        const hadMarks =
          doc.calibration.points.length > 0 ||
          doc.calibration.applied !== null;
        doc.calibration.points = [];
        doc.calibration.applied = null;
        doc.calibration.appliedMethod = null;
        doc.calibration.appliedTilt = 0;
        doc.calibration.appliedKey = "";
        doc.calibration.selectedId = null;
        doc.calibration.rebindNotice = hadMarks
          ? "检测到不同素材，旧标点与校准已清空。"
          : "";
      } else if (previous) {
        doc.calibration.rebindNotice =
          doc.calibration.points.length > 0
            ? "同一张素材的新尺寸，已沿用归一化标点与校准。"
            : "";
      }
      doc.asset = markRaw(asset);
    } catch (e) {
      if (ticket === revision)
        error.value = e instanceof Error ? e.message : "无法读取图片";
    } finally {
      if (ticket === revision) busy.value = false;
    }
  }
  return { busy, error, load };
}
