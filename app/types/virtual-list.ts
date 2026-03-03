/**
 * 虚拟列表相关的共享类型定义
 * 所有虚拟列表组件和 Worker 共用的类型，保证类型一致性
 */

// ========== 基础数据类型 ==========

/** 基础版虚拟列表的数据项 */
export interface VirtualListItem {
  /** 唯一标识 */
  readonly id: number
  /** 展示文本 */
  readonly text: string
  /** HSL 背景色 */
  readonly color: string
}

/** 动态高度版的数据项 */
export interface DynamicHeightItem {
  /** 唯一标识 */
  readonly id: number
  /** 主文本内容 */
  readonly text: string
  /** 附加说明（可为空字符串） */
  readonly extra: string
  /** HSL 背景色 */
  readonly color: string
  /** HSL 强调色（用于文字） */
  readonly accent: string
}

/** 优化版虚拟列表的数据项 */
export interface OptimizedDataItem {
  /** 唯一标识 */
  readonly id: number
  /** 展示文本 */
  readonly text: string
  /** 分类标签 */
  readonly category: CategoryType
  /** 数值（用于排序） */
  readonly value: number
  /** HSL 背景色 */
  readonly color: string
}

// ========== 动态高度虚拟列表相关 ==========

/** 位置缓存项 - 记录每个列表项的空间信息 */
export interface PositionCacheItem {
  /** 数据索引 */
  index: number
  /** 元素顶部偏移（px） */
  top: number
  /** 元素底部偏移（px） */
  bottom: number
  /** 元素高度（px），初始为预估高度，渲染后更新为真实高度 */
  height: number
}

// ========== 虚拟列表配置 ==========

/** 虚拟列表配置项 */
export interface VirtualListConfig {
  /** 每项高度（固定高度版），单位 px */
  readonly itemHeight: number
  /** 容器可视高度，单位 px */
  readonly containerHeight: number
  /** 上下缓冲区大小（行数） */
  readonly buffer: number
}

/** 动态高度虚拟列表的额外配置 */
export interface DynamicHeightConfig extends VirtualListConfig {
  /** 预估行高（px），实际高度由 ResizeObserver 校准 */
  readonly estimatedHeight: number
}

// ========== Web Worker 通信类型 ==========

/** 分类枚举类型 */
export type CategoryType = '性能' | '架构' | '渲染' | '优化' | '数据' | '交互'

/** 所有分类（包含 'all' 选项） */
export type CategoryFilter = 'all' | CategoryType

/** 分类列表常量 */
export const CATEGORIES: readonly CategoryType[] = ['性能', '架构', '渲染', '优化', '数据', '交互'] as const

/** 分类过滤列表常量（包含 'all'） */
export const CATEGORY_FILTERS: readonly CategoryFilter[] = ['all', ...CATEGORIES] as const

/** 可排序字段 */
export type SortField = 'id' | 'value' | 'text' | 'category'

/** 排序方向 */
export type SortOrder = 'asc' | 'desc'

/** 数据量选项 */
export type DataCountOption = 1000 | 10000 | 50000 | 100000

/** 数据量选项列表 */
export const DATA_COUNT_OPTIONS: readonly DataCountOption[] = [1000, 10000, 50000, 100000] as const

// ----- Worker 请求消息 -----

/** 生成数据请求 */
export interface WorkerGenerateRequest {
  type: 'generate'
  payload: {
    count: number
  }
}

/** 过滤数据请求 */
export interface WorkerFilterRequest {
  type: 'filter'
  payload: {
    data: readonly OptimizedDataItem[]
    keyword: string
    category: CategoryFilter
  }
}

/** 排序数据请求 */
export interface WorkerSortRequest {
  type: 'sort'
  payload: {
    data: readonly OptimizedDataItem[]
    sortBy: SortField
    sortOrder: SortOrder
  }
}

/** Worker 请求消息联合类型 */
export type WorkerRequest = WorkerGenerateRequest | WorkerFilterRequest | WorkerSortRequest

// ----- Worker 响应消息 -----

/** 生成数据响应 */
export interface WorkerGeneratedResponse {
  type: 'generated'
  data: OptimizedDataItem[]
  elapsed: number
}

/** 过滤数据响应 */
export interface WorkerFilteredResponse {
  type: 'filtered'
  data: OptimizedDataItem[]
  elapsed: number
}

/** 排序数据响应 */
export interface WorkerSortedResponse {
  type: 'sorted'
  data: OptimizedDataItem[]
  elapsed: number
}

/** Worker 响应消息联合类型 */
export type WorkerResponse = WorkerGeneratedResponse | WorkerFilteredResponse | WorkerSortedResponse

// ========== 性能统计类型 ==========

/** 滚动性能统计 */
export interface ScrollPerformanceStats {
  /** 滚动事件触发总数 */
  scrollEventCount: number
  /** 实际更新次数（rAF 合并后） */
  actualUpdateCount: number
  /** Worker 计算耗时（ms） */
  workerElapsed: number
}

// ========== 优化开关 ==========

/** 白屏优化开关配置 */
export interface OptimizationToggles {
  /** 是否启用 requestAnimationFrame 节流 */
  useRAF: boolean
  /** 是否启用 CSS contain 渲染隔离 */
  useContain: boolean
  /** 是否启用 IntersectionObserver 哨兵 */
  useIOSentinel: boolean
}
