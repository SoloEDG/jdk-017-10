<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Move,
  Maximize,
  MousePointer2,
  Plus,
  Minus,
  ScanLine,
  Crosshair,
  Check,
  X,
} from "lucide-vue-next";
import type { StudioDocument, Projection } from "../../../shared/types";
import { usePreview } from "../model/usePreview";
import { dragView, wheelZoom } from "../lib/gestures";
import { HorizonOverlay, HorizonSource } from "../../horizon";
import {
  addPoint,
  canAddPoint,
  movePoint,
  removePoint,
  activeOrientation,
} from "../../horizon/model/calibration";
import {
  assetToScreen,
  screenToAssetUV,
} from "../../projection/lib/coordinates";
const { doc } = defineProps<{ doc: StudioDocument }>();
const canvas = ref<HTMLCanvasElement>();
const { rendering } = usePreview(doc, canvas);
const guides = ref(false);
const wrap = ref<HTMLElement>();
const PREVIEW = 600;
let start: { x: number; y: number; p: Projection } | null = null;
let markDrag: { id: string; moved: boolean } | null = null;

const orientation = computed(() =>
  activeOrientation(doc.calibration),
);
const offCanvas = computed(() =>
  doc.calibration.points.filter(
    (point) =>
      !assetToScreen(
        point.u,
        point.v,
        PREVIEW,
        PREVIEW,
        doc.projection,
        orientation.value,
      ),
  ).length,
);

function localPoint(e: PointerEvent) {
  const rect = wrap.value!.getBoundingClientRect();
  const scale = PREVIEW / rect.width;
  return {
    x: (e.clientX - rect.left) * scale,
    y: (e.clientY - rect.top) * scale,
    rect,
  };
}

function hitMark(e: PointerEvent) {
  const { x, y } = localPoint(e);
  let best: string | null = null;
  let distance = 22;
  for (const point of doc.calibration.points) {
    const screen = assetToScreen(
      point.u,
      point.v,
      PREVIEW,
      PREVIEW,
      doc.projection,
      orientation.value,
    );
    if (!screen) continue;
    const d = Math.hypot(screen.x - x, screen.y - y);
    if (d < distance) {
      distance = d;
      best = point.id;
    }
  }
  return best;
}

function down(e: PointerEvent) {
  if (e.button !== 0 && !(doc.calibration.marking && e.button === 2)) return;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  if (doc.calibration.marking && e.button === 0 && !e.shiftKey) {
    start = null;
    const hit = hitMark(e);
    if (hit) {
      doc.calibration.selectedId = hit;
      markDrag = { id: hit, moved: false };
    } else if (canAddPoint(doc.calibration)) {
      const { x, y } = localPoint(e);
      const uv = screenToAssetUV(
        x,
        y,
        PREVIEW,
        PREVIEW,
        doc.projection,
        orientation.value,
      );
      const id = addPoint(doc.calibration, uv.u, uv.v);
      doc.calibration.selectedId = id;
      markDrag = { id, moved: true };
    }
    return;
  }
  start = { x: e.clientX, y: e.clientY, p: { ...doc.projection } };
}
function move(e: PointerEvent) {
  if (markDrag) {
    const { x, y } = localPoint(e);
    const uv = screenToAssetUV(
      x,
      y,
      PREVIEW,
      PREVIEW,
      doc.projection,
      orientation.value,
    );
    movePoint(doc.calibration, markDrag.id, uv.u, uv.v);
    markDrag.moved = true;
    return;
  }
  if (!start) return;
  Object.assign(
    doc.projection,
    dragView(
      start.p,
      e.clientX - start.x,
      e.clientY - start.y,
      (e.currentTarget as HTMLElement).clientWidth,
    ),
  );
}
function end(e: PointerEvent) {
  const target = e.currentTarget as HTMLElement;
  if (target.hasPointerCapture?.(e.pointerId))
    target.releasePointerCapture(e.pointerId);
}
function up(e: PointerEvent) {
  start = null;
  if (markDrag) {
    // Click without drag on an existing mark removes it.
    if (!markDrag.moved) removePoint(doc.calibration, markDrag.id);
    markDrag = null;
  }
  end(e);
}
function cancelGesture(e: PointerEvent) {
  // A cancelled gesture (lost capture, system interruption) must not delete.
  start = null;
  markDrag = null;
  end(e);
}
function wheel(e: WheelEvent) {
  doc.projection.zoom = wheelZoom(doc.projection.zoom, e.deltaY);
}

function accept() {
  doc.calibration.marking = false;
}
function cancel() {
  doc.calibration.marking = false;
  doc.calibration.selectedId = null;
}
function resetView() {
  doc.projection.zoom = 1;
}
</script>
<template>
  <main class="viewport">
    <div class="viewport-heading">
      <div>
        <span class="eyebrow">LIVE CANVAS</span>
        <h1>换个视角，世界很小。</h1>
      </div>
      <span class="live"><i />{{ rendering ? "正在渲染" : "实时预览" }}</span>
    </div>
    <div class="canvas-area" :class="{ calibrating: doc.calibration.marking }">
      <span class="corner-label"
        >{{
          doc.projection.mode === "planet" ? "LITTLE PLANET" : "INFINITE TUNNEL"
        }}
        / 01</span
      >
      <div
        ref="wrap"
        class="canvas-wrap"
        :class="{ guides, marking: doc.calibration.marking }"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="cancelGesture"
        @lostpointercapture="cancelGesture"
        @wheel.prevent="wheel"
        @contextmenu.prevent
      >
        <canvas ref="canvas" aria-label="小行星实时投影画布" />
        <HorizonOverlay v-if="doc.asset" :doc="doc" />
        <div v-if="!doc.asset" class="empty">导入一张照片，开启你的星球</div>
        <div v-if="guides" class="crosshair" />
        <div v-if="doc.calibration.marking" class="marking-banner">
          <Crosshair :size="13" /> 点击添加标点 · 拖动微调 · 单击已有点移除
        </div>
      </div>
      <div class="canvas-caption">
        <span>STEREOGRAPHIC PROJECTION</span><span>600 × 600 · 预览</span>
      </div>
      <div v-if="doc.calibration.marking" class="calibration-actions">
        <button class="primary" @click="accept">
          <Check :size="14" /> 完成标点
        </button>
        <button class="text-button" @click="cancel">
          <X :size="13" /> 退出标点
        </button>
        <span v-if="offCanvas" class="mini"
          >{{ offCanvas }} 个标点当前在取景之外，旋转画面即可看到。</span
        >
      </div>
    </div>
    <HorizonSource
      v-if="doc.asset && (doc.calibration.marking || doc.calibration.points.length)"
      :doc="doc"
    />
    <div class="viewport-toolbar">
      <div class="gesture-hint">
        <template v-if="doc.calibration.marking"
          ><Crosshair :size="14" /> 标点模式：单击加点 · Shift 拖动或右键拖动旋转</template
        >
        <template v-else
          ><MousePointer2 :size="14" /> 拖动旋转 <span>·</span
          ><Move :size="14" /> 滚轮缩放</template
        >
      </div>
      <div class="tool-buttons">
        <button
          aria-label="缩小"
          @click="doc.projection.zoom = wheelZoom(doc.projection.zoom, 100)"
        >
          <Minus :size="16" /></button
        ><span>{{ Math.round(doc.projection.zoom * 100) }}%</span
        ><button
          aria-label="放大"
          @click="doc.projection.zoom = wheelZoom(doc.projection.zoom, -100)"
        >
          <Plus :size="16" /></button
        ><b /><button
          aria-label="切换辅助线"
          :class="{ selected: guides }"
          @click="guides = !guides"
        >
          <ScanLine :size="17" /></button
        ><button aria-label="重置缩放" @click="resetView">
          <Maximize :size="16" />
        </button>
      </div>
    </div>
    <div class="inspiration">
      <span class="spark">✳</span>
      <div>
        <strong>每一片风景，都有另一个宇宙。</strong
        ><span>试试切换隧道模式，或轻轻拖动星球，寻找意想不到的构图。</span>
      </div>
      <span class="inspiration-number">017</span>
    </div>
  </main>
</template>
