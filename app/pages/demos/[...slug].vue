<!--
  Demo 动态路由页面（TailwindCSS）
-->
<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug
const path = Array.isArray(slug) ? `/demos/${slug.join('/')}` : `/demos/${slug}`

const { data: page } = await useAsyncData(
  `demos-${path}`,
  () => queryCollection('demos').path(path).first()
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
      <div class="flex gap-2 mb-3 flex-wrap" v-if="page.tags?.length || page.difficulty">
        <span
          v-for="tag in (page.tags || [])"
          :key="tag"
          class="px-3 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
        >{{ tag }}</span>
        <span v-if="page.difficulty" class="px-3 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--bg-card-hover)] text-[var(--text-secondary)]">
          {{ page.difficulty }}
        </span>
      </div>
      <h1 class="text-[2rem] font-extrabold text-[var(--text-primary)] mb-2 tracking-tight leading-tight">{{ page.title }}</h1>
      <p v-if="page.description" class="text-[15px] text-[var(--text-secondary)] leading-relaxed">{{ page.description }}</p>
    </header>
    <div class="prose">
      <ContentRenderer :value="page" />
    </div>
  </article>
</template>
