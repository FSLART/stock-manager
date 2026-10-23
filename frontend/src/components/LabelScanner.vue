<script setup>
import { onUnmounted, ref } from 'vue'
import { readBarcodesFromImageData } from 'zxing-wasm/reader'
import { parseLabel, sharpen } from '../label.js'
defineProps({ action: String })
const emit = defineEmits(['use'])
const dialog = ref(null), video = ref(null), overlay = ref(null)
const label = ref(null), status = ref(''), camera = ref(false), paused = ref(false), reading = ref(false), photo = ref('')
const FORMATS = ['DataMatrix', 'PDF417']
let stream = null, liveTimer = null

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } })
    video.value.srcObject = stream
    camera.value = true
    track()
  } catch { status.value = 'Sem acesso à câmara (é preciso HTTPS e autorização). Podes escolher uma fotografia.' }
}
function stopCamera() {
  clearTimeout(liveTimer)
  stream?.getTracks().forEach(track => track.stop())
  stream = null
  camera.value = false
}
function clearPhoto() {
  if (photo.value) URL.revokeObjectURL(photo.value)
  photo.value = ''
}
function togglePause() {
  // Retomar recomeça: sem limpar, a etiqueta anterior ficava à vista enquanto se procura a próxima.
  if (paused.value) { clearPhoto(); clearBoxes(); label.value = null; status.value = ''; video.value.play() }
  else video.value.pause()
  paused.value = !paused.value
}
// Lê da imagem em tamanho real, até 4000 px para não esgotar a memória.
async function pixels(source) {
  const image = source instanceof Blob ? await createImageBitmap(source) : source
  const width = image.videoWidth || image.width, height = image.videoHeight || image.height
  const scale = Math.min(1, 4000 / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}
// Contorna cada código encontrado: verde com o P/N se é uma etiqueta, laranja se é outro código.
// O canvas tem o tamanho da imagem lida e o CSS estica-o por cima do vídeo ou da fotografia.
function drawBoxes(codes, { width, height }) {
  const canvas = overlay.value
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  const line = Math.max(3, width / 250)
  context.lineWidth = line
  context.font = `bold ${line * 6}px sans-serif`
  for (const code of codes) {
    const { topLeft, topRight, bottomRight, bottomLeft } = code.position
    const found = parseLabel(code.text)
    context.strokeStyle = context.fillStyle = found ? '#22c55e' : '#f59e0b'
    context.beginPath()
    for (const point of [topLeft, topRight, bottomRight, bottomLeft]) context.lineTo(point.x, point.y)
    context.closePath()
    context.stroke()
    if (!found) continue
    // O P/N fica num fundo escuro por cima da caixa, para se ler sobre o texto da etiqueta.
    const x = Math.min(topLeft.x, bottomLeft.x), y = Math.max(line * 8, Math.min(topLeft.y, topRight.y) - line * 2)
    context.fillStyle = '#000000cc'
    context.fillRect(x, y - line * 6.5, context.measureText(found.mpn).width + line * 2, line * 8)
    context.fillStyle = '#22c55e'
    context.fillText(found.mpn, x + line, y)
  }
}
const clearBoxes = () => overlay.value?.getContext('2d').clearRect(0, 0, overlay.value.width, overlay.value.height)
// Com a câmara a correr, uma leitura rápida a cada 300 ms mostra onde está o código, para apontar e focar.
async function track() {
  if (!stream) return
  if (!paused.value && !reading.value && video.value.videoWidth) {
    try {
      const image = await pixels(video.value)
      const codes = await readBarcodesFromImageData(image, { formats: FORMATS, textMode: 'Plain' })
      // Entretanto pode ter sido pausado ou lido: não apaga a caixa da imagem congelada.
      if (!paused.value && !reading.value) {
        drawBoxes(codes, image)
        // Ao encontrar uma etiqueta congela a imagem e mostra os dados, sem ter de carregar em Ler.
        const found = codes.map(code => parseLabel(code.text)).find(Boolean)
        if (found) {
          togglePause()
          label.value = found
          status.value = ''
        }
      }
    } catch { /* Sem descodificador (offline): a leitura com o botão mostra o erro. */ }
  }
  liveTimer = setTimeout(track, 300)
}
// Fotografias pouco nítidas (ex. enviadas por WhatsApp) só se leem realçadas ou com outro limiar de preto e branco.
const PASSES = [[false, 'LocalAverage'], [false, 'GlobalHistogram'], [true, 'LocalAverage'], [true, 'GlobalHistogram']]
// O descodificador (zxing-wasm) só é descarregado na primeira leitura.
async function read(source) {
  reading.value = true
  status.value = 'A ler…'
  label.value = null
  clearBoxes()
  try {
    const image = await pixels(source)
    let sharp = null, seen = []
    for (const [sharpened, binarizer] of PASSES) {
      if (sharpened) sharp ||= sharpen(image)
      const codes = await readBarcodesFromImageData(sharpened ? sharp : image, { formats: FORMATS, textMode: 'Plain', binarizer })
      if (codes.length) seen = codes
      // shortcut: uses the first label found in the image, add a list if people photograph several labels at once.
      label.value = codes.map(code => parseLabel(code.text)).find(Boolean) || null
      if (label.value) break
    }
    drawBoxes(seen, image)
    status.value = label.value ? '' : seen.length ? 'O código encontrado (a laranja) não é de uma etiqueta de componente.'
      : 'Não encontrei o código 2D da etiqueta. Aproxima, foca e tenta de novo.'
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
  if (!file) return
  if (camera.value && !paused.value) togglePause()
  clearPhoto()
  photo.value = URL.createObjectURL(file)
  read(file)
}
function open() {
  label.value = null
  status.value = ''
  paused.value = false
  clearPhoto()
  clearBoxes()
  dialog.value.showModal()
  startCamera()
}
function close() {
  stopCamera()
  clearPhoto()
}
function use() {
  emit('use', { ...label.value, qty: Number(label.value.qty) || 1 })
  dialog.value.close()
}
onUnmounted(close)
defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="scanner-dialog" aria-labelledby="scanner-title" @close="close">
    <form @submit.prevent="use">
      <h2 id="scanner-title">Ler etiqueta</h2>
      <div v-show="camera || photo" class="scanner-view">
        <img v-if="photo" :src="photo" alt="Fotografia da etiqueta">
        <video v-show="!photo" ref="video" autoplay playsinline muted></video>
        <canvas ref="overlay" aria-hidden="true"></canvas>
      </div>
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
