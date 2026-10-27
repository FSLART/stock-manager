import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import App from '../frontend/src/App.vue'
import AppNavigation from '../frontend/src/components/AppNavigation.vue'
import { componentValue, describe } from '../frontend/src/stockText.js'

let wrapper
const stock = { auth: true, can_edit: true, user: { id: 3, name: 'Rita Costa', department: 'Powertrain', role: 'Member', admin: false }, categories: [{ name: 'Resistências', props: ['Resistência (Ω)'], section: 'Eletrónica' }], items: [{ id: 1, cat: 'Resistências', props: { 'Resistência (Ω)': '10k' }, qty: 8 }] }
beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => structuredClone(stock) })))
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })
it('gives non-Electronics members direct access to shared tools without promising stock editing', async () => {
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('h1').text()).toBe('Ferramentas da equipa LART')
  for (const path of ['/stock', '/locations', '/labels', '/pcbs', '/harness', '/analog-simulation']) expect(wrapper.find(`main a[href="#${path}"]`).exists()).toBe(true)
  expect(wrapper.find('main').text()).not.toMatch(/Gerir categorias|Adicionar material/)
  expect(wrapper.find('a[href="#/batches"]').exists()).toBe(false)
  await wrapper.find('main a[href="#/stock"]').trigger('click')
  await flushPromises()
  expect(wrapper.find('h1').text()).toBe('Tudo em stock')
  expect(wrapper.find('.top .primary').exists()).toBe(false)
})
it('shows purchasing to eligible leaders and preserves browser link modifiers', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(stock), user: { ...stock.user, role: 'Department Leader' } }) })
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('a[href="#/batches"]').text()).toContain('Compras e encomendas')
  const link = wrapper.find('main a[href="#/stock"]')
  await link.trigger('click', { ctrlKey: true })
  expect(wrapper.find('h1').text()).toBe('Ferramentas da equipa LART')
})
it('closes the phone navigation on Escape and restores focus', async () => {
  wrapper = mount(AppNavigation, { attachTo: document.body, global: { provide: { navigation: { push: vi.fn(), follow: vi.fn() }, auth: reactive({ enabled: true, user: null }) } } })
  const toggle = wrapper.find('.nav-toggle')
  await toggle.trigger('click')
  expect(toggle.attributes('aria-expanded')).toBe('true')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  await flushPromises()
  expect(toggle.attributes('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(toggle.element)
})
it('offers a meaningful parent instead of sending settings back to inventory', async () => {
  window.history.replaceState(null, '', '/#/settings')
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('.workspace-header a[href="#/"]').text()).toBe('Início')
  expect(wrapper.find('.workspace-header').text()).not.toContain('← Inventário')
})
it('formats physical values with their units and omits missing property placeholders', () => {
  const item = { props: { 'P/N': '-', 'Resistência (Ω)': '10k', Encapsulamento: '0603', Fabricante: '—' } }
  expect(componentValue(item)).toBe('10k Ω')
  expect(describe(item)).toBe('0603')
  expect(componentValue({ props: { 'Capacidade': '100nF' } })).toBe('100nF')
})
it('bounds stock rendering and makes additional results available', async () => {
  window.history.replaceState(null, '', '/#/stock')
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(stock), items: Array.from({ length: 125 }, (_, id) => ({ ...stock.items[0], id: id + 1 })) }) })
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.findAll('tbody tr')).toHaveLength(100)
  await wrapper.find('.stock-load-more').trigger('click')
  expect(wrapper.findAll('tbody tr')).toHaveLength(125)
})
it('keeps a modified label draft when leaving by a link or browser hash is cancelled', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(stock), user: { ...stock.user, department: 'Electronics' }, labels: [{ id: 7, title: 'Gaveta A', fields: [], width: 55, height: 25 }] }) })
  window.history.replaceState(null, '', '/#/labels')
  vi.stubGlobal('confirm', vi.fn(() => false))
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('.label-card-title').trigger('click')
  await wrapper.find('input[placeholder="Armário 1"]').setValue('Gaveta B')
  await wrapper.find('a.menu-link[href="#/stock"]').trigger('click')
  expect(wrapper.find('h1').text()).toBe('Etiquetas')
  expect(window.location.hash).toBe('#/labels')
  window.location.hash = '/stock'
  await vi.waitFor(() => expect(window.location.hash).toBe('#/labels'))
  expect(wrapper.find('h1').text()).toBe('Etiquetas')
  expect(wrapper.find('input[placeholder="Armário 1"]').element.value).toBe('Gaveta B')
  expect(window.location.hash).toBe('#/labels')
})
it('selects only the loaded inventory results when using select all', async () => {
  window.history.replaceState(null, '', '/#/stock')
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(stock), user: { ...stock.user, department: 'Electronics' }, items: Array.from({ length: 125 }, (_, id) => ({ ...stock.items[0], id: id + 1 })) }) })
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('thead input[type=checkbox]').setValue(true)
  expect(wrapper.find('.selection-bar strong').text()).toBe('100 selecionados')
})
it('keeps the initial connection failure visible after its toast expires', async () => {
  vi.useFakeTimers()
  window.history.replaceState(null, '', '/#/stock')
  fetch.mockRejectedValue(new TypeError('offline'))
  wrapper = mount(App)
  await flushPromises()
  await vi.advanceTimersByTimeAsync(3100)
  expect(wrapper.find('.sync-strip').text()).toContain('Sem ligação ao servidor')
  vi.useRealTimers()
})
it.each(['/harness', '/analog-simulation'])('provides a focusable main landmark on %s', async route => {
  window.history.replaceState(null, '', '/#' + route)
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('main#main-content[tabindex="-1"]').exists()).toBe(true)
})
it('preserves earlier destinations after cancelling Back from a label draft', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(stock), user: { ...stock.user, department: 'Electronics' } }) })
  const confirm = vi.fn(() => false)
  vi.stubGlobal('confirm', confirm)
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('main a[href="#/stock"]').trigger('click')
  await wrapper.find('a.menu-link[href="#/labels"]').trigger('click')
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === '+ Gaveta').trigger('click')
  window.history.back()
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
  await vi.waitFor(() => expect(window.location.hash).toBe('#/labels'))
  confirm.mockReturnValue(true)
  window.history.back()
  await vi.waitFor(() => expect(wrapper.find('h1').text()).toBe('Tudo em stock'))
})

it.each(['/', '/stock', '/settings', '/harness', '/analog-simulation'])('shows exactly one shared footer on %s', async route => {
  window.history.replaceState(null, '', '/#' + route)
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.findAll('footer.site-footer')).toHaveLength(1)
  expect(wrapper.get('footer.site-footer a[href="#/settings"]').text()).toBe('Conta e preferências')
})
it('disables manual refresh and announces progress while the request is pending', async () => {
  window.history.replaceState(null, '', '/#/stock')
  wrapper = mount(App)
  await flushPromises()
  let complete
  fetch.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  await wrapper.get('.refresh-button').trigger('click')
  expect(wrapper.get('.refresh-button').attributes('disabled')).toBeDefined()
  expect(wrapper.get('.refresh-button').text()).toBe('A atualizar…')
  complete({ ok: true, json: async () => structuredClone(stock) })
  await flushPromises()
  expect(wrapper.get('.refresh-button').text()).toBe('Atualizar')
})
