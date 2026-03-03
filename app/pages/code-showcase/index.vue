<!--
  代码展示列表页 - 展示所有代码实现文章
-->
<script setup lang="ts">
const { data: items } = await useAsyncData('code-list', () =>
  queryCollection('codeShowcase').order('stem', 'ASC').all()
)

useSeoMeta({ title: '代码实现展示 - Vue Lab' })
</script>

<template>
  <div class="max-w-3xl">
    <header class="mb-8 pb-6 border-b border-[var(--border-color)]">
      <h1 class="text-3xl font-extrabold text-[var(--text-brand)] mb-2 tracking-tight">代码实现展示</h1>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed">手写实现经典 JavaScript 概念，深入理解底层原理</p>
    </header>

    <div class="grid gap-3">
      <NuxtLink
        v-for="item in items"
        :key="item.path"
        :to="item.path"
        class="group flex items-center gap-4 p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-hover)] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      >
        <div class="w-11 h-11 rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center flex-shrink-0">
          <Icon name="ph:code-bold" size="20" />
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-base font-bold text-[var(--text-primary)] mb-1">{{ item.title }}</h3>
          <p class="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">{{ item.description }}</p>
          <div class="flex gap-1.5 mt-2 flex-wrap" v-if="item.tags?.length">
            <span
              v-for="tag in item.tags"
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
