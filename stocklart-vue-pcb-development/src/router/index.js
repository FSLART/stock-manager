import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('../pages/HomePage.vue') },
    { path: '/stock', name: 'stock', component: () => import('../pages/StockPage.vue') },
    {
      path: '/board-signals',
      name: 'board-signals',
      component: () => import('../pages/BoardSignalsPage.vue')
    },
    { path: '/movements', name: 'movements', component: () => import('../pages/MovementsPage.vue') },
    { path: '/pcbs', name: 'pcbs', component: () => import('../pages/PcbBomPage.vue') },
    { path: '/settings', name: 'settings', component: () => import('../pages/SettingsPage.vue') }
  ]
})
