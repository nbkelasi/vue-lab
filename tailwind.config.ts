import type { Config } from 'tailwindcss'

/**
 * TailwindCSS 配置
 * @nuxtjs/tailwindcss 模块会自动加载此文件
 * 同时 VS Code 的 Tailwind CSS IntelliSense 扩展也需要此文件才能提供悬停提示
 */
export default <Config>{
  content: [
    './app/**/*.{vue,ts}',
    './content/**/*.md',
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {},
  },
}
