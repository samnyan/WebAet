import { createRouter, createWebHashHistory } from 'vue-router'
export const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', name: 'editor', component: () => import('../views/EditorView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
] })
