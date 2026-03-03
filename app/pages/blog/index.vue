<!--
  博客列表页 - 展示所有文章
-->
<script setup lang="ts">
const { data: posts } = await useAsyncData('blog-list', () =>
  queryCollection('blog').order('stem', 'DESC').all()
)

useSeoMeta({ title: '技术文章 - Vue Lab' })
</script>

<template>
  <div class="max-w-3xl">
    <header class="mb-8 pb-6 border-b border-[var(--border-color)]">
      <h1 class="text-3xl font-extrabold text-[var(--text-brand)] mb-2 tracking-tight">技术文章</h1>
      <p class="text-sm text-[var(--text-secondary)] leading-relaxed">前端技术博客与学习笔记</p>
    </header>

    <div class="grid gap-4">
      <NuxtLink
        v-for="post in posts"
        :key="post.path"
        :to="post.path"
        class="group block p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-hover)] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      >
        <div class="flex items-center gap-2 mb-2 text-xs text-[var(--text-muted)]">
          <Icon name="ph:calendar-bold" size="14" />
          <span v-if="post.date">{{ post.date }}</span>
        </div>
        <h3 class="text-lg font-bold text-[var(--text-primary)] mb-2 group-hover:text-[var(--color-primary)] transition-colors">{{ post.title }}</h3>
        <p class="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">{{ post.description }}</p>
        <div class="flex gap-1.5 flex-wrap" v-if="post.tags?.length">
          <span
            v-for="tag in post.tags"
            :key="tag"
            class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
          >{{ tag }}</span>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
