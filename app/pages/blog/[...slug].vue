<!--
  博客动态路由页面（TailwindCSS）
-->
<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug
const path = Array.isArray(slug) ? `/blog/${slug.join('/')}` : `/blog/${slug}`

const { data: page } = await useAsyncData(
  `blog-${path}`,
  () => queryCollection('blog').path(path).first()
)

if (!page.value) {
  throw createError({ statusCode: 404, message: '页面未找到' })
}

useSeoMeta({
  title: `${page.value?.title} - Vue Lab`,
  description: page.value?.description,
})
</script>

<template>
  <article v-if="page" class="max-w-full">
    <header class="mb-8 pb-6 border-b border-[var(--border-color)]">
      <div class="flex items-center gap-2 mb-3 flex-wrap">
        <span v-if="page.date" class="flex items-center gap-1 text-xs text-[var(--text-muted)] font-medium">
          <Icon name="ph:calendar-bold" size="14" />
          {{ page.date }}
        </span>
        <span
          v-for="tag in (page.tags || [])"
          :key="tag"
          class="px-3 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
        >{{ tag }}</span>
      </div>
      <h1 class="text-[2rem] font-extrabold text-[var(--text-primary)] mb-2 tracking-tight leading-tight">{{ page.title }}</h1>
      <p v-if="page.description" class="text-[15px] text-[var(--text-secondary)] leading-relaxed">{{ page.description }}</p>
    </header>
    <div class="prose">
      <ContentRenderer :value="page" />
    </div>
  </article>
</template>
