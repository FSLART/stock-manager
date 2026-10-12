<script setup>
import AppNavigation from '../components/AppNavigation.vue'
import { useInventoryContext } from '../composables/useInventoryContext'
import { router } from '../router'

const inventory = useInventoryContext()
</script>

<template>
  <div class="home-page">
    <AppNavigation active="home" />

    <main class="home-content">
      <section class="home-dashboard">
        <div class="home-carousel">
          <img
            :key="inventory.carouselSlide.url"
            :src="inventory.carouselSlide.url"
            :alt="inventory.carouselSlide.title"
          />
          <div class="carousel-overlay"></div>
          <div class="carousel-copy">
            <p class="eyebrow">Stocklart · espaço de criação</p>
            <h1>{{ inventory.carouselSlide.title }}</h1>
            <p>Uma forma simples de gerir os teus componentes e manter cada projeto no caminho certo.</p>
          </div>
          <div class="carousel-controls">
            <button aria-label="Imagem anterior" @click="inventory.previousSlide">←</button>
            <span
              >{{ String(inventory.carouselIndex + 1).padStart(2, '0') }} /
              {{ String(inventory.carouselImages.length).padStart(2, '0') }}</span
            >
            <button aria-label="Próxima imagem" @click="inventory.nextSlide">→</button>
          </div>
          <div class="carousel-dots">
            <button
              v-for="(_, index) in inventory.carouselImages"
              :key="index"
              :class="{ selected: inventory.carouselIndex === index }"
              :aria-label="`Ir para imagem ${index + 1}`"
              @click="inventory.selectSlide(index)"
            ></button>
          </div>
        </div>
        <div class="home-options">
          <p class="eyebrow">Pit lane · próximo passo</p>
          <h2>Vamos trabalhar.</h2>
          <button class="home-option" @click="router.push('/stock')">
            <strong>Consultar stock</strong><span>→</span>
          </button>
          <button class="home-option" @click="router.push('/stock')">
            <strong>Gerir categorias</strong><span>→</span>
          </button>
          <button class="home-option" @click="router.push('/stock')">
            <strong>Adicionar material</strong><span>→</span>
          </button>
          <div class="home-summary">
            <strong>{{ inventory.totalUnits }}</strong
            ><span>unidades em stock · {{ inventory.categoryCount }} categorias</span>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
