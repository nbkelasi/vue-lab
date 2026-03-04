<!--
  VirtualListDynamicHeight - 支持自定义/动态高度的虚拟列表（进阶版）
  核心原理：
  1. 使用「预估高度」初始化所有列表项的位置
  2. 渲染后通过 ResizeObserver 记录每个列表项的真实高度
  3. 使用缓存数组存储每项的 top/bottom/height，快速二分查找可见范围
  通过 MDC 语法 ::VirtualListDynamicHeight 在 Markdown 中使用

  性能优化（修复快速拖动滚动条卡死问题）：
  - positions 使用普通数组 + 版本号，避免 Vue 深度响应式代理开销
  - 级联更新限制最多 200 项，避免 O(n) 全量遍历
  - rAF 节流滚动事件，每帧最多更新一次
  - CSS contain 隔离渲染
-->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { DynamicHeightItem, DynamicHeightConfig, PositionCacheItem, DataCountOption } from '~/types/virtual-list'
import { DATA_COUNT_OPTIONS } from '~/types/virtual-list'

// ========== 常量配置 ==========
/** 动态高度虚拟列表配置 */
const CONFIG: DynamicHeightConfig = {
  itemHeight: 0,         // 动态高度版不使用固定行高
  containerHeight: 400,
  buffer: 5,
  estimatedHeight: 60,   // 预估高度，渲染后 ResizeObserver 校准
} as const

/** 高度变化判定阈值（px），低于此值视为无变化 */
const HEIGHT_DIFF_THRESHOLD: number = 0.5

/**
 * 级联更新最大项数
 * 限制每次高度变化后向下级联更新的范围，避免 O(n) 遍历导致卡死
 */
const MAX_CASCADE: number = 200

/** 模拟不同高度的内容文本库 */
const CONTENT_VARIANTS: readonly string[] = [
  '这是一行简短的内容。',
  '虚拟列表是高性能渲染的核心技术，它只渲染可视区域内的 DOM 节点。',
  '这段内容稍长一些。动态高度的虚拟列表需要在渲染后测量每个元素的真实高度，然后更新位置缓存。这比固定高度的实现要复杂得多，但更加灵活。',
  '短文本',
  '中等长度的描述性文本，包含了一些有用的信息，用来展示不同高度的列表项效果。',
  '这是一个多行内容的示例。在实际应用中，列表项的高度往往不是固定的——有的可能只有一行文字，有的可能包含图片、标签、描述等复杂内容。动态高度虚拟列表的核心挑战就在于，在元素实际渲染之前，我们无法准确知道它的真实高度。',
  '🎯 性能优化要点',
  '📊 数据量大时仍保持流畅滚动，关键在于减少 DOM 操作和利用缓存避免重复计算。二分查找算法在这里扮演了重要角色。',
] as const

// ========== 响应式状态 ==========
/** 数据总量 */
const totalItems: Ref<DataCountOption> = ref<DataCountOption>(10000)
/** 当前滚动位置（px） */
const scrollTop: Ref<number> = ref(0)
/** 滚动容器 DOM 引用 */
const containerRef: Ref<HTMLElement | null> = ref<HTMLElement | null>(null)
/** 可见列表区域 DOM 引用 */
const listRef: Ref<HTMLElement | null> = ref<HTMLElement | null>(null)

// ========== 位置缓存（使用普通数组，避免 Vue 深度代理开销） ==========
/**
 * 位置缓存 — 普通数组（非响应式）
 * 关键优化：positions 使用普通数组而非 Ref<PositionCacheItem[]>
 * 因为 10,000 个对象的深度 Proxy 代理会导致每次赋值极慢
 */
let positionsCache: PositionCacheItem[] = []

/**
 * 位置缓存版本号（响应式）
 * 每次修改 positionsCache 后递增，触发依赖它的 computed 重新计算
 */
const positionVersion: Ref<number> = ref(0)

// ========== rAF 节流 ==========
/** rAF 请求 ID */
let rafId: number | null = null
/** 待处理的滚动位置 */
let pendingScrollTop: number | null = null

// ========== 数据生成 ==========
/** 生成全量模拟数据（每项内容不同，导致高度不同） */
const allData: ComputedRef<DynamicHeightItem[]> = computed<DynamicHeightItem[]>(() =>
  Array.from({ length: totalItems.value }, (_, i): DynamicHeightItem => ({
    id: i + 1,
    text: CONTENT_VARIANTS[i % CONTENT_VARIANTS.length] ?? '虚拟列表演示',
    extra: i % 3 === 0 ? `附加说明 #${i + 1}：包含标签 [性能] [优化] [Vue3]` : '',
    color: `hsl(${(i * 47) % 360}, 65%, 88%)`,
    accent: `hsl(${(i * 47) % 360}, 65%, 45%)`,
  }))
)

// ========== 位置缓存管理 ==========
/**
 * 初始化位置缓存
 * 所有项使用预估高度初始化，渲染后由 ResizeObserver 更新为真实高度
 */
function initPositions(): void {
  positionsCache = allData.value.map((_, index): PositionCacheItem => ({
    index,
    top: index * CONFIG.estimatedHeight,
    bottom: (index + 1) * CONFIG.estimatedHeight,
    height: CONFIG.estimatedHeight,
  }))
  positionVersion.value++
}

/**
 * 测量已渲染 DOM 的真实高度，更新位置缓存
 * 优化：级联更新限制为 MAX_CASCADE 项，避免 O(n) 卡死
 */
function updatePositions(): void {
  if (!listRef.value) return

  const nodes: HTMLCollection = listRef.value.children
  if (!nodes || nodes.length === 0) return

  let changed: boolean = false

  for (let i = 0; i < nodes.length; i++) {
    const node: Element | undefined = nodes[i]
    if (!node) continue

    const rect: DOMRect = (node as HTMLElement).getBoundingClientRect()
    const realHeight: number = rect.height
    const dataIndex: number = startIndex.value + i

    const currentPos: PositionCacheItem | undefined = positionsCache[dataIndex]
    if (!currentPos) continue

    const oldHeight: number = currentPos.height
    const diff: number = realHeight - oldHeight

    if (Math.abs(diff) > HEIGHT_DIFF_THRESHOLD) {
      changed = true
      // 更新当前项
      currentPos.height = realHeight
      currentPos.bottom = currentPos.top + realHeight

      // 级联更新后续项的位置（限制最大范围，避免卡死）
      const cascadeEnd: number = Math.min(dataIndex + 1 + MAX_CASCADE, positionsCache.length)
      for (let j = dataIndex + 1; j < cascadeEnd; j++) {
        const pos: PositionCacheItem | undefined = positionsCache[j]
        const prevPos: PositionCacheItem | undefined = positionsCache[j - 1]
        if (!pos || !prevPos) continue
        pos.top = prevPos.bottom
        pos.bottom = pos.top + pos.height
      }
    }
  }

  // 只在有变化时才递增版本号，触发 computed 更新
  if (changed) {
    positionVersion.value++
  }
}

// ========== 二分查找 ==========
/**
 * 二分查找：给定 scrollTop，找到包含该位置的列表项索引
 * 在位置缓存数组中搜索，时间复杂度 O(log n)
 *
 * @param targetScrollTop - 目标滚动位置（px）
 * @returns 包含该位置的列表项索引
 */
function binarySearch(targetScrollTop: number): number {
  const len: number = positionsCache.length
  if (len === 0) return 0

  // 边界保护：在列表之前 → 返回第一项
  if (targetScrollTop <= 0) return 0

  // 边界保护：超过列表末尾 → 返回最后一项
  const lastPos: PositionCacheItem | undefined = positionsCache[len - 1]
  if (lastPos && targetScrollTop >= lastPos.bottom) return len - 1

  let low: number = 0
  let high: number = len - 1
  let result: number = 0

  while (low <= high) {
    const mid: number = (low + high) >>> 1
    const midPos: PositionCacheItem | undefined = positionsCache[mid]
    if (!midPos) break

    if (midPos.bottom <= targetScrollTop) {
      result = mid
      low = mid + 1
    } else if (midPos.top > targetScrollTop) {
      high = mid - 1
      result = mid
    } else {
      return mid
    }
  }
  return result
}

// ========== 虚拟列表核心计算 ==========
/** 可视区域起始索引（含缓冲区） */
const startIndex: ComputedRef<number> = computed<number>(() => {
  // 依赖 positionVersion 触发重算
  const _v = positionVersion.value
  const count: number = positionsCache.length
  if (count === 0) return 0
  return Math.max(0, binarySearch(scrollTop.value) - CONFIG.buffer)
})

/** 可视区域结束索引（含缓冲区） */
const endIndex: ComputedRef<number> = computed<number>(() => {
  const _v = positionVersion.value
  const count: number = positionsCache.length
  if (count === 0) return 0
  const end: number = binarySearch(scrollTop.value + CONFIG.containerHeight)
  return Math.min(end + CONFIG.buffer * 2, count)
})

/** 当前需要渲染的可见数据切片 */
const visibleItems: ComputedRef<DynamicHeightItem[]> = computed<DynamicHeightItem[]>(() =>
  allData.value.slice(startIndex.value, endIndex.value)
)

/** 可见区域的 Y 轴偏移量（px） */
const offsetY: ComputedRef<number> = computed<number>(() => {
  const _v = positionVersion.value
  if (positionsCache.length === 0 || startIndex.value >= positionsCache.length) return 0
  return positionsCache[startIndex.value]?.top ?? 0
})

/** 列表总高度（px），基于位置缓存的最后一项的 bottom 值 */
const totalHeight: ComputedRef<number> = computed<number>(() => {
  const _v = positionVersion.value
  if (positionsCache.length === 0) return 0
  return positionsCache[positionsCache.length - 1]?.bottom ?? 0
})

// ========== 性能统计 ==========
/** 当前渲染的 DOM 节点数 */
const renderedCount: ComputedRef<number> = computed<number>(() =>
  visibleItems.value.length
)

/** 滚动进度百分比 */
const scrollPercent: ComputedRef<number> = computed<number>(() => {
  const maxScroll: number = totalHeight.value - CONFIG.containerHeight
  return maxScroll > 0 ? Math.round((scrollTop.value / maxScroll) * 100) : 0
})

// ========== ResizeObserver ==========
/** ResizeObserver 实例，用于监测列表项高度变化 */
let resizeObserver: ResizeObserver | null = null
/** 上次观察的可见范围，避免重复断开/重连 */
let lastObservedRange: { start: number; end: number } = { start: -1, end: -1 }

/** 初始化 ResizeObserver */
function setupResizeObserver(): void {
  if (resizeObserver) resizeObserver.disconnect()

  resizeObserver = new ResizeObserver((): void => {
    updatePositions()
  })

  observeCurrentChildren()
}

/** 观察当前可见区域的 DOM 子元素（每次可见区变化后调用） */
function observeCurrentChildren(): void {
  if (!listRef.value || !resizeObserver) return

  const currentStart: number = startIndex.value
  const currentEnd: number = endIndex.value
  if (currentStart === lastObservedRange.start && currentEnd === lastObservedRange.end) return

  resizeObserver.disconnect()
  const children: HTMLCollection = listRef.value.children
  for (let i = 0; i < children.length; i++) {
    const child: Element | undefined = children[i]
    if (child) resizeObserver.observe(child)
  }
  lastObservedRange = { start: currentStart, end: currentEnd }
}

// ========== 事件处理 ==========
/**
 * 滚动事件处理（rAF 节流）
 * 快速拖动滚动条时，每帧最多更新一次 scrollTop
 */
function onScroll(e: Event): void {
  const target = e.target as HTMLElement
  pendingScrollTop = target.scrollTop

  if (rafId === null) {
    rafId = requestAnimationFrame((): void => {
      if (pendingScrollTop !== null) {
        scrollTop.value = pendingScrollTop
        pendingScrollTop = null
      }
      rafId = null
    })
  }
}

/** 监听可见范围变化，更新位置 + 重新观察新 DOM */
watch([startIndex, endIndex], (): void => {
  nextTick((): void => {
    updatePositions()
    observeCurrentChildren()
  })
})

// ========== 数据量变化监听 ==========
watch(totalItems, (): void => {
  initPositions()
  scrollTop.value = 0
  if (containerRef.value) {
    containerRef.value.scrollTop = 0
  }
  nextTick((): void => { updatePositions() })
})

// ========== 生命周期 ==========
onMounted((): void => {
  initPositions()
  nextTick((): void => {
    updatePositions()
    setupResizeObserver()
  })
})

onBeforeUnmount((): void => {
  // 清理 rAF
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  // 清理 ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<template>
  <div class="vl-dynamic my-6 rounded-xl border border-[var(--border-color)] overflow-hidden " style="background: var(--bg-card)">
    <!-- 标题栏 -->
    <div class="vl-dynamic__header px-5 py-3 border-b border-[var(--border-color)]" style="background: var(--bg-soft)">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-base">📐</span>
        <h3 class="text-sm font-bold text-[var(--text-primary)] m-0">动态高度虚拟列表</h3>
        <span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          进阶版
        </span>
      </div>
      <p class="text-[11px] text-[var(--text-muted)] m-0 leading-relaxed">
        支持每项不同高度 · 预估高度 + ResizeObserver 实时校准 · 二分查找定位 · rAF 节流
      </p>
    </div>

    <!-- 控制面板 -->
    <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-3 border-b border-[var(--border-color)]" style="background: var(--bg-soft)">
      <div class="flex items-center gap-3">
        <label class="text-xs font-semibold text-[var(--text-secondary)]">数据量：</label>
        <select
          v-model.number="totalItems"
          class="px-2.5 py-1 text-xs rounded-md border border-[var(--border-color)] font-medium cursor-pointer"
          style="background: var(--bg-card); color: var(--text-primary)"
        >
          <option v-for="count in DATA_COUNT_OPTIONS" :key="count" :value="count">
            {{ count.toLocaleString() }} 条
          </option>
        </select>
      </div>
      <div class="flex items-center gap-4 text-[11px] font-mono">
        <span class="text-[var(--text-muted)]">
          总计 <strong class="text-[var(--text-primary)]">{{ totalItems.toLocaleString() }}</strong> 项
        </span>
        <span class="text-[var(--text-muted)]">
          渲染 <strong class="text-[var(--color-primary)]">{{ renderedCount }}</strong> 个 DOM
        </span>
        <span class="text-[var(--text-muted)]">
          {{ scrollPercent }}%
        </span>
      </div>
    </div>

    <!-- 虚拟列表容器 -->
    <div
      ref="containerRef"
      class="overflow-y-auto relative"
      :style="{ height: CONFIG.containerHeight + 'px' }"
      @scroll="onScroll"
    >
      <!-- 撑开滚动高度的占位层 -->
      <div :style="{ height: totalHeight + 'px', position: 'relative' }">
        <!-- 可见区域 -->
        <div ref="listRef" :style="{ transform: `translateY(${offsetY}px)`, willChange: 'transform' }">
          <div
            v-for="item in visibleItems"
            :key="item.id"
            class="vl-dynamic__item px-4 py-3 border-b border-[var(--border-color)] transition-colors hover:bg-[var(--bg-card-hover)]"
          >
            <div class="flex items-start gap-3">
              <!-- 序号徽标 -->
              <span
                class="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                :style="{ background: item.color, color: item.accent }"
              >
                {{ item.id }}
              </span>
              <!-- 内容区 -->
              <div class="flex-1 min-w-0">
                <p class="text-[13px] text-[var(--text-secondary)] m-0 leading-relaxed">
                  {{ item.text }}
                </p>
                <p
                  v-if="item.extra"
                  class="text-[11px] text-[var(--text-muted)] m-0 mt-1.5 px-2 py-1 rounded-md"
                  style="background: var(--bg-soft)"
                >
                  {{ item.extra }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部说明 -->
    <div class="vl-dynamic__footer px-5 py-2.5 border-t border-[var(--border-color)] flex items-center gap-4 flex-wrap" style="background: var(--bg-soft)">
      <span class="text-[11px] text-[var(--text-muted)]">
        📐 每项高度不同，通过预估高度初始化 → 渲染后 ResizeObserver 校准 → 二分查找定位
      </span>
      <span class="text-[11px] text-[var(--text-muted)] font-mono">
        预估高度: {{ CONFIG.estimatedHeight }}px
      </span>
    </div>
  </div>
</template>

<style scoped>
/* CSS contain 优化：告诉浏览器每个列表项渲染独立，减少布局污染 */
.vl-dynamic__item {
  contain: layout style paint;
}
</style>
