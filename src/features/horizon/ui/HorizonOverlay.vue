<script setup lang="ts">
import { computed } from "vue";
import type { StudioDocument } from "../../../shared/types";
import { assetToScreen } from "../../projection/lib/coordinates";
import { useHorizon } from "../model/useHorizon";
import { cross, normalize, uvFromDirection } from "../../../shared/sphere";

const props = defineProps<{ doc: StudioDocument }>();
const SIZE = 600;

const { fit, orientation } = useHorizon(props.doc);

const marks = computed(() =>
  props.doc.calibration.points.map((point, index) => {
    const screen = assetToScreen(
      point.u,
      point.v,
      SIZE,
      SIZE,
      props.doc.projection,
      orientation.value,
    );
    const residual = fit.value.residuals[point.id];
    return {
      id: point.id,
      index: index + 1,
      enabled: point.enabled,
      selected: props.doc.calibration.selectedId === point.id,
      screen,
      residual,
      outlier:
        point.enabled &&
        residual !== undefined &&
        Math.abs(residual) > props.doc.calibration.tolerance,
    };
  }),
);

/**
 * The proposed horizon, sampled in the asset frame and projected through the
 * current framing, so the line runs exactly over the marked content.
 */
const horizon = computed(() => {
  if (!fit.value.valid) return [] as { x: number; y: number }[][];
  const n = normalize(fit.value.normal);
  let a = cross(n, { x: 0, y: 1, z: 0 });
  if (Math.hypot(a.x, a.y, a.z) < 1e-6) a = cross(n, { x: 1, y: 0, z: 0 });
  a = normalize(a);
  const b = cross(n, a);
  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  let previous: { x: number; y: number } | null = null;
  const steps = 540;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const direction = {
      x: a.x * Math.cos(t) + b.x * Math.sin(t),
      y: a.y * Math.cos(t) + b.y * Math.sin(t),
      z: a.z * Math.cos(t) + b.z * Math.sin(t),
    };
    const uv = uvFromDirection(direction);
    const screen = assetToScreen(
      uv.u,
      uv.v,
      SIZE,
      SIZE,
      props.doc.projection,
      orientation.value,
    );
    const sane =
      screen &&
      Number.isFinite(screen.x) &&
      Number.isFinite(screen.y) &&
      Math.abs(screen.x) < 5000 &&
      Math.abs(screen.y) < 5000 &&
      (!previous || Math.hypot(screen.x - previous.x, screen.y - previous.y) < 260);
    if (sane && screen) {
      run.push(screen);
      previous = screen;
    } else {
      if (run.length > 1) runs.push(run);
      run = [];
      previous = null;
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
});

function pathOf(run: { x: number; y: number }[]) {
  return run
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
}
</script>
<template>
  <svg
    class="horizon-overlay"
    :class="{ marking: doc.calibration.marking }"
    viewBox="0 0 600 600"
    aria-hidden="true"
  >
    <g v-if="fit.valid" class="horizon-line">
      <path v-for="(run, i) in horizon" :key="i" :d="pathOf(run)" />
    </g>
    <g
      v-for="mark in marks"
      v-show="mark.screen"
      :key="mark.id"
      class="mark"
      :class="{
        selected: mark.selected,
        disabled: !mark.enabled,
        outlier: mark.outlier,
      }"
      :transform="`translate(${mark.screen?.x ?? 0} ${mark.screen?.y ?? 0})`"
    >
      <circle r="10" />
      <text text-anchor="middle" dominant-baseline="central">
        {{ mark.index }}
      </text>
    </g>
  </svg>
</template>
