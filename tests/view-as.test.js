import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import App from '../frontend/src/App.vue'

vi.mock('zxing-wasm/writer', () => ({ writeBarcode: async text => ({ svg: `<svg width="1" height="1"><title>${text}</title></svg>` }) }))

const base = {
  can_edit: true, auth: true, roles: ['Board', 'Department Leader', 'Member'],
  departments: ['Electronics', 'Powertrain'], sections: { Electronics: ['Componentes eletrónicos'], Powertrain: ['Geral'] },
  categories: [], items: [],
}
const admin = { ...base, user: { id: 1, name: 'Ana Silva', admin: true, role: 'Member', department: '' }, preview: null }
let wrapper, payload
const respond = body => vi.fn(async () => ({ ok: true, json: async () => structuredClone(body) }))
beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/#/')
})
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })

it('lets an admin choose a role and departments to view the site as', async () => {
  vi.stubGlobal('fetch', respond(admin))
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('.user-chip').trigger('click')
  await flushPromises()
  expect(wrapper.find('.view-as-menu summary').text()).toBe('Ver o site como…')
  const chip = text => wrapper.findAll('.view-as-menu .toggle-chip').find(button => button.text() === text)
  await chip('Department Leader').trigger('click')
  await chip('Powertrain').trigger('click')
  await wrapper.find('.view-as-menu button.primary').trigger('click')
  await flushPromises()
  payload = fetch.mock.calls.find(([url]) => url === '/api/auth/view-as')
  expect(payload[1].method).toBe('POST')
  expect(JSON.parse(payload[1].body)).toEqual({ role: 'Department Leader', departments: ['Powertrain'] })
})

it('shows a banner on every page while previewing, also as a guest, with a way back', async () => {
  vi.stubGlobal('fetch', respond({ ...base, user: null, preview: { guest: true } }))
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('.preview-banner').text()).toContain('visitante sem sessão')
  expect(wrapper.find('.session-box').text()).toContain('Entrar')
  await wrapper.find('.preview-banner button.primary').trigger('click')
  await flushPromises()
  expect(fetch).toHaveBeenCalledWith('/api/auth/view-as', expect.objectContaining({ method: 'DELETE' }))
})

it('hides the picker from members who are not admins', async () => {
  vi.stubGlobal('fetch', respond({ ...admin, user: { ...admin.user, admin: false, role: 'Board' } }))
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('.user-chip').trigger('click')
  await flushPromises()
  expect(wrapper.find('.view-as-menu').exists()).toBe(false)
  expect(wrapper.find('.preview-banner').exists()).toBe(false)
})
