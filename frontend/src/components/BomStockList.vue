<script setup>
import { computed, ref } from 'vue'
// rows vêm de stockCheck (pcbStock.js); details são linhas extra do BOM mostradas ao abrir a linha.
const props = defineProps({ rows: Array, label: String })
const STATUS = { missing: 'Em falta', short: 'Insuficiente', check: 'Verificar', ok: 'OK' }
const filter = ref('')
// Uma linha por componente e o resto ao abrir: um BOM de 60 linhas cabe em pouco mais de um ecrã.
const keyed = computed(() => props.rows.map((row, key) => ({ ...row, key })))
const counts = computed(() => Object.keys(STATUS).map(status => [status, props.rows.filter(row => row.status === status).length]).filter(([, count]) => count))
const shown = computed(() => filter.value ? keyed.value.filter(row => row.status === filter.value) : keyed.value)
</script>

<template>
  <div class="bom-table">
    <div class="bom-filters" role="group" :aria-label="`Filtrar ${label} pelo estado do stock`">
      <button type="button" class="bom-filter" :aria-pressed="!filter" @click="filter = ''">Todos {{ rows.length }}</button>
      <button
        v-for="[status, count] in counts"
        :key="status"
        type="button"
        class="bom-filter stock-status"
        :class="`stock-${status}`"
        :aria-pressed="filter === status"
        @click="filter = filter === status ? '' : status"
      >{{ count }} {{ STATUS[status] }}</button>
    </div>
    <div class="bom-line bom-line-head" aria-hidden="true">
      <span>Estado</span><span>Componente</span><span>Referências</span><span>Stock / precisos</span>
    </div>
    <ul class="bom-lines" :aria-label="label">
      <li v-for="row in shown" :key="row.key">
        <details>
          <summary class="bom-line">
            <span class="stock-status" :class="`stock-${row.status}`">{{ STATUS[row.status] }}</span>
            <strong :title="row.name">{{ row.name }}</strong>
            <span class="bom-line-refs">{{ row.references.join(', ') }}</span>
            <span class="bom-line-qty"><b>{{ row.onHand }}</b> / {{ row.needed }}</span>
          </summary>
          <dl class="bom-line-detail">
            <template v-if="row.references.length"><dt>Referências</dt><dd>{{ row.references.join(', ') }}</dd></template>
            <template v-if="row.locations"><dt>Localização</dt><dd>{{ row.locations }}</dd></template>
            <template v-for="[term, text] in row.details || []" :key="term"><dt>{{ term }}</dt><dd>{{ text }}</dd></template>
            <template v-if="row.variants">
              <dt>Valores</dt>
              <dd>
                <ul class="bom-variants">
                  <li v-for="variant in row.variants" :key="variant.name">
                    {{ variant.name }} <b>{{ variant.onHand }}</b> em stock<template v-if="variant.locations"> · {{ variant.locations }}</template>
                  </li>
                </ul>
                <p v-if="row.status === 'check'" class="hint">O BOM junta estes valores numa linha sem dizer quantos são de cada. Confirma no esquema.</p>
              </dd>
            </template>
          </dl>
        </details>
      </li>
    </ul>
    <p v-if="!shown.length" class="hint">Nenhum componente com este estado.</p>
  </div>
</template>
