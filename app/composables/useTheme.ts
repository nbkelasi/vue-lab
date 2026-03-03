/**
 * useTheme - 主题切换 Composable
 * 
 * 功能：
 * 1. 持久化读写 localStorage 中的主题偏好
 * 2. 首次访问时跟随系统偏好
 * 3. 通过修改 <html data-theme> 属性来切换主题
 */
import { useState } from '#app'

export const useTheme = () => {
  const isDark = useState('theme-dark', () => true)

  /** 将主题同步到 DOM 和 localStorage */
  const applyTheme = (dark: boolean) => {
    if (import.meta.client) {
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
      localStorage.setItem('theme', dark ? 'dark' : 'light')
    }
  }

  /** 切换明暗主题 */
  const toggleTheme = () => {
    isDark.value = !isDark.value
    applyTheme(isDark.value)
  }

  /** 初始化主题（在布局 onMounted 中调用） */
  const initTheme = () => {
    if (import.meta.client) {
      const saved = localStorage.getItem('theme')
      if (saved) {
        isDark.value = saved === 'dark'
      } else {
        isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
      }
      applyTheme(isDark.value)
    }
  }

  return { isDark, toggleTheme, initTheme }
}
