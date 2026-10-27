import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { createServer } from 'vite'

let server, pages, root, container
before(async () => {
  const dom = new JSDOM('<div id="test"></div>', { url: 'http://localhost/harness/', pretendToBeVisual: true })
  for (const key of ['window', 'document', 'HTMLElement', 'Element', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) globalThis[key] = dom.window[key]
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname, optimizeDeps: { noDiscovery: true, include: [] }, root: new URL('..', import.meta.url).pathname, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  pages = await server.ssrLoadModule('/src/pages.jsx')
  container = document.getElementById('test')
  root = createRoot(container)
})
after(async () => { await act(() => root?.unmount()); await server?.close() })
const render = async (element) => act(() => root.render(React.createElement(MantineProvider, { env: 'test', forceColorScheme: 'dark' }, element)))
const harness = {
  code: 'TEST', meta: { code: 'TEST', name: 'Ensaio', category: 'car', wires: 450, connectors: 0 },
  H: { conns: new Map(), pins: new Map() }, findings: [],
  model: { sheets: { Wires: Array.from({ length: 450 }, (_, i) => ({ wire_id: `W-${i}`, from_ref: 'J1', to_ref: 'J2' })), Connectors: [], Pins: [], Issues: [], Segments: [], Nodes: [], Parts: [] } },
}
const data = { list: [harness], byCode: new Map([['TEST', harness]]), missing: [], carFindings: [{ sev: 'critical', msg: 'Problema crítico', refs: [], wires: [] }], index: { car: 'T26e', generated: '2026-10-27', mates: [] } }

test('a pesquisa precede o resumo expansível dos problemas no início', async () => {
  await render(React.createElement(pages.CarOverview, { data }))
  const search = container.querySelector('input')
  const details = container.querySelector('details')
  assert.ok(details, 'os problemas têm uma divulgação nativa')
  assert.ok(search.compareDocumentPosition(details) & window.Node.DOCUMENT_POSITION_FOLLOWING)
  assert.equal(details.open, false)
  assert.match(details.querySelector('summary').textContent, /1.*Crítico|Crítico.*1/)
  assert.match(details.textContent, /Problema crítico/)
})

test('a lista de fios carrega todas as páginas e reinicia ao mudar o harness', async () => {
  await render(React.createElement(pages.Wires, { data, code: '' }))
  assert.equal(container.querySelectorAll('tbody tr').length, 100)
  for (let count = 200; count <= 500; count += 100) {
    const more = [...container.querySelectorAll('button')].find((b) => /Mostrar mais/.test(b.textContent))
    assert.ok(more, 'há uma ação explícita para os restantes fios')
    await act(() => more.click())
    assert.equal(container.querySelectorAll('tbody tr').length, Math.min(count, 450))
  }
  assert.ok(![...container.querySelectorAll('button')].some((b) => /Mostrar mais/.test(b.textContent)))
  await render(React.createElement(pages.Wires, { data, code: 'TEST' }))
  assert.equal(container.querySelectorAll('tbody tr').length, 100)
})
