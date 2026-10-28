<script setup>
import { inject, ref } from 'vue'
// Só para admins: escolhe a vista (visitante, ou cargo + departamentos) e o servidor passa a responder como essa pessoa.
const auth = inject('auth')
const role = ref(auth.preview?.role || (auth.preview?.guest ? 'guest' : 'Member'))
const departments = ref(auth.preview?.department ? auth.preview.department.split(', ') : [])
const toggle = name => { departments.value = departments.value.includes(name) ? departments.value.filter(d => d !== name) : [...departments.value, name] }
const apply = () => auth.viewAs(role.value === 'guest' ? { guest: true } : { role: role.value, departments: departments.value })
</script>

<template>
  <div class="view-as-picker">
    <p id="view-as-role" class="editor-label">Ver como</p>
    <div class="toggle-chips compact" role="group" aria-labelledby="view-as-role">
      <button type="button" class="toggle-chip" :aria-pressed="role === 'guest'" @click="role = 'guest'">Visitante sem sessão</button>
      <button v-for="name in auth.roles" :key="name" type="button" class="toggle-chip" :aria-pressed="role === name" @click="role = name">{{ name }}</button>
    </div>
    <template v-if="role !== 'guest'">
      <p id="view-as-departments" class="editor-label">Departamentos <span>{{ departments.length ? '' : 'nenhum' }}</span></p>
      <div class="toggle-chips compact" role="group" aria-labelledby="view-as-departments">
        <button v-for="name in auth.departments" :key="name" type="button" class="toggle-chip" :aria-pressed="departments.includes(name)" @click="toggle(name)">{{ name }}</button>
      </div>
    </template>
    <button type="button" class="primary" @click="apply">Ver o site assim</button>
  </div>
</template>
