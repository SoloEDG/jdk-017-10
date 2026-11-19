<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, watchEffect } from "vue";
import type { StudioDocument } from "../../../shared/types";
import { useHorizon } from "../model/useHorizon";
import {
  addPoint,
  canAddPoint,
  movePoint,
  removePoint,
} from "../model/calibration";
import { cross, normalize, uvFromDirection } from "../../../shared/sphere";

const props = defineProps<{ doc: StudioDocument }>();
const canvas = ref<HTMLCanvasElement>();
const zoom = ref(1);
const BASE = 600;
let drag: { id: string; pointer: number } | null = null;
let moved = false;

const { fit } = useHorizon(props.doc);
/** Editing only happens in marking mode; otherwise the strip is a preview. */
const editable = computed(() => props.doc.calibration.marking);
const asset = computed(() => props.doc.asset);

function bitmapSize() {
  const current = asset.value;
  if (!current) return { width: BASE, height: BASE / 2 };
  const width = BASE * zoom.value;
  return { width, height: (width * current.height) / current.width };
}

/** Fitted great circle in equirectangular space, split where it meets the seam. */
function horizonRuns(width: number, height: number) {
  if (!fit.value?.valid) return [] as { x: number; y: number }[][];
  const n = normalize(fit.value.normal);
  let a = cross(n, { x: 0, y: 1, z: 0 });
  if (Math.hypot(a.x, a.y, a.z) < 1e-6) a = cross(n, { x: 1, y: 0, z: 0 });
  a = normalize(a);
  const b = cross(n, a);
  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  let prev: { x: number; y: number } | null = null;
  const steps = 480;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const d = {
      x: a.x * Math.cos(t) + b.x * Math.sin(t),
      y: a.y * Math.cos(t) + b.y * Math.sin(t),
      z: a.z * Math.cos(t) + b.z * Math.sin(t),
    };
    const uv = uvFromDirection(d);
    const p = { x: uv.u * width, y: uv.v * height };
    if (prev && Math.abs(prev.x - p.x) > width * 0.45) {
      if (run.length > 1) runs.push(run);
      run = [];
    }
    run.push(p);
    prev = p;
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

const source = ref<HTMLCanvasElement | null>(null);

function paint() {
  const el = canvas.value;
  const current = asset.value;
  if (!el || !current) return;
  if (!source.value) source.value = document.createElement("canvas");
  const cached = source.value;
  if (cached.width !== current.width || cached.height !== current.height) {
    cached.width = current.width;
    cached.height = current.height;
  }
  cached.getContext("2d")!.putImageData(current.data, 0, 0);

  const { width, height } = bitmapSize();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  el.width = Math.round(width * dpr);
  el.height = Math.round(height * dpr);
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  const ctx = el.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cached, 0, 0, width, height);

  // Seam guides, so marks placed on either side of the wrap stay readable.
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = "rgba(37, 66, 47, 0.5)";
  ctx.lineWidth = 1;
  for (const x of [0.5, width - 0.5]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.strokeStyle = "#ffd66b";
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 5;
  for (const run of horizonRuns(width, height)) {
    ctx.beginPath();
    run.forEach((point, i) =>
      i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
    );
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  props.doc.calibration.points.forEach((point, index) => {
    const x = point.u * width;
    const y = point.v * height;
    const residual = fit.value.residuals[point.id];
    const outlier =
      point.enabled &&
      residual !== undefined &&
      Math.abs(residual) > props.doc.calibration.tolerance;
    const selected = props.doc.calibration.selectedId === point.id;
    const radius = selected ? 10 : 8;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = !point.enabled
      ? "rgba(120, 128, 120, 0.6)"
      : outlier
        ? "#c4553d"
        : "#2f7a56";
    ctx.fill();
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeStyle = selected ? "#ffd66b" : "#fff";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "600 10px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), x, y + 0.5);
  });
}

watchEffect(paint);
watch(
  () => props.doc.asset,
  () => {
    zoom.value = 1;
  },
);
watch(zoom, () => requestAnimationFrame(paint));
onBeforeUnmount(() => {
  drag = null;
});

/** Pointer position in normalized asset coordinates, plus canvas-pixel offsets. */
function locate(e: PointerEvent) {
  const el = canvas.value!;
  const rect = el.getBoundingClientRect();
  const { width, height } = bitmapSize();
  const x = (e.clientX - rect.left) * (width / Math.max(rect.width, 1));
  const y = (e.clientY - rect.top) * (height / Math.max(rect.height, 1));
  return {
    u: x / width,
    v: y / height,
    x,
    y,
    inside: x >= 0 && x <= width && y >= 0 && y <= height,
  };
}

function hit(e: PointerEvent) {
  if (!canvas.value) return null;
  const { x, y } = locate(e);
  const { width, height } = bitmapSize();
  let best: string | null = null;
  let bestDistance = 16;
  for (const point of props.doc.calibration.points) {
    const d = Math.hypot(x - point.u * width, y - point.v * height);
    if (d < bestDistance) {
      bestDistance = d;
      best = point.id;
    }
  }
  return best;
}

function down(e: PointerEvent) {
  if (!props.doc.asset || !editable.value) return;
  const id = hit(e);
  if (id) {
    props.doc.calibration.selectedId = id;
    drag = { id, pointer: e.pointerId };
    moved = false;
  } else {
    const { u, v, inside } = locate(e);
    if (!inside || !canAddPoint(props.doc.calibration)) return;
    const added = addPoint(props.doc.calibration, u, v);
    props.doc.calibration.selectedId = added;
    drag = { id: added, pointer: e.pointerId };
    moved = true;
  }
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (!drag) return;
  const { u, v } = locate(e);
  movePoint(props.doc.calibration, drag.id, u, v);
  moved = true;
}
function end(e: PointerEvent) {
  const target = e.currentTarget as HTMLElement;
  if (target.hasPointerCapture?.(e.pointerId))
    target.releasePointerCapture(e.pointerId);
}
function up(e: PointerEvent) {
  if (!drag) return;
  // A click without movement on an existing mark removes it; a cancelled
  // pointer gesture never deletes anything.
  if (!moved) removePoint(props.doc.calibration, drag.id);
  drag = null;
  end(e);
}
function cancel(e: PointerEvent) {
  drag = null;
  end(e);
}
</script>
<template>
  <section class="horizon-source" aria-label="原图地平线标点">
    <header>
      <div>
        <span class="eyebrow">SOURCE STRIP</span>
        <strong>在原图上标出同一条地平线</strong>
      </div>
      <div class="strip-tools">
        <span v-if="editable">点击添加 · 拖动调整 · 单击已有点移除</span>
        <span v-else>开启标点后可在此编辑</span>
        <button
          aria-label="放大原图"
          :disabled="zoom >= 3"
          @click="zoom = Math.min(3, zoom + 0.5)"
        >
          +
        </button>
        <span class="strip-zoom">{{ zoom.toFixed(1) }}×</span>
        <button
          aria-label="缩小原图"
          :disabled="zoom <= 1"
          @click="zoom = Math.max(1, zoom - 0.5)"
        >
          −
        </button>
      </div>
    </header>
    <div class="strip-scroll">
      <canvas
        ref="canvas"
        :class="{ editable }"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="cancel"
        @lostpointercapture="cancel"
      />
    </div>
  </section>
</template>
