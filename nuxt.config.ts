// https://nuxt.com/docs/api/configuration/nuxt-config
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
    // GitHub Pages 预设：生成纯静态文件到 .output/public
    preset: 'github-pages',
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
    // GitHub Pages 子路径：构建时通过环境变量 NUXT_APP_BASE_URL 覆盖
    baseURL: '/',
    head: {
      title: 'Vue Lab - Vue 学习实验室',
      meta: [
        { name: 'description', content: 'Vue 效果展示、代码实现、技术文章的综合学习平台' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
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