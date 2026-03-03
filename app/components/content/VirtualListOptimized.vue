<!--
  VirtualListOptimized - 最终版虚拟列表（动态高度 + 白屏优化）
  核心特性：
  1. 支持自定义/动态高度 - 预估高度 + ResizeObserver + 二分查找
  2. IntersectionObserver 哨兵 - 辅助边界检测
  3. requestAnimationFrame 节流 - 确保每帧只更新一次
  4. Web Worker 后台计算 - 排序/过滤不阻塞主线程
  5. CSS contain 渲染隔离 - 浏览器只重绘变化区域

  白屏优化关键：
  - ResizeObserver 随可视区变化动态观察新 DOM
  - 位置缓存级联更新优化：只更新到可见范围外一定距离
  - 增大像素级缓冲区，保证快速滚动时也有足够预渲染
  - 滚动回调零延迟直接同步位置
-->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick, shallowRef } from 'vue'
import type { Ref, ComputedRef, ShallowRef } from 'vue'
import type {
  OptimizedDataItem,
  DataCountOption,
  CategoryFilter,
  CategoryType,
  SortField,
  SortOrder,
  WorkerRequest,
  WorkerResponse,
  PositionCacheItem,
} from '~/types/virtual-list'
import {
  DATA_COUNT_OPTIONS,
  CATEGORY_FILTERS,
} from '~/types/virtual-list'

// ========== 常量配置 ==========
/** 容器可视高度（px） */
const CONTAINER_HEIGHT: number = 420
/** 预估行高（px），真实高度由 ResizeObserver 校准 */
const ESTIMATED_HEIGHT: number = 50
/** 高度变化判定阈值（px），低于此值视为无变化 */
const HEIGHT_DIFF_THRESHOLD: number = 0.5
/** 搜索防抖延迟（ms） */
const FILTER_DEBOUNCE_MS: number = 200
/**
 * 像素级缓冲区大小（px）
 * 在可视区上下各额外渲染这么多像素的内容，防止白屏
 * 值越大白屏越少但 DOM 越多
 */
const BUFFER_PX: number = 600
/** 位置级联更新最大范围（超过此数不再级联，留到下次） */
const MAX_CASCADE_COUNT: number = 200

// ========== DOM 引用 ==========
const containerRef: Ref<HTMLElement | null> = ref<HTMLElement | null>(null)
const listRef: Ref<HTMLElement | null> = ref<HTMLElement | null>(null)
const sentinelTopRef: Ref<HTMLElement | null> = ref<HTMLElement | null>(null)
const sentinelBottomRef: Ref<HTMLElement | null> = ref<HTMLElement | null>(null)

// ========== 优化开关 ==========
const useDynamicHeight: Ref<boolean> = ref(true)
const useRAF: Ref<boolean> = ref(true)
const useContain: Ref<boolean> = ref(true)
const useIOSentinel: Ref<boolean> = ref(true)

// ========== 响应式状态 ==========
const totalItems: Ref<DataCountOption> = ref<DataCountOption>(10000)
const scrollTop: Ref<number> = ref(0)
const isWorkerReady: Ref<boolean> = ref(false)
const workerElapsed: Ref<number> = ref(0)
const filterKeyword: Ref<string> = ref('')
const sortBy: Ref<SortField> = ref<SortField>('id')
const sortOrder: Ref<SortOrder> = ref<SortOrder>('asc')
const activeCategory: Ref<CategoryFilter> = ref<CategoryFilter>('all')
const isProcessing: Ref<boolean> = ref(false)

// ========== 性能计数器 ==========
const scrollEventCount: Ref<number> = ref(0)
const actualUpdateCount: Ref<number> = ref(0)
let rafId: number | null = null
let pendingScrollTop: number | null = null
/** 客户端挂载标志，避免 SSR hydration 不匹配 */
const isMounted: Ref<boolean> = ref(false)

// ========== 数据存储 ==========
const rawData: ShallowRef<OptimizedDataItem[]> = shallowRef<OptimizedDataItem[]>([])
const processedData: ShallowRef<OptimizedDataItem[]> = shallowRef<OptimizedDataItem[]>([])

// ========== 位置缓存（动态高度模式） ==========
/**
 * 使用普通数组而非 ref 包装，避免 Vue 对海量位置数据做响应式追踪。
 * 通过手动触发 triggerKey 来通知 computed 重新计算。
 */
let positionsCache: PositionCacheItem[] = []
/** 每次位置缓存变化时 +1，用于触发 computed 重算 */
const positionVersion: Ref<number> = ref(0)
let resizeObserver: ResizeObserver | null = null
/** 上一次观察的可见范围，用于判断是否需要重新观察 */
let lastObservedRange: { start: number; end: number } = { start: -1, end: -1 }

// ========== 模拟动态内容的文本库 ==========
const CONTENT_VARIANTS: readonly string[] = [
  '虚拟列表只渲染可视区域',
  '大幅减少 DOM 节点数量，这是高性能长列表的核心技术',
  '滚动时动态计算可见范围',
  '使用 transform 偏移模拟位置',
  'Vue 3 Composition API 实现。结合响应式系统和 computed 属性，可以非常高效地实现虚拟滚动的核心逻辑',
  '性能优化的关键技术',
  '支持十万级数据量渲染，通过只渲染可视区域内的 DOM 节点来保证高性能',
  '节省内存与 CPU 开销',
  'IntersectionObserver 优化',
  'requestAnimationFrame 节流。rAF 会在浏览器下一次重绘之前执行回调，确保每帧最多更新一次',
  'Web Worker 后台计算',
  'CSS contain 渲染隔离，告诉浏览器每个列表项的渲染独立于外部',
] as const

// ========== Web Worker ==========
let worker: Worker | null = null
let filterDebounceTimer: ReturnType<typeof setTimeout> | null = null

function initWorker(): void {
  try {
    const workerCode: string = `
      var texts = [
        '虚拟列表只渲染可视区域', '大幅减少 DOM 节点数量，这是高性能长列表的核心技术',
        '滚动时动态计算可见范围', '使用 transform 偏移模拟位置',
        'Vue 3 Composition API 实现。结合响应式系统和 computed 属性，可以非常高效地实现虚拟滚动的核心逻辑',
        '性能优化的关键技术',
        '支持十万级数据量渲染，通过只渲染可视区域内的 DOM 节点来保证高性能',
        '节省内存与 CPU 开销',
        'IntersectionObserver 优化',
        'requestAnimationFrame 节流。rAF 会在浏览器下一次重绘之前执行回调，确保每帧最多更新一次',
        'Web Worker 后台计算',
        'CSS contain 渲染隔离，告诉浏览器每个列表项的渲染独立于外部',
      ];
      var categories = ['性能', '架构', '渲染', '优化', '数据', '交互'];

      function generateData(count) {
        var data = [];
        for (var i = 0; i < count; i++) {
          data.push({
            id: i + 1,
            text: '第 ' + (i + 1) + ' 项 — ' + texts[i % texts.length],
            category: categories[i % categories.length],
            value: Math.floor(Math.random() * 10000),
            color: 'hsl(' + ((i * 37) % 360) + ', 70%, 85%)',
          });
        }
        return data;
      }

      function filterData(data, keyword, category) {
        var result = data;
        if (keyword) {
          var lower = keyword.toLowerCase();
          result = result.filter(function(item) {
            return item.text.toLowerCase().includes(lower) || item.id.toString().includes(lower);
          });
        }
        if (category && category !== 'all') {
          result = result.filter(function(item) { return item.category === category; });
        }
        return result;
      }

      function sortData(data, sortBy, sortOrder) {
        var sorted = data.slice();
        sorted.sort(function(a, b) {
          var c = 0;
          switch (sortBy) {
            case 'id': c = a.id - b.id; break;
            case 'value': c = a.value - b.value; break;
            case 'text': c = a.text.localeCompare(b.text); break;
            case 'category': c = a.category.localeCompare(b.category); break;
            default: c = a.id - b.id;
          }
          return sortOrder === 'desc' ? -c : c;
        });
        return sorted;
      }

      self.addEventListener('message', function(e) {
        var type = e.data.type;
        var payload = e.data.payload;
        var start = performance.now();
        switch (type) {
          case 'generate': {
            var data = generateData(payload.count);
            self.postMessage({ type: 'generated', data: data, elapsed: performance.now() - start });
            break;
          }
          case 'filter': {
            var filtered = filterData(payload.data, payload.keyword, payload.category);
            self.postMessage({ type: 'filtered', data: filtered, elapsed: performance.now() - start });
            break;
          }
          case 'sort': {
            var sorted = sortData(payload.data, payload.sortBy, payload.sortOrder);
            self.postMessage({ type: 'sorted', data: sorted, elapsed: performance.now() - start });
            break;
          }
        }
      });
    `
    const blob: Blob = new Blob([workerCode], { type: 'application/javascript' })
    worker = new Worker(URL.createObjectURL(blob))
    worker.addEventListener('message', handleWorkerMessage)
    isProcessing.value = true
    postWorkerMessage({ type: 'generate', payload: { count: totalItems.value } })
  } catch (_error: unknown) {
    console.warn('Web Worker 创建失败，回退到主线程处理')
    generateDataOnMainThread()
  }
}

function handleWorkerMessage(e: MessageEvent<WorkerResponse>): void {
  const response: WorkerResponse = e.data
  workerElapsed.value = response.elapsed

  switch (response.type) {
    case 'generated':
      rawData.value = response.data
      processedData.value = response.data
      isWorkerReady.value = true
      isProcessing.value = false
      onDataReady()
      break
    case 'filtered':
      if (sortBy.value !== 'id' || sortOrder.value !== 'asc') {
        postWorkerMessage({
          type: 'sort',
          payload: { data: response.data, sortBy: sortBy.value, sortOrder: sortOrder.value },
        })
      } else {
        processedData.value = response.data
        isProcessing.value = false
        onDataReady()
      }
      break
    case 'sorted':
      processedData.value = response.data
      isProcessing.value = false
      onDataReady()
      break
  }
}

function postWorkerMessage(message: WorkerRequest): void {
  worker?.postMessage(message)
}

function generateDataOnMainThread(): void {
  const cats: readonly CategoryType[] = ['性能', '架构', '渲染', '优化', '数据', '交互']
  const data: OptimizedDataItem[] = []
  for (let i = 0; i < totalItems.value; i++) {
    data.push({
      id: i + 1,
      text: `第 ${i + 1} 项 — ${CONTENT_VARIANTS[i % CONTENT_VARIANTS.length] ?? '虚拟列表演示'}`,
      category: cats[i % cats.length] ?? '性能',
      value: Math.floor(Math.random() * 10000),
      color: `hsl(${(i * 37) % 360}, 70%, 85%)`,
    })
  }
  rawData.value = data
  processedData.value = data
  isWorkerReady.value = true
  isProcessing.value = false
  onDataReady()
}

/** 数据就绪后统一的初始化入口 */
function onDataReady(): void {
  // 关键：数据就绪时必须重置滚动位置，否则 scrollTop 可能远超新数据的总高度
  scrollTop.value = 0
  if (containerRef.value) containerRef.value.scrollTop = 0

  if (useDynamicHeight.value) {
    initPositions()
    // 下一帧测量真实高度并设置观察
    nextTick((): void => {
      measureAndUpdate()
      setupResizeObserver()
    })
  }
}

// ========== 位置缓存管理（核心 - 防白屏关键） ==========

/** 初始化位置缓存，所有项使用预估高度 */
function initPositions(): void {
  const count: number = processedData.value.length
  positionsCache = new Array(count)
  for (let i = 0; i < count; i++) {
    positionsCache[i] = {
      index: i,
      top: i * ESTIMATED_HEIGHT,
      bottom: (i + 1) * ESTIMATED_HEIGHT,
      height: ESTIMATED_HEIGHT,
    }
  }
  lastObservedRange = { start: -1, end: -1 }
  positionVersion.value++
}

/**
 * 测量已渲染 DOM 的真实高度，更新位置缓存
 * 优化点：级联更新限制在 MAX_CASCADE_COUNT 范围内
 */
function measureAndUpdate(): void {
  if (!listRef.value || !useDynamicHeight.value) return

  const nodes: HTMLCollection = listRef.value.children
  if (!nodes || nodes.length === 0) return

  let hasChange: boolean = false
  const currentStart: number = startIndex.value

  for (let i = 0; i < nodes.length; i++) {
    const node: Element | undefined = nodes[i]
    if (!node) continue

    const realHeight: number = (node as HTMLElement).getBoundingClientRect().height
    if (realHeight === 0) continue // 隐藏元素跳过

    const dataIndex: number = currentStart + i
    const pos: PositionCacheItem | undefined = positionsCache[dataIndex]
    if (!pos) continue

    const diff: number = realHeight - pos.height
    if (Math.abs(diff) > HEIGHT_DIFF_THRESHOLD) {
      pos.height = realHeight
      pos.bottom = pos.top + realHeight
      hasChange = true

      // 限制级联更新范围，避免遍历全部 10 万项阻塞主线程
      const cascadeEnd: number = Math.min(dataIndex + 1 + MAX_CASCADE_COUNT, positionsCache.length)
      for (let j = dataIndex + 1; j < cascadeEnd; j++) {
        const cur: PositionCacheItem | undefined = positionsCache[j]
        const prev: PositionCacheItem | undefined = positionsCache[j - 1]
        if (!cur || !prev) break
        cur.top = prev.bottom
        cur.bottom = cur.top + cur.height
      }
    }
  }

  if (hasChange) {
    positionVersion.value++
    // 观察新进入可视区的元素
    observeVisibleElements()
  }
}

/**
 * 关键修复：每次可视范围变化时，重新观察当前可见 DOM 的高度变化
 * 之前只在初始化时观察一次，滚动过程中新进入的 DOM 不被观察 → 白屏
 */
function observeVisibleElements(): void {
  if (!listRef.value || !resizeObserver || !useDynamicHeight.value) return

  const currentStart: number = startIndex.value
  const currentEnd: number = endIndex.value

  // 如果范围没变，不重复观察
  if (currentStart === lastObservedRange.start && currentEnd === lastObservedRange.end) return

  // 断开旧观察，重新观察新 DOM
  resizeObserver.disconnect()
  const children: HTMLCollection = listRef.value.children
  for (let i = 0; i < children.length; i++) {
    const child: Element | undefined = children[i]
    if (child) resizeObserver.observe(child)
  }
  lastObservedRange = { start: currentStart, end: currentEnd }
}

function setupResizeObserver(): void {
  if (resizeObserver) resizeObserver.disconnect()
  if (!useDynamicHeight.value) return

  resizeObserver = new ResizeObserver((): void => {
    measureAndUpdate()
  })

  // 初始观察
  if (listRef.value) {
    const children: HTMLCollection = listRef.value.children
    for (let i = 0; i < children.length; i++) {
      const child: Element | undefined = children[i]
      if (child) resizeObserver.observe(child)
    }
  }
}

// ========== 二分查找（动态高度模式） ==========

/**
 * 二分查找：给定像素位置，找到包含该位置的列表项索引
 *
 * 关键修复：当 targetPx 超过所有项的 bottom（滚动到列表末尾时），
 * 之前的实现只走 `low = mid + 1` 而不更新 result，导致返回初始值 0。
 * 这使得 endIndex = 1 而 startIndex = 9990 → slice 返回空数组 → 白屏。
 */
function binarySearch(targetPx: number): number {
  const len: number = positionsCache.length
  if (len === 0) return 0

  // 边界保护：targetPx 在列表之前 → 第一项
  if (targetPx <= 0) return 0

  // 边界保护：targetPx 超过列表末尾 → 最后一项
  const lastPos: PositionCacheItem | undefined = positionsCache[len - 1]
  if (lastPos && targetPx >= lastPos.bottom) return len - 1

  let low: number = 0
  let high: number = len - 1
  let result: number = 0

  while (low <= high) {
    const mid: number = (low + high) >>> 1
    const midPos: PositionCacheItem | undefined = positionsCache[mid]
    if (!midPos) break

    if (midPos.bottom <= targetPx) {
      // targetPx 在 mid 之后，记录 mid 作为当前已知的最近项
      result = mid
      low = mid + 1
    } else if (midPos.top > targetPx) {
      // targetPx 在 mid 之前
      high = mid - 1
      result = mid
    } else {
      // targetPx 恰好在 mid 的范围内：top <= targetPx < bottom
      return mid
    }
  }
  return result
}

// ========== 虚拟列表核心计算 ==========

const dataCount: ComputedRef<number> = computed<number>(() => processedData.value.length)

/** 列表总高度（px） */
const totalHeight: ComputedRef<number> = computed<number>(() => {
  // 依赖 positionVersion 触发重新计算
  const _v: number = positionVersion.value
  if (useDynamicHeight.value && positionsCache.length > 0) {
    return positionsCache[positionsCache.length - 1]?.bottom ?? 0
  }
  return dataCount.value * ESTIMATED_HEIGHT
})

/**
 * 可视区域起始索引
 * 使用像素级缓冲区：上方额外 BUFFER_PX 像素
 */
const startIndex: ComputedRef<number> = computed<number>(() => {
  const _v: number = positionVersion.value
  const count: number = dataCount.value
  if (count === 0) return 0

  if (useDynamicHeight.value && positionsCache.length > 0) {
    const bufferStart: number = Math.max(0, scrollTop.value - BUFFER_PX)
    return Math.min(binarySearch(bufferStart), count - 1)
  }
  // 固定高度模式（或动态高度但缓存尚未初始化时的回退）
  const itemBuffer: number = Math.ceil(BUFFER_PX / ESTIMATED_HEIGHT)
  return Math.max(0, Math.min(Math.floor(scrollTop.value / ESTIMATED_HEIGHT) - itemBuffer, count - 1))
})

/**
 * 可视区域结束索引
 * 使用像素级缓冲区：下方额外 BUFFER_PX 像素
 */
const endIndex: ComputedRef<number> = computed<number>(() => {
  const _v: number = positionVersion.value
  const count: number = dataCount.value
  if (count === 0) return 0

  if (useDynamicHeight.value && positionsCache.length > 0) {
    const bufferEnd: number = scrollTop.value + CONTAINER_HEIGHT + BUFFER_PX
    const endIdx: number = binarySearch(bufferEnd)
    return Math.min(endIdx + 1, count)
  }
  // 固定高度模式（或缓存未初始化时的回退）
  const itemBuffer: number = Math.ceil(BUFFER_PX / ESTIMATED_HEIGHT)
  return Math.min(
    startIndex.value + Math.ceil(CONTAINER_HEIGHT / ESTIMATED_HEIGHT) + itemBuffer * 2,
    count
  )
})

const visibleItems: ComputedRef<OptimizedDataItem[]> = computed<OptimizedDataItem[]>(() =>
  processedData.value.slice(startIndex.value, endIndex.value)
)

/** 可见区域的 Y 轴偏移量（px） */
const offsetY: ComputedRef<number> = computed<number>(() => {
  const _v: number = positionVersion.value
  if (useDynamicHeight.value && positionsCache.length > 0 && startIndex.value < positionsCache.length) {
    return positionsCache[startIndex.value]?.top ?? 0
  }
  return startIndex.value * ESTIMATED_HEIGHT
})

// ========== 性能统计 ==========
const renderedCount: ComputedRef<number> = computed<number>(() => visibleItems.value.length)

const scrollPercent: ComputedRef<number> = computed<number>(() => {
  const maxScroll: number = totalHeight.value - CONTAINER_HEIGHT
  return maxScroll > 0 ? Math.round((scrollTop.value / maxScroll) * 100) : 0
})

const savedEvents: ComputedRef<number> = computed<number>(() =>
  scrollEventCount.value - actualUpdateCount.value
)

// ========== 优化 1: rAF 节流 ==========

function onScroll(e: Event): void {
  const target = e.target as HTMLElement
  const newScrollTop: number = target.scrollTop
  scrollEventCount.value++

  if (useRAF.value) {
    pendingScrollTop = newScrollTop
    if (rafId === null) {
      rafId = requestAnimationFrame((): void => {
        if (pendingScrollTop !== null) {
          scrollTop.value = pendingScrollTop
          actualUpdateCount.value++
          pendingScrollTop = null
        }
        rafId = null
      })
    }
  } else {
    scrollTop.value = newScrollTop
    actualUpdateCount.value++
  }
}

/**
 * 关键修复：监听 startIndex / endIndex 变化，在 DOM 更新后测量 + 重新观察
 * 这是防止白屏的核心 — 确保每次可视范围变化都能及时测量新 DOM
 */
watch([startIndex, endIndex], (): void => {
  if (!useDynamicHeight.value) return
  nextTick((): void => {
    measureAndUpdate()
    observeVisibleElements()
  })
})

// ========== 优化 2: IntersectionObserver 哨兵 ==========
let topObserver: IntersectionObserver | null = null
let bottomObserver: IntersectionObserver | null = null

function setupIntersectionObservers(): void {
  if (!containerRef.value) return

  const options: IntersectionObserverInit = {
    root: containerRef.value,
    threshold: 0,
  }

  topObserver = new IntersectionObserver((entries: IntersectionObserverEntry[]): void => {
    entries.forEach((entry: IntersectionObserverEntry): void => {
      if (entry.isIntersecting && containerRef.value) {
        scrollTop.value = containerRef.value.scrollTop
      }
    })
  }, options)

  bottomObserver = new IntersectionObserver((entries: IntersectionObserverEntry[]): void => {
    entries.forEach((entry: IntersectionObserverEntry): void => {
      if (entry.isIntersecting && containerRef.value) {
        scrollTop.value = containerRef.value.scrollTop
      }
    })
  }, options)
}

watch([sentinelTopRef, sentinelBottomRef], (): void => {
  if (!useIOSentinel.value) return
  if (sentinelTopRef.value && topObserver) topObserver.observe(sentinelTopRef.value)
  if (sentinelBottomRef.value && bottomObserver) bottomObserver.observe(sentinelBottomRef.value)
})

// ========== 监听数据量/过滤/排序变化 ==========

watch(totalItems, (count: DataCountOption): void => {
  scrollTop.value = 0
  if (containerRef.value) containerRef.value.scrollTop = 0
  isProcessing.value = true
  if (worker) {
    postWorkerMessage({ type: 'generate', payload: { count } })
  } else {
    generateDataOnMainThread()
  }
})

watch([filterKeyword, activeCategory], (): void => {
  if (filterDebounceTimer) clearTimeout(filterDebounceTimer)
  filterDebounceTimer = setTimeout((): void => { applyFilterSort() }, FILTER_DEBOUNCE_MS)
})

watch([sortBy, sortOrder], (): void => { applyFilterSort() })

watch(useDynamicHeight, (enabled: boolean): void => {
  if (enabled) {
    onDataReady()
    nextTick((): void => { setupResizeObserver() })
  } else {
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
    positionsCache = []
    positionVersion.value++
  }
})

function applyFilterSort(): void {
  isProcessing.value = true
  scrollTop.value = 0
  if (containerRef.value) containerRef.value.scrollTop = 0

  if (worker) {
    postWorkerMessage({
      type: 'filter',
      payload: { data: rawData.value, keyword: filterKeyword.value, category: activeCategory.value },
    })
  } else {
    let result: OptimizedDataItem[] = rawData.value
    if (filterKeyword.value) {
      const kw: string = filterKeyword.value.toLowerCase()
      result = result.filter((item: OptimizedDataItem): boolean =>
        item.text.toLowerCase().includes(kw) || item.id.toString().includes(kw)
      )
    }
    if (activeCategory.value !== 'all') {
      result = result.filter((item: OptimizedDataItem): boolean => item.category === activeCategory.value)
    }
    processedData.value = result
    isProcessing.value = false
    onDataReady()
  }
}

// ========== 工具函数 ==========
function resetStats(): void {
  scrollEventCount.value = 0
  actualUpdateCount.value = 0
}

function getCategoryLabel(cat: CategoryFilter): string {
  return cat === 'all' ? '全部' : cat
}

// ========== 生命周期 ==========
onMounted((): void => {
  isMounted.value = true
  initWorker()
  nextTick((): void => {
    setupIntersectionObservers()
    setupResizeObserver()
  })
})

onBeforeUnmount((): void => {
  if (worker) { worker.terminate(); worker = null }
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  if (topObserver) { topObserver.disconnect(); topObserver = null }
  if (bottomObserver) { bottomObserver.disconnect(); bottomObserver = null }
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
  if (filterDebounceTimer) { clearTimeout(filterDebounceTimer) }
})
</script>

<template>
  <div class="vl-optimized my-6 rounded-xl border border-[var(--border-color)] overflow-hidden" style="background: var(--bg-card)">
    <!-- 标题栏 -->
    <div class="px-5 py-3 border-b border-[var(--border-color)]" style="background: var(--bg-soft)">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-base">⚡</span>
        <h3 class="text-sm font-bold text-[var(--text-primary)] m-0">最终版虚拟列表</h3>
        <span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          最终版
        </span>
      </div>
      <p class="text-[11px] text-[var(--text-muted)] m-0 leading-relaxed">
        动态高度 + rAF 节流 · IntersectionObserver 哨兵 · Web Worker 计算 · CSS contain 隔离
      </p>
    </div>

    <!-- 优化开关面板 -->
    <div class="px-5 py-3 border-b border-[var(--border-color)] flex flex-wrap gap-4" style="background: var(--bg-soft)">
      <label class="vl-optimized__toggle flex items-center gap-1.5 text-[11px] cursor-pointer select-none" :class="{ 'vl-optimized__toggle--active': useDynamicHeight }">
        <input type="checkbox" v-model="useDynamicHeight" class="sr-only">
        <span class="vl-optimized__toggle-dot" />
        <span>动态高度</span>
      </label>
      <label class="vl-optimized__toggle flex items-center gap-1.5 text-[11px] cursor-pointer select-none" :class="{ 'vl-optimized__toggle--active': useRAF }">
        <input type="checkbox" v-model="useRAF" class="sr-only">
        <span class="vl-optimized__toggle-dot" />
        <span>rAF 节流</span>
      </label>
      <label class="vl-optimized__toggle flex items-center gap-1.5 text-[11px] cursor-pointer select-none" :class="{ 'vl-optimized__toggle--active': useContain }">
        <input type="checkbox" v-model="useContain" class="sr-only">
        <span class="vl-optimized__toggle-dot" />
        <span>CSS contain</span>
      </label>
      <label class="vl-optimized__toggle flex items-center gap-1.5 text-[11px] cursor-pointer select-none" :class="{ 'vl-optimized__toggle--active': useIOSentinel }">
        <input type="checkbox" v-model="useIOSentinel" class="sr-only">
        <span class="vl-optimized__toggle-dot" />
        <span>IO 哨兵</span>
      </label>
      <button
        @click="resetStats"
        class="ml-auto text-[10px] px-2 py-0.5 rounded border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        style="background: var(--bg-card)"
      >
        重置统计
      </button>
    </div>

    <!-- 控制面板 -->
    <div class="px-5 py-3 border-b border-[var(--border-color)] space-y-3" style="background: var(--bg-soft)">
      <div class="flex flex-wrap items-center justify-between gap-4">
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
            数据 <strong class="text-[var(--text-primary)]">{{ dataCount.toLocaleString() }}</strong>
          </span>
          <span class="text-[var(--text-muted)]">
            DOM <strong class="text-[var(--color-primary)]">{{ renderedCount }}</strong>
          </span>
          <span class="text-[var(--text-muted)]">
            {{ scrollPercent }}%
          </span>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-1.5">
          <span class="text-xs">🔍</span>
          <input
            v-model="filterKeyword"
            type="text"
            placeholder="搜索..."
            class="px-2 py-1 text-xs rounded-md border border-[var(--border-color)] w-28"
            style="background: var(--bg-card); color: var(--text-primary)"
          >
        </div>

        <div class="flex items-center gap-1">
          <button
            v-for="cat in CATEGORY_FILTERS"
            :key="cat"
            @click="activeCategory = cat"
            class="px-2 py-0.5 text-[10px] rounded-full border transition-all"
            :class="activeCategory === cat
              ? 'border-[var(--color-primary)] text-[var(--color-primary)] font-semibold'
              : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'"
            :style="activeCategory === cat ? 'background: var(--color-primary-alpha)' : 'background: transparent'"
          >
            {{ getCategoryLabel(cat) }}
          </button>
        </div>

        <div class="flex items-center gap-1.5 ml-auto">
          <select
            v-model="sortBy"
            class="px-2 py-0.5 text-[10px] rounded border border-[var(--border-color)]"
            style="background: var(--bg-card); color: var(--text-primary)"
          >
            <option value="id">按 ID</option>
            <option value="value">按数值</option>
            <option value="text">按文本</option>
            <option value="category">按分类</option>
          </select>
          <button
            @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
            class="px-1.5 py-0.5 text-xs rounded border border-[var(--border-color)] hover:bg-[var(--bg-card-hover)] transition-colors"
            style="background: var(--bg-card); color: var(--text-primary)"
          >
            {{ sortOrder === 'asc' ? '↑' : '↓' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 加载状态（SSR 服务端渲染 或 Worker 处理中） -->
    <div v-if="!isMounted || isProcessing" class="px-5 py-8 text-center text-sm text-[var(--text-muted)]">
      <div class="vl-optimized__spinner mx-auto mb-2" />
      {{ !isMounted ? '初始化中...' : 'Worker 正在处理数据...' }}
    </div>

    <!-- 虚拟列表容器 -->
    <div
      v-else
      ref="containerRef"
      class="vl-optimized__container overflow-y-auto relative"
      :style="{ height: CONTAINER_HEIGHT + 'px' }"
      @scroll="onScroll"
    >
      <div :style="{ height: totalHeight + 'px', position: 'relative' }">
        <!-- 顶部哨兵 -->
        <div
          v-if="useIOSentinel"
          ref="sentinelTopRef"
          class="absolute w-full"
          :style="{ top: offsetY + 'px', height: '1px', pointerEvents: 'none' }"
        />

        <!-- 可见区域（will-change 提示 GPU 加速） -->
        <div
          ref="listRef"
          class="vl-optimized__visible-area"
          :style="{ transform: `translateY(${offsetY}px)` }"
        >
          <div
            v-for="item in visibleItems"
            :key="item.id"
            class="vl-optimized__item px-4 border-b border-[var(--border-color)] transition-colors hover:bg-[var(--bg-card-hover)]"
            :class="{
              'vl-optimized__item--contained': useContain,
              'vl-optimized__item--dynamic': useDynamicHeight,
              'vl-optimized__item--fixed': !useDynamicHeight,
            }"
            :style="!useDynamicHeight ? { height: ESTIMATED_HEIGHT + 'px' } : undefined"
          >
            <div class="flex items-center gap-3" :class="{ 'py-2.5': useDynamicHeight }">
              <span
                class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                :style="{ background: item.color, color: '#333' }"
              >
                {{ item.id }}
              </span>
              <span
                class="text-[var(--text-secondary)] text-[13px] flex-1"
                :class="{ 'truncate': !useDynamicHeight, 'leading-relaxed': useDynamicHeight }"
              >
                {{ item.text }}
              </span>
              <span class="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--border-color)] text-[var(--text-muted)] flex-shrink-0">
                {{ item.category }}
              </span>
              <span class="text-[11px] text-[var(--text-muted)] font-mono w-12 text-right flex-shrink-0">
                {{ item.value }}
              </span>
            </div>
          </div>
        </div>

        <!-- 底部哨兵 -->
        <div
          v-if="useIOSentinel"
          ref="sentinelBottomRef"
          class="absolute w-full"
          :style="{
            top: useDynamicHeight
              ? undefined
              : (offsetY + visibleItems.length * ESTIMATED_HEIGHT) + 'px',
            height: '1px',
            pointerEvents: 'none'
          }"
        />
      </div>
    </div>

    <!-- 底部性能面板 -->
    <div class="px-5 py-2.5 border-t border-[var(--border-color)] flex flex-wrap items-center gap-x-5 gap-y-1" style="background: var(--bg-soft)">
      <span class="text-[11px] text-[var(--text-muted)]">
        📊 scroll 事件: <strong class="font-mono text-[var(--text-primary)]">{{ scrollEventCount }}</strong>
      </span>
      <span class="text-[11px] text-[var(--text-muted)]">
        ✅ 实际更新: <strong class="font-mono text-[var(--color-primary)]">{{ actualUpdateCount }}</strong>
      </span>
      <span v-if="useRAF && savedEvents > 0" class="text-[11px] text-emerald-600 dark:text-emerald-400">
        🚀 节省 <strong class="font-mono">{{ savedEvents }}</strong> 次更新
      </span>
      <span v-if="workerElapsed > 0" class="text-[11px] text-[var(--text-muted)]">
        ⚙️ Worker: <strong class="font-mono text-[var(--text-primary)]">{{ workerElapsed.toFixed(1) }}ms</strong>
      </span>
      <span v-if="useDynamicHeight" class="text-[11px] text-amber-600 dark:text-amber-400">
        📐 动态高度 · 预估 {{ ESTIMATED_HEIGHT }}px · 缓冲 {{ BUFFER_PX }}px
      </span>
    </div>
  </div>
</template>

<style scoped>
/* ========== 容器优化 ========== */
.vl-optimized__container {
  /* 告诉浏览器此区域会滚动，提前分配合成层 */
  will-change: scroll-position;
}

/* ========== 可见区域 GPU 加速 ========== */
.vl-optimized__visible-area {
  will-change: transform;
}

/* ========== 列表项样式 ========== */
.vl-optimized__item--fixed {
  display: flex;
  align-items: center;
}

.vl-optimized__item--dynamic {
  min-height: 40px;
}

/* ========== CSS contain 优化 ========== */
.vl-optimized__item--contained {
  contain: layout style paint;
  content-visibility: auto;
}

.vl-optimized__item--contained.vl-optimized__item--fixed {
  contain-intrinsic-size: auto 50px;
}

/* ========== 开关样式 ========== */
.vl-optimized__toggle {
  color: var(--text-muted);
  transition: color 0.2s;
}

.vl-optimized__toggle--active {
  color: var(--color-primary, #10b981);
}

.vl-optimized__toggle-dot {
  display: inline-block;
  width: 28px;
  height: 16px;
  border-radius: 8px;
  background: var(--border-color);
  position: relative;
  transition: background 0.25s;
}

.vl-optimized__toggle-dot::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: white;
  transition: transform 0.25s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.vl-optimized__toggle--active .vl-optimized__toggle-dot {
  background: var(--color-primary, #10b981);
}

.vl-optimized__toggle--active .vl-optimized__toggle-dot::after {
  transform: translateX(12px);
}

/* ========== 加载动画 ========== */
.vl-optimized__spinner {
  width: 24px;
  height: 24px;
  border: 2.5px solid var(--border-color);
  border-top-color: var(--color-primary, #10b981);
  border-radius: 50%;
  animation: vl-spin 0.7s linear infinite;
}

@keyframes vl-spin {
  to { transform: rotate(360deg); }
}
</style>
