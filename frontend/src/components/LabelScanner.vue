<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { readBarcodesFromImageData } from 'zxing-wasm/reader'
import { findPart, parseLabel, sharpen } from '../label.js'
import { partNumberOf } from '../stockText.js'
import { readStored, writeStored } from '../api.js'
const props = defineProps({ action: String, items: { type: Array, default: null }, parts: { type: Array, default: () => [] } })
// Uma etiqueta lida com o P/N do catálogo quando ele existe (a Mouser chega a estragar o P/N no código 2D).
function readLabel(text) {
  const found = parseLabel(text)
  const part = found && findPart(found.mpn, props.parts)
  return part ? { ...found, mpn: part.mpn, manufacturer: found.manufacturer || part.manufacturer } : found
}
// O que um código não reconhecido contém, para se perceber porque não serve (controlos visíveis como ·).
const preview = text => String(text).replace(/[\x00-\x1f]/g, '·').slice(0, 70)
const emit = defineEmits(['use'])
const dialog = ref(null), video = ref(null), overlay = ref(null)
const label = ref(null), status = ref(''), camera = ref(false), paused = ref(false), reading = ref(false), photo = ref(''), focus = ref(null)
const FORMATS = ['DataMatrix', 'PDF417']
let stream = null, liveTimer = null, liveTick = 0
// Há webcams que já mandam a imagem espelhada: o texto fica ao contrário e o OCR não o lê. Fica guardado neste navegador.
const mirrored = ref(readStored('stocklart-scanner-mirrored', false) === true)
function toggleMirror() { mirrored.value = !mirrored.value; writeStored('stocklart-scanner-mirrored', mirrored.value) }
// Desenha a imagem no canvas, desvirada se for o vídeo de uma câmara espelhada.
function drawFrame(context, image, width, height) {
  if (mirrored.value && image === video.value) { context.translate(width, 0); context.scale(-1, 1) }
  context.drawImage(image, 0, 0, width, height)
}
// Itens em stock com o P/N lido (pode estar em várias localizações). Sem items (BOM) não se mostra.
const stocked = computed(() => props.items && label.value ? props.items.filter(item => partNumberOf(item).toUpperCase() === label.value.mpn.toUpperCase()) : null)

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
    video.value.srcObject = stream
    camera.value = true
    setUpFocus()
    track()
  } catch { status.value = 'Sem acesso à câmara (é preciso HTTPS e autorização). Podes escolher uma fotografia.' }
}
// As webcams focam a 40–60 cm: perto da etiqueta ficam desfocadas e nenhum descodificador lê o código.
// Se a câmara deixar, liga o foco automático contínuo e mostra um controlo para focar à mão.
function setUpFocus() {
  const [videoTrack] = stream.getVideoTracks()
  const capabilities = videoTrack.getCapabilities?.() ?? {}
  if (capabilities.focusMode?.includes('continuous')) videoTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {})
  const range = capabilities.focusDistance
  focus.value = range?.max > range?.min && capabilities.focusMode?.includes('manual')
    ? { ...range, value: videoTrack.getSettings().focusDistance ?? range.min } : null
}
function setFocus() {
  stream?.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: 'manual', focusDistance: focus.value.value }] }).catch(() => {})
}
function stopCamera() {
  clearTimeout(liveTimer)
  stream?.getTracks().forEach(track => track.stop())
  stream = null
  camera.value = false
  focus.value = null
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
// Lê da imagem em tamanho real (ou ampliada), até 4000 px para não esgotar a memória.
async function pixels(source, zoom = 1) {
  const image = source instanceof Blob ? await createImageBitmap(source) : source
  const width = image.videoWidth || image.width, height = image.videoHeight || image.height
  const scale = Math.min(zoom, 4000 / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  drawFrame(context, image, canvas.width, canvas.height)
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
// Fotografias pouco nítidas (ex. enviadas por WhatsApp) só se leem realçadas ou com outro limiar de preto e branco;
// códigos pequenos numa webcam de 720p só se leem com a imagem ampliada para o dobro. Cada passagem: [zoom, realçar, limiar].
const PASSES = [[1, false, 'LocalAverage'], [1, false, 'GlobalHistogram'], [1, true, 'LocalAverage'], [1, true, 'GlobalHistogram'], [2, true, 'LocalAverage']]
// Com a câmara a correr, uma leitura a cada 300 ms mostra onde está o código, para apontar e focar.
// Cada imagem usa a passagem seguinte, porque as webcams (foco fixo, pouca resolução) muitas vezes só se leem realçadas.
async function track() {
  if (!stream) return
  if (!paused.value && !reading.value && video.value.videoWidth) {
    try {
      const [zoom, sharpened, binarizer] = PASSES[liveTick++ % PASSES.length]
      const image = await pixels(video.value, zoom)
      const codes = await readBarcodesFromImageData(sharpened ? sharpen(image) : image, { formats: FORMATS, textMode: 'Plain', binarizer })
      // Entretanto pode ter sido pausado ou lido: não apaga a caixa da imagem congelada.
      if (!paused.value && !reading.value) {
        drawBoxes(codes, image)
        // Ao encontrar uma etiqueta congela a imagem e mostra os dados, sem ter de carregar em Ler.
        const found = codes.map(code => readLabel(code.text)).find(Boolean)
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
// Sem código 2D com o P/N (etiquetas Comkey, chinesas...), o servidor lê o texto da fotografia (OCR) e compara-o
// com o catálogo. Demora uns 3 s, por isso só corre depois de as passagens de códigos falharem.
async function readText(source) {
  status.value = 'Sem código 2D. A ler o texto da etiqueta…'
  const blob = source instanceof Blob ? source : await new Promise(done => {
    const canvas = document.createElement('canvas')
    canvas.width = source.videoWidth || source.width
    canvas.height = source.videoHeight || source.height
    drawFrame(canvas.getContext('2d'), source, canvas.width, canvas.height)
    canvas.toBlob(done, 'image/jpeg', 0.92)
  })
  const body = new FormData()
  body.append('image', blob, 'etiqueta.jpg')
  const response = await fetch('/api/ocr', { method: 'POST', body })
  if (response.status === 401) throw new Error('Inicia sessão para ler o texto da etiqueta.')
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Não foi possível ler o texto da etiqueta.')
  return data.label
}
// O descodificador (zxing-wasm) só é descarregado na primeira leitura.
async function read(source) {
  reading.value = true
  status.value = 'A ler…'
  label.value = null
  clearBoxes()
  try {
    const images = {}, sharp = {}
    let seen = { codes: [], image: null }
    for (const [zoom, sharpened, binarizer] of PASSES) {
      const image = images[zoom] ||= await pixels(source, zoom)
      // Uma fotografia grande não cresce mais (limite de 4000 px): a passagem ampliada repetiria outra.
      if (zoom > 1 && image.width <= images[1].width) continue
      const codes = await readBarcodesFromImageData(sharpened ? sharp[zoom] ||= sharpen(image) : image, { formats: FORMATS, textMode: 'Plain', binarizer })
      if (codes.length) seen = { codes, image }
      // shortcut: uses the first label found in the image, add a list if people photograph several labels at once.
      label.value = codes.map(code => readLabel(code.text)).find(Boolean) || null
      if (label.value) break
    }
    drawBoxes(seen.codes, seen.image || images[1])
    if (!label.value) {
      try { label.value = await readText(source) } catch (error) { status.value = error.message; return }
    }
    status.value = label.value ? '' : seen.codes.length ? `O código encontrado (a laranja) não é de uma etiqueta de componente, nem reconheci o texto. Lido: «${preview(seen.codes[0].text)}»`
      : 'Não encontrei o código 2D nem reconheci o texto da etiqueta. Aproxima, foca e tenta de novo.'
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
        <video v-show="!photo" ref="video" :class="{ mirrored }" autoplay playsinline muted></video>
        <canvas ref="overlay" aria-hidden="true"></canvas>
      </div>
      <div v-if="camera" class="actions">
        <button type="button" class="ghost" @click="togglePause">{{ paused ? 'Retomar' : 'Pausar' }}</button>
        <button type="button" class="ghost" :aria-pressed="mirrored" @click="toggleMirror">Espelhar</button>
        <button type="button" class="primary" :disabled="reading" @click="readFrame">Ler etiqueta</button>
      </div>
      <label v-if="camera && focus">Foco (perto ↔ longe)
        <input v-model.number="focus.value" type="range" :min="focus.min" :max="focus.max" :step="focus.step || 'any'" @input="setFocus">
      </label>
      <label>{{ camera ? 'Ou escolhe uma fotografia' : 'Fotografia da etiqueta' }} <input type="file" accept="image/*" @change="readPhoto"></label>
      <p v-if="status" class="hint" :class="{ error: !reading }" role="status">{{ status }}</p>
      <template v-if="label">
        <dl class="label-data">
          <dt>P/N</dt><dd>{{ label.mpn }}</dd>
          <template v-if="label.manufacturer"><dt>Fabricante</dt><dd>{{ label.manufacturer }}</dd></template>
          <template v-if="label.order"><dt>Encomenda</dt><dd>{{ label.order }}</dd></template>
          <template v-if="label.invoice"><dt>Fatura</dt><dd>{{ label.invoice }}</dd></template>
          <template v-if="label.country"><dt>Origem</dt><dd>{{ label.country }}</dd></template>
          <template v-if="stocked"><dt>Em stock</dt><dd>{{ stocked.length ? `${stocked.reduce((sum, item) => sum + item.qty, 0)} un.` : 'Não existe em stock' }}<template v-for="item in stocked.filter(item => item.location)" :key="item.id"> · {{ item.qty }} em {{ item.location }}</template></dd></template>
        </dl>
        <p v-if="label.ocr" class="hint">Lido pelo texto da etiqueta (sem código 2D). Confirma o P/N e a quantidade.</p>
        <label>Quantidade <input v-model.number="label.qty" type="number" min="1" step="1" required></label>
      </template>
      <div class="actions"><button type="button" class="ghost" @click="dialog.close()">Cancelar</button><button class="primary" :disabled="!label">{{ action }}</button></div>
    </form>
  </dialog>
</template>
