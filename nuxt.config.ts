// https://nuxt.com/docs/api/configuration/nuxt-config

// GitHub Pages 子路径：CI 中通过 NUXT_APP_BASE_URL 环境变量设置为 /vue-lab/
// 本地开发默认 /
const baseURL = process.env.NUXT_APP_BASE_URL || '/'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // 静态站点生成（SSG）模式
  ssr: true,

  modules: [
    '@nuxt/content',
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
    '@nuxt/icon',
  ],

  // Nitro 服务端引擎配置
  nitro: {
    // 预渲染配置（nuxt generate 使用）
    prerender: {
      // 从首页开始爬取所有链接
      routes: ['/'],
      crawlLinks: true,
      // Content 模块的 SQL dump 等辅助路由 404 时不中断构建
      failOnError: false,
    },
  },

  // Nuxt Content 配置
  content: {
    build: {
      markdown: {
        highlight: {
          theme: {
            default: 'github-light',
            dark: 'github-dark',
          },
          langs: ['js', 'ts', 'vue', 'html', 'css', 'json', 'bash', 'shell'],
        },
      },
    },
  },

  // 全局 head 配置
  app: {
    baseURL,
    head: {
      title: 'Vue Lab - Vue 学习实验室',
      meta: [
        { name: 'description', content: 'Vue 效果展示、代码实现、技术文章的综合学习平台' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: `${baseURL}favicon.ico` },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
        },
      ],
    },
  },

  // TailwindCSS 配置
  tailwindcss: {
    cssPath: '~/assets/css/main.css',
  },
})