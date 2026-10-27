<script setup>
import { useNavigation } from '../composables/useNavigation.js'
const router = useNavigation()
function backToTop() {
  window.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  document.getElementById('main-content')?.focus({ preventScroll: true })
}
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer-inner">
      <div><a class="footer-brand" href="#/" @click="router.follow($event, '/')">STOCKLART</a><p>Ferramentas da equipa LART</p></div>
      <nav aria-label="Ligações do rodapé">
        <a href="#/" @click="router.follow($event, '/')">Início</a>
        <a href="#/settings" @click="router.follow($event, '/settings')">Conta e preferências</a>
        <button type="button" @click="backToTop">Voltar ao topo</button>
      </nav>
    </div>
  </footer>
</template>
