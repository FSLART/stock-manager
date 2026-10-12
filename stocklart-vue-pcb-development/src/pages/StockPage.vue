<script setup>
import AppNavigation from '../components/AppNavigation.vue'
import InventoryModals from '../components/InventoryModals.vue'
import { useInventoryContext } from '../composables/useInventoryContext'

const inventory = useInventoryContext()
</script>

<template>
  <div class="stock-page">
    <AppNavigation active="stock" />
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-heading">
          <span class="eyebrow">Organização</span>
          <strong>Categorias</strong>
        </div>
        <nav class="category-nav" aria-label="Categorias">
          <button :class="['category-link', { active: !inventory.currentCategory }]" @click="inventory.setCategory('')">
            <span>Todos</span><b>{{ inventory.totalUnits }}</b>
          </button>
          <div v-for="category in inventory.categories" :key="category.name" class="category-entry">
            <button
              :class="['category-link', { active: inventory.currentCategory === category.name }]"
              @click="inventory.setCategory(category.name)"
            >
              <span><i :style="{ background: inventory.categoryColor(category.name) }"></i>{{ category.name }}</span>
              <b>{{ inventory.categoryTotal(category.name) }}</b>
            </button>
            <div class="category-tools">
              <button aria-label="Editar categoria" @click="inventory.openCategoryEdit(category)">✎</button>
              <button aria-label="Apagar categoria" @click="inventory.deleteCategory(category)">×</button>
            </div>
          </div>
        </nav>
        <button class="outline-button sidebar-action" @click="inventory.openCategoryDialog">+ Nova categoria</button>
      </aside>

      <main class="content">
        <header class="topbar">
          <div>
            <p class="eyebrow">Inventário local</p>
            <h1>{{ inventory.currentCategory || 'Tudo em stock' }}</h1>
            <p class="subtitle">
              {{ inventory.shownItems.length }} referências · {{ inventory.totalUnits }} unidades guardadas neste
              navegador
            </p>
          </div>
        </header>
        <section class="toolbar">
          <label class="search-box">
            <span>⌕</span>
            <input v-model="inventory.query" type="search" placeholder="Pesquisar por componente, valor ou categoria" />
          </label>
          <span class="storage-note"><i></i> Armazenamento local do navegador</span>
        </section>
        <section class="inventory" aria-live="polite">
          <div v-if="!inventory.shownItems.length" class="empty-state">
            <strong>Nenhum componente encontrado</strong>
            <span>Cria uma referência nova ou altera a pesquisa.</span>
          </div>
          <article v-for="item in inventory.shownItems" :key="item.id" class="inventory-row">
            <div class="image-slot">
              <img v-if="item.image" :src="item.image" :alt="`Imagem de ${inventory.mainValue(item)}`" />
              <span v-else class="no-image">—</span>
            </div>
            <div class="item-category">
              <i :style="{ background: inventory.categoryColor(item.cat) }"></i>{{ item.cat }}
            </div>
            <div class="item-main">
              <strong>{{ inventory.mainValue(item) }}</strong>
              <div class="property-list">
                <span v-for="(value, key) in item.props" :key="key"
                  ><em>{{ key }}</em
                  >{{ value }}</span
                >
              </div>
            </div>
            <div :class="['quantity-control', { low: item.qty <= 5 }]">
              <button aria-label="Retirar dez" @click="inventory.changeQuantity(item, -10)">-10</button>
              <button aria-label="Retirar uma" @click="inventory.changeQuantity(item, -1)">−</button>
              <output>{{ item.qty }}</output>
              <button aria-label="Adicionar uma" @click="inventory.changeQuantity(item, 1)">+</button>
              <button aria-label="Adicionar dez" @click="inventory.changeQuantity(item, 10)">+10</button>
            </div>
            <button class="delete-button" aria-label="Apagar item" @click="inventory.deleteItem(item)">×</button>
          </article>
        </section>
      </main>
      <button class="floating-stock-action" @click="inventory.openItemDialog">
        <span>+</span>
        Adicionar / retirar
      </button>
      <div v-if="inventory.notice" class="toast">{{ inventory.notice }}</div>
      <InventoryModals />
    </div>
  </div>
</template>
