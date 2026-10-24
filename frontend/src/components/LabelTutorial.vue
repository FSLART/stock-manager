<script setup>
import { computed, ref } from 'vue'
import { writeBarcode } from 'zxing-wasm/writer'
import DrawerLabel from './DrawerLabel.vue'
import { ICONS } from '../labelIcons.js'
// Tutorial das etiquetas, um passo de cada vez. As imagens são etiquetas de exemplo desenhadas pelo mesmo componente
// da impressão, para nunca ficarem diferentes do que sai na impressora.
const dialog = ref(null), step = ref(0), code = ref('')
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
const current = computed(() => steps[step.value])

async function open() {
  step.value = 0
  dialog.value.showModal()
  if (code.value) return
  const result = await writeBarcode('https://stocklart.pt/#/stock', { format: 'DataMatrix' }).catch(() => null)
  code.value = result?.svg?.replace(/<svg width="(\d+)" height="(\d+)"/, '<svg viewBox="0 0 $1 $2" shape-rendering="crispEdges"') || ''
}
defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="tutorial-dialog" aria-labelledby="tutorial-title">
    <div class="tutorial-head">
      <p class="eyebrow">Passo {{ step + 1 }} de {{ steps.length }}</p>
      <button type="button" class="del" aria-label="Fechar tutorial" @click="dialog.close()">×</button>
    </div>
    <h2 id="tutorial-title">{{ current.title }}</h2>
    <!-- Imagens do passo: etiquetas de exemplo e cópias dos botões, só para ver (aria-hidden). -->
    <div class="tutorial-figure" aria-hidden="true">
      <template v-if="current.key === 'start'">
        <div class="tutorial-buttons"><span class="text-button">+ Gaveta</span><span class="text-button">+ Parafuso</span><span class="text-button">+ Eletrónica</span></div>
        <DrawerLabel :label="drawer" :code="code" /><DrawerLabel :label="screw('M3x10')" /><DrawerLabel :label="resistor" />
      </template>
      <template v-else-if="current.key === 'layout'">
        <figure><DrawerLabel :label="drawer" :code="code" /><figcaption>Gaveta</figcaption></figure>
        <figure><DrawerLabel :label="resistor" /><figcaption>Caixa</figcaption></figure>
      </template>
      <template v-else-if="current.key === 'text'">
        <figure><DrawerLabel :label="{ ...drawer, code: '' }" /><figcaption>Letra automática</figcaption></figure>
        <figure><DrawerLabel :label="{ ...drawer, code: '', titleSize: 18, fieldSize: 9 }" /><figcaption>Título 18 pt, campos 9 pt</figcaption></figure>
      </template>
      <template v-else-if="current.key === 'screw'">
        <DrawerLabel :label="screw('M3x10')" /><DrawerLabel :label="screw('M5x30')" />
        <DrawerLabel :label="example({ title: 'M4x16', icon: 'drive-hex', screw: 'screw-socket' })" /><DrawerLabel :label="example({ title: 'M6x20', icon: 'drive-hex-head', screw: 'bolt' })" />
      </template>
      <template v-else-if="current.key === 'icons'">
        <div class="tutorial-icons"><span v-for="key in ['resistor', 'capacitor', 'chip', 'screw-countersunk', 'drive-torx', 'nut', 'washer', 'washer-split']" :key="key" v-html="ICONS[key].svg"></span></div>
        <DrawerLabel :label="{ ...drawer, code: '', title: 'Porcas M3', icon: 'nut' }" /><DrawerLabel :label="example({ title: 'Anilhas M4', icon: 'washer' })" />
      </template>
      <template v-else-if="current.key === 'code'">
        <DrawerLabel :label="drawer" :code="code" />
        <span class="tutorial-arrow">→</span>
        <span class="tutorial-phone">Abre o inventário em <b>Armário 1</b></span>
      </template>
      <template v-else-if="current.key === 'many'">
        <pre class="tutorial-lines">M3x10
M4x16
M5x20</pre>
        <span class="tutorial-arrow">→</span>
        <div class="tutorial-stack"><DrawerLabel v-for="title in ['M3x10', 'M4x16', 'M5x20']" :key="title" :label="screw(title)" /></div>
      </template>
      <template v-else>
        <div class="tutorial-buttons"><span class="primary">Guardar</span><span class="text-button">Imprimir</span><span class="text-button">Imprimir todas</span></div>
        <div class="tutorial-stack"><DrawerLabel :label="screw('M3x10')" /><DrawerLabel :label="drawer" :code="code" /></div>
      </template>
    </div>
    <p class="tutorial-text">{{ current.text }}</p>
    <div class="tutorial-nav">
      <button type="button" class="text-button" :disabled="step === 0" @click="step--">Anterior</button>
      <div class="tutorial-dots">
        <button v-for="(item, index) in steps" :key="item.key" type="button" class="tutorial-dot" :aria-current="index === step ? 'step' : undefined" :aria-label="`Passo ${index + 1}: ${item.title}`" @click="step = index"></button>
      </div>
      <button v-if="step < steps.length - 1" type="button" class="primary" autofocus @click="step++">Seguinte</button>
      <button v-else type="button" class="primary" @click="dialog.close()">Concluir</button>
    </div>
  </dialog>
</template>
