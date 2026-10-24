<script setup>
import { onUnmounted, ref, watch } from 'vue'
const props = defineProps({ url: String })
const canvasBox = ref(null), state = ref('idle'), message = ref('')
// O three.js só é descarregado ao abrir o 3D, como o descodificador das etiquetas.
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm'
const CONTROLS_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js/+esm'
let dispose = () => {}, pollTimer = null

// O servidor converte o STEP numa malha (scripts/step-mesh.cjs); enquanto converte responde 202.
async function fetchMesh() {
  const stem = props.url.match(/([0-9a-f]{32})\.step$/)?.[1]
  if (!stem) throw new Error('Este STEP foi guardado antes do 3D. Volta a anexá-lo para o ver.')
  for (;;) {
    const response = await fetch(`/api/pcb-step/${stem}/mesh`)
    if (response.status !== 202) {
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Não foi possível abrir o modelo 3D.')
      return response.arrayBuffer()
    }
    message.value = 'O servidor está a preparar o modelo 3D. Num STEP grande demora cerca de 2 min, só na primeira vez.'
    await new Promise(done => { pollTimer = setTimeout(done, 5000) })
    if (state.value !== 'loading') return null
  }
}

function readMesh(buffer) {
  const headerLength = new DataView(buffer).getUint32(0, true)
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength)))
  let offset = 4 + headerLength
  return header.map(({ color, positions, indices }) => {
    const group = { color, positions: new Float32Array(buffer, offset, positions) }
    offset += positions * 4
    group.indices = new Uint32Array(buffer, offset, indices)
    offset += indices * 4
    return group
  })
}

async function show() {
  state.value = 'loading'
  message.value = 'A abrir o modelo 3D…'
  try {
    const [THREE, { OrbitControls }, buffer] = await Promise.all([import(/* @vite-ignore */ THREE_URL), import(/* @vite-ignore */ CONTROLS_URL), fetchMesh()])
    if (!buffer || state.value !== 'loading') return
    render(THREE, OrbitControls, readMesh(buffer))
    state.value = 'ready'
  } catch (error) {
    state.value = 'error'
    message.value = error.message?.startsWith('Failed to fetch') ? 'Sem ligação para descarregar o visualizador 3D.' : error.message
  }
}

// Leve: uma malha por cor (poucas chamadas de desenho), sombreamento plano sem normais e só desenha quando a vista muda.
function render(THREE, OrbitControls, groups) {
  const box = canvasBox.value
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  box.append(renderer.domElement)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(getComputedStyle(box).getPropertyValue('--side').trim() || '#181914')
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1e5)
  camera.up.set(0, 0, 1)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.2))
  const light = new THREE.DirectionalLight(0xffffff, 1.6)
  camera.add(light)
  scene.add(camera)
  for (const { color, positions, indices } of groups) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    scene.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: new THREE.Color(...color.map(c => c / 255)), flatShading: true, side: THREE.DoubleSide })))
  }
  const bounds = new THREE.Box3().setFromObject(scene)
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3()).length()
  camera.position.copy(center).add(new THREE.Vector3(0.45, -0.75, 0.75).multiplyScalar(size))
  camera.near = size / 1000
  camera.far = size * 20
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(center)
  const draw = () => renderer.render(scene, camera)
  controls.addEventListener('change', draw)
  const resize = () => {
    renderer.setSize(box.clientWidth, box.clientHeight)
    camera.aspect = box.clientWidth / box.clientHeight
    camera.updateProjectionMatrix()
    draw()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(box)
  controls.update()
  resize()
  dispose = () => {
    observer.disconnect()
    controls.dispose()
    scene.traverse(object => { object.geometry?.dispose(); object.material?.dispose() })
    renderer.dispose()
    renderer.domElement.remove()
  }
}

function close() {
  clearTimeout(pollTimer)
  dispose()
  dispose = () => {}
  state.value = 'idle'
  message.value = ''
}
watch(() => props.url, close)
onUnmounted(close)
</script>

<template>
  <div class="step-viewer" :class="`step-viewer-${state}`">
    <div v-show="state === 'ready'" ref="canvasBox" class="step-canvas" aria-label="Modelo 3D da placa: arrasta para rodar, roda do rato para aproximar"></div>
    <div v-if="state !== 'ready'" class="step-viewer-idle">
      <button v-if="state !== 'loading'" class="primary-button" type="button" @click="show">{{ state === 'error' ? 'Tentar de novo' : 'Ver em 3D' }}</button>
      <p v-if="message" class="hint" :class="{ error: state === 'error' }" role="status">{{ message }}</p>
    </div>
    <button v-else class="text-button step-viewer-close" type="button" @click="close">Fechar 3D</button>
  </div>
</template>
