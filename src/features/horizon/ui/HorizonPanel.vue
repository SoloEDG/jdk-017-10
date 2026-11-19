<script setup lang="ts">
import { computed } from "vue";
import { Compass, Crosshair, RotateCcw, Trash2, Eye, EyeOff, Check } from "lucide-vue-next";
import type { StudioDocument } from "../../../shared/types";
import { confidenceLabel, MIN_APPLY_CONFIDENCE } from "../lib/fit";
import { useHorizon } from "../model/useHorizon";
import {
  clearCalibration,
  clearPoints,
  includeAll,
  MAX_POINTS,
  pointKey,
  removePoint,
  setTolerance,
  togglePoint,
} from "../model/calibration";

const props = defineProps<{ doc: StudioDocument }>();
const { analysis, method, fit } = useHorizon(props.doc);
const calibration = computed(() => props.doc.calibration);
const currentKey = computed(
  () =>
    `${method.value}:${calibration.value.tolerance.toFixed(2)}:${pointKey(
      calibration.value.points.filter((p) => p.enabled),
    )}`,
);
const applied = computed(() => calibration.value.applied !== null);
const stale = computed(
  () => applied.value && calibration.value.appliedKey !== currentKey.value,
);
const canApply = computed(
  () =>
    fit.value.valid &&
    analysis.value.enough &&
    fit.value.confidence >= MIN_APPLY_CONFIDENCE,
);
const sortedPoints = computed(() =>
  calibration.value.points.map((point, index) => ({
    ...point,
    index: index + 1,
    residual: fit.value.residuals[point.id],
  })),
);
const outlierCount = computed(
  () =>
    sortedPoints.value.filter(
      (p) =>
        p.enabled &&
        p.residual !== undefined &&
        Math.abs(p.residual) > calibration.value.tolerance,
    ).length,
);

function apply() {
  const value = fit.value;
  if (!value.valid || !canApply.value) return;
  calibration.value.applied = { ...value.orientation };
  calibration.value.appliedMethod = value.method;
  calibration.value.appliedTilt = value.tilt;
  // Pin the inspected method so the applied key stays comparable afterwards.
  calibration.value.method = value.method;
  calibration.value.methodAuto = false;
  calibration.value.appliedKey = currentKey.value;
  calibration.value.enabled = true;
  calibration.value.marking = false;
}

function chooseMethod(value: "strict" | "robust") {
  calibration.value.method = value;
  calibration.value.methodAuto = false;
}

const disabledCount = computed(
  () => calibration.value.points.filter((p) => !p.enabled).length,
);

function removeOutliers() {
  // Snapshot first: once a point is disabled the computed analysis recomputes,
  // so reading it mid-loop would chase a moving target.
  const current = analysis.value;
  const ids = calibration.value.points.map((p) => p.id);
  const rejected = new Set<string>();
  if (current.robust.valid && current.robust.inliers >= 3) {
    const inliers = new Set(current.robust.inlierIds);
    for (const id of ids) if (!inliers.has(id)) rejected.add(id);
  } else {
    for (const [id, residual] of Object.entries(current.strict.residuals))
      if (Math.abs(residual) > calibration.value.tolerance) rejected.add(id);
  }
  for (const point of calibration.value.points)
    if (point.enabled && rejected.has(point.id)) point.enabled = false;
}

function toggleMarking() {
  calibration.value.marking = !calibration.value.marking;
  if (calibration.value.marking) calibration.value.selectedId = null;
}

function pick(id: string) {
  calibration.value.selectedId =
    calibration.value.selectedId === id ? null : id;
}

function format(value: number | undefined, digits = 2) {
  if (value === undefined || !Number.isFinite(value)) return "–";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}°`;
}
</script>

<template>
  <section class="panel horizon-panel">
    <div class="section-label">
      <span>04 / 地平线校准</span><Compass :size="16" />
    </div>
    <p class="muted">
      在同一条真实地平线上标出 3–6 个点，求出让它们共同水平的球面朝向。
    </p>
    <p v-if="doc.calibration.rebindNotice" class="mini rebind-note">
      {{ doc.calibration.rebindNotice }}
    </p>

    <div class="horizon-actions">
      <button
        class="mark-button"
        :class="{ active: doc.calibration.marking }"
        :disabled="!doc.asset"
        @click="toggleMarking"
      >
        <Crosshair :size="14" />
        {{ doc.calibration.marking ? "结束标点" : "开始标点" }}
      </button>
      <button
        class="text-button"
        :disabled="!doc.calibration.points.length"
        @click="clearPoints(doc.calibration)"
      >
        <RotateCcw :size="13" /> 清空
      </button>
    </div>
    <p v-if="doc.calibration.marking" class="mini marking-hint">
      在下方原图或星球预览上点击添加标点，拖动可微调；单击已有点即可移除。
    </p>

    <div class="segmented small horizon-methods">
      <button
        :class="{ active: method === 'strict' }"
        @click="chooseMethod('strict')"
      >
        严格拟合
        <i v-if="analysis.recommended === 'strict'" class="rec">推荐</i>
      </button>
      <button
        :class="{ active: method === 'robust' }"
        @click="chooseMethod('robust')"
      >
        稳健方案
        <i v-if="analysis.recommended === 'robust'" class="rec">推荐</i>
      </button>
    </div>

    <label class="control"
      >离群容差
      <output>{{ doc.calibration.tolerance.toFixed(1) }}°</output
      ><input
        aria-label="离群容差"
        type="range"
        min="0.2"
        max="5"
        step="0.1"
        :value="doc.calibration.tolerance"
        @input="
          setTolerance(
            doc.calibration,
            Number(($event.target as HTMLInputElement).value),
          )
        "
    /></label>

    <div class="fit-readout">
      <div class="fit-row">
        <span>倾角</span><b>{{ fit.tilt.toFixed(2) }}°</b>
      </div>
      <div class="fit-row">
        <span>{{ fit.method === "strict" ? "残差 RMS" : "内点残差 RMS" }}</span
        ><b>{{ fit.inlierRms.toFixed(2) }}°</b>
      </div>
      <div v-if="fit.inliers < fit.total" class="fit-row">
        <span>全部点 RMS</span><b>{{ fit.rms.toFixed(2) }}°</b>
      </div>
      <div class="fit-row">
        <span>最大残差</span><b>{{ fit.maxAbs.toFixed(2) }}°</b>
      </div>
      <div class="fit-row">
        <span>内点</span
        ><b>{{ fit.inliers }} / {{ fit.total }}</b>
      </div>
      <div class="confidence">
        <span
          >{{ confidenceLabel(fit.confidence) }} ·
          {{ Math.round(fit.confidence * 100) }}%</span
        >
        <div class="confidence-bar">
          <i :style="{ width: `${Math.round(fit.confidence * 100)}%` }" />
        </div>
      </div>
      <p v-if="analysis.outliers > 0 && !analysis.sparse" class="mini warn">
        {{ analysis.outliers }} 个点与其余标点分成互相矛盾的组，自动方案不会替你取舍；
        请在列表中排除确认选错的点。
      </p>
      <p v-if="!fit.valid" class="mini warn">{{ fit.reason }}，将保留当前取景。</p>
      <p
        v-else-if="fit.confidence < MIN_APPLY_CONFIDENCE"
        class="mini warn"
      >
        约束不足，请补充间距更大的标点；将保留当前取景。
      </p>
      <p v-else class="mini">{{ analysis.reason }}</p>
      <p v-if="analysis.strict.inliers < analysis.strict.total" class="mini">
        同一批可靠点上，严格拟合 RMS
        {{ analysis.strictRmsOnRobustInliers.toFixed(2) }}°，稳健方案
        {{ analysis.robust.inlierRms.toFixed(2) }}°；两种朝向相差
        {{ analysis.strictRobustDelta.toFixed(2) }}°。
      </p>
    </div>

    <ul v-if="sortedPoints.length" class="mark-list">
      <li
        v-for="point in sortedPoints"
        :key="point.id"
        :class="{
          selected: doc.calibration.selectedId === point.id,
          disabled: !point.enabled,
          outlier:
            point.enabled &&
            point.residual !== undefined &&
            Math.abs(point.residual) > doc.calibration.tolerance,
        }"
      >
        <button class="mark-index" @click="pick(point.id)">
          {{ point.index }}
        </button>
        <span class="residual">{{ format(point.residual) }}</span>
        <button
          class="icon-button"
          :aria-label="point.enabled ? '排除该点' : '恢复该点'"
          @click="togglePoint(doc.calibration, point.id)"
        >
          <EyeOff v-if="point.enabled" :size="13" /><Eye v-else :size="13" />
        </button>
        <button
          class="icon-button"
          aria-label="删除该点"
          @click="removePoint(doc.calibration, point.id)"
        >
          <Trash2 :size="13" />
        </button>
      </li>
    </ul>
    <p v-if="outlierCount && method === 'strict'" class="mini warn">
      有 {{ outlierCount }} 个点超出容差，严格拟合会把它们一起平均。
      <button class="inline-button" @click="removeOutliers">排除这些点</button>
    </p>

    <p v-else-if="disabledCount" class="mini">
      已手动排除 {{ disabledCount }} 个点。
      <button class="inline-button" @click="includeAll(doc.calibration)">
        全部恢复
      </button>
    </p>
    <p v-if="analysis.enabled === 3" class="mini">
      三个点总能恰好共圆，需要跨越大角度才可信；补一个点可交叉验证。
    </p>
    <p v-if="doc.calibration.points.length >= MAX_POINTS" class="mini">
      已达到 {{ MAX_POINTS }} 个标点上限，先删除部分点再继续添加。
    </p>

    <div class="horizon-apply">
      <button class="primary" :disabled="!canApply" @click="apply">
        <Check :size="14" /> 应用校准
      </button>
      <label class="check calibration-toggle">
        <input type="checkbox" v-model="doc.calibration.enabled" />
        启用素材变换
      </label>
    </div>
    <p v-if="applied" class="mini" :class="{ warn: stale }">
      <template v-if="stale"
        >标点或方案已改变，画面沿用上次确认的校准；重新应用即可更新。</template
      >
      <template v-else
        >已应用{{ doc.calibration.appliedMethod === "strict" ? "严格" : "稳健" }}校准，
        素材偏转 {{ doc.calibration.appliedTilt.toFixed(2) }}°。此变换与你的旋转取景分开，两种投影和导出一致。</template
      >
    </p>
    <button
      v-if="applied"
      class="text-button"
      @click="clearCalibration(doc.calibration)"
    >
      <RotateCcw :size="13" /> 移除校准，回到原始朝向
    </button>
  </section>
</template>
