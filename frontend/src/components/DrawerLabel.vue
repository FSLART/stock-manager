<script setup>
import { computed } from 'vue'
import { ICONS, screwDrawing } from '../labelIcons.js'
// Uma etiqueta em milímetros reais, igual na pré-visualização e na impressão.
// code é o SVG gerado pelo zxing; ícones e parafuso vêm de labelIcons.js: nenhum HTML vem do servidor.
const props = defineProps({ label: { type: Object, required: true }, code: { type: String, default: '' } })
// Sem tamanho escolhido, as letras acompanham a altura da etiqueta (CSS).
const style = computed(() => ({
  width: `${props.label.width}mm`, height: `${props.label.height}mm`, '--h': `${props.label.height}mm`,
  ...(props.label.titleSize && { '--title': `${props.label.titleSize}pt` }),
  ...(props.label.fieldSize && { '--value': `${props.label.fieldSize}pt` }),
  ...(framed.value && { '--frame-width': `${props.label.borderWidth}mm`, '--frame-radius': `${props.label.borderRadius || 0}mm`, '--frame-inset': `${props.label.borderInset || 0}mm` }),
}))
const framed = computed(() => Number(props.label.borderWidth) > 0)
const icon = computed(() => ICONS[props.label.icon])
const screw = computed(() => props.label.layout === 'bin' ? screwDrawing(props.label.screw, props.label.title) : '')
</script>

<template>
  <div class="drawer-label" :class="{ bin: label.layout === 'bin', framed }" :style="style">
    <div v-if="label.code" class="drawer-label-code" v-html="code"></div>
    <!-- Caixa: ícones em cima e texto centrado por baixo, como as etiquetas Gridfinity. -->
    <div v-if="label.layout === 'bin'" class="drawer-label-text">
      <div v-if="icon || screw" class="bin-icons">
        <span v-if="icon" class="bin-icon" :title="icon.name" v-html="icon.svg"></span>
        <span v-if="screw" class="bin-screw" v-html="screw"></span>
      </div>
      <strong>{{ label.title || 'Sem título' }}</strong>
      <small v-if="label.fields.some(field => field.value)">{{ label.fields.map(field => field.value).filter(Boolean).join(' · ') }}</small>
    </div>
    <div v-else class="drawer-label-text">
      <strong><span v-if="icon" class="drawer-label-icon" :title="icon.name" v-html="icon.svg"></span>{{ label.title || 'Sem título' }}</strong>
      <dl><div v-for="(field, index) in label.fields" :key="index"><dt>{{ field.name }}</dt><dd>{{ field.value }}</dd></div></dl>
    </div>
  </div>
</template>
