<!--
  VirtualListDemo - 可嵌入 Markdown 的虚拟列表交互式演示组件（基础版 · 固定高度）
  通过 MDC 语法 ::VirtualListDemo 在 Markdown 中使用
-->
<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { VirtualListItem, VirtualListConfig, DataCountOption } from '~/types/virtual-list'
import { DATA_COUNT_OPTIONS } from '~/types/virtual-list'

// ========== 常量配置 ==========
/** 虚拟列表基础配置 */
const CONFIG: VirtualListConfig = {
  itemHeight: 40,
  containerHeight: 400,
  buffer: 5,
} as const

/** 随机文本库 */
const SAMPLE_TEXTS: readonly string[] = [
  '虚拟列表只渲染可视区域',
  '大幅减少 DOM 节点数量',
  '滚动时动态计算可见范围',
  '使用 transform 偏移模拟位置',
  'Vue 3 Composition API 实现',
  '性能优化的关键技术',
  '支持十万级数据量渲染',
  '节省内存与 CPU 开销',
] as const

// ========== 响应式状态 ==========
/** 数据总量 */
const totalItems: Ref<DataCountOption> = ref<DataCountOption>(10000)
/** 当前滚动位置（px） */
const scrollTop: Ref<number> = ref(0)
/** 容器 DOM 引用 */
const containerRef: Ref<HTMLElement | null> = ref<HTMLElement | null>(null)

// ========== 数据生成 ==========
/** 从文本库中随机选取一条文本 */
function getRandomText(): string {
  return SAMPLE_TEXTS[Math.floor(Math.random() * SAMPLE_TEXTS.length)] ?? '虚拟列表演示'
}

/** 生成全量模拟数据 */
const allData: ComputedRef<VirtualListItem[]> = computed<VirtualListItem[]>(() =>
  Array.from({ length: totalItems.value }, (_, i): VirtualListItem => ({
    id: i + 1,
    text: `第 ${i + 1} 项 — ${getRandomText()}`,
    color: `hsl(${(i * 37) % 360}, 70%, 85%)`,
  }))
)

// ========== 虚拟列表核心计算 ==========
/** 可视区域起始索引（含缓冲区） */
const startIndex: ComputedRef<number> = computed<number>(() =>
  Math.max(0, Math.floor(scrollTop.value / CONFIG.itemHeight) - CONFIG.buffer)
)

/** 可视区域结束索引（含缓冲区） */
const endIndex: ComputedRef<number> = computed<number>(() =>
  Math.min(
    startIndex.value + Math.ceil(CONFIG.containerHeight / CONFIG.itemHeight) + CONFIG.buffer * 2,
    totalItems.value
  )
)

/** 当前需要渲染的可见数据切片 */
const visibleItems: ComputedRef<VirtualListItem[]> = computed<VirtualListItem[]>(() =>
  allData.value.slice(startIndex.value, endIndex.value)
)

/** 可见区域的 Y 轴偏移量（px） */
const offsetY: ComputedRef<number> = computed<number>(() =>
  startIndex.value * CONFIG.itemHeight
)

/** 列表总高度（px），用于撑开滚动容器 */
const totalHeight: ComputedRef<number> = computed<number>(() =>
  totalItems.value * CONFIG.itemHeight
)

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

/** 理论最少渲染 DOM 数（用于底部说明） */
const minRenderCount: ComputedRef<number> = computed<number>(() =>
  Math.ceil(CONFIG.containerHeight / CONFIG.itemHeight) + CONFIG.buffer * 2
)

// ========== 事件处理 ==========
/** 滚动事件处理 */
function onScroll(e: Event): void {
  const target = e.target as HTMLElement
  scrollTop.value = target.scrollTop
}
</script>

<template>
  <div class="my-6 rounded-xl border border-[var(--border-color)] overflow-hidden" style="background: var(--bg-card)">
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
        <div :style="{ transform: `translateY(${offsetY}px)` }">
          <div
            v-for="item in visibleItems"
            :key="item.id"
            class="flex items-center gap-3 px-4 border-b border-[var(--border-color)] text-sm transition-colors hover:bg-[var(--bg-card-hover)]"
            :style="{ height: CONFIG.itemHeight + 'px' }"
          >
            <span
              class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
              :style="{ background: item.color, color: '#333' }"
            >
              {{ item.id }}
            </span>
            <span class="text-[var(--text-secondary)] truncate text-[13px]">{{ item.text }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部说明 -->
    <div class="px-5 py-2.5 text-[11px] text-[var(--text-muted)] border-t border-[var(--border-color)]" style="background: var(--bg-soft)">
      💡 尝试切换数据量，观察渲染 DOM 数始终很少（仅 ~{{ minRenderCount }} 个）
    </div>
  </div>
</template>
