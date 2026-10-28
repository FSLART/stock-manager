import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import App from '../frontend/src/App.vue'

vi.mock('zxing-wasm/writer', () => ({ writeBarcode: async text => ({ svg: `<svg width="1" height="1"><title>${text}</title></svg>` }) }))

// "Parafusos" existe em dois departamentos, com stock independente.
const data = {
  can_edit: true, auth: true,
  user: { id: 2, name: 'Rui', admin: false, department: 'Powertrain' },
  departments: ['Electronics', 'Powertrain', 'Aerodynamics'],
  sections: { Electronics: ['Componentes eletrónicos'], Powertrain: ['Geral', 'Fixação'], Aerodynamics: ['Geral'] },
  categories: [
    { name: 'LEDs', props: ['cor'], image: false, section: 'Componentes eletrónicos', department: 'Electronics' },
    { name: 'Parafusos', props: ['tamanho'], image: false, section: 'Fixação', department: 'Powertrain' },
    { name: 'Parafusos', props: ['tamanho'], image: false, section: 'Geral', department: 'Aerodynamics' },
  ],
  items: [
    { id: 1, cat: 'LEDs', props: { cor: 'azul' }, qty: 3, image: '', department: 'Electronics' },
    { id: 2, cat: 'Parafusos', props: { tamanho: 'M3' }, qty: 40, image: '', department: 'Powertrain' },
    { id: 3, cat: 'Parafusos', props: { tamanho: 'M5' }, qty: 7, image: '', department: 'Aerodynamics' },
  ],
}
let wrapper
beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/#/stock')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => structuredClone(data) })))
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })

const chip = name => wrapper.findAll('.department-picker .toggle-chip').find(button => button.text().startsWith(name))

it('opens the member department and keeps same-name categories apart', async () => {
  wrapper = mount(App)
  await flushPromises()
  expect(chip('Powertrain').attributes('aria-pressed')).toBe('true')
  expect(chip('Aerodynamics').text()).toContain('7')
  expect(wrapper.find('.sub').text()).toBe('1 referência · 40 unidades')
  // Sections follow the department order; an empty one is shown to its editors.
  expect(wrapper.findAll('.cat-section button:not(.fold):not(.cat-edit)').map(b => b.text().replace(/\d+$/, '').trim())).toEqual(['Geral', 'Fixação'])
  await chip('Aerodynamics').trigger('click')
  expect(wrapper.find('.sub').text()).toBe('1 referência · 7 unidades')
  expect(wrapper.text()).toContain('M5')
  expect(JSON.parse(localStorage.getItem('stocklart-department'))).toBe('Aerodynamics')
  // Rui is not in Aerodynamics: no editing controls there.
  expect(wrapper.find('button[aria-label="Nova categoria"]').exists()).toBe(false)
  expect(wrapper.find('.new-section').exists()).toBe(false)
})

it('sends the department with stock and section changes', async () => {
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('.new-section').trigger('click')
  await wrapper.find('dialog[aria-labelledby="section-title"] input').setValue('Consumíveis')
  await wrapper.find('dialog[aria-labelledby="section-title"] form').trigger('submit')
  await flushPromises()
  expect(fetch).toHaveBeenCalledWith('/api/sections', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Consumíveis', department: 'Powertrain' }) }))
  vi.stubGlobal('confirm', () => true)
  await wrapper.find('button[aria-label="Editar categoria Parafusos"]').trigger('click')
  await wrapper.find('dialog[aria-labelledby="category-title"] .delete-category').trigger('click')
  await flushPromises()
  expect(fetch).toHaveBeenCalledWith('/api/categories/Parafusos?department=Powertrain', expect.objectContaining({ method: 'DELETE' }))
})

it('shows a useful empty state for a department without stock', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), user: { ...data.user, department: 'Powertrain, Dynamics' }, departments: [...data.departments, 'Dynamics'] }) })
  localStorage.setItem('stocklart-department', JSON.stringify('Dynamics'))
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('.empty').text()).toContain('Dynamics ainda não tem stock')
  expect(wrapper.find('.empty button.primary').text()).toBe('Criar primeira categoria')
})
