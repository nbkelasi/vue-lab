<!--
  CollabBroadcast - BroadcastChannel 多标签页实时协作 Demo
  通过 MDC 语法 ::CollabBroadcast 在 Markdown 中使用
  
  功能：
  1. 多标签页之间实时同步光标位置
  2. 可拖拽的共享方块，位置/颜色实时同步
  3. 共享文本输入框
-->
<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, nextTick } from 'vue'

// ========== 类型定义 ==========
interface CursorInfo {
  x: number
  y: number
  userId: string
  color: string
  name: string
  lastUpdate: number
}

interface Block {
  id: number
  x: number
  y: number
  color: string
}

interface SyncMessage {
  type: 'cursor' | 'blocks' | 'text' | 'join' | 'leave'
  userId: string
  payload: any
}

// ========== 常量 ==========
/** 调色板：给每个标签页分配不同颜色 */
const COLORS = [
  '#f43f5e', '#8b5cf6', '#3b82f6', '#06b6d4',
  '#10b981', '#f59e0b', '#ec4899', '#6366f1',
] as const

const NAMES = [
  '用户 A', '用户 B', '用户 C', '用户 D',
  '用户 E', '用户 F', '用户 G', '用户 H',
] as const

/** 光标超时：超过此时间未更新则认为离开 */
const CURSOR_TIMEOUT = 3000

// ========== 状态 ==========
/** 当前用户身份 */
const userId = ref(`tab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)
const userIndex = ref(0)
const userColor = ref(COLORS[0])
const userName = ref(NAMES[0])

/** 画布引用 */
const canvasRef = ref<HTMLElement | null>(null)

/** 远端用户光标 */
const remoteCursors = reactive<Map<string, CursorInfo>>(new Map())

/** 共享方块 */
const blocks = reactive<Block[]>([
  { id: 1, x: 60, y: 60, color: '#f43f5e' },
  { id: 2, x: 200, y: 100, color: '#3b82f6' },
  { id: 3, x: 140, y: 200, color: '#10b981' },
])

/** 共享文本 */
const sharedText = ref('在这里输入文字，另一个标签页会实时同步...')

/** 拖拽状态 */
const dragging = ref<{ blockId: number; offsetX: number; offsetY: number } | null>(null)

/** 连接状态 */
const isConnected = ref(false)
const peerCount = ref(0)

/** BroadcastChannel 实例 */
let channel: BroadcastChannel | null = null

/** 清理远端光标的定时器 */
let cleanupTimer: ReturnType<typeof setInterval> | null = null

/** rAF ID */
let rafId: number | null = null
let pendingCursor: { x: number; y: number } | null = null

// ========== BroadcastChannel 通信 ==========
/** 初始化频道 */
function initChannel() {
  try {
    channel = new BroadcastChannel('vue-lab-collab')
    isConnected.value = true

    channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      const msg = event.data
      if (msg.userId === userId.value) return // 忽略自己的消息

      switch (msg.type) {
        case 'cursor':
          handleRemoteCursor(msg)
          break
        case 'blocks':
          handleRemoteBlocks(msg.payload)
          break
        case 'text':
          handleRemoteText(msg.payload)
          break
        case 'join':
          handlePeerJoin(msg)
          break
        case 'leave':
          handlePeerLeave(msg.userId)
          break
      }
    }

    // 广播自己上线
    broadcast({ type: 'join', userId: userId.value, payload: { color: userColor.value, name: userName.value } })
  } catch (e) {
    console.warn('BroadcastChannel 不可用:', e)
    isConnected.value = false
  }
}

/** 发送消息 */
function broadcast(msg: SyncMessage) {
  channel?.postMessage(msg)
}

/** 处理远端光标 */
function handleRemoteCursor(msg: SyncMessage) {
  const cursor: CursorInfo = {
    x: msg.payload.x,
    y: msg.payload.y,
    userId: msg.userId,
    color: msg.payload.color || '#8b5cf6',
    name: msg.payload.name || '匿名',
    lastUpdate: Date.now(),
  }
  remoteCursors.set(msg.userId, cursor)
  peerCount.value = remoteCursors.size
}

/** 处理远端方块更新 */
function handleRemoteBlocks(payload: Block[]) {
  payload.forEach((remote) => {
    const local = blocks.find((b) => b.id === remote.id)
    if (local) {
      local.x = remote.x
      local.y = remote.y
      local.color = remote.color
    }
  })
}

/** 处理远端文本 */
function handleRemoteText(payload: { text: string }) {
  sharedText.value = payload.text
}

/** 处理新标签页加入 */
function handlePeerJoin(msg: SyncMessage) {
  remoteCursors.set(msg.userId, {
    x: 0, y: 0,
    userId: msg.userId,
    color: msg.payload.color,
    name: msg.payload.name,
    lastUpdate: Date.now(),
  })
  peerCount.value = remoteCursors.size
  // 回复当前状态给新加入者（必须转为纯对象，reactive 代理无法被 structured clone）
  broadcast({
    type: 'blocks',
    userId: userId.value,
    payload: blocks.map(b => ({ id: b.id, x: b.x, y: b.y, color: b.color })),
  })
  broadcast({
    type: 'text',
    userId: userId.value,
    payload: { text: sharedText.value },
  })
}

/** 处理标签页离开 */
function handlePeerLeave(id: string) {
  remoteCursors.delete(id)
  peerCount.value = remoteCursors.size
}

// ========== 本地交互 ==========
/** 鼠标在画布上移动 —— 用 rAF 节流 */
function onCanvasMouseMove(e: MouseEvent) {
  if (!canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  pendingCursor = { x, y }

  // 处理拖拽
  if (dragging.value) {
    const block = blocks.find((b) => b.id === dragging.value!.blockId)
    if (block) {
      block.x = Math.max(0, Math.min(x - dragging.value.offsetX, rect.width - 56))
      block.y = Math.max(0, Math.min(y - dragging.value.offsetY, rect.height - 56))
    }
  }

  if (rafId === null) {
    rafId = requestAnimationFrame(() => {
      if (pendingCursor) {
        broadcast({
          type: 'cursor',
          userId: userId.value,
          payload: { ...pendingCursor, color: userColor.value, name: userName.value },
        })
      }
      if (dragging.value) {
        broadcast({
          type: 'blocks',
          userId: userId.value,
          payload: blocks.map(b => ({ id: b.id, x: b.x, y: b.y, color: b.color })),
        })
      }
      rafId = null
    })
  }
}

/** 开始拖拽方块 */
function onBlockMouseDown(e: MouseEvent, block: Block) {
  e.preventDefault()
  if (!canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  dragging.value = {
    blockId: block.id,
    offsetX: (e.clientX - rect.left) - block.x,
    offsetY: (e.clientY - rect.top) - block.y,
  }
}

/** 结束拖拽 */
function onCanvasMouseUp() {
  if (dragging.value) {
    broadcast({
      type: 'blocks',
      userId: userId.value,
      payload: blocks.map(b => ({ id: b.id, x: b.x, y: b.y, color: b.color })),
    })
    dragging.value = null
  }
}

/** 文本输入 */
function onTextInput() {
  broadcast({
    type: 'text',
    userId: userId.value,
    payload: { text: sharedText.value },
  })
}

/** 随机改变方块颜色 */
function randomizeBlockColor(block: Block) {
  const hue = Math.floor(Math.random() * 360)
  block.color = `hsl(${hue}, 70%, 60%)`
  broadcast({
    type: 'blocks',
    userId: userId.value,
    payload: blocks.map(b => ({ id: b.id, x: b.x, y: b.y, color: b.color })),
  })
}

/** 清理超时的远端光标 */
function cleanupStaleCursors() {
  const now = Date.now()
  for (const [id, cursor] of remoteCursors) {
    if (now - cursor.lastUpdate > CURSOR_TIMEOUT) {
      remoteCursors.delete(id)
    }
  }
  peerCount.value = remoteCursors.size
}

// ========== 生命周期 ==========
onMounted(() => {
  // 随机分配身份
  userIndex.value = Math.floor(Math.random() * COLORS.length)
  userColor.value = COLORS[userIndex.value]
  userName.value = NAMES[userIndex.value]

  initChannel()
  cleanupTimer = setInterval(cleanupStaleCursors, 1000)
})

onBeforeUnmount(() => {
  // 广播离开
  broadcast({ type: 'leave', userId: userId.value, payload: null })
  channel?.close()
  if (cleanupTimer) clearInterval(cleanupTimer)
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
  <div class="my-6 rounded-xl border border-[var(--border-color)] overflow-hidden" style="background: var(--bg-card)">
    <!-- 顶部状态栏 -->
    <div
      class="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-[var(--border-color)]"
      style="background: var(--bg-soft)"
    >
      <div class="flex items-center gap-3">
        <!-- 连接状态指示器 -->
        <div class="flex items-center gap-2">
          <span
            class="w-2.5 h-2.5 rounded-full inline-block animate-pulse"
            :style="{ background: isConnected ? '#10b981' : '#ef4444' }"
          />
          <span class="text-xs font-semibold" :style="{ color: userColor }">
            {{ userName }}
          </span>
        </div>

        <!-- 在线标签页计数 -->
        <div
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
          style="background: var(--color-primary-soft); color: var(--color-primary)"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          {{ peerCount + 1 }} 个标签页在线
        </div>
      </div>

      <div class="text-[11px] text-[var(--text-muted)] font-mono">
        BroadcastChannel API · 零依赖
      </div>
    </div>

    <!-- 协作画布 -->
    <div
      ref="canvasRef"
      class="relative overflow-hidden select-none"
      style="height: 360px; background: var(--bg-base)"
      @mousemove="onCanvasMouseMove"
      @mouseup="onCanvasMouseUp"
      @mouseleave="onCanvasMouseUp"
    >
      <!-- 网格背景 -->
      <svg class="absolute inset-0 w-full h-full pointer-events-none opacity-[0.06]">
        <defs>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" stroke-width="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      <!-- 画布提示 -->
      <div
        v-if="peerCount === 0"
        class="absolute inset-0 flex items-center justify-center pointer-events-none z-0"
      >
        <div class="text-center px-6 py-4 rounded-xl" style="background: var(--bg-soft); border: 1px dashed var(--border-color)">
          <div class="text-3xl mb-2">🖥️ ↔️ 🖥️</div>
          <p class="text-sm text-[var(--text-secondary)] font-medium">
            打开一个新标签页访问同一页面
          </p>
          <p class="text-xs text-[var(--text-muted)] mt-1">
            移动鼠标、拖拽方块、输入文字 — 实时同步
          </p>
        </div>
      </div>

      <!-- 可拖拽方块 -->
      <div
        v-for="block in blocks"
        :key="block.id"
        class="absolute w-14 h-14 rounded-xl cursor-grab active:cursor-grabbing flex items-center justify-center text-white font-bold text-lg shadow-lg hover:scale-110 transition-transform z-10"
        :style="{
          left: block.x + 'px',
          top: block.y + 'px',
          background: block.color,
          boxShadow: `0 4px 16px ${block.color}44`,
        }"
        @mousedown="onBlockMouseDown($event, block)"
        @dblclick="randomizeBlockColor(block)"
      >
        {{ block.id }}
      </div>

      <!-- 远端光标 -->
      <template v-for="[id, cursor] in remoteCursors" :key="id">
        <div
          class="absolute pointer-events-none z-20 transition-all duration-100"
          :style="{ left: cursor.x + 'px', top: cursor.y + 'px' }"
        >
          <!-- 光标 SVG -->
          <svg
            width="18" height="22" viewBox="0 0 18 22"
            class="drop-shadow-md"
            :style="{ filter: `drop-shadow(0 1px 3px ${cursor.color}88)` }"
          >
            <path
              d="M1 1L1 17L5.5 13L10 21L13 19.5L8.5 12L14 11L1 1Z"
              :fill="cursor.color"
              stroke="white"
              stroke-width="1.5"
            />
          </svg>
          <!-- 名称标签 -->
          <span
            class="absolute left-5 top-4 text-[10px] px-2 py-0.5 rounded-full text-white font-semibold whitespace-nowrap shadow-sm"
            :style="{ background: cursor.color }"
          >
            {{ cursor.name }}
          </span>
        </div>
      </template>
    </div>

    <!-- 共享文本输入 -->
    <div class="px-5 py-3 border-t border-[var(--border-color)]" style="background: var(--bg-soft)">
      <label class="text-xs font-semibold text-[var(--text-secondary)] mb-1.5 block">
        📝 共享文本（实时同步）
      </label>
      <input
        v-model="sharedText"
        type="text"
        class="w-full px-4 py-2.5 text-sm rounded-lg border border-[var(--border-color)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
        style="background: var(--bg-card); color: var(--text-primary)"
        placeholder="输入文字，另一个标签页会实时看到..."
        @input="onTextInput"
      />
    </div>

    <!-- 底部说明 -->
    <div
      class="px-5 py-2.5 text-[11px] text-[var(--text-muted)] border-t border-[var(--border-color)] flex items-center justify-between"
      style="background: var(--bg-soft)"
    >
      <span>💡 同一浏览器打开多个标签页即可体验 · 拖拽方块 · 双击变色 · 实时同步</span>
      <span class="font-mono opacity-60">ID: {{ userId.slice(-6) }}</span>
    </div>
  </div>
</template>
