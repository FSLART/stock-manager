<script setup>
import { nextTick, ref, watch } from 'vue'
import DrawerLabel from './DrawerLabel.vue'
import { readStored, writeStored } from '../api.js'
import { bluetoothAvailable, forPrinter, HEAD_DOTS, labelCommands, printOverBluetooth, renderLabel, shouldRotate } from '../phomemo.js'
// Impressão na Phomemo M110: mostra cada etiqueta como sai (preto e branco, 203 dpi, já rodada se for preciso)
// e envia-a por Bluetooth, ou descarrega o PNG para a app do telemóvel. Recebe as etiquetas com o SVG do código (svg).
const dialog = ref(null), entries = ref([]), rendered = ref([]), status = ref(''), busy = ref(false)
const bluetooth = bluetoothAvailable()
const settings = ref({ orientation: 'auto', media: 'gaps', ...readStored('stocklart-phomemo', {}) })
watch(settings, value => writeStored('stocklart-phomemo', value), { deep: true })
const orientations = [['auto', 'Automática'], ['normal', 'Como está'], ['rotated', 'Rodada 90°']]
const media = [['gaps', 'Etiquetas com espaço'], ['continuous', 'Rolo contínuo']]
// Cópias das etiquetas sem zoom, fora do ecrã: é delas que sai a imagem.
const sources = []
const fileName = entry => `etiqueta-${(entry.title || 'sem-titulo').replace(/[^\w-]+/g, '-')}`

async function render() {
  await nextTick()
  status.value = ''
  try {
    rendered.value = await Promise.all(entries.value.map(async (entry, index) => {
      const canvas = forPrinter(await renderLabel(sources[index].$el, entry), shouldRotate(entry, settings.value.orientation))
      return { name: fileName(entry), canvas, url: canvas.toDataURL('image/png'), tooWide: canvas.width > HEAD_DOTS }
    }))
  } catch { rendered.value = []; status.value = 'Não foi possível preparar a imagem da etiqueta.' }
}
watch(() => settings.value.orientation, () => { if (entries.value.length) render() })

async function open(list) {
  entries.value = list
  rendered.value = []
  dialog.value.showModal()
  await render()
}
function download() {
  for (const { name, url } of rendered.value) Object.assign(document.createElement('a'), { href: url, download: `${name}.png` }).click()
}
async function print() {
  busy.value = true
  status.value = 'Escolhe a impressora na janela do browser…'
  try {
    await printOverBluetooth(rendered.value.map(({ canvas }) => labelCommands(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height), { media: settings.value.media })))
    status.value = `${rendered.value.length} etiqueta(s) enviada(s) para a impressora.`
  } catch (error) {
    status.value = error.name === 'NotFoundError' ? 'Nenhuma impressora escolhida.' : `Não foi possível imprimir: ${error.message}`
  } finally { busy.value = false }
}
defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="phomemo-dialog" aria-labelledby="phomemo-title">
    <div class="tutorial-head">
      <p class="eyebrow">Impressora de etiquetas</p>
      <button type="button" class="del" aria-label="Fechar" @click="dialog.close()">×</button>
    </div>
    <h2 id="phomemo-title">Phomemo M110</h2>
    <p class="hint">Assim sai na impressora: preto e branco, a 203 dpi, até 55 mm de largura.</p>
    <div>
      <p id="phomemo-orientation" class="editor-label">Orientação</p>
      <div class="toggle-chips" role="group" aria-labelledby="phomemo-orientation">
        <button v-for="[key, name] in orientations" :key="key" type="button" class="toggle-chip" :aria-pressed="settings.orientation === key" @click="settings.orientation = key">{{ name }}</button>
      </div>
    </div>
    <div>
      <p id="phomemo-media" class="editor-label">Papel</p>
      <div class="toggle-chips" role="group" aria-labelledby="phomemo-media">
        <button v-for="[key, name] in media" :key="key" type="button" class="toggle-chip" :aria-pressed="settings.media === key" @click="settings.media = key">{{ name }}</button>
      </div>
    </div>
    <div class="phomemo-previews">
      <figure v-for="entry in rendered" :key="entry.name + entry.url.length">
        <img :src="entry.url" :alt="`${entry.name} como sai na impressora`">
        <figcaption>{{ entry.canvas.width }} × {{ entry.canvas.height }} pontos<span v-if="entry.tooWide" class="phomemo-warn"> · mais larga do que 55 mm: os lados ficam cortados</span></figcaption>
      </figure>
    </div>
    <p v-if="status" class="hint" role="status">{{ status }}</p>
    <div class="location-actions">
      <button type="button" class="primary" :disabled="busy || !rendered.length || !bluetooth" @click="print">Imprimir por Bluetooth</button>
      <button type="button" class="text-button" :disabled="!rendered.length" @click="download">Descarregar PNG</button>
    </div>
    <p class="hint">{{ bluetooth ? 'Liga a impressora; o Chrome mostra-a numa lista para escolher.' : 'Este browser não tem Bluetooth: usa o Chrome ou o Edge no computador ou no Android.' }} O PNG abre-se na app Phomemo do telemóvel.</p>
    <div class="phomemo-sources" aria-hidden="true">
      <DrawerLabel v-for="(entry, index) in entries" :key="index" :ref="component => { sources[index] = component }" :label="entry" :code="entry.svg || ''" />
    </div>
  </dialog>
</template>
