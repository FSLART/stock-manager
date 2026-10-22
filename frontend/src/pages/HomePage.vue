<script setup>
import { computed, ref } from 'vue'
import circuito from '../assets/lart-circuito.jpg?inline'
import garagem from '../assets/lart-garagem.jpg?inline'
import testes from '../assets/lart-testes.jpg?inline'
import soldadura from '../assets/lart-soldadura.jpg?inline'
import AppNavigation from '../components/AppNavigation.vue'
import { useInventoryContext } from '../composables/useInventoryContext'
import { useNavigation } from '../composables/useNavigation.js'
const router = useNavigation()

const inventory = useInventoryContext()
const slides = [
  { url: circuito, title: 'Eletrónica feita pela equipa' },
  { url: garagem, title: 'O laboratório onde tudo acontece' },
  { url: testes, title: 'Testar no terreno' },
  { url: soldadura, title: 'Mãos à obra' },
]
const slideIndex = ref(0)
const slide = computed(() => slides[slideIndex.value])
function nextSlide(delta) { slideIndex.value = (slideIndex.value + delta + slides.length) % slides.length }
</script>

<template>
  <div class="home-page">
    <AppNavigation active="home" />

    <main class="home-content">
      <section class="home-dashboard">
        <div class="home-carousel">
          <img
            :key="slide.url"
            :src="slide.url"
            :alt="slide.title"
          />
          <div class="carousel-overlay"></div>
          <div class="carousel-copy">
            <p class="eyebrow">Stocklart · espaço de criação</p>
            <h1>{{ slide.title }}</h1>
            <p>Uma forma simples de gerir os teus componentes e manter cada projeto no caminho certo.</p>
          </div>
          <div class="carousel-controls">
            <button aria-label="Imagem anterior" @click="nextSlide(-1)">←</button>
            <span
              >{{ String(slideIndex + 1).padStart(2, '0') }} /
              {{ String(slides.length).padStart(2, '0') }}</span
            >
            <button aria-label="Próxima imagem" @click="nextSlide(1)">→</button>
          </div>
          <div class="carousel-dots">
            <button
              v-for="(_, index) in slides"
              :key="index"
              :class="{ selected: slideIndex === index }"
              :aria-label="`Ir para imagem ${index + 1}`"
              @click="slideIndex = index"
            ></button>
          </div>
        </div>
        <div class="home-options">
          <p class="eyebrow">Pit lane · próximo passo</p>
          <h2>Vamos trabalhar.</h2>
          <button class="home-option" @click="router.push('/stock')">
            <strong>Consultar stock</strong><span>→</span>
          </button>
          <button class="home-option" @click="inventory.manageCategories">
            <strong>Gerir categorias</strong><span>→</span>
          </button>
          <button class="home-option" @click="inventory.addMaterial" :disabled="!inventory.categoryCount">
            <strong>Adicionar material</strong><span>→</span>
          </button>
          <a class="home-option" href="https://stocklart.pt/harness/">
            <strong>Cablagem do T26e</strong><span>→</span>
          </a>
          <div class="home-summary">
            <strong>{{ inventory.totalUnits }}</strong
            ><span>unidades em stock · {{ inventory.categoryCount }} categorias</span>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
