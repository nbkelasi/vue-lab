<!--
  Demos 列表页 - 展示所有 Vue 效果 Demo
-->
<script setup lang="ts">
const { data: demos } = await useAsyncData('demos-list', () =>
  queryCollection('demos').order('stem', 'ASC').all()
)

useSeoMeta({ title: 'Vue 效果展示 - Vue Lab' })
</script>

<template>
  <div class="max-w-3xl">
    <header class="mb-8 pb-6 border-b border-[var(--border-color)]">
      <h1 class="text-3xl font-extrabold text-[var(--text-brand)] mb-2 tracking-tight">Vue 效果展示</h1>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed">通过交互式 Demo 深入理解 Vue 的各种特性和高级用法</p>
    </header>

    <div class="grid gap-3">
      <NuxtLink
        v-for="demo in demos"
        :key="demo.path"
        :to="demo.path"
        class="group flex items-center gap-4 p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-hover)] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      >
        <span v-if="demo.icon" class="text-2xl flex-shrink-0">{{ demo.icon }}</span>
        <div class="flex-1 min-w-0">
          <h3 class="text-base font-bold text-[var(--text-primary)] mb-1">{{ demo.title }}</h3>
          <p class="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">{{ demo.description }}</p>
          <div class="flex gap-1.5 mt-2 flex-wrap" v-if="demo.tags?.length">
            <span
              v-for="tag in demo.tags"
              :key="tag"
              class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
            >{{ tag }}</span>
          </div>
        </div>
        <span class="text-lg text-[var(--text-muted)] group-hover:text-[var(--color-primary)] group-hover:translate-x-1 transition-all flex-shrink-0">→</span>
      </NuxtLink>
    </div>
  </div>
</template>
