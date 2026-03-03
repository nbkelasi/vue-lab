import { defineContentConfig, defineCollection, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    // Vue 效果展示
    demos: defineCollection({
      type: 'page',
      source: 'demos/**/*.md',
      schema: z.object({
        icon: z.string().optional(),
        tags: z.array(z.string()).optional(),
        difficulty: z.enum(['入门', '进阶', '高级']).optional(),
      }),
    }),

    // 代码实现展示
    codeShowcase: defineCollection({
      type: 'page',
      source: 'code-showcase/**/*.md',
      schema: z.object({
        tags: z.array(z.string()).optional(),
        category: z.string().optional(),
      }),
    }),

    // 技术博客
    blog: defineCollection({
      type: 'page',
      source: 'blog/**/*.md',
      schema: z.object({
        date: z.string().optional(),
        tags: z.array(z.string()).optional(),
        cover: z.string().optional(),
      }),
    }),
  },
})
