<script setup>
import { computed, inject } from 'vue'
import homeImages from 'home-images'
import AppNavigation from '../components/AppNavigation.vue'
import { useNavigation } from '../composables/useNavigation.js'
const router = useNavigation(), auth = inject('auth', null)
const leader = computed(() => Boolean(auth?.user && (auth.user.admin || ['Board', 'Department Leader'].includes(auth.user.role))))
const resources = [
  { title: 'Inventário', description: 'Consulta material, quantidades e disponibilidade.', route: '/stock', icon: 'M4 7h16v13H4z M3 3h18v4H3z M10 11h4' },
  { title: 'Localizações', description: 'Encontra caixas e gavetas. Abre o material pelo QR.', route: '/locations', icon: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' },
  { title: 'Etiquetas', description: 'Prepara e imprime etiquetas para a oficina.', route: '/labels', icon: 'M3 3h8l10 10-8 8L3 11Z M7 7h.01' },
  { title: 'Movimentos', description: 'Vê o que mudou, quando e por quem.', route: '/movements', icon: 'M7 3v18 M3 7l4-4 4 4 M17 21V3 M13 17l4 4 4-4' },
]
const engineering = [
  { title: 'Projetos PCB', description: 'Placas, listas de materiais e stock para produção.', route: '/pcbs', icon: 'M5 5h14v14H5z M9 9h6v6H9z M9 2v3 M15 2v3 M9 19v3 M15 19v3 M2 9h3 M2 15h3 M19 9h3 M19 15h3' },
  { title: 'Cablagem do T26e', description: 'Conectores, circuitos e vistas 2D e 3D do carro.', route: '/harness', icon: 'M4 3v5a4 4 0 0 0 4 4h8a4 4 0 0 1 4 4v5 M12 3v18 M1 3h6 M9 3h6 M9 21h6 M17 21h6' },
  { title: 'Simulação analógica', description: 'Explora e testa o funcionamento das placas.', route: '/analog-simulation', icon: 'M2 12h4l3-8 6 16 3-8h4' },
]
</script>

<template>
  <div class="home-page">
    <AppNavigation active="home" />
    <main id="main-content" class="team-home" tabindex="-1">
      <header class="team-intro">
        <div class="team-intro-copy">
          <h1>Ferramentas da<br class="desktop-break"> equipa LART</h1>
          <p>Da oficina à pista. Encontra o material, os projetos e as ferramentas para trabalhar em equipa.</p>
        </div>
        <figure class="team-photo"><img :src="homeImages[1]" alt="Oficina da equipa LART, com o carro e as caixas de material" fetchpriority="high"><figcaption>O mesmo projeto. Toda a equipa.</figcaption></figure>
      </header>
      <div class="team-tools">
        <section class="tool-section" aria-labelledby="resources-title">
          <div class="tool-section-heading"><h2 id="resources-title">Recursos e oficina</h2><p>Material e organização, à mão de todos.</p></div>
          <div class="tool-list">
            <a v-for="tool in resources" :key="tool.route" :href="`#${tool.route}`" class="tool-link" @click="router.follow($event, tool.route)">
              <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="tool.icon" /></svg>
              <span><strong>{{ tool.title }}</strong><span>{{ tool.description }}</span></span>
              <svg class="tool-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
            </a>
          </div>
        </section>
        <section class="tool-section" aria-labelledby="engineering-title">
          <div class="tool-section-heading"><h2 id="engineering-title">Engenharia</h2><p>Do componente ao sistema completo.</p></div>
          <div class="tool-list">
            <a v-for="tool in engineering" :key="tool.route" :href="`#${tool.route}`" class="tool-link" @click="router.follow($event, tool.route)">
              <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="tool.icon" /></svg>
              <span><strong>{{ tool.title }}</strong><span>{{ tool.description }}</span></span>
              <svg class="tool-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
            </a>
          </div>
          <a v-if="leader" class="purchasing-link" href="#/batches" @click="router.follow($event, '/batches')"><span><strong>Compras e encomendas</strong><span>Consulta fornecedores, material e documentos.</span></span><svg class="tool-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></a>
        </section>
      </div>
      <footer class="team-home-footer"><p>Consulta livre. Alterações identificadas e de acordo com as permissões da tua conta.</p><a href="#/settings" @click="router.follow($event, '/settings')">Conta e preferências</a></footer>
    </main>
  </div>
</template>
