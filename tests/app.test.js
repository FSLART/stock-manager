import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import App from '../frontend/src/App.vue'
import LabelScanner from '../frontend/src/components/LabelScanner.vue'
import { pcbServer } from './pcb-server.js'

// O WASM do zxing não carrega no jsdom; o SVG falso guarda o texto do QR para os testes o lerem.
vi.mock('zxing-wasm/writer', () => ({ writeBarcode: async text => ({ svg: `<svg width="1" height="1"><title>${text}</title></svg>` }) }))

const data = {
  can_edit: true,
  categories: [{ name: 'LEDs', props: ['cor'], image: true }, { name: 'R&D', props: ['valor'], image: false }],
  items: [
    { id: 1, cat: 'LEDs', props: { cor: '<1A & azul' }, qty: 3, image: '' },
    { id: 2, cat: 'R&D', props: { valor: '10 Ω' }, qty: 20, image: '' },
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
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('renders safe text, filters search and categories, and reports totals', async () => {
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('.sub').text()).toBe('2 referências · 23 unidades')
  expect(wrapper.find('.component-cell').text()).toContain('<1A & azul')
  expect(wrapper.find('.component-cell').html()).toContain('&lt;1A &amp; azul')
  await wrapper.find('input[type=search]').setValue('10Ω')
  expect(wrapper.findAll('.row')).toHaveLength(1)
  await wrapper.find('input[type=search]').setValue('')
  await wrapper.findAll('nav .cat-row > button:first-child')[1].trigger('click')
  expect(wrapper.find('h1').text()).toBe('LEDs')
  expect(wrapper.find('.sub').text()).toBe('1 referência · 3 unidades')
})

it('folds sidebar sections and hides empty categories until asked', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), categories: [
    { ...data.categories[0], section: 'Componentes eletrónicos' }, { ...data.categories[1], section: 'Harness' },
    { name: 'Vazia', props: ['x'], image: false, section: 'Harness' },
  ] }) })
  wrapper = mount(App)
  await flushPromises()
  const names = () => wrapper.findAll('nav .cat-row > button:first-child').map(button => button.text().replace(/\d+$/, '').trim())
  expect(names()).toEqual(['Tudo', 'LEDs', 'R&D'])
  await wrapper.find('nav .show-empty input').setValue(true)
  expect(names()).toEqual(['Tudo', 'LEDs', 'R&D', 'Vazia'])
  await wrapper.find('button[aria-label="Dobrar Harness"]').trigger('click')
  expect(names()).toEqual(['Tudo', 'LEDs'])
  expect(JSON.parse(localStorage.getItem('stocklart-folded-sections'))).toEqual(['Harness'])
  await wrapper.find('button[aria-label="Abrir Harness"]').trigger('click')
  expect(names()).toEqual(['Tudo', 'LEDs', 'R&D', 'Vazia'])
})

it('nests subcategories under their parent and counts them in the parent', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), categories: [
    { name: 'Passivos', props: ['x'], image: false, section: 'Componentes eletrónicos', parent: null },
    { ...data.categories[1], section: 'Componentes eletrónicos', parent: 'Passivos' },
    { ...data.categories[0], section: 'Componentes eletrónicos', parent: null },
  ] }) })
  wrapper = mount(App)
  await flushPromises()
  const rows = () => wrapper.findAll('nav .cat-row > button:first-child')
  // A mãe vazia aparece porque a filha tem stock, e a filha vem logo a seguir, um nível dentro.
  expect(rows().map(button => button.text().replace(/\d+$/, '').trim())).toEqual(['Tudo', 'Passivos', 'R&D', 'LEDs'])
  expect(rows()[2].attributes('style')).toContain('--depth: 1')
  await rows()[1].trigger('click')
  expect(wrapper.find('.sub').text()).toBe('1 referência · 20 unidades')
  await rows()[2].trigger('click')
  expect(wrapper.find('.trail').text()).toBe('Passivos›')
})

it('clamps a decrement at zero and sends only the actual stock change', async () => {
  vi.useFakeTimers()
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('button[aria-label="Retirar 10"]').trigger('click')
  expect(wrapper.find('output').text()).toBe('0')
  await vi.advanceTimersByTimeAsync(151)
  expect(fetch).toHaveBeenCalledWith('/api/items/1/step', expect.objectContaining({ body: '{"id":1,"delta":-3}' }))
})

it('submits a movement using the selected dynamic properties', async () => {
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('.top .primary').trigger('click')
  const form = wrapper.find('dialog form')
  await form.find('.fields input').setValue('vermelho')
  await form.find('input[type=number]').setValue(4)
  await form.trigger('submit')
  await flushPromises()
  expect(fetch).toHaveBeenCalledWith('/api/move', expect.objectContaining({ body: JSON.stringify({ cat: 'LEDs', props: { cor: 'vermelho' }, qty: 4, mode: 'in', image: '', department: 'Electronics' }) }))
})

it('searches the category by typing its name', async () => {
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('.top .primary').trigger('click')
  const form = wrapper.find('dialog form')
  const input = form.find('input[list=movement-categories]')
  await input.setValue('r&')
  expect(form.find('.fields label').text()).toBe('cor')
  await input.setValue('r&d')
  expect(form.find('.fields label').text()).toBe('valor')
  await input.setValue('xyz')
  await input.trigger('change')
  expect(input.element.value).toBe('R&D')
})

it('handles an empty stock without opening an invalid movement', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ categories: [], items: [] }) })
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('.top .primary').exists()).toBe(false)
  expect(wrapper.find('.empty').text()).toContain('ainda não tem stock')
})

it('combines property and stock filters and clears them together with search', async () => {
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('table').exists()).toBe(true)
  await wrapper.find('input[aria-label="Filtrar cor: <1A & azul"]').setValue(true)
  expect(wrapper.findAll('tbody .row')).toHaveLength(1)
  expect(wrapper.find('tbody').text()).toContain('LEDs')
  await wrapper.find('select[aria-label="Filtrar stock"]').setValue('available')
  expect(wrapper.findAll('tbody .row')).toHaveLength(1)
  await wrapper.find('select[aria-label="Filtrar stock"]').setValue('empty')
  expect(wrapper.findAll('tbody .row')).toHaveLength(0)
  await wrapper.find('input[aria-label="Pesquisar componentes"]').setValue('nothing')
  await wrapper.find('button[aria-label="Limpar filtros"]').trigger('click')
  expect(wrapper.findAll('tbody .row')).toHaveLength(2)
  expect(wrapper.find('.sub').text()).toBe('2 referências · 23 unidades')
})

it('selects a range with shift-click and moves the selection to one location', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), items: [
    ...data.items, { id: 3, cat: 'R&D', props: { valor: '1k' }, qty: 5, image: '', location: 'Gaveta A' },
  ], locations: { 'Caixa vazia': '' } }) })
  wrapper = mount(App)
  await flushPromises()
  const boxes = () => wrapper.findAll('tbody .select-cell input')
  await boxes()[0].trigger('click')
  await boxes()[2].trigger('click', { shiftKey: true })
  expect(wrapper.find('.selection-bar strong').text()).toBe('3 selecionados')
  // Uma caixa criada na página Localizações aparece na lista mesmo sem componentes.
  expect(wrapper.findAll('#stock-locations option').map(option => option.attributes('value'))).toEqual(['Caixa vazia', 'Gaveta A'])
  await wrapper.find('.selection-bar input').setValue('Caixa 1')
  await wrapper.find('.selection-bar').trigger('submit')
  await flushPromises()
  const request = fetch.mock.calls.find(([url]) => url === '/api/items/location')
  expect(JSON.parse(request[1].body)).toEqual({ ids: [1, 2, 3], location: 'Caixa 1' })
  expect(wrapper.find('.selection-bar').exists()).toBe(false)
  // Filtrar por localização e selecionar todos os mostrados.
  await wrapper.find('select[aria-label="Filtrar localização"]').setValue('Gaveta A')
  expect(wrapper.findAll('tbody .row')).toHaveLength(1)
  await wrapper.find('thead .select-cell input').trigger('change')
  expect(wrapper.find('.selection-bar strong').text()).toBe('1 selecionado')
})

it('syncs every selected P/N once with the parts APIs', async () => {
  const stock = { ...structuredClone(data), categories: [{ name: 'CIs', props: ['P/N'], image: true }], items: [
    { id: 1, cat: 'CIs', props: { 'P/N': 'NE555' }, qty: 1, image: '' }, { id: 2, cat: 'CIs', props: { 'P/N': 'ne555' }, qty: 2, image: '' },
    { id: 3, cat: 'CIs', props: { 'P/N': 'LM358' }, qty: 1, image: '/static/uploads/old.jpg' }, { id: 4, cat: 'CIs', props: { 'P/N': '-' }, qty: 1, image: '' },
  ] }
  fetch.mockImplementation(async url => ({ ok: true, json: async () => url.startsWith('/api/parts/lookup') ? { part: {}, image: 'https://api/x.jpg' }
    : url === '/api/images' ? { url: '/static/uploads/new.jpg' } : structuredClone(stock) }))
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('thead .select-cell input').trigger('change')
  const button = wrapper.findAll('.selection-bar button').find(entry => entry.text().startsWith('Sincronizar'))
  expect(button.text()).toBe('Sincronizar com APIs (2)')
  await button.trigger('click')
  await flushPromises()
  expect(fetch.mock.calls.map(([url]) => url).filter(url => url.startsWith('/api/parts/lookup'))).toEqual(['/api/parts/lookup?mpn=ne555', '/api/parts/lookup?mpn=LM358'])
  // A imagem é descarregada uma vez e vai só para os itens sem imagem (o LM358 já tem uma).
  expect(fetch.mock.calls.filter(([url]) => url === '/api/images')).toHaveLength(1)
  const edits = fetch.mock.calls.filter(([url]) => url.startsWith('/api/items/')).map(([url, options]) => [url, JSON.parse(options.body)])
  expect(edits).toEqual([['/api/items/1', { id: 1, props: { 'P/N': 'NE555' }, qty: 1, image: '/static/uploads/new.jpg' }],
    ['/api/items/2', { id: 2, props: { 'P/N': 'ne555' }, qty: 2, image: '/static/uploads/new.jpg' }]])
})

it('opens the stock filtered by the box whose code is in the QR link', async () => {
  window.history.replaceState(null, '', '/#/stock?box=k7q2mx')
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), items: [
    { ...data.items[0], location: 'Gaveta A' }, data.items[1],
  ], location_codes: { 'Gaveta A': 'K7Q2MX' } }) })
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('select[aria-label="Filtrar localização"]').element.value).toBe('Gaveta A')
  expect(wrapper.findAll('tbody .row')).toHaveLength(1)
})

it('sorts quantities numerically in both directions', async () => {
  wrapper = mount(App)
  await flushPromises()
  const sort = wrapper.find('button[aria-label="Ordenar por Quantidade"]')
  await sort.trigger('click')
  expect(wrapper.findAll('tbody output').map(row => row.text())).toEqual(['3', '20'])
  await sort.trigger('click')
  expect(wrapper.findAll('tbody output').map(row => row.text())).toEqual(['20', '3'])
})

it('keeps unused category properties out of the populated table and filters', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), categories: [
    ...data.categories, { name: 'Empty category', props: ['unused'], image: false },
  ] }) })
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('button[aria-label="Ordenar por unused"]').exists()).toBe(false)
  expect(wrapper.find('input[aria-label="Pesquisar filtro unused"]').exists()).toBe(false)
})

it('filters image availability and resets property selections when switching category', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), items: [
    { ...data.items[0], image: '/uploads/led.png' }, data.items[1],
  ] }) })
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('select[aria-label="Filtrar imagens"]').setValue('yes')
  expect(wrapper.findAll('tbody .row')).toHaveLength(1)
  await wrapper.find('select[aria-label="Filtrar imagens"]').setValue('no')
  expect(wrapper.find('tbody').text()).toContain('R&D')
  await wrapper.find('select[aria-label="Filtrar imagens"]').setValue('')
  await wrapper.find('input[aria-label="Filtrar cor: <1A & azul"]').setValue(true)
  await wrapper.findAll('nav .cat-row > button:first-child')[2].trigger('click')
  expect(wrapper.findAll('tbody .row')).toHaveLength(1)
  expect(wrapper.find('tbody').text()).toContain('10 Ω')
})

it('opens an item with its values and saves an absolute quantity without clearing its image', async () => {
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('button[aria-label="Editar componente"]').trigger('click')
  const form = wrapper.find('dialog form')
  expect(form.find('h2').text()).toBe('Editar componente')
  expect(form.find('.fields input').element.value).toBe('<1A & azul')
  await form.find('.fields input').setValue('verde')
  await form.find('input[type=number]:not([step=any])').setValue(0)
  await form.trigger('submit')
  await flushPromises()
  const request = fetch.mock.calls.find(([url, options]) => url === '/api/items/1' && options.method === 'PATCH')
  expect(JSON.parse(request[1].body)).toEqual({ id: 1, props: { cor: 'verde' }, qty: 0 })
})

it('edits category and field names while sending the original field identity', async () => {
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('button[aria-label="Editar categoria LEDs"]').trigger('click')
  const form = wrapper.findAll('dialog form')[1]
  await form.find('input').setValue('Luzes')
  await form.find('.property-editor input').setValue('tonalidade')
  await form.trigger('submit')
  await flushPromises()
  const request = fetch.mock.calls.find(([url, options]) => url === '/api/categories/LEDs?department=Electronics' && options.method === 'PATCH')
  expect(JSON.parse(request[1].body)).toEqual({ originalName: 'LEDs', name: 'Luzes', fields: [{ source: 'cor', name: 'tonalidade' }], image: true, section: 'Componentes eletrónicos', parent: null, department: 'Electronics' })
})

it('creates a category with one input per property, like the edit form', async () => {
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('button[aria-label="Nova categoria"]').trigger('click')
  const form = wrapper.findAll('dialog form')[1]
  await form.find('input').setValue('Díodos')
  await form.find('.property-editor input').setValue('tipo')
  await form.find('button.ghost').trigger('click')
  await form.findAll('.property-editor input')[1].setValue(' tensão ')
  await form.trigger('submit')
  await flushPromises()
  const request = fetch.mock.calls.find(([url, options]) => url === '/api/categories' && options.method === 'POST')
  expect(JSON.parse(request[1].body)).toEqual({ name: 'Díodos', props: ['tipo', 'tensão'], image: false, section: 'Componentes eletrónicos', parent: null, department: 'Electronics' })
})

it('reorders category properties and sends them in the new order', async () => {
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('button[aria-label="Editar categoria LEDs"]').trigger('click')
  const form = wrapper.findAll('dialog form')[1]
  expect(form.find('button[aria-label="Subir propriedade"]').element.disabled).toBe(true)
  await form.find('button.ghost').trigger('click')
  await form.findAll('.property-editor input')[1].setValue('tamanho')
  await form.findAll('button[aria-label="Subir propriedade"]')[1].trigger('click')
  expect(form.findAll('.property-editor input').map(input => input.element.value)).toEqual(['tamanho', 'cor'])
  await form.trigger('submit')
  await flushPromises()
  const request = fetch.mock.calls.find(([url, options]) => url === '/api/categories/LEDs?department=Electronics' && options.method === 'PATCH')
  expect(JSON.parse(request[1].body).fields).toEqual([{ source: null, name: 'tamanho' }, { source: 'cor', name: 'cor' }])
})

it('puts a pasted image into the image field and ignores pasted text', async () => {
  const added = []
  vi.stubGlobal('DataTransfer', class { items = { add: file => added.push(file) }; files = added })
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('button[aria-label="Editar componente"]').trigger('click')
  const input = wrapper.find('dialog input[type=file]').element
  let assigned = null
  Object.defineProperty(input, 'files', { set: files => { assigned = files }, get: () => assigned || [] })
  const image = new File(['x'], 'image.png', { type: 'image/png' })
  const paste = files => Object.assign(new Event('paste', { bubbles: true, cancelable: true }), { clipboardData: { files } })
  const textPaste = paste([])
  wrapper.find('dialog').element.dispatchEvent(textPaste)
  expect(textPaste.defaultPrevented).toBe(false)
  expect(assigned).toBe(null)
  const imagePaste = paste([image])
  wrapper.find('dialog').element.dispatchEvent(imagePaste)
  expect(imagePaste.defaultPrevented).toBe(true)
  expect(assigned).toEqual([image])
})

it('suggests existing property names and reuses their spelling in a new category', async () => {
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('button[aria-label="Nova categoria"]').trigger('click')
  const form = wrapper.findAll('dialog form')[1]
  expect(form.findAll('#known-properties option').map(option => option.element.value)).toEqual(['cor', 'valor'])
  await form.find('input').setValue('Lâmpadas')
  await form.find('.property-editor input').setValue(' COR ')
  await form.trigger('submit')
  await flushPromises()
  const request = fetch.mock.calls.find(([url, options]) => url === '/api/categories' && options.method === 'POST')
  expect(JSON.parse(request[1].body).props).toEqual(['cor'])
})

it('uploads an image from a link and fills the link from an image dragged from another page', async () => {
  fetch.mockImplementation(async url => ({ ok: true, json: async () => url === '/api/images' ? { url: '/uploads/new.jpg' } : structuredClone(data) }))
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('button[aria-label="Editar componente"]').trigger('click')
  const dialog = wrapper.find('dialog')
  const drop = dataTransfer => Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer })
  const pageImage = drop({ files: [], getData: () => '# comment\nhttps://example.com/led.png' })
  dialog.element.dispatchEvent(pageImage)
  await flushPromises()
  expect(pageImage.defaultPrevented).toBe(true)
  expect(dialog.find('input[type=url]').element.value).toBe('https://example.com/led.png')
  const pdf = drop({ files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })], getData: () => '' })
  dialog.element.dispatchEvent(pdf)
  expect(pdf.defaultPrevented).toBe(true)
  await dialog.find('form').trigger('submit')
  await flushPromises()
  const upload = fetch.mock.calls.find(([url]) => url === '/api/images')
  expect(upload[1].body.get('url')).toBe('https://example.com/led.png')
  const request = fetch.mock.calls.find(([url, options]) => url === '/api/items/1' && options.method === 'PATCH')
  expect(JSON.parse(request[1].body).image).toBe('/uploads/new.jpg')
})

it('previews a real image in the middle of the page while hovered, but not the default icons', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), items: [{ ...data.items[0], image: '/uploads/led.jpg' }, data.items[1]] }) })
  wrapper = mount(App, { attachTo: document.body })
  await flushPromises()
  const [photo, icon] = wrapper.findAll('tbody .image-cell img')
  await icon.trigger('mouseenter')
  expect(document.querySelector('.image-preview')).toBe(null)
  await photo.trigger('mouseenter')
  expect(document.querySelector('.image-preview').getAttribute('src')).toBe('/uploads/led.jpg')
  await photo.trigger('mouseleave')
  expect(document.querySelector('.image-preview')).toBe(null)
})

it('fills the movement form from a catalog part and reuses the stocked item with the same part number', async () => {
  const catalog = {
    ...structuredClone(data),
    categories: [...data.categories, { name: 'CIs', props: ['Brand', 'P/N', 'Footprint'], image: false }],
    items: [...data.items, { id: 3, cat: 'CIs', props: { Brand: 'TI', 'P/N': 'SN74HC02PWRG4', Footprint: 'TSSOP-14' }, qty: 3, image: '' }],
    parts: [
      { mpn: 'SN74HC02PWRG4', manufacturer: 'Texas Instruments', description: 'Logic Gates', category: '', props: {}, price: 0.85 },
      { mpn: 'LAN8720AI', manufacturer: 'Microchip', description: 'Ethernet PHY', category: 'CIs', props: {}, price: 1.1 },
    ],
  }
  fetch.mockResolvedValue({ ok: true, json: async () => structuredClone(catalog) })
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('.estimate').text()).toBe('≈ 2,55\u00a0€')
  const row = wrapper.findAll('tbody tr').find(tr => tr.text().includes('SN74HC02PWRG4'))
  expect(row.findAll('.price-cell').map(cell => cell.text())).toEqual(['0,85\u00a0€', '2,55\u00a0€'])
  expect(wrapper.find('tbody tr .price-cell').text()).toBe('—')
  await wrapper.findAll('button').find(button => button.text() === 'Adicionar').trigger('click')
  const form = wrapper.find('dialog form')
  const picker = form.find('input[list="catalog-parts"]')
  expect(form.findAll('#catalog-parts option').map(option => option.element.value)).toEqual(['SN74HC02PWRG4', 'LAN8720AI'])
  await picker.setValue('sn74hc02pwrg4')
  expect(form.find('input[list=movement-categories]').element.value).toBe('CIs')
  expect(form.findAll('.fields input').map(input => input.element.value)).toEqual(['TI', 'SN74HC02PWRG4', 'TSSOP-14'])
  await picker.setValue('LAN8720AI')
  expect(form.findAll('.fields input').map(input => input.element.value)).toEqual(['Microchip', 'LAN8720AI', ''])
})

it('edits a category from one discreet button and deletes it from inside the edit form', async () => {
  vi.stubGlobal('confirm', vi.fn(() => true))
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('button[aria-label="Apagar categoria LEDs"]').exists()).toBe(false)
  await wrapper.find('button[aria-label="Editar categoria LEDs"]').trigger('click')
  const dialog = wrapper.findAll('dialog')[1]
  await dialog.find('button.delete-category').trigger('click')
  await flushPromises()
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Apagar a categoria "LEDs"?'))
  expect(dialog.element.open).toBe(false)
  expect(fetch.mock.calls.some(([url, options]) => url === '/api/categories/LEDs?department=Electronics' && options.method === 'DELETE')).toBe(true)
})

it('edits the unit price of a part number from the component form', async () => {
  const priced = {
    ...structuredClone(data),
    categories: [...data.categories, { name: 'CIs', props: ['Brand', 'P/N'], image: false }],
    items: [...data.items,
      { id: 3, cat: 'CIs', props: { Brand: 'TI', 'P/N': 'SN74HC02PWRG4' }, qty: 3, image: '' },
      { id: 4, cat: 'CIs', props: { Brand: 'TI', 'P/N': '-' }, qty: 1, image: '' }],
    parts: [{ mpn: 'SN74HC02PWRG4', manufacturer: 'Texas Instruments', description: '', category: '', props: {}, price: 0.85 }],
  }
  fetch.mockImplementation(async () => ({ ok: true, json: async () => structuredClone(priced) }))
  wrapper = mount(App)
  await flushPromises()
  const editRow = async match => {
    await wrapper.findAll('tbody tr').find(tr => match(tr.text())).find('button[aria-label="Editar componente"]').trigger('click')
    return wrapper.find('dialog form')
  }
  let form = await editRow(text => text.includes('SN74HC02PWRG4'))
  const price = () => form.find('input[type=number][step=any]')
  expect(price().element.value).toBe('0.85')
  await price().setValue('0.9')
  await form.trigger('submit')
  await flushPromises()
  const calls = () => fetch.mock.calls.filter(([, options]) => options?.method && options.method !== 'GET').map(([url, options]) => [url, options.method, JSON.parse(options.body)])
  expect(calls()).toEqual([['/api/parts', 'POST', { mpn: 'SN74HC02PWRG4', price: 0.9 }]])

  fetch.mockClear()
  form = await editRow(text => text.includes('SN74HC02PWRG4'))
  await price().setValue('1.2')
  await form.find('input[type=number]:not([step=any])').setValue(5)
  await form.trigger('submit')
  await flushPromises()
  expect(calls().map(([url, method]) => [url, method])).toEqual([['/api/items/3', 'PATCH'], ['/api/parts', 'POST']])

  form = await editRow(text => text.includes('TI') && !text.includes('SN74'))
  expect(price().element.disabled).toBe(true)
  expect(form.text()).toContain('Preenche o P/N para guardar o preço.')
})

it('lists every catalog part from the corner button, marks what is in stock and searches', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({
    ...structuredClone(data),
    categories: [...data.categories, { name: 'CIs', props: ['P/N'], image: false }],
    items: [...data.items, { id: 3, cat: 'CIs', props: { 'P/N': 'SN74HC02PWRG4' }, qty: 3, image: '' }],
    parts: [
      { mpn: 'SN74HC02PWRG4', manufacturer: 'Texas Instruments', description: 'NOR gate', category: '', props: {}, price: 0.851, source: 'Batch_Mouser_2.xls' },
      { mpn: 'RC0603JR-071KL', manufacturer: 'YAGEO', description: 'Chip Resistor 0603 1k', category: 'Resistências', props: {}, price: 0.004, source: 'Compras_Mouser_3' },
    ],
  }) })
  wrapper = mount(App)
  await flushPromises()
  const button = wrapper.find('.catalog-btn')
  expect(button.text()).toBe('Catálogo de peças 2')
  await button.trigger('click')
  const dialog = wrapper.find('.catalog-dialog')
  expect(dialog.element.open).toBe(true)
  const rows = () => dialog.findAll('tbody tr').map(tr => tr.findAll('td').map(td => td.text()))
  expect(rows()).toEqual([
    ['SN74HC02PWRG4', 'Texas Instruments', 'NOR gate', '—', '0,85 €', 'Sim'],
    ['RC0603JR-071KL', 'YAGEO', 'Chip Resistor 0603 1k', 'Resistências', '0,004 €', ''],
  ])
  await dialog.find('input[type=search]').setValue('yageo')
  expect(rows().map(row => row[0])).toEqual(['RC0603JR-071KL'])
  expect(dialog.find('.sub').text()).toBe('1 de 2')
})

it('adds a part to the catalog and corrects only the changed fields of an existing one', async () => {
  const catalog = { ...structuredClone(data), parts: [{ mpn: 'TL082BCDT', manufacturer: 'ST', description: 'Op Amps', category: '', props: {}, price: 0.4, source: 'cart' }] }
  fetch.mockImplementation(async (url, options) => ({ ok: true, json: async () => options?.method === 'POST' ? { msg: 'ok' } : structuredClone(catalog) }))
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('.catalog-btn').trigger('click')
  const dialog = wrapper.find('.catalog-dialog')
  await dialog.find('button.add-part').trigger('click')
  let form = dialog.find('form.catalog-form')
  const inputs = () => form.findAll('input')
  await inputs()[0].setValue(' SC0915 ')
  await inputs()[1].setValue('Raspberry Pi')
  await inputs()[3].setValue('Placas de Desenvolvimento')
  await inputs()[4].setValue('4.2')
  await form.trigger('submit')
  await flushPromises()
  const posts = () => fetch.mock.calls.filter(([url, options]) => url === '/api/parts' && options.method === 'POST').map(([, options]) => JSON.parse(options.body))
  expect(posts()).toEqual([{ mpn: 'SC0915', manufacturer: 'Raspberry Pi', description: '', category: 'Placas de Desenvolvimento', price: 4.2 }])
  expect(dialog.find('form.catalog-form').exists()).toBe(false)

  await dialog.find('.catalog-row').trigger('click')
  form = dialog.find('form.catalog-form')
  expect(inputs()[0].element.readOnly).toBe(true)
  await inputs()[3].setValue('CIs Amplificadores')
  await form.trigger('submit')
  await flushPromises()
  expect(posts()[1]).toEqual({ mpn: 'TL082BCDT', category: 'CIs Amplificadores' })
})

it('fills the rest of the form when a catalog part number is typed or chosen in the P/N field', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({
    ...structuredClone(data),
    categories: [{ name: 'CIs', props: ['Brand', 'P/N', 'Footprint'], image: false }],
    items: [],
    parts: [{ mpn: 'LAN8720AI', manufacturer: 'Microchip', description: 'Ethernet PHY', category: 'CIs', props: { Footprint: 'QFN-24' }, price: 1.1 }],
  }) })
  wrapper = mount(App)
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === 'Adicionar').trigger('click')
  const form = wrapper.find('dialog form')
  const fields = () => form.findAll('.fields input')
  expect(fields()[1].attributes('list')).toBe('catalog-parts')
  await fields()[1].setValue('LAN87')
  expect(fields().map(input => input.element.value)).toEqual(['', 'LAN87', ''])
  await fields()[1].setValue('lan8720ai')
  expect(fields().map(input => input.element.value)).toEqual(['Microchip', 'LAN8720AI', 'QFN-24'])
})

it('previews the chosen image and removes it again before saving', async () => {
  const added = []
  vi.stubGlobal('DataTransfer', class { items = { add: file => added.push(file) }; files = added })
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  wrapper = mount(App)
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === 'Adicionar').trigger('click')
  const dialog = wrapper.find('dialog')
  const input = dialog.find('input[type=file]').element
  let assigned = []
  Object.defineProperty(input, 'files', { set: files => { assigned = files }, get: () => assigned })
  Object.defineProperty(input, 'value', { set: () => { assigned = [] }, get: () => '' })
  const paste = Object.assign(new Event('paste', { bubbles: true, cancelable: true }), { clipboardData: { files: [new File(['x'], 'led.png', { type: 'image/png' })] } })
  dialog.element.dispatchEvent(paste)
  await flushPromises()
  expect(dialog.find('.new-image img').attributes('src')).toBe('blob:preview')
  await dialog.find('.new-image button').trigger('click')
  expect(dialog.find('.new-image').exists()).toBe(false)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  await dialog.find('input[type=url]').setValue('https://example.com/led.png')
  expect(dialog.find('.new-image img').attributes('src')).toBe('https://example.com/led.png')
  await dialog.find('.new-image button').trigger('click')
  expect(dialog.find('input[type=url]').element.value).toBe('')
  await dialog.find('.fields input').setValue('azul')
  await dialog.find('form').trigger('submit')
  await flushPromises()
  expect(fetch.mock.calls.some(([url]) => url === '/api/images')).toBe(false)
})

it('keeps rejected edits open with the server error and does not offer editing on unsupported backends', async () => {
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('button[aria-label="Editar categoria LEDs"]').trigger('click')
  fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Já existe essa categoria' }) })
  await wrapper.findAll('dialog form')[1].trigger('submit')
  await flushPromises()
  expect(wrapper.findAll('dialog')[1].element.open).toBe(true)
  expect(wrapper.find('[role=alert]').text()).toBe('Já existe essa categoria')
  wrapper.unmount()
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), can_edit: false }) })
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('button[aria-label="Editar componente"]').exists()).toBe(false)
})

it('joins the other properties in one Descrição column in Tudo and gives each property a column inside a category', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), categories: [{ name: 'Res', props: ['valor (Ω)', 'tamanho', 'tol'], image: false }, { name: 'LEDs', props: ['cor'], image: false }],
    items: [{ id: 1, cat: 'Res', props: { 'valor (Ω)': '10k', tamanho: '0603', tol: '1%' }, qty: 5, image: '' }, { id: 2, cat: 'LEDs', props: { cor: 'azul' }, qty: 2, image: '' }] }) })
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.findAll('th').map(th => th.text().replace(/\s*[↕↑↓]$/, ''))).toEqual(['', 'Imagem', 'Categoria', 'Componente', 'Descrição', 'Localização', 'Preço un.', 'Quantidade', 'Valor', 'Ações'])
  expect(wrapper.find('tbody .row .desc-cell').text()).toBe('0603 · 1%')
  await wrapper.findAll('nav .cat-row > button:first-child')[1].trigger('click')
  expect(wrapper.findAll('th').map(th => th.text().replace(/\s*[↕↑↓]$/, ''))).toEqual(['', 'Imagem', 'valor (Ω)', 'tamanho', 'tol', 'Localização', 'Preço un.', 'Quantidade', 'Valor', 'Ações'])
  expect(wrapper.find('tbody .component-cell').classes()).toContain('card-only')
})

it('starts with the property filters closed and offers undo after deleting an item', async () => {
  vi.stubGlobal('confirm', vi.fn(() => true))
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('.filter-panels').attributes('style')).toContain('display: none')
  await wrapper.find('button[aria-label="Apagar item"]').trigger('click')
  await flushPromises()
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('3 un.'))
  expect(fetch).toHaveBeenCalledWith('/api/items/1', expect.objectContaining({ method: 'DELETE' }))
  expect(wrapper.find('#toast').text()).toContain('Desfazer')
  await wrapper.find('.toast-undo').trigger('click')
  await flushPromises()
  expect(fetch).toHaveBeenCalledWith('/api/move', expect.objectContaining({ body: JSON.stringify({ cat: 'LEDs', department: 'Electronics', props: { cor: '<1A & azul' }, qty: 3, mode: 'in', image: '' }) }))
})

it('offers a sort selector that mirrors the table headers for the phone cards', async () => {
  wrapper = mount(App)
  await flushPromises()
  const select = wrapper.find('.mobile-sort select')
  expect(select.findAll('option').map(option => option.text())).toEqual(['Ordem original', 'Categoria', 'Componente', 'Descrição', 'Localização', 'Preço un.', 'Quantidade', 'Valor'])
  await select.setValue('qty')
  expect(wrapper.findAll('tbody output').map(row => row.text())).toEqual(['3', '20'])
  await wrapper.find('.mobile-sort button').trigger('click')
  expect(wrapper.findAll('tbody output').map(row => row.text())).toEqual(['20', '3'])
})

it('opens a scanned label in a category that has a P/N field when the current one has none', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), categories: [...data.categories, { name: 'Díodos', props: ['referência', 'tipo'], image: false }, { name: 'CIs', props: ['P/N', 'Fabricante'], image: false }] }) })
  wrapper = mount(App)
  await flushPromises()
  wrapper.findComponent(LabelScanner).vm.$emit('use', { mpn: 'MCP6C02T-100E/CHY', manufacturer: 'Microchip', qty: 3 })
  await flushPromises()
  const form = wrapper.find('dialog form')
  expect(form.find('input[list=movement-categories]').element.value).toBe('CIs')
  expect(form.findAll('.fields input').map(input => input.element.value)).toEqual(['MCP6C02T-100E/CHY', 'Microchip'])
  expect(form.find('input[type=number]').element.value).toBe('3')
})

it('completes a scanned label with the Mouser/DigiKey lookup: category, description, datasheet, price and image', async () => {
  const stock = { ...structuredClone(data), categories: [...data.categories, { name: 'CIs', props: ['P/N', 'Fabricante'], image: true }] }
  const part = { mpn: 'MCP6C02T-100E/CHY', manufacturer: 'Microchip Technology', description: 'Current Sense Amplifiers', category: 'CIs', props: {}, price: 1.2, datasheet: 'https://example.com/mcp6c02.pdf', source: 'Mouser API 2026-10-23' }
  fetch.mockImplementation(async url => ({ ok: true, json: async () => url.startsWith('/api/parts/lookup') ? { part, image: 'https://mm.digikey.com/mcp6c02.jpg' } : structuredClone(stock) }))
  wrapper = mount(App)
  await flushPromises()
  wrapper.findComponent(LabelScanner).vm.$emit('use', { mpn: 'MCP6C02T-100E/CHY', manufacturer: 'Microchip', qty: 3 })
  await flushPromises()
  expect(fetch).toHaveBeenCalledWith('/api/parts/lookup?mpn=MCP6C02T-100E%2FCHY', expect.objectContaining({ method: 'GET' }))
  const form = wrapper.find('dialog form')
  expect(form.find('input[list=movement-categories]').element.value).toBe('CIs')
  expect(form.findAll('.fields input').map(input => input.element.value)).toEqual(['MCP6C02T-100E/CHY', 'Microchip Technology'])
  expect(form.find('input[type=url]').element.value).toBe('https://mm.digikey.com/mcp6c02.jpg')
  expect(form.text()).toContain('Current Sense Amplifiers')
  expect(form.find('a[href="https://example.com/mcp6c02.pdf"]').exists()).toBe(true)
  expect(form.find('input[type=number]').element.value).toBe('3')
})

it('syncs an edited component with the Mouser/DigiKey APIs, keeping typed values and saving no extra price', async () => {
  const stock = {
    ...structuredClone(data),
    categories: [...data.categories, { name: 'CIs', props: ['P/N', 'Fabricante', 'Encapsulamento'], image: true }],
    items: [...data.items, { id: 3, cat: 'CIs', props: { 'P/N': 'NE555P', Fabricante: 'TI', Encapsulamento: '' }, qty: 2, image: '' }],
  }
  const part = { mpn: 'NE555P', manufacturer: 'Texas Instruments', description: 'Timer', category: 'CIs', props: { Encapsulamento: 'DIP-8' }, price: 0.4, datasheet: '', source: 'Mouser API 2026-10-24' }
  fetch.mockImplementation(async url => ({ ok: true, json: async () => url.startsWith('/api/parts/lookup') ? { part, image: 'https://example.com/ne555.jpg' } : structuredClone(stock) }))
  wrapper = mount(App)
  await flushPromises()
  await wrapper.findAll('tbody tr').find(tr => tr.text().includes('NE555P')).find('button[aria-label="Editar componente"]').trigger('click')
  const form = wrapper.find('dialog form')
  await form.find('.sync-part').trigger('click')
  await flushPromises()
  expect(fetch).toHaveBeenCalledWith('/api/parts/lookup?mpn=NE555P', expect.objectContaining({ method: 'GET' }))
  expect(form.findAll('.fields input').map(input => input.element.value)).toEqual(['NE555P', 'TI', 'DIP-8'])
  expect(form.find('input[type=number][step=any]').element.value).toBe('0.4')
  expect(form.find('input[type=url]').element.value).toBe('https://example.com/ne555.jpg')
  expect(form.text()).toContain('Timer')
  expect(form.text()).toContain('Sincronizado com a Mouser/DigiKey')
})

it('shows how much of a scanned P/N is already in stock, per location', async () => {
  const items = [{ id: 1, cat: 'CIs', props: { 'P/N': 'MCP6C02T-100E/CHY' }, qty: 5, location: 'A1' }, { id: 2, cat: 'CIs', props: { 'P/N': 'mcp6c02t-100e/chy' }, qty: 2, location: 'B3' }]
  const scanner = mount(LabelScanner, { props: { items, action: 'Adicionar' } })
  scanner.vm.label = { mpn: 'MCP6C02T-100E/CHY', qty: 1 }
  await flushPromises()
  expect(scanner.find('.label-data').text()).toContain('7 un. · 5 em A1 · 2 em B3')
  scanner.vm.label = { mpn: 'OTHER', qty: 1 }
  await flushPromises()
  expect(scanner.find('.label-data').text()).toContain('Não existe em stock')
  scanner.unmount()
})

it('opens the stock filtered by the location in a QR link, and renames a location from its page', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), items: [
    { ...data.items[0], location: 'Caixa 1' }, data.items[1],
  ], locations: { 'Caixa 1': '/uploads/a.jpg' } }) })
  window.history.replaceState(null, '', '/#/stock?location=Caixa%201')
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.find('.sub').text()).toBe('1 referência · 3 unidades')
  window.history.replaceState(null, '', '/#/locations')
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  await flushPromises()
  expect(wrapper.find('.location-card img').attributes('src')).toBe('/uploads/a.jpg')
  await wrapper.findAll('.location-card button').find(button => button.text() === 'Editar').trigger('click')
  await wrapper.find('.location-form input').setValue('Caixa A')
  await wrapper.find('.location-form').trigger('submit')
  await flushPromises()
  const request = fetch.mock.calls.find(([url]) => url === '/api/locations')
  expect(JSON.parse(request[1].body)).toEqual({ name: 'Caixa 1', newName: 'Caixa A' })
  await wrapper.find('.location-new input').setValue('Caixa 9')
  await wrapper.find('.location-new').trigger('submit')
  await flushPromises()
  expect(JSON.parse(fetch.mock.calls.filter(([url]) => url === '/api/locations').at(-1)[1].body)).toEqual({ name: 'Caixa 9', newName: 'Caixa 9' })
})

it('removes a photo and deletes only empty boxes', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), items: [{ ...data.items[0], location: 'Caixa 1' }],
    locations: { 'Caixa 1': '/uploads/a.jpg', Vazia: '' } }) })
  window.history.replaceState(null, '', '/#/locations')
  vi.stubGlobal('confirm', () => true)
  wrapper = mount(App)
  await flushPromises()
  const card = name => wrapper.findAll('.location-card').find(card => card.find('strong').text() === name)
  const button = (name, text) => card(name).findAll('button').find(button => button.text() === text)
  expect(button('Caixa 1', 'Apagar').attributes('disabled')).toBeDefined()
  await button('Vazia', 'Apagar').trigger('click')
  await flushPromises()
  const deleted = fetch.mock.calls.find(([url, options]) => url === '/api/locations' && options.method === 'DELETE')
  expect(JSON.parse(deleted[1].body)).toEqual({ name: 'Vazia' })
  await button('Caixa 1', 'Editar').trigger('click')
  await wrapper.find('.location-form .location-check input').setValue(true)
  await wrapper.find('.location-form').trigger('submit')
  await flushPromises()
  const edited = fetch.mock.calls.find(([url, options]) => url === '/api/locations' && options.method === 'PATCH')
  expect(JSON.parse(edited[1].body)).toEqual({ name: 'Caixa 1', newName: 'Caixa 1', image: '' })
})

it('prints one QR label per selected box with its fixed code', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), items: [{ ...data.items[0], location: 'Caixa 1' }],
    locations: { 'Caixa 1': '', Vazia: '' }, location_codes: { 'Caixa 1': 'K7Q2MX', Vazia: 'ABC234' } }) })
  window.history.replaceState(null, '', '/#/locations')
  let printed
  vi.stubGlobal('print', () => { printed = [...document.querySelectorAll('.qr-label')].map(label => [label.querySelector('title').textContent.split('#')[1], label.querySelector('strong').textContent, label.querySelector('small').textContent]) })
  wrapper = mount(App, { attachTo: document.body })
  await flushPromises()
  const print = () => wrapper.find('.location-print button')
  expect(print().text()).toBe('Imprimir QR (0)')
  await wrapper.find('.location-print input').setValue(true)
  expect(print().text()).toBe('Imprimir QR (2)')
  await print().trigger('click')
  await vi.waitFor(() => expect(printed).toEqual([['/stock?box=K7Q2MX', 'K7Q2MX', 'Caixa 1'], ['/stock?box=ABC234', 'ABC234', 'Vazia']]))
  expect(document.querySelector('.qr-labels')).toBeNull()
})

it('creates a drawer label, saves it on the server and prints it with its Data Matrix', async () => {
  const saved = { id: 7, title: 'Armário 2', fields: [{ name: 'Posição', value: 'A3' }], code: 'QRCode', location: '', width: 60, height: 25 }
  const labels = [saved]
  fetch.mockImplementation(async (url, options) => {
    const body = url === '/api/labels' && JSON.parse(options.body)
    if (body?.ids) labels.splice(0, labels.length, ...labels.filter(entry => !body.ids.includes(entry.id)))
    const added = body && !body.ids ? (body.labels || [body]).map((entry, index) => ({ ...entry, id: 7 + labels.length + index })) : []
    labels.push(...added)
    return { ok: true, json: async () => body ? { msg: 'Etiqueta guardada', ids: added.map(entry => entry.id) }
      : { ...structuredClone(data), items: [data.items[0], { ...data.items[1], location: 'Caixa 1' }], locations: { 'Caixa 1': '' }, location_codes: { 'Caixa 1': 'K7Q2MX' }, labels: structuredClone(labels) } }
  })
  window.history.replaceState(null, '', '/#/labels')
  vi.stubGlobal('confirm', () => true)
  let printed
  vi.stubGlobal('print', () => { printed = [...document.querySelectorAll('.qr-labels .drawer-label')].map(label => [label.querySelector('title')?.textContent, label.querySelector('.drawer-label-text').textContent]) })
  wrapper = mount(App, { attachTo: document.body })
  await flushPromises()
  const button = text => wrapper.findAll('button').find(button => button.text() === text)
  // A página abre na lista das etiquetas da equipa; carregar numa abre o editor, sem nada para guardar.
  expect(wrapper.findAll('.label-card-title').map(title => title.text())).toEqual(['Armário 2'])
  expect(wrapper.find('.drawer-label-editor').exists()).toBe(false)
  await wrapper.find('.label-card-title').trigger('click')
  expect(wrapper.find('input[placeholder="Armário 1"]').element.value).toBe('Armário 2')
  expect(button('Guardar').attributes('disabled')).toBeDefined()
  await button('+ Gaveta').trigger('click')
  await wrapper.find('input[placeholder="Armário 1"]').setValue('Armário 1')
  await wrapper.find('input[aria-label="Valor do campo 2"]').setValue('D20')
  await flushPromises()
  expect(wrapper.find('.drawer-label-preview .drawer-label-text').text()).toBe('Armário 1ModeloPosiçãoD20')
  expect(wrapper.find('.drawer-label-preview title').text()).toBe('Armário 1\nPosição: D20')
  // Ligar um componente preenche a etiqueta; sem localização própria, o código abre a gaveta do componente.
  const linked = wrapper.find('input[list="drawer-label-items"]')
  await linked.setValue('R&D · 10 Ω')
  await linked.trigger('change')
  expect(wrapper.find('input[placeholder="Armário 1"]').element.value).toBe('R&D')
  expect(wrapper.find('.drawer-label-icon').attributes('title')).toBe('Circuito integrado')
  await wrapper.find('.label-icon[aria-label="Porca sextavada"]').trigger('click')
  expect(wrapper.find('.drawer-label-icon').attributes('title')).toBe('Porca sextavada')
  await button('Guardar').trigger('click')
  await flushPromises()
  const post = fetch.mock.calls.find(([url]) => url === '/api/labels')
  expect(post[1].method).toBe('POST')
  expect(JSON.parse(post[1].body)).toEqual({ title: 'R&D', fields: [{ name: 'valor', value: '10 Ω' }], code: 'DataMatrix', location: '', width: 55, height: 25, icon: 'nut', item: 2, layout: 'drawer', screw: '', titleSize: null, fieldSize: null })
  // Guardar volta à lista, onde a etiqueta nova já aparece e se imprime.
  const titles = () => wrapper.findAll('.label-card-title').map(title => title.text())
  expect(titles()).toEqual(['Armário 2', 'R&D'])
  await wrapper.findAll('.label-card')[1].findAll('button').find(button => button.text() === 'Imprimir').trigger('click')
  await vi.waitFor(() => expect(printed).toEqual([[expect.stringMatching(/#\/stock\?box=K7Q2MX$/), 'R&Dvalor10 Ω']]))
  // Imprimir todas mistura tamanhos: cada etiqueta sai numa página do seu tamanho.
  let pages
  vi.stubGlobal('print', () => { pages = [[...document.querySelectorAll('.qr-labels .drawer-label')].map(label => label.className), [...document.head.querySelectorAll('style')].at(-1).textContent] })
  await button('Imprimir todas (2)').trigger('click')
  await vi.waitFor(() => expect(pages).toBeDefined())
  expect(pages[0]).toEqual(['drawer-label label-60x25', 'drawer-label label-55x25'])
  expect(pages[1]).toContain('@page label-60x25{size:60mm 25mm;margin:0}')
  expect(pages[1]).toContain('@page label-55x25{size:55mm 25mm;margin:0}')
  expect(document.querySelector('.qr-labels')).toBeNull()
  // O ponto de partida "Parafuso" é uma etiqueta de caixa com o desenho do parafuso, que cresce com o título.
  await button('+ Parafuso').trigger('click')
  const drawing = () => wrapper.find('.drawer-label-preview .bin-screw svg').attributes('viewBox')
  expect(wrapper.find('.drawer-label-preview .drawer-label.bin strong').text()).toBe('M3x10')
  const short = drawing()
  await wrapper.find('input[placeholder="M3x10"]').setValue('M5x30')
  expect(Number(drawing().split(' ')[2])).toBeGreaterThan(Number(short.split(' ')[2]))
  await wrapper.find('input[aria-label="Letra do título (pt)"]').setValue(14)
  expect(wrapper.find('.drawer-label-preview .drawer-label').attributes('style')).toContain('--title: 14pt')
  // Várias de uma vez: um título por linha cria uma etiqueta para cada, iguais no resto.
  await button('Várias de uma vez').trigger('click')
  await wrapper.find('textarea').setValue('M3x10\nM4x16\n\n M5x20 ')
  expect(wrapper.findAll('.drawer-label-preview strong').map(title => title.text())).toEqual(['M3x10', 'M4x16', 'M5x20'])
  await button('Guardar 3').trigger('click')
  await flushPromises()
  const batch = JSON.parse(fetch.mock.calls.filter(([url]) => url === '/api/labels').at(-1)[1].body).labels
  expect(batch.map(entry => [entry.title, entry.screw, entry.titleSize])).toEqual([['M3x10', 'screw-countersunk', 14], ['M4x16', 'screw-countersunk', 14], ['M5x20', 'screw-countersunk', 14]])
  expect(titles()).toEqual(['Armário 2', 'R&D', 'M3x10', 'M4x16', 'M5x20'])
  await wrapper.find('.label-card-title').trigger('click')
  await button('Apagar').trigger('click')
  await flushPromises()
  const deleted = () => fetch.mock.calls.filter(([url, options]) => url === '/api/labels' && options.method === 'DELETE').map(([, options]) => JSON.parse(options.body).ids)
  expect(deleted()).toEqual([[7]])
  // Na lista seleciona-se várias e apagam-se de uma vez.
  await wrapper.find('button[aria-label="Selecionar M4x16"]').trigger('click')
  await wrapper.find('button[aria-label="Selecionar M5x20"]').trigger('click')
  pages = undefined
  await button('Imprimir selecionadas (2)').trigger('click')
  await vi.waitFor(() => expect(pages?.[0]).toHaveLength(2))
  await button('Apagar selecionadas (2)').trigger('click')
  await flushPromises()
  expect(deleted().at(-1)).toEqual([10, 11])
  expect(titles()).toEqual(['R&D', 'M3x10'])
})

it('explains how to make labels in an illustrated step-by-step tutorial', async () => {
  window.history.replaceState(null, '', '/#/labels')
  wrapper = mount(App, { attachTo: document.body })
  await flushPromises()
  await wrapper.find('.label-heading-actions .tutorial-button').trigger('click')
  const dialog = wrapper.findAll('.tutorial-dialog').find(found => found.element.open)
  expect(dialog.element.open).toBe(true)
  expect(dialog.find('.eyebrow').text()).toBe('Passo 1 de 8')
  expect(dialog.find('h2').text()).toBe('Começa por um modelo')
  expect(dialog.findAll('.tutorial-figure .drawer-label')).toHaveLength(3)
  for (let step = 1; step < 8; step++) await dialog.findAll('button').find(button => button.text() === 'Seguinte').trigger('click')
  expect(dialog.find('h2').text()).toBe('Guardar e imprimir')
  await dialog.findAll('button').find(button => button.text() === 'Concluir').trigger('click')
  expect(dialog.element.open).toBe(false)
})

it('explains the inventory in a step-by-step tutorial that reads a real label photo', async () => {
  wrapper = mount(App, { attachTo: document.body })
  await flushPromises()
  await wrapper.find('.stock-content .tutorial-button').trigger('click')
  const dialog = wrapper.findAll('.tutorial-dialog').find(found => found.element.open)
  expect(dialog.find('.eyebrow').text()).toBe('Passo 1 de 7')
  await dialog.findAll('.tutorial-dot')[2].trigger('click')
  expect(dialog.find('h2').text()).toBe('Ler a etiqueta da encomenda')
  expect(dialog.find('.tut-photo img').attributes('src')).toBe('/static/tutorial/mouser-label.webp')
})

it('replaces the BOM of a saved PCB project and keeps its name and STEP', async () => {
  const step = { name: 'placa.step', url: '/uploads/placa.step' }
  const server = pcbServer([{ id: 'p1', name: 'Placa', fileName: 'v1.csv', step, items: [{ reference: 'R1', value: '10k', description: '—', footprint: '—', partNumber: '—', quantity: 1 }] }])
  window.history.replaceState(null, '', '/#/pcbs')
  vi.stubGlobal('confirm', () => true)
  wrapper = mount(App)
  await flushPromises()
  await wrapper.find('.saved-project-open').trigger('click')
  const input = wrapper.find('input[aria-label="Substituir ficheiro BOM"]')
  Object.defineProperty(input.element, 'files', { value: [{ name: 'v2.csv', text: async () => 'Reference,Value,Qty\nC1,100nF,3' }] })
  await input.trigger('change')
  await flushPromises()
  const [saved] = server
  expect(saved).toMatchObject({ name: 'Placa', fileName: 'v2.csv', step, items: [{ reference: 'C1', value: '100nF', quantity: 3 }] })
  expect(wrapper.find('.pcb-project-detail').text()).toContain('v2.csv')
})

it('flips a mirrored webcam and remembers it', async () => {
  const scanner = mount(LabelScanner, { props: { action: 'Adicionar' } })
  scanner.vm.camera = true
  await flushPromises()
  const mirror = () => scanner.findAll('button').find(button => button.text() === 'Espelhar')
  await mirror().trigger('click')
  expect(scanner.find('video').classes()).toContain('mirrored')
  expect(mirror().attributes('aria-pressed')).toBe('true')
  expect(JSON.parse(localStorage.getItem('stocklart-scanner-mirrored'))).toBe(true)
  scanner.unmount()
})

it('takes a location photo with the phone camera and previews it before saving', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), locations: { 'Caixa 1': '/uploads/a.jpg' } }) })
  window.history.replaceState(null, '', '/#/locations')
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:nova', revokeObjectURL: () => {} }))
  wrapper = mount(App)
  await flushPromises()
  await wrapper.findAll('.location-card button').find(button => button.text() === 'Editar').trigger('click')
  const camera = wrapper.find('.location-form input[capture=environment]')
  expect(camera.attributes('accept')).toBe('image/*')
  Object.defineProperty(camera.element, 'files', { value: [new File(['x'], 'foto.jpg', { type: 'image/jpeg' })] })
  await camera.trigger('change')
  expect(wrapper.find('.location-card img').attributes('src')).toBe('blob:nova')
  expect(wrapper.find('.location-form .location-check input').attributes('disabled')).toBeDefined()
})

it.each(['Member', 'Board', 'Department Leader'])('keeps PCB/BOMs read-only for a non-Electronics %s, even their own projects', async role => {
  const user = { id: 2, name: 'Rui', admin: false, role, department: 'Powertrain' }
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), auth: true, user }) })
  pcbServer([{ id: 'owned', name: 'My PCB', createdBy: { id: 2, name: 'Rui' }, items: [] }])
  localStorage.setItem('stocklart-pcb-projects', JSON.stringify([{ id: 'local', name: 'Local PCB', items: [] }]))
  window.history.replaceState(null, '', '/#/pcbs')
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.text()).not.toContain('Novo projeto PCB')
  expect(wrapper.find('.saved-project-delete').exists()).toBe(false)
  await wrapper.find('.saved-project-open').trigger('click')
  expect(wrapper.find('.pcb-project-detail').text()).toContain('My PCB')
  expect(wrapper.find('input[aria-label="Substituir ficheiro BOM"]').exists()).toBe(false)
  expect(wrapper.find('input[aria-label="Anexar imagem da PCB"]').exists()).toBe(false)
  expect(fetch.mock.calls.filter(([url, options]) => url === '/api/pcb-projects' && options.method === 'POST')).toHaveLength(0)
  expect(JSON.parse(localStorage.getItem('stocklart-pcb-projects'))).toHaveLength(1)
})

it('hides location mutation controls from non-Electronics users', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...structuredClone(data), auth: true,
    user: { id: 2, name: 'Rui', admin: false, role: 'Board', department: 'Powertrain' }, locations: { 'Original box': '' } }) })
  window.history.replaceState(null, '', '/#/locations')
  wrapper = mount(App)
  await flushPromises()
  expect(wrapper.text()).toContain('Original box')
  expect(wrapper.find('.location-new').exists()).toBe(false)
  expect(wrapper.findAll('button').some(button => ['Editar', 'Apagar'].includes(button.text()))).toBe(false)
})
