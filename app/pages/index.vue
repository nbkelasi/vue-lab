<!--
  首页 - Hero + 分类卡片导航
  使用 home 布局（无侧边栏）
-->
<script setup lang="ts">
definePageMeta({
  layout: 'home',
})

const { sections } = useNavigation()

// 查询各集合的文章数量
const { data: demoCount } = await useAsyncData('demo-count', () =>
  queryCollection('demos').count()
)
const { data: codeCount } = await useAsyncData('code-count', () =>
  queryCollection('codeShowcase').count()
)
const { data: blogCount } = await useAsyncData('blog-count', () =>
  queryCollection('blog').count()
)

const getCount = (collection: string) => {
  switch (collection) {
    case 'demos': return demoCount.value || 0
    case 'codeShowcase': return codeCount.value || 0
    case 'blog': return blogCount.value || 0
    default: return 0
  }
}

// 技术标签
const techBadges = ['Vue 3', 'Nuxt', 'Composition API', 'TypeScript', 'TailwindCSS']
</script>

<template>
  <div class="home-page">
    <!-- Hero 区域 -->
    <section class="hero">
      <div class="hero-glow"></div>
      <h1 class="hero-title">Vue 学习实验室</h1>
      <p class="hero-desc">
        通过动手实践来深入理解 Vue 的各种特性和高级用法<br>
        每个 Demo 都配有详细注释和源码展示，适合边看边学
      </p>
      <div class="hero-badges">
        <span v-for="badge in techBadges" :key="badge" class="badge">{{ badge }}</span>
      </div>
    </section>

    <!-- 分类导航卡片 -->
    <section class="sections-grid">
      <NuxtLink
        v-for="section in sections"
        :key="section.basePath"
        :to="section.basePath"
        class="section-card"
      >
        <div class="card-icon">
          <Icon :name="section.icon" size="28" />
        </div>
        <div class="card-body">
          <h3 class="card-title">{{ section.label }}</h3>
          <p class="card-desc">{{ section.description }}</p>
          <div class="card-meta">
            <span class="card-count">{{ getCount(section.collection) }} 篇内容</span>
            <span class="card-arrow">→</span>
          </div>
        </div>
      </NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.home-page {
  padding-bottom: 60px;
}

/* Hero */
.hero {
  text-align: center;
  padding: 60px 0 50px;
  position: relative;
}

.hero-glow {
  position: absolute;
  top: -60px;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 300px;
  background: radial-gradient(ellipse, var(--color-primary-soft) 0%, transparent 70%);
  pointer-events: none;
}

.hero-title {
  font-size: 42px;
  font-weight: 800;
  letter-spacing: -1.5px;
  color: var(--text-brand);
  margin-bottom: 16px;
  position: relative;
}

.hero-desc {
  font-size: 15px;
  color: var(--text-secondary);
  line-height: 1.8;
  margin-bottom: 24px;
}

.hero-badges {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.badge {
  padding: 5px 16px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

/* 分类卡片 */
.sections-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  padding-top: 20px;
}

.section-card {
  display: flex;
  gap: 20px;
  padding: 28px;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  color: inherit;
  transition: all 0.25s ease;
}

.section-card:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-hover);
  box-shadow: var(--shadow-md);
  transform: translateY(-3px);
}

.card-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-body {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.card-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 12px;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-count {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.card-arrow {
  font-size: 18px;
  color: var(--text-muted);
  transition: all 0.25s;
}

.section-card:hover .card-arrow {
  color: var(--color-primary);
  transform: translateX(4px);
}
</style>
