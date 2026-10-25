import { lazy, Suspense, useEffect, useState } from 'react'
import { Alert, Anchor, Container, Group, Loader, Text } from '@mantine/core'
import { indexCar, indexHarness } from './lib/harness.js'
import { validate, validateCar } from './lib/validate.js'
import { CarOverview, Connector, Connectors, HarnessPage, href, Issues, Trace, Wires } from './pages.jsx'
import { BomPage, DiagramPage, FormboardPage } from './pages2d.jsx'
import { parsePositions } from './lib/positions.js'
import Validate from './Validate.jsx'

const Viewer3D = lazy(() => import('./Viewer3D.jsx')) // three.js só carrega na página 3D

// os Excels vivem no próprio site: para atualizar basta substituir o ficheiro do harness em data/t26/
const DATA = `${import.meta.env.BASE_URL}data/t26/`
const NAV = [['', 'Harnesses'], ['connectors', 'Conectores'], ['wires', 'Fios'], ['diagram', '2D'], ['3d', '3D'], ['pick', 'Coordenadas'], ['bom', 'BOM'], ['issues', 'Issues'], ['validate', 'Validar']]
const SECTION = { c: 'connectors', t: 'wires', h: '', formboard: 'diagram' }

function useRoute() {
  const read = () => location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => (setRoute(read()), window.scrollTo(0, 0))
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return route
}

async function load(setProgress) {
  const get = async (name) => {
    const res = await fetch(DATA + name, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
    return res
  }
  const index = await (await get('index.json')).json()
  const catalog = await fetch(DATA + 'catalog.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null), () => null)
  const { parseWorkbook } = await import('./lib/model.js')
  const withFile = index.harnesses.filter((h) => h.file)
  let done = 0
  const list = await Promise.all(withFile.map(async (meta) => {
    const model = parseWorkbook(new Uint8Array(await (await get(meta.file)).arrayBuffer()))
    setProgress(`${++done}/${withFile.length}`)
    return { code: meta.code, meta, model, H: indexHarness(model), findings: validate(model, catalog) }
  }))
  const car = indexCar(list.filter((h) => h.meta.category === 'car'), index.mates)
  const csv = await fetch(DATA + 'positions.csv', { cache: 'no-cache' }).then((r) => (r.ok ? r.text() : ''), () => '')
  const boards = await fetch(DATA + 'boards.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null), () => null)
  const layout = await fetch(DATA + 'layout.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null), () => null)
  return {
    index, list, car,
    byCode: new Map(list.map((h) => [h.code, h])),
    missing: index.harnesses.filter((h) => !h.file),
    carFindings: validateCar(list, car, index),
    positionRows: parsePositions(csv),
    boards,
    catalog,
    layout,
  }
}

export default function App() {
  const [page = '', a = '', b = '', c = ''] = useRoute()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  // Mudar coordenadas pede sessão no Stocklart (mesmo domínio); sem resposta conta como sem sessão.
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    fetch('/api/auth/me').then((r) => (r.ok ? r.json() : {})).then((d) => setSignedIn(Boolean(d.user)), () => {})
  }, [])

  useEffect(() => {
    load(setProgress).then(setData, (e) => setError(`Não consegui carregar os harnesses: ${e.message}`))
  }, [])

  const active = SECTION[page] ?? page
  let body
  if (error) body = <Alert color="red" mt="xl" title="Erro">{error}</Alert>
  else if (!data && page !== 'validate') body = <Group mt="xl" gap="sm"><Loader size="sm" /><Text c="dimmed">A carregar os harnesses… {progress}</Text></Group>
  else if (page === 'validate') body = <Validate data={data} code={a} />
  else if (page === 'h') body = <HarnessPage data={data} code={a} />
  else if (page === 'connectors') body = <Connectors data={data} code={a} />
  else if (page === 'c') body = <Connector data={data} code={a} refName={b} />
  else if (page === 'wires') body = <Wires data={data} code={a} />
  else if (page === 't') body = <Trace data={data} code={a} wireId={b} />
  else if (page === 'issues') body = <Issues data={data} code={a} />
  else if (page === 'bom') body = <BomPage data={data} code={a} />
  else if (page === 'diagram') body = <DiagramPage data={data} code={a} refName={b} />
  else if (page === 'formboard') body = <FormboardPage key={a} data={data} code={a} refName={b} />
  else if (page === '3d' || page === 'pick') body = <Suspense fallback={<Loader size="sm" mt="xl" />}><Viewer3D key={page + signedIn} data={data} mode={a} code={b} id={c} pickPage={page === 'pick' && signedIn} canPick={signedIn} /></Suspense>
  else body = <CarOverview data={data} />

  return (
    <>
      <Container fluid px={{ base: 'md', sm: 'xl' }} py="md" component="header">
        <Group justify="space-between" gap="sm">
          <Anchor href={href('')} underline="never" c="white" fw={600}>
            LART <Text span c="dimmed">harness</Text>
          </Anchor>
          <Group gap="md" component="nav" aria-label="Secções" wrap="wrap">
            {NAV.filter(([id]) => id !== 'pick' || signedIn).map(([id, label]) => (
              <Anchor key={id} href={href(id)} size="sm" underline="never" c={active === id ? 'white' : 'dimmed'} fw={active === id ? 600 : 400}
                aria-current={active === id ? 'page' : undefined}>
                {label}
              </Anchor>
            ))}
          </Group>
        </Group>
      </Container>
      <Container fluid px={{ base: 'md', sm: 'xl' }} component="main" pb="xl">{body}</Container>
    </>
  )
}
