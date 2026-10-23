<script setup>
import { onUnmounted, ref } from 'vue'
import { BarcodeDetector } from 'barcode-detector/ponyfill'
import { parseLabel } from '../label.js'
defineProps({ action: String })
const emit = defineEmits(['use'])
const dialog = ref(null), video = ref(null)
const label = ref(null), status = ref(''), camera = ref(false), paused = ref(false), reading = ref(false)
let stream = null, detector = null

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } })
    video.value.srcObject = stream
    camera.value = true
  } catch { status.value = 'Sem acesso à câmara (é preciso HTTPS e autorização). Podes escolher uma fotografia.' }
}
function stopCamera() {
  stream?.getTracks().forEach(track => track.stop())
  stream = null
  camera.value = false
}
function togglePause() {
  if (paused.value) video.value.play()
  else video.value.pause()
  paused.value = !paused.value
}
// Fotografias pequenas (ex. enviadas por WhatsApp) só se leem ampliadas; até 4000 px para não esgotar a memória.
async function enlarged(source) {
  const image = source instanceof Blob ? await createImageBitmap(source) : source
  const width = image.videoWidth || image.width, height = image.videoHeight || image.height
  const scale = Math.min(2, 4000 / Math.max(width, height))
  if (scale <= 1) return null
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}
// O descodificador (zxing-wasm) só é descarregado na primeira leitura.
async function read(source) {
  reading.value = true
  status.value = 'A ler…'
  try {
    detector ||= new BarcodeDetector({ formats: ['data_matrix', 'code_128'] })
    // shortcut: merges every code in the image into one label, add a list if people photograph several labels at once.
    const labelIn = async image => parseLabel((await detector.detect(image)).map(code => code.rawValue))
    label.value = await labelIn(source)
    if (!label.value) {
      const bigger = await enlarged(source)
      if (bigger) label.value = await labelIn(bigger)
    }
    status.value = label.value ? '' : 'Não encontrei o P/N na etiqueta. Aproxima, foca e tenta de novo.'
  } catch { status.value = 'Não foi possível ler a imagem. Verifica a ligação à Internet e tenta de novo.' }
  finally { reading.value = false }
}
// Ler congela a imagem, para se ver exatamente o que foi lido.
function readFrame() {
  if (!paused.value) togglePause()
  read(video.value)
}
function readPhoto(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (file) read(file)
}
function open() {
  label.value = null
  status.value = ''
  paused.value = false
  dialog.value.showModal()
  startCamera()
}
function use() {
  emit('use', { ...label.value, qty: Number(label.value.qty) || 1 })
  dialog.value.close()
}
onUnmounted(stopCamera)
defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="scanner-dialog" aria-labelledby="scanner-title" @close="stopCamera">
    <form @submit.prevent="use">
      <h2 id="scanner-title">Ler etiqueta</h2>
      <video v-show="camera" ref="video" class="scanner-video" autoplay playsinline muted></video>
      <div v-if="camera" class="actions">
        <button type="button" class="ghost" @click="togglePause">{{ paused ? 'Retomar' : 'Pausar' }}</button>
        <button type="button" class="primary" :disabled="reading" @click="readFrame">Ler etiqueta</button>
      </div>
      <label>{{ camera ? 'Ou escolhe uma fotografia' : 'Fotografia da etiqueta' }} <input type="file" accept="image/*" @change="readPhoto"></label>
      <p v-if="status" class="hint" :class="{ error: !reading }" role="status">{{ status }}</p>
      <template v-if="label">
        <dl class="label-data">
          <dt>P/N</dt><dd>{{ label.mpn }}</dd>
          <template v-if="label.manufacturer"><dt>Fabricante</dt><dd>{{ label.manufacturer }}</dd></template>
          <template v-if="label.order"><dt>Encomenda</dt><dd>{{ label.order }}</dd></template>
          <template v-if="label.invoice"><dt>Fatura</dt><dd>{{ label.invoice }}</dd></template>
          <template v-if="label.country"><dt>Origem</dt><dd>{{ label.country }}</dd></template>
        </dl>
        <label>Quantidade <input v-model.number="label.qty" type="number" min="1" step="1" required></label>
      </template>
      <div class="actions"><button type="button" class="ghost" @click="dialog.close()">Cancelar</button><button class="primary" :disabled="!label">{{ action }}</button></div>
    </form>
  </dialog>
</template>
