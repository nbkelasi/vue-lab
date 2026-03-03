<!--
  AppHeader - 顶部导航栏
  使用 TailwindCSS + CSS 变量实现
-->
<script setup lang="ts">
const route = useRoute()
const { isDark, toggleTheme, initTheme } = useTheme()
const { sections } = useNavigation()

// 移动端菜单控制
const mobileMenuOpen = ref(false)

onMounted(() => initTheme())
</script>

<template>
  <header class="sticky top-0 z-50 backdrop-blur-xl border-b border-[var(--border-color)] transition-colors duration-300" style="background: var(--header-bg)">
    <div class="max-w-[1200px] mx-auto px-6 h-[var(--header-height)] flex items-center justify-between">
      <!-- Logo -->
      <NuxtLink to="/" class="flex items-center gap-2 no-underline text-[var(--text-primary)]">
        <span class="text-[22px]">🧪</span>
        <span class="text-lg font-extrabold text-[var(--text-brand)] tracking-tight">Vue Lab</span>
      </NuxtLink>

      <!-- 右侧：导航 + 主题切换 -->
      <div class="flex items-center gap-3">
        <!-- 桌面端导航 -->
        <nav class="hidden md:flex gap-1">
          <NuxtLink
            v-for="section in sections"
            :key="section.basePath"
            :to="section.basePath"
            class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200"
            :class="route.path.startsWith(section.basePath)
              ? 'bg-[var(--color-primary)] text-white font-semibold'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'"
          >
            <Icon :name="section.icon" size="16" />
            <span>{{ section.label }}</span>
          </NuxtLink>
        </nav>

        <!-- 主题切换按钮 -->
        <button
          class="p-1 flex items-center border-none bg-transparent cursor-pointer text-[var(--text-primary)]"
          :title="isDark ? '切换到亮色主题' : '切换到暗色主题'"
          @click="toggleTheme"
        >
          <span class="flex items-center w-12 h-[26px] rounded-full border border-[var(--border-color)] p-0.5 relative transition-all duration-300" style="background: var(--bg-card-hover)">
            <span
              class="w-5 h-5 rounded-full flex items-center justify-center text-white shadow-md transition-transform duration-300"
              style="background: var(--color-primary)"
              :class="isDark ? 'translate-x-0' : 'translate-x-[22px]'"
            >
              <Icon :name="isDark ? 'ph:moon-bold' : 'ph:sun-bold'" size="13" />
            </span>
          </span>
        </button>

        <!-- 移动端菜单按钮 -->
        <button
          class="md:hidden p-2 text-[var(--text-primary)] bg-transparent border-none cursor-pointer"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <Icon :name="mobileMenuOpen ? 'ph:x-bold' : 'ph:list-bold'" size="22" />
        </button>
      </div>
    </div>

    <!-- 移动端菜单 -->
    <Transition name="slide">
      <div v-if="mobileMenuOpen" class="md:hidden border-t border-[var(--border-color)] px-4 py-3" style="background: var(--bg-sidebar)">
        <NuxtLink
          v-for="section in sections"
          :key="section.basePath"
          :to="section.basePath"
          class="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
          :class="route.path.startsWith(section.basePath)
            ? 'text-[var(--color-primary)] bg-[var(--color-primary-soft)]'
            : 'text-[var(--text-secondary)]'"
          @click="mobileMenuOpen = false"
        >
          <Icon :name="section.icon" size="18" />
          <span>{{ section.label }}</span>
        </NuxtLink>
      </div>
    </Transition>
  </header>
</template>

<style scoped>
.slide-enter-active, .slide-leave-active { transition: all 0.2s ease; }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
