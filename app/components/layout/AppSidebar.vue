<!--
  AppSidebar - 侧边栏导航（TailwindCSS）
-->
<script setup lang="ts">
const route = useRoute()
const { sections } = useNavigation()

const { data: demoList } = await useAsyncData('demo-nav', () =>
  queryCollection('demos').order('stem', 'ASC').all()
)
const { data: codeList } = await useAsyncData('code-nav', () =>
  queryCollection('codeShowcase').order('stem', 'ASC').all()
)
const { data: blogList } = await useAsyncData('blog-nav', () =>
  queryCollection('blog').order('stem', 'ASC').all()
)

const getListForSection = (collection: string) => {
  switch (collection) {
    case 'demos': return demoList.value || []
    case 'codeShowcase': return codeList.value || []
    case 'blog': return blogList.value || []
    default: return []
  }
}
</script>

<template>
  <aside class="hidden md:block w-[var(--sidebar-width)] h-[calc(100vh-var(--header-height))] sticky top-[var(--header-height)] overflow-y-auto border-r border-[var(--border-color)] flex-shrink-0 transition-colors duration-300" style="background: var(--bg-sidebar)">
    <div class="p-5 px-4">
      <div v-for="section in sections" :key="section.collection" class="mb-6">
        <!-- 分类标题 -->
        <NuxtLink :to="section.basePath" class="flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] no-underline hover:text-[var(--text-primary)] transition-colors">
          <Icon :name="section.icon" size="14" />
          <span>{{ section.label }}</span>
        </NuxtLink>

        <!-- 文章列表 -->
        <ul class="list-none p-0 mt-1">
          <li v-for="item in getListForSection(section.collection)" :key="item.path">
            <NuxtLink
              :to="item.path"
              class="block px-2.5 py-[7px] pl-8 text-[13px] font-medium no-underline rounded-md transition-all duration-150"
              :class="route.path === item.path
                ? 'text-[var(--color-primary)] bg-[var(--color-primary-soft)] font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'"
            >
              {{ item.title }}
            </NuxtLink>
          </li>
        </ul>
      </div>
    </div>
  </aside>
</template>
