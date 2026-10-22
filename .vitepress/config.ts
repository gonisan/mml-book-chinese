import { defineConfig } from 'vitepress'
import { buildNav, buildSidebar, readBook, toRewrites } from '../scripts/lib/book'
import { mathSpaceNormalizer } from './plugins/math-spaces'

const book = readBook()
const base = '/'

export default defineConfig({
  lang: 'zh-CN',
  title: '数学基础 for 机器学习',
  description: '《Mathematics for Machine Learning》中文翻译：从数学基础到四大机器学习问题',
  base,
  cleanUrls: true,
  srcExclude: ['README.md', 'node_modules/**'],

  rewrites: toRewrites(book),

  markdown: {
    math: { tex: { tags: 'none' } },
    config(md) {
      md.use(mathSpaceNormalizer)
    }
  },

  themeConfig: {
    nav: buildNav(book),
    sidebar: buildSidebar(book),
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一节', next: '下一节' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '主题',
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索', buttonAriaLabel: '搜索' },
          modal: {
            noResultsText: '没有找到结果',
            resetButtonTitle: '清除条件',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' }
          }
        }
      }
    },
    footer: {
      message: '本书中文翻译仅供学习交流，原书版权归 Cambridge University Press 所有'
    }
  }
})
