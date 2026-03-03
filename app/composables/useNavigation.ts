/**
 * useNavigation - 导航配置 Composable
 * 
 * 集中管理站点的分类导航信息
 * 新增模块时只需在这里添加一项即可
 */
export interface NavSection {
  label: string
  icon: string // Iconify 图标名
  collection: string
  basePath: string
  description: string
}

export const useNavigation = () => {
  const sections: NavSection[] = [
    {
      label: 'Vue 效果展示',
      icon: 'ph:flask-bold',
      collection: 'demos',
      basePath: '/demos',
      description: 'Vue 各种特性的交互式 Demo',
    },
    {
      label: '代码实现展示',
      icon: 'ph:code-bold',
      collection: 'codeShowcase',
      basePath: '/code-showcase',
      description: '节流防抖、Promise 等 JS 概念',
    },
    {
      label: '技术文章',
      icon: 'ph:article-bold',
      collection: 'blog',
      basePath: '/blog',
      description: '技术博客与学习笔记',
    },
  ]

  return { sections }
}
