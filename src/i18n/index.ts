import { createI18n } from 'vue-i18n'
export const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en', messages: {
  'zh-CN': { open: '打开资源', editor: '编辑器', ready: '打开 AET 文件开始编辑', language: 'English' },
  en: { open: 'Open assets', editor: 'Editor', ready: 'Open an AET file to begin', language: '中文' },
} })
