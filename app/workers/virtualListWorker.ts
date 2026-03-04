/**
 * 虚拟列表 Web Worker
 * 将大数据的排序、过滤等计算密集型操作移至后台线程
 * 避免阻塞主线程，防止滚动卡顿和白屏
 *
 * 由 VirtualListOptimized.vue 通过 Vite 的 Worker 导入加载：
 * new Worker(new URL('~/workers/virtualListWorker.ts', import.meta.url), { type: 'module' })
 */

// ========== 类型定义（Worker 环境无法 import，需本地声明） ==========

/** 分类类型 */
type CategoryType = '性能' | '架构' | '渲染' | '优化' | '数据' | '交互'

/** 分类过滤（含 'all'） */
type CategoryFilter = 'all' | CategoryType

/** 可排序字段 */
type SortField = 'id' | 'value' | 'text' | 'category'

/** 排序方向 */
type SortOrder = 'asc' | 'desc'

/** 数据项结构 */
interface DataItem {
  readonly id: number
  readonly text: string
  readonly category: CategoryType
  readonly value: number
  readonly color: string
}

// ----- Worker 请求消息 -----

interface GeneratePayload {
  count: number
}

interface FilterPayload {
  data: readonly DataItem[]
  keyword: string
  category: CategoryFilter
}

interface SortPayload {
  data: readonly DataItem[]
  sortBy: SortField
  sortOrder: SortOrder
}

type WorkerRequestType = 'generate' | 'filter' | 'sort'

interface WorkerMessageBase<T extends WorkerRequestType, P> {
  type: T
  payload: P
}

type WorkerMessage =
  | WorkerMessageBase<'generate', GeneratePayload>
  | WorkerMessageBase<'filter', FilterPayload>
  | WorkerMessageBase<'sort', SortPayload>

// ----- Worker 响应消息 -----

type WorkerResponseType = 'generated' | 'filtered' | 'sorted'

interface WorkerResponseBase<T extends WorkerResponseType> {
  type: T
  data: DataItem[]
  elapsed: number
}

type WorkerResponseMessage =
  | WorkerResponseBase<'generated'>
  | WorkerResponseBase<'filtered'>
  | WorkerResponseBase<'sorted'>

// ========== 常量 ==========

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
  'IntersectionObserver 优化',
  'requestAnimationFrame 节流',
  'Web Worker 后台计算',
  'CSS contain 渲染隔离',
] as const

/** 分类列表 */
const CATEGORIES: readonly CategoryType[] = ['性能', '架构', '渲染', '优化', '数据', '交互'] as const

// ========== 核心函数 ==========

/**
 * 生成模拟数据
 * @param count - 数据条数
 * @returns 生成的数据数组
 */
function generateData(count: number): DataItem[] {
  const data: DataItem[] = []
  for (let i = 0; i < count; i++) {
    const textIndex: number = i % SAMPLE_TEXTS.length
    const catIndex: number = i % CATEGORIES.length
    data.push({
      id: i + 1,
      text: `第 ${i + 1} 项 — ${SAMPLE_TEXTS[textIndex] ?? '虚拟列表演示'}`,
      category: CATEGORIES[catIndex] ?? '性能',
      value: Math.floor(Math.random() * 10000),
      color: `hsl(${(i * 37) % 360}, 70%, 85%)`,
    })
  }
  return data
}

/**
 * 过滤数据
 * @param data - 原始数据
 * @param keyword - 搜索关键词（支持按 text 和 id 搜索）
 * @param category - 分类过滤（'all' 表示不过滤）
 * @returns 过滤后的数据
 */
function filterData(
  data: readonly DataItem[],
  keyword: string,
  category: CategoryFilter,
): DataItem[] {
  let result: readonly DataItem[] = data

  if (keyword) {
    const lowerKeyword: string = keyword.toLowerCase()
    result = result.filter((item: DataItem): boolean =>
      item.text.toLowerCase().includes(lowerKeyword) ||
      item.id.toString().includes(lowerKeyword)
    )
  }

  if (category && category !== 'all') {
    result = result.filter((item: DataItem): boolean => item.category === category)
  }

  // 返回新数组，避免 readonly 约束传播
  return [...result]
}

/**
 * 排序数据
 * @param data - 待排序数据
 * @param sortBy - 排序字段
 * @param sortOrder - 排序方向
 * @returns 排序后的新数组
 */
function sortData(
  data: readonly DataItem[],
  sortBy: SortField,
  sortOrder: SortOrder,
): DataItem[] {
  const sorted: DataItem[] = [...data]

  sorted.sort((a: DataItem, b: DataItem): number => {
    let compareValue: number = 0

    switch (sortBy) {
      case 'id':
        compareValue = a.id - b.id
        break
      case 'value':
        compareValue = a.value - b.value
        break
      case 'text':
        compareValue = a.text.localeCompare(b.text)
        break
      case 'category':
        compareValue = a.category.localeCompare(b.category)
        break
      default: {
        // 利用 never 类型确保穷尽检查
        const _exhaustiveCheck: never = sortBy
        compareValue = 0
      }
    }

    return sortOrder === 'desc' ? -compareValue : compareValue
  })

  return sorted
}

/**
 * 构建 Worker 响应消息
 * @param type - 响应类型
 * @param data - 数据
 * @param startTime - 计算起始时间（用于计算耗时）
 */
function postResponse<T extends WorkerResponseType>(
  type: T,
  data: DataItem[],
  startTime: number,
): void {
  const response: WorkerResponseBase<T> = {
    type,
    data,
    elapsed: performance.now() - startTime,
  }
  self.postMessage(response)
}

// ========== 消息监听 ==========
self.addEventListener('message', (e: MessageEvent<WorkerMessage>): void => {
  const { type, payload } = e.data
  const startTime: number = performance.now()

  switch (type) {
    case 'generate': {
      const data: DataItem[] = generateData(payload.count)
      postResponse('generated', data, startTime)
      break
    }

    case 'filter': {
      const filtered: DataItem[] = filterData(payload.data, payload.keyword, payload.category)
      postResponse('filtered', filtered, startTime)
      break
    }

    case 'sort': {
      const sorted: DataItem[] = sortData(payload.data, payload.sortBy, payload.sortOrder)
      postResponse('sorted', sorted, startTime)
      break
    }

    default: {
      // 穷尽检查：确保所有消息类型都已处理
      const _exhaustiveCheck: never = type
      console.error(`未知的 Worker 消息类型: ${_exhaustiveCheck}`)
    }
  }
})
