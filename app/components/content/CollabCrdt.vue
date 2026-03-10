<!--
  CollabCRDT - 基于 CRDT 思想的协同文本编辑 Demo
  通过 MDC 语法 ::CollabCRDT 在 Markdown 中使用

  功能：
  1. 多标签页协同编辑同一段文本
  2. 实时显示远端用户光标位置
  3. 基于 Last-Writer-Wins (LWW) 的简化 CRDT 冲突解决
  4. 操作历史记录可视化
-->
<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'

// ========== 类型定义 ==========
/** 文本操作类型 */
interface TextOperation {
  type: 'insert' | 'delete'
  position: number
  content: string
  userId: string
  userName: string
  userColor: string
  timestamp: number
  /** Lamport 逻辑时钟，用于因果排序 */
  clock: number
}

/** 远端用户信息 */
interface RemoteUser {
  userId: string
  name: string
  color: string
  cursorPos: number
  lastUpdate: number
}

/** 同步消息 */
interface SyncMessage {
  type: 'operation' | 'state-request' | 'state-sync' | 'presence' | 'leave'
  userId: string
  payload: any
}

// ========== 常量 ==========
const COLORS = ['#f43f5e', '#8b5cf6', '#3b82f6', '#06b6d4', '#f59e0b', '#ec4899'] as const
const NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'] as const
const CHANNEL_NAME = 'vue-lab-crdt-collab'
const PRESENCE_INTERVAL = 1000
const USER_TIMEOUT = 3000
const MAX_HISTORY = 30

// ========== 状态 ==========
const userId = ref(`crdt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)
const userIdx = ref(0)
const userColor = computed(() => COLORS[userIdx.value % COLORS.length])
const userName = computed(() => NAMES[userIdx.value % NAMES.length])

/** 文本编辑器引用 */
const editorRef = ref<HTMLTextAreaElement | null>(null)

/** 共享文本内容 */
const text = ref('欢迎体验 CRDT 协同编辑 ✨\n\n多个标签页可以同时编辑这段文字。\n每次修改会生成一个操作（Operation），\n通过 BroadcastChannel 广播给其他标签页。\n\n试试看：在不同标签页同时输入！')

/** 本地光标位置 */
const localCursorPos = ref(0)

/** Lamport 逻辑时钟 */
let logicalClock = 0

/** 远端用户 */
const remoteUsers = reactive<Map<string, RemoteUser>>(new Map())

/** 操作历史 */
const opHistory = reactive<TextOperation[]>([])

/** 连接状态 */
const isConnected = ref(false)
const activeTab = ref<'editor' | 'history'>('editor')

/** 统计 */
const totalOps = ref(0)

let channel: BroadcastChannel | null = null
let presenceTimer: ReturnType<typeof setInterval> | null = null
let cleanupTimer: ReturnType<typeof setInterval> | null = null
let isRemoteUpdate = false
/**
 * IME 输入法组合状态标志（中文输入时为 true）
 * 注意：不能用模板内联表达式修改 let 变量，必须通过函数修改
 */
let isComposing = false
/**
 * "已提交"的文本快照，用于 diff 计算的基线
 * 关键：text.value 始终与 textarea 同步（包含 IME 中间态），
 * 而 committedText 只在 diff 被计算并广播后才更新
 */
let committedText = text.value

// ========== CRDT 核心逻辑 ==========
/**
 * 生成一个操作
 * 这里使用 Lamport 时钟来确保因果一致性
 */
function createOperation(type: 'insert' | 'delete', position: number, content: string): TextOperation {
  logicalClock++
  return {
    type,
    position,
    content,
    userId: userId.value,
    userName: userName.value,
    userColor: userColor.value,
    timestamp: Date.now(),
    clock: logicalClock,
  }
}

/**
 * 应用远端操作到本地文本
 * OT (Operational Transformation) 的简化实现
 */
function applyRemoteOperation(op: TextOperation) {
  isRemoteUpdate = true

  // 更新逻辑时钟（取自己和收到的最大值 + 1）
  logicalClock = Math.max(logicalClock, op.clock) + 1

  const currentText = text.value
  const savedCursor = localCursorPos.value

  if (op.type === 'insert') {
    // 在指定位置插入
    const pos = Math.min(op.position, currentText.length)
    text.value = currentText.slice(0, pos) + op.content + currentText.slice(pos)

    // 调整本地光标：如果远端插入在我光标前面，我的光标需要后移
    if (pos <= savedCursor) {
      localCursorPos.value = savedCursor + op.content.length
    }
  } else if (op.type === 'delete') {
    // 删除指定位置的内容
    const pos = Math.min(op.position, currentText.length)
    const endPos = Math.min(pos + op.content.length, currentText.length)
    text.value = currentText.slice(0, pos) + currentText.slice(endPos)

    // 调整本地光标
    if (pos < savedCursor) {
      localCursorPos.value = Math.max(pos, savedCursor - (endPos - pos))
    }
  }

  // 远端操作应用后，同步 committedText 基线
  committedText = text.value

  // 在编辑器中恢复光标位置
  nextTick(() => {
    if (editorRef.value) {
      editorRef.value.setSelectionRange(localCursorPos.value, localCursorPos.value)
    }
    isRemoteUpdate = false
  })
}

// ========== 通信层 ==========
function initChannel() {
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
    isConnected.value = true

    channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      const msg = event.data
      if (msg.userId === userId.value) return

      switch (msg.type) {
        case 'operation':
          handleRemoteOperation(msg.payload)
          break
        case 'state-request':
          // 新加入的标签页请求当前状态
          sendStateSync()
          break
        case 'state-sync':
          handleStateSync(msg.payload)
          break
        case 'presence':
          handlePresence(msg)
          break
        case 'leave':
          remoteUsers.delete(msg.userId)
          break
      }
    }

    // 请求当前状态
    broadcast({ type: 'state-request', userId: userId.value, payload: null })
  } catch (e) {
    console.warn('BroadcastChannel 不可用:', e)
    isConnected.value = false
  }
}

function broadcast(msg: SyncMessage) {
  channel?.postMessage(msg)
}

/** 处理远端操作 */
function handleRemoteOperation(op: TextOperation) {
  applyRemoteOperation(op)
  addToHistory(op)
  totalOps.value++
}

/** 发送当前完整状态（给新加入者） */
function sendStateSync() {
  broadcast({
    type: 'state-sync',
    userId: userId.value,
    payload: { text: text.value, clock: logicalClock },
  })
}

/** 处理状态同步（新加入时收到） */
function handleStateSync(payload: { text: string; clock: number }) {
  // 仅当自己刚加入时使用（操作历史为空）
  if (totalOps.value === 0) {
    isRemoteUpdate = true
    text.value = payload.text
    committedText = payload.text
    logicalClock = Math.max(logicalClock, payload.clock)
    nextTick(() => { isRemoteUpdate = false })
  }
}

/** 处理在线状态 */
function handlePresence(msg: SyncMessage) {
  remoteUsers.set(msg.userId, {
    userId: msg.userId,
    name: msg.payload.name,
    color: msg.payload.color,
    cursorPos: msg.payload.cursorPos,
    lastUpdate: Date.now(),
  })
}

// ========== 本地编辑 ==========
/** IME 组合开始（通过函数修改，避免模板内联赋值 let 变量的问题） */
function onCompositionStart() {
  isComposing = true
}

/** IME 组合输入结束（中文输入确认时触发） */
function onCompositionEnd(e: CompositionEvent) {
  isComposing = false
  if (isRemoteUpdate) return
  const textarea = e.target as HTMLTextAreaElement
  // 确保 text.value 是最终值
  text.value = textarea.value
  localCursorPos.value = textarea.selectionStart
  // 组合结束后，用 committedText 作为基线计算 diff
  computeAndBroadcastDiff()
}

/**
 * 监听文本编辑
 * 关键：始终更新 text.value 保持与 textarea 同步！
 * 否则 :value="text" 绑定会在 Vue 重渲染时覆盖用户输入
 */
function onInput(e: Event) {
  if (isRemoteUpdate) return
  const textarea = e.target as HTMLTextAreaElement

  // ★ 始终同步 text.value，防止 :value 绑定覆盖用户输入
  text.value = textarea.value
  localCursorPos.value = textarea.selectionStart

  // IME 组合中只同步文本，不计算 diff（等 compositionend 再统一处理）
  if (isComposing) return

  computeAndBroadcastDiff()
}

/**
 * 对比 committedText（上次已广播的文本）与当前 text.value，
 * 计算差异并广播操作
 */
function computeAndBroadcastDiff() {
  const newText = text.value
  const oldText = committedText

  if (newText === oldText) return

  if (newText.length > oldText.length) {
    // 插入操作
    const insertPos = findDiffStart(oldText, newText)
    const insertedContent = newText.slice(insertPos, insertPos + (newText.length - oldText.length))
    const op = createOperation('insert', insertPos, insertedContent)
    broadcast({ type: 'operation', userId: userId.value, payload: op })
    addToHistory(op)
    totalOps.value++
  } else if (newText.length < oldText.length) {
    // 删除操作
    const deletePos = findDiffStart(oldText, newText)
    const deletedContent = oldText.slice(deletePos, deletePos + (oldText.length - newText.length))
    const op = createOperation('delete', deletePos, deletedContent)
    broadcast({ type: 'operation', userId: userId.value, payload: op })
    addToHistory(op)
    totalOps.value++
  }

  // 更新提交基线
  committedText = newText
}

/** 找到两个字符串第一个不同的位置 */
function findDiffStart(oldStr: string, newStr: string): number {
  const minLen = Math.min(oldStr.length, newStr.length)
  for (let i = 0; i < minLen; i++) {
    if (oldStr[i] !== newStr[i]) return i
  }
  return minLen
}

/** 光标位置变化 */
function onSelect(e: Event) {
  const textarea = e.target as HTMLTextAreaElement
  localCursorPos.value = textarea.selectionStart
}

/** 添加到操作历史 */
function addToHistory(op: TextOperation) {
  opHistory.unshift(op)
  if (opHistory.length > MAX_HISTORY) {
    opHistory.pop()
  }
}

/** 广播在线状态 */
function broadcastPresence() {
  broadcast({
    type: 'presence',
    userId: userId.value,
    payload: {
      name: userName.value,
      color: userColor.value,
      cursorPos: localCursorPos.value,
    },
  })
}

/** 清理超时用户 */
function cleanupStaleUsers() {
  const now = Date.now()
  for (const [id, user] of remoteUsers) {
    if (now - user.lastUpdate > USER_TIMEOUT) {
      remoteUsers.delete(id)
    }
  }
}

/** 格式化时间戳 */
function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

/** 在线用户列表 */
const onlineUsers = computed(() => {
  const list = [{ name: userName.value, color: userColor.value, isLocal: true }]
  for (const [, user] of remoteUsers) {
    list.push({ name: user.name, color: user.color, isLocal: false })
  }
  return list
})

// ========== 生命周期 ==========
onMounted(() => {
  userIdx.value = Math.floor(Math.random() * COLORS.length)
  initChannel()
  presenceTimer = setInterval(broadcastPresence, PRESENCE_INTERVAL)
  cleanupTimer = setInterval(cleanupStaleUsers, 1000)
})

onBeforeUnmount(() => {
  broadcast({ type: 'leave', userId: userId.value, payload: null })
  channel?.close()
  if (presenceTimer) clearInterval(presenceTimer)
  if (cleanupTimer) clearInterval(cleanupTimer)
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
        <!-- 连接指示 -->
        <span
          class="w-2.5 h-2.5 rounded-full inline-block animate-pulse"
          :style="{ background: isConnected ? '#10b981' : '#ef4444' }"
        />

        <!-- 在线用户头像列 -->
        <div class="flex items-center -space-x-1.5">
          <div
            v-for="(user, idx) in onlineUsers"
            :key="idx"
            class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-[var(--bg-card)] transition-transform hover:scale-110 hover:z-10"
            :style="{ background: user.color, zIndex: onlineUsers.length - idx }"
            :title="user.name + (user.isLocal ? ' (你)' : '')"
          >
            {{ user.name[0] }}
          </div>
        </div>

        <!-- 在线人数 -->
        <span class="text-xs text-[var(--text-muted)]">
          {{ onlineUsers.length }} 人在线
        </span>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-[10px] font-mono text-[var(--text-muted)]">
          Lamport Clock: {{ logicalClock }}
        </span>
        <span class="text-[10px] font-mono text-[var(--text-muted)]">·</span>
        <span class="text-[10px] font-mono text-[var(--text-muted)]">
          Ops: {{ totalOps }}
        </span>
      </div>
    </div>

    <!-- Tab 选项卡 -->
    <div class="flex border-b border-[var(--border-color)]" style="background: var(--bg-soft)">
      <button
        class="px-5 py-2.5 text-xs font-semibold transition-colors relative"
        :style="{
          color: activeTab === 'editor' ? 'var(--color-primary)' : 'var(--text-muted)',
          background: activeTab === 'editor' ? 'var(--bg-card)' : 'transparent',
        }"
        @click="activeTab = 'editor'"
      >
        ✏️ 协同编辑器
        <span
          v-if="activeTab === 'editor'"
          class="absolute bottom-0 left-0 right-0 h-0.5"
          style="background: var(--color-primary)"
        />
      </button>
      <button
        class="px-5 py-2.5 text-xs font-semibold transition-colors relative"
        :style="{
          color: activeTab === 'history' ? 'var(--color-primary)' : 'var(--text-muted)',
          background: activeTab === 'history' ? 'var(--bg-card)' : 'transparent',
        }"
        @click="activeTab = 'history'"
      >
        📋 操作历史
        <span
          v-if="opHistory.length > 0"
          class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] text-white"
          style="background: var(--color-primary)"
        >
          {{ opHistory.length }}
        </span>
        <span
          v-if="activeTab === 'history'"
          class="absolute bottom-0 left-0 right-0 h-0.5"
          style="background: var(--color-primary)"
        />
      </button>
    </div>

    <!-- 编辑器面板 -->
    <div v-show="activeTab === 'editor'" class="relative">
      <!-- 远端光标指示器（在编辑器上方） -->
      <div
        v-if="remoteUsers.size > 0"
        class="flex items-center gap-2 px-5 py-2 border-b border-[var(--border-color)]"
        style="background: var(--bg-base)"
      >
        <span class="text-[10px] text-[var(--text-muted)]">远端光标：</span>
        <template v-for="[id, user] in remoteUsers" :key="id">
          <span
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-white font-medium"
            :style="{ background: user.color }"
          >
            {{ user.name }} @ {{ user.cursorPos }}
          </span>
        </template>
      </div>

      <!-- 文本编辑器 -->
      <textarea
        ref="editorRef"
        :value="text"
        class="w-full resize-none font-mono text-sm leading-relaxed px-5 py-4 focus:outline-none"
        style="background: var(--bg-base); color: var(--text-primary); min-height: 260px"
        spellcheck="false"
        @input="onInput"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @select="onSelect"
        @click="onSelect"
        @keyup="onSelect"
      />

      <!-- 光标位置 -->
      <div
        class="px-5 py-2 border-t border-[var(--border-color)] flex items-center justify-between"
        style="background: var(--bg-soft)"
      >
        <span class="text-[10px] font-mono text-[var(--text-muted)]">
          光标位置: {{ localCursorPos }} · 文本长度: {{ text.length }}
        </span>
        <span class="text-[10px] font-mono text-[var(--text-muted)]">
          字符数: {{ text.length }}
        </span>
      </div>
    </div>

    <!-- 操作历史面板 -->
    <div v-show="activeTab === 'history'">
      <div
        class="overflow-y-auto"
        style="max-height: 320px"
      >
        <div
          v-if="opHistory.length === 0"
          class="px-5 py-12 text-center text-sm text-[var(--text-muted)]"
        >
          暂无操作记录，开始编辑后将在这里显示
        </div>

        <div
          v-for="(op, idx) in opHistory"
          :key="idx"
          class="flex items-start gap-3 px-5 py-2.5 border-b border-[var(--border-color)] last:border-b-0 transition-colors hover:bg-[var(--bg-card-hover)]"
          style="background: var(--bg-base)"
        >
          <!-- 操作类型图标 -->
          <div
            class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
            :style="{ background: op.type === 'insert' ? '#10b981' : '#f43f5e' }"
          >
            {{ op.type === 'insert' ? '+' : '−' }}
          </div>

          <!-- 操作详情 -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span
                class="text-[10px] px-1.5 py-0.5 rounded text-white font-semibold"
                :style="{ background: op.userColor }"
              >
                {{ op.userName }}
              </span>
              <span class="text-[10px] text-[var(--text-muted)] font-mono">
                {{ formatTime(op.timestamp) }}
              </span>
              <span class="text-[10px] text-[var(--text-muted)] font-mono">
                clock:{{ op.clock }}
              </span>
            </div>
            <div class="text-xs text-[var(--text-secondary)]">
              <span class="font-medium">{{ op.type === 'insert' ? '插入' : '删除' }}</span>
              <code class="mx-1 px-1.5 py-0.5 rounded text-[11px]" style="background: var(--color-primary-soft); color: var(--color-primary)">
                "{{ op.content.length > 20 ? op.content.slice(0, 20) + '...' : op.content }}"
              </code>
              at pos {{ op.position }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部说明 -->
    <div
      class="px-5 py-2.5 text-[11px] text-[var(--text-muted)] border-t border-[var(--border-color)]"
      style="background: var(--bg-soft)"
    >
      💡 使用 Lamport 时钟实现因果排序 · 操作转换 (OT) 处理冲突 · BroadcastChannel 通信
    </div>
  </div>
</template>
