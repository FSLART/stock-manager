<script setup>
import { ref } from 'vue'
import { scanPhoto } from 'home-images'
import TutorialDialog from './TutorialDialog.vue'
// Tutorial do inventário. Cada imagem é um pedaço do ecrã verdadeiro com setas; a leitura usa a foto de uma etiqueta Mouser real.
const shell = ref(null)
const steps = [
  { key: 'search', title: 'Procurar componentes', text: 'Escreve na pesquisa o que procuras (valor, P/N, localização…) ou escolhe uma categoria à esquerda. A lista mostra quantas referências e unidades há.' },
  { key: 'filters', title: 'Filtrar a lista', text: 'Em Filtros escolhes só o que está em stock, o que está a acabar, uma gaveta ou as propriedades da categoria. Limpar filtros volta a mostrar tudo.' },
  { key: 'scan', title: 'Ler a etiqueta da encomenda', text: 'Carrega em Ler etiqueta e aponta a câmara ao código 2D da etiqueta da Mouser, DigiKey ou TE, ou escolhe uma fotografia. Ele lê o P/N, o fabricante e a quantidade.' },
  { key: 'confirm', title: 'Confirmar e adicionar', text: 'Confere o que foi lido e a quantidade, e carrega em Adicionar ao stock. Abre o formulário já preenchido com a peça do catálogo; só falta guardar.' },
  { key: 'add', title: 'Adicionar à mão', text: 'Sem etiqueta, carrega em Adicionar, escolhe a categoria, preenche as propriedades e a quantidade. Se a peça já existe, a quantidade soma-se.' },
  { key: 'qty', title: 'Tirar e pôr unidades', text: 'Em cada linha, − e + tiram ou põem 1, −10 e +10 tiram ou põem 10. Editar muda o componente; ✕ apaga-o. Tudo fica nos Movimentos e pode ser desfeito.' },
  { key: 'move', title: 'Arrumar numa gaveta', text: 'Marca os componentes, escreve a gaveta na barra que aparece e carrega em Mover para aqui. Depois, em Etiquetas, fazes a etiqueta para essa gaveta.' },
]
defineExpose({ open: () => shell.value.open() })
</script>

<template>
  <TutorialDialog ref="shell" :steps="steps">
    <template #default="{ step: key }">
      <div v-if="key === 'search'" class="tut-form">
        <div class="tut-row"><span class="tut-input tut-wide">⌕ 10k</span><b class="tut-arrow">← escreve o que procuras</b></div>
        <span class="tut-label">Categorias</span>
        <div class="tut-row"><span class="toggle-chip">Tudo</span><span class="toggle-chip" aria-pressed="true">Resistências</span><span class="toggle-chip">Condensadores</span></div>
        <b class="tut-arrow">↑ ou escolhe uma categoria</b>
        <div class="tut-row"><strong>Resistências</strong><span class="sub">80 referências · 4200 unidades</span></div>
      </div>
      <div v-else-if="key === 'filters'" class="tut-form">
        <div class="tut-row"><span class="text-button">Filtros ⌄</span><b class="tut-arrow">← abre os filtros</b></div>
        <div class="tut-row"><span class="tut-input">Pouco stock (1–5) ▾</span><b class="tut-arrow">← o que está a acabar</b></div>
        <div class="tut-row"><span class="tut-input">Caixa 1 ▾</span><b class="tut-arrow">← só uma gaveta</b></div>
        <div class="tut-row"><span class="text-button">✕ Limpar filtros</span><b class="tut-arrow">← mostra tudo outra vez</b></div>
      </div>
      <template v-else-if="key === 'scan'">
        <div class="tut-form">
          <div class="tut-row"><span class="text-button">Importar CSV</span><span class="text-button tut-hot">Ler etiqueta</span><span class="primary">Adicionar</span></div>
          <b class="tut-arrow">↑ carrega em Ler etiqueta</b>
          <span class="tut-label">Na janela que abre</span>
          <div class="tut-row"><span class="text-button">Ler etiqueta</span><b class="tut-arrow">← com a câmara</b></div>
          <div class="tut-row"><span class="tut-input">Escolher fotografia</span><b class="tut-arrow">← ou uma foto</b></div>
        </div>
        <div class="tut-photo">
          <img :src="scanPhoto" alt="">
          <span class="tut-spot"></span>
          <b class="tut-photo-note">Código 2D →</b>
        </div>
      </template>
      <div v-else-if="key === 'confirm'" class="tut-form">
        <span class="tut-label">Lido da etiqueta</span>
        <dl class="tut-read">
          <dt>P/N</dt><dd>MIC6270YM5-TR</dd><dt>Fabricante</dt><dd>Microchip</dd>
          <dt>Encomenda</dt><dd>39759441</dd><dt>Fatura</dt><dd>091314939</dd><dt>Origem</dt><dd>TH</dd>
        </dl>
        <span class="tut-label">Quantidade</span>
        <div class="tut-row"><span class="tut-input tut-small">20</span><b class="tut-arrow">← confere a quantidade</b></div>
        <div class="tut-row"><span class="primary">Adicionar ao stock</span><b class="tut-arrow">← abre o formulário preenchido</b></div>
      </div>
      <div v-else-if="key === 'add'" class="tut-form">
        <div class="tut-row"><span class="primary">Adicionar</span><b class="tut-arrow">← no topo do inventário</b></div>
        <span class="tut-label">Categoria</span>
        <div class="tut-row"><span class="tut-input">Resistências ▾</span><b class="tut-arrow">← escolhe a categoria</b></div>
        <span class="tut-label">Valor · Tamanho</span>
        <div class="tut-row"><span class="tut-input tut-small">10 kΩ</span><span class="tut-input tut-small">0603</span><b class="tut-arrow">← as propriedades</b></div>
        <span class="tut-label">Quantidade</span>
        <div class="tut-row"><span class="tut-input tut-small">100</span><b class="tut-arrow">← quantas entram</b></div>
        <span class="primary">Adicionar ao stock</span>
      </div>
      <div v-else-if="key === 'qty'" class="tut-form">
        <div class="tut-row"><strong>10 kΩ</strong><span class="sub">Resistências · 0603 · Caixa 1</span></div>
        <div class="tut-row"><span class="tut-key">−10</span><span class="tut-key">−</span><strong class="tut-count">20</strong><span class="tut-key">+</span><span class="tut-key">+10</span></div>
        <b class="tut-arrow">↑ tira ou põe 1 ou 10 unidades</b>
        <div class="tut-row"><span class="text-button">Editar</span><span class="tut-key">✕</span><b class="tut-arrow">← muda ou apaga o componente</b></div>
      </div>
      <div v-else class="tut-form">
        <div class="tut-row"><span class="tut-check">✓</span><span>10 kΩ · 0603</span></div>
        <div class="tut-row"><span class="tut-check">✓</span><span>100 nF · 0603</span><b class="tut-arrow">← marca os componentes</b></div>
        <div class="tut-row"><strong>2 selecionados</strong><span class="tut-input">Caixa 1</span></div>
        <b class="tut-arrow">↑ escreve a gaveta</b>
        <div class="tut-row"><span class="primary">Mover para aqui</span><b class="tut-arrow">← arruma-os lá</b></div>
      </div>
    </template>
  </TutorialDialog>
</template>
