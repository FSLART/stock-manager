<script setup>
import { ref } from 'vue'
import { writeBarcode } from 'zxing-wasm/writer'
import DrawerLabel from './DrawerLabel.vue'
import TutorialDialog from './TutorialDialog.vue'
import { ICONS } from '../labelIcons.js'
// Tutorial das etiquetas, um passo de cada vez. As imagens são etiquetas de exemplo desenhadas pelo mesmo componente
// da impressão, para nunca ficarem diferentes do que sai na impressora.
const shell = ref(null), code = ref('')
const example = extra => ({ title: '', fields: [], code: '', location: '', width: 55, height: 12, icon: '', item: null, layout: 'bin', screw: '', titleSize: null, fieldSize: null, ...extra })
const drawer = example({ layout: 'drawer', title: 'Armário 1', height: 25, code: 'DataMatrix', fields: [{ name: 'Modelo', value: 'F1' }, { name: 'Posição', value: 'D20' }] })
const screw = title => example({ title, icon: 'drive-phillips', screw: 'screw-countersunk' })
const resistor = example({ title: '10 kΩ', height: 15, icon: 'resistor', fields: [{ name: 'Encapsulamento', value: '0603' }, { name: 'Tolerância', value: '1%' }] })
const steps = [
  { key: 'start', title: 'Começa por um modelo', text: 'Carrega em + Gaveta, + Parafuso ou + Eletrónica. Cada um já vem preenchido com um exemplo; depois mudas o que quiseres.' },
  { key: 'layout', title: 'Gaveta ou caixa', text: 'Em Formato escolhes o desenho. Gaveta: código à esquerda, título e campos à direita. Caixa: ícones em cima e texto ao centro, ideal para caixas pequenas.' },
  { key: 'text', title: 'Título, campos e letra', text: 'Escreve o título e junta até 4 campos, como Modelo ou Posição. Em Letra (pt) mudas o tamanho do texto; vazio fica automático.' },
  { key: 'screw', title: 'Parafusos desenhados', text: 'No formato caixa escolhe a cabeça em Desenho do parafuso. O tamanho vem do título: M3x10 sai curto, M5x30 sai comprido.' },
  { key: 'icons', title: 'Ícones', text: 'Escolhe um ícone na biblioteca: eletrónica, cabeças de parafuso, encaixes, porcas e anilhas. Na gaveta aparece antes do título; na caixa, em cima.' },
  { key: 'code', title: 'Código e ligações', text: 'Com Data Matrix ou QR, quem ler o código com o telemóvel abre o inventário na gaveta certa. Liga uma Localização, ou um Componente: aí a etiqueta preenche-se sozinha com os dados dele.' },
  { key: 'many', title: 'Várias de uma vez', text: 'Numa etiqueta nova carrega em Várias de uma vez e escreve um título por linha. Sai uma etiqueta por linha, iguais em tudo o resto. Ótimo para parafusos de vários tamanhos.' },
  { key: 'print', title: 'Guardar e imprimir', text: 'Guardar volta à lista e a etiqueta fica para toda a equipa. Imprimir abre a impressão e cada etiqueta sai no seu tamanho. Usa o Chrome ou o Brave e escolhe a impressora de etiquetas.' },
]

async function open() {
  shell.value.open()
  if (code.value) return
  const result = await writeBarcode('https://stocklart.pt/#/stock', { format: 'DataMatrix' }).catch(() => null)
  code.value = result?.svg?.replace(/<svg width="(\d+)" height="(\d+)"/, '<svg viewBox="0 0 $1 $2" shape-rendering="crispEdges"') || ''
}
defineExpose({ open })
</script>

<template>
  <!-- Cada imagem é um pedaço do formulário, igual ao verdadeiro, com setas para o que se usa, e a etiqueta que dá. -->
  <TutorialDialog ref="shell" :steps="steps">
    <template #default="{ step: key }">
      <template v-if="key === 'start'">
        <div class="tut-form">
          <div class="tut-row"><span class="text-button">← Todas as etiquetas</span></div>
          <div class="tut-row"><span class="text-button">+ Gaveta</span><span class="text-button">+ Parafuso</span><span class="text-button">+ Eletrónica</span></div>
          <b class="tut-arrow">↑ Carrega num destes para começar</b>
        </div>
        <div class="tutorial-stack"><DrawerLabel :label="drawer" :code="code" /><DrawerLabel :label="screw('M3x10')" /><DrawerLabel :label="resistor" /></div>
      </template>
      <template v-else-if="key === 'layout'">
        <div class="tut-form">
          <span class="tut-label">Formato</span>
          <div class="tut-row"><span class="toggle-chip">Gaveta</span><span class="toggle-chip" aria-pressed="true">Caixa (ícones em cima)</span></div>
          <b class="tut-arrow">↑ Escolhe o desenho da etiqueta</b>
        </div>
        <div class="tutorial-stack">
          <figure><DrawerLabel :label="drawer" :code="code" /><figcaption>Gaveta</figcaption></figure>
          <figure><DrawerLabel :label="resistor" /><figcaption>Caixa</figcaption></figure>
        </div>
      </template>
      <template v-else-if="key === 'text'">
        <div class="tut-form">
          <div class="tut-row tut-pair"><span><span class="tut-label">Título</span><span class="tut-input">Armário 1</span></span><span><span class="tut-label">Letra (pt)</span><span class="tut-input tut-small">18</span></span></div>
          <b class="tut-arrow">↑ O título e o tamanho da letra</b>
          <span class="tut-label">Campos</span>
          <div class="tut-row"><span class="tut-input">Modelo</span><span class="tut-input">F1</span></div>
          <div class="tut-row"><span class="tut-input">Posição</span><span class="tut-input">D20</span><b class="tut-arrow">← nome e valor</b></div>
          <div class="tut-row"><span class="text-button">+ Campo</span><b class="tut-arrow">← até 4</b></div>
        </div>
        <DrawerLabel :label="{ ...drawer, code: '', titleSize: 18 }" />
      </template>
      <template v-else-if="key === 'screw'">
        <div class="tut-form">
          <span class="tut-label">Título</span>
          <div class="tut-row"><span class="tut-input">M5x30</span><b class="tut-arrow">← o tamanho vem daqui</b></div>
          <span class="tut-label">Desenho do parafuso</span>
          <div class="tut-row"><span v-for="key in ['screw-socket', 'screw-countersunk', 'screw-button', 'bolt']" :key="key" class="label-icon" :aria-pressed="key === 'screw-countersunk'" v-html="ICONS[key].svg"></span></div>
          <b class="tut-arrow">↑ Escolhe a cabeça</b>
        </div>
        <div class="tutorial-stack"><DrawerLabel :label="screw('M3x10')" /><DrawerLabel :label="screw('M5x30')" /></div>
      </template>
      <template v-else-if="key === 'icons'">
        <div class="tut-form">
          <span class="tut-label">Ícone</span>
          <div class="tut-row"><span v-for="key in ['resistor', 'capacitor', 'drive-torx', 'nut', 'washer']" :key="key" class="label-icon" :aria-pressed="key === 'nut'" v-html="ICONS[key].svg"></span></div>
          <b class="tut-arrow">↑ Carrega no ícone que queres</b>
        </div>
        <div class="tutorial-stack"><DrawerLabel :label="{ ...drawer, code: '', title: 'Porcas M3', icon: 'nut' }" /><DrawerLabel :label="example({ title: 'Porcas M3', icon: 'nut' })" /></div>
      </template>
      <template v-else-if="key === 'code'">
        <div class="tut-form">
          <span class="tut-label">Código</span>
          <div class="tut-row"><span class="toggle-chip" aria-pressed="true">Data Matrix</span><span class="toggle-chip">QR</span><span class="toggle-chip">Sem código</span></div>
          <span class="tut-label">Componente ligado</span>
          <div class="tut-row"><span class="tut-input">Porcas · M3</span><b class="tut-arrow">← preenche a etiqueta</b></div>
          <span class="tut-label">Localização ligada</span>
          <div class="tut-row"><span class="tut-input">Armário 1</span><b class="tut-arrow">← o código abre esta gaveta</b></div>
        </div>
        <div class="tutorial-stack"><DrawerLabel :label="drawer" :code="code" /><span class="tutorial-phone">Ler o código abre o inventário em <b>Armário 1</b></span></div>
      </template>
      <template v-else-if="key === 'many'">
        <div class="tut-form">
          <span class="tut-label">Títulos, um por linha</span>
          <div class="tut-row"><pre class="tutorial-lines">M3x10
M4x16
M5x20</pre><b class="tut-arrow">← um por linha</b></div>
          <div class="tut-row"><span class="toggle-chip" aria-pressed="true">Várias de uma vez</span><b class="tut-arrow">← liga aqui</b></div>
          <div class="tut-row"><span class="primary">Guardar 3</span></div>
        </div>
        <div class="tutorial-stack"><DrawerLabel v-for="title in ['M3x10', 'M4x16', 'M5x20']" :key="title" :label="screw(title)" /></div>
      </template>
      <template v-else>
        <div class="tut-form">
          <div class="tut-row"><span class="primary">Guardar</span><b class="tut-arrow">← fica para toda a equipa</b></div>
          <div class="tut-row"><span class="text-button">Imprimir</span><b class="tut-arrow">← só esta</b></div>
          <div class="tut-row"><span class="text-button">Imprimir todas</span><b class="tut-arrow">← na lista, todas de uma vez</b></div>
        </div>
        <div class="tutorial-stack"><DrawerLabel :label="screw('M3x10')" /><DrawerLabel :label="drawer" :code="code" /></div>
      </template>
    </template>
  </TutorialDialog>
</template>
