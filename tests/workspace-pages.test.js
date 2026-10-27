import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import LabelsPage from '../frontend/src/pages/LabelsPage.vue'
import LocationsPage from '../frontend/src/pages/LocationsPage.vue'
import MovementsPage from '../frontend/src/pages/MovementsPage.vue'
import BatchesPage from '../frontend/src/pages/BatchesPage.vue'
import PcbBomPage from '../frontend/src/pages/PcbBomPage.vue'
import SettingsPage from '../frontend/src/pages/SettingsPage.vue'
vi.mock('zxing-wasm/writer', () => ({ writeBarcode: async () => ({ svg: '<svg width="1" height="1"></svg>' }) }))
let wrapper
function page(component, overrides = {}) {
  const inventory = reactive({ items: [], labels: [], locations: {}, codes: {}, ready: true, canEdit: true, signedIn: true, electronicsEditor: true, ...overrides.inventory })
  const navigation = { push: vi.fn(), beforeLeave: vi.fn(() => vi.fn()), ...overrides.navigation }
  const api = { direct: vi.fn(async action => action === 'pcbProjects' ? { projects: [] } : { movements: [], purchases: [] }), ...overrides.api }
  wrapper = mount(component, { attachTo: document.body, global: {
    provide: { inventory, navigation, api, auth: { user: { id: 1, name: 'Ana' }, enabled: true }, preferences: reactive({ compact: false, notifications: true }) },
    stubs: { WorkspacePage: { props: ['title', 'description'], template: '<main><h1>{{ title }}</h1><p>{{ description }}</p><slot /></main>' }, StepViewer: true, LabelScanner: true, LabelTutorial: true, PhomemoDialog: true, PeopleAdmin: true },
  } })
  return { inventory, navigation, api }
}
const button = text => wrapper.findAll('button').find(entry => entry.text() === text)
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); localStorage.clear() })
it('protects label drafts on route exits and reload, then unregisters its guard', async () => {
  const unregister = vi.fn()
  const { navigation } = page(LabelsPage, { navigation: { beforeLeave: vi.fn(() => unregister) } })
  expect(navigation.beforeLeave).toHaveBeenCalledOnce()
  const guard = navigation.beforeLeave.mock.calls[0][0]
  expect(guard()).toBe(true)
  await button('+ Gaveta').trigger('click')
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  expect(guard()).toBe(false)
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  wrapper.unmount(); wrapper = null
  expect(unregister).toHaveBeenCalledOnce()
  const clean = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(clean)
  expect(clean.defaultPrevented).toBe(false)
})
it('searches labels and team templates without losing selection', async () => {
  page(LabelsPage, { inventory: { labels: [
    { id: 1, title: 'Resistências', fields: [], code: '', width: 55, height: 25 },
    { id: 2, title: 'Parafusos', fields: [], code: '', width: 55, height: 25 },
    { id: 3, title: '', template: true, templateName: 'Gaveta grande', fields: [], code: '', width: 55, height: 25 },
  ] } })
  await button('Selecionar').trigger('click')
  await wrapper.get('[aria-label="Pesquisar etiquetas e modelos"]').setValue('gaveta')
  expect(wrapper.findAll('.label-card')).toHaveLength(0)
  expect(wrapper.text()).toContain('+ Gaveta grande')
  await wrapper.get('[aria-label="Pesquisar etiquetas e modelos"]').setValue('resistencias')
  expect(wrapper.findAll('.label-card')).toHaveLength(1)
  expect(wrapper.text()).toContain('Selecionada')
})
it('keeps advanced label styling collapsed while showing content and size', async () => {
  page(LabelsPage)
  await button('+ Gaveta').trigger('click')
  expect(wrapper.get('details summary').text()).toBe('Estilo avançado')
  expect(wrapper.get('details').attributes('open')).toBeUndefined()
  expect(wrapper.get('details [aria-label="Letra do título (pt)"]').exists()).toBe(true)
  expect(wrapper.get('.drawer-label-size').element.closest('details')).toBeNull()
})
it('searches locations and explains empty boxes without exposing editing to viewers', async () => {
  page(LocationsPage, { inventory: { electronicsEditor: false, locations: { 'Caixa A': '', 'Gaveta B': '' } } })
  await wrapper.get('[aria-label="Pesquisar localizações"]').setValue('caixa')
  expect(wrapper.findAll('.location-card')).toHaveLength(1)
  expect(wrapper.text()).toContain('Sem componentes')
  expect(button('Editar')).toBeUndefined()
  await wrapper.get('[aria-label="Pesquisar localizações"]').setValue('inexistente')
  expect(wrapper.text()).toContain('Nenhuma localização corresponde')
  await button('Limpar pesquisa').trigger('click')
  expect(wrapper.findAll('.location-card')).toHaveLength(2)
})
it('bounds movement rendering and combines date, person and type filters', async () => {
  const movement = { cat: 'Resistências', props: { valor: '10 kΩ', Encapsulamento: '0603' }, person: 'Ana', type: 'in', ts: '2026-10-25T10:00:00Z', delta: 1, before: 0, after: 1 }
  page(MovementsPage, { api: { direct: async () => ({ movements: [...Array.from({ length: 120 }, (_, i) => ({ ...movement, id: i })), { ...movement, id: 130, person: 'Rui', type: 'out', ts: '2026-10-24T10:00:00Z' }] }) } })
  await flushPromises()
  expect(wrapper.findAll('.movement-row')).toHaveLength(100)
  expect(wrapper.text()).toContain('1000 movimentos mais recentes')
  await button('Mostrar mais movimentos').trigger('click')
  expect(wrapper.findAll('.movement-row')).toHaveLength(121)
  await wrapper.get('[aria-label="Pessoa"]').setValue('Rui')
  await wrapper.get('[aria-label="Tipo de movimento"]').setValue('out')
  await wrapper.get('[aria-label="Desde"]').setValue('2026-10-24')
  await wrapper.get('[aria-label="Até"]').setValue('2026-10-24')
  expect(wrapper.findAll('.movement-row')).toHaveLength(1)
  expect(wrapper.find('.movement-main strong').text()).toBe('10 kΩ')
  expect(wrapper.find('.movement-main').text()).toContain('0603')
  await wrapper.get('[aria-label="Desde"]').setValue('2026-10-25')
  expect(wrapper.findAll('.movement-row')).toHaveLength(0)
})
it.each([[MovementsPage, 'movements', { movements: [] }], [BatchesPage, 'purchases', { purchases: [] }]])('retries a failed page load', async (component, action, result) => {
  let failed = true
  page(component, { api: { direct: async requested => { if (failed) throw new Error('Sem ligação'); expect(requested).toBe(action); return result } } })
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('Sem ligação')
  failed = false
  await button('Tentar novamente').trigger('click')
  await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})
it('starts PCB with saved projects and reveals creation explicitly', async () => {
  page(PcbBomPage)
  await flushPromises()
  expect(wrapper.find('input[aria-label="Carregar ficheiro BOM"]').exists()).toBe(false)
  expect(wrapper.get('h1').text()).toBe('Projetos PCB')
  await button('Novo projeto').trigger('click')
  expect(wrapper.get('input[aria-label="Carregar ficheiro BOM"]').exists()).toBe(true)
  expect(document.activeElement).toBe(wrapper.get('.project-name-field input').element)
  expect(wrapper.findAll('h2')[0].text()).toBe('Projetos guardados')
  expect(wrapper.text()).toContain('partilhados com a equipa')
})
it('combines the user profile and preferences without the old session and sharing cards', async () => {
  page(SettingsPage)
  expect(wrapper.get('.settings-profile').text()).toContain('Ana')
  expect(wrapper.text()).toContain('Só neste navegador')
  expect(wrapper.text()).not.toMatch(/A tua sessão|Dados partilhados/)
  await wrapper.get('[aria-label="Modo compacto"]').setValue(true)
  expect(localStorage.getItem('stocklart-compact-mode')).toBe('true')
})
