import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { Alert, Anchor, Badge, Button, CloseButton, Group, Loader, NativeSelect, Paper, Stack, Switch, Text, Title } from '@mantine/core'
import { boardOf, ends, txt } from './lib/harness.js'
import { connKey, placeConnectors } from './lib/positions.js'
import { href } from './pages.jsx'

const MODEL = `${import.meta.env.BASE_URL}data/t26/model.glb`
let modelPromise // o GLB carrega uma vez por visita ao site
const loadModel = () => (modelPromise ||= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL))

const PALETTE = ['#4dabf7', '#ff922b', '#69db7c', '#f783ac', '#ffd43b', '#9775fa', '#3bc9db', '#ff6b6b', '#a9e34b', '#e599f7', '#74c0fc', '#ffa94d', '#63e6be', '#faa2c1']
const WIRE = { BK: '#adb5bd', BN: '#a0522d', RD: '#fa5252', OG: '#fd7e14', YE: '#fcc419', GN: '#40c057', BU: '#339af0', VT: '#9775fa', GY: '#ced4da', WH: '#f8f9fa', PK: '#f783ac', TQ: '#22b8cf' }
const PICKS = 'lart-harness-picks'
const readPicks = () => {
  try { return JSON.parse(localStorage.getItem(PICKS)) || [] } catch { return [] }
}
const savePicks = (p) => {
  try { localStorage.setItem(PICKS, JSON.stringify(p)) } catch { /* sem armazenamento: os picks duram até fechar a página */ }
}
const fmt = (p) => p.map((v) => v.toFixed(3)).join(', ')

// fios e conectores em foco: um circuito (trace) ou um conector
function focusOf(data, mode, code, id) {
  if (mode === 't') {
    const h = data.byCode.get(code)
    const w = h?.H.wireById.get(id)
    if (!w) return null
    const c = data.car.circuitOf.get(w)
    const wires = c ? c.wires : h.H.circuitOf.get(w).wires.map((x) => ({ code, w: x }))
    const nets = [...new Set(wires.map((x) => txt(x.w.net)).filter(Boolean))].slice(0, 4).join(' / ')
    return { title: `Circuito ${nets || id}`, back: href('t', code, id), wires, conns: new Set(wires.flatMap((x) => ends(x.w).map((e) => connKey(x.code, e.ref)))) }
  }
  if (mode === 'c') {
    const mate = data.car.mateOf.get(`${code}\u0001${id}`)
    const sides = [[code, id], ...(mate ? [[mate.code, mate.ref]] : [])]
    const wires = sides.flatMap(([c, r]) => (data.byCode.get(c)?.model.sheets.Wires || []).filter((w) => ends(w).some((e) => e.ref === r)).map((w) => ({ code: c, w })))
    return { title: `${id} (${code})`, back: href('c', code, id), wires, conns: new Set([...sides.map(([c, r]) => connKey(c, r)), ...wires.flatMap((x) => ends(x.w).map((e) => connKey(x.code, e.ref)))]) }
  }
  return null
}

const arc = (a, b) => {
  const d = a.distanceTo(b)
  const mid = a.clone().add(b).multiplyScalar(0.5)
  mid.y += Math.min(0.12, 0.02 + 0.06 * d) // arco para cima, para o fio não atravessar o chassis no desenho
  return new THREE.QuadraticBezierCurve3(a, mid, b)
}

export default function Viewer3D({ data, mode, code, id, pickPage = false }) {
  const box = useRef(null)
  const three = useRef(null)
  const [status, setStatus] = useState('loading')
  const [filter, setFilter] = useState('')
  const [xray, setXray] = useState(true)
  const [pick, setPick] = useState(pickPage)
  const [point, setPoint] = useState(null)
  const [part, setPart] = useState('')
  const [target, setTarget] = useState('')
  const [picks, setPicks] = useState(readPicks)
  const [hover, setHover] = useState(null)
  const [selected, setSelected] = useState(null)
  const [copied, setCopied] = useState(false)
  const focus = useMemo(() => focusOf(data, mode, code, id), [data, mode, code, id])
  const colourOf = useMemo(() => new Map(data.list.map((h, i) => [h.code, PALETTE[i % PALETTE.length]])), [data])
  const [positions, setPositions] = useState(new Map())

  // --- cena, câmara, controlos e modelo (uma vez)
  useEffect(() => {
    const el = box.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    el.appendChild(renderer.domElement)
    renderer.domElement.setAttribute('aria-label', 'Modelo 3D do carro com os conectores')
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x223355, 2.2))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(2, 3, 1)
    scene.add(sun)
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    const groups = { wires: new THREE.Group(), marks: new THREE.Group(), focus: new THREE.Group(), pick: new THREE.Group() }
    Object.values(groups).forEach((g) => scene.add(g))
    const t = { renderer, scene, camera, controls, groups, model: null }
    three.current = t
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()
    let raf
    const loop = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()
    loadModel().then((gltf) => {
      if (three.current !== t) return
      const model = gltf.scene
      const byName = new Map()
      model.traverse((o) => {
        if (o.userData?.name) byName.set(o.userData.name, o)
        if (o.isMesh) {
          o.material.userData.base ??= { opacity: o.material.opacity, transparent: o.material.transparent, depthWrite: o.material.depthWrite }
        }
      })
      t.model = model
      t.anchorPos = (name) => {
        const o = byName.get(name)
        return o ? new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).toArray() : null
      }
      scene.add(model)
      setStatus('ready')
    }, (e) => setStatus(`Não consegui carregar o modelo 3D: ${e.message}`))
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      if (t.model) scene.remove(t.model)
      Object.values(groups).forEach((g) => g.traverse((o) => o.geometry?.dispose()))
      renderer.dispose()
      el.removeChild(renderer.domElement)
      three.current = null
    }
  }, [])

  // --- raio-x
  useEffect(() => {
    three.current?.model?.traverse((o) => {
      if (!o.isMesh) return
      const b = o.material.userData.base
      Object.assign(o.material, xray ? { opacity: 0.13, transparent: true, depthWrite: false } : b)
      o.material.needsUpdate = true
    })
  }, [xray, status])

  // --- posições (csv + picks locais + peças do modelo + acoplamentos)
  useEffect(() => {
    if (status !== 'ready') return
    const rows = [...data.positionRows, ...picks.map((p) => ({ harness: p.code, ref: p.ref, xyz: p.pos, source: 'pick', notes: `pick ${p.at}` }))]
    setPositions(placeConnectors(data, rows, three.current.anchorPos))
  }, [status, picks, data])

  // --- marcadores, fios e foco
  useEffect(() => {
    const t = three.current
    if (!t || status !== 'ready') return
    const { wires, marks, focus: hi } = t.groups
    for (const g of [wires, marks, hi]) {
      g.traverse((o) => o.geometry?.dispose())
      g.clear()
    }
    const inScope = (c) => !filter || c === filter
    const at = (c, r) => positions.get(connKey(c, r))?.pos
    const sphere = new THREE.SphereGeometry(1, 16, 12)
    const mat = new Map()
    const dot = (colour, opacity) => {
      const k = colour + opacity
      if (!mat.has(k)) mat.set(k, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthTest: false }))
      return mat.get(k)
    }
    // feixes: um tubo por par de conectores, grossura pelo nº de fios
    const bundles = new Map()
    for (const h of data.list) {
      if (!inScope(h.code)) continue
      for (const w of h.model.sheets.Wires) {
        const [a, b] = ends(w).map((e) => e.ref).sort()
        const [pa, pb] = [at(h.code, a), at(h.code, b)]
        if (!pa || !pb) continue
        const k = `${pa}|${pb}`
        bundles.set(k, { pa, pb, n: (bundles.get(k)?.n || 0) + 1 })
      }
    }
    for (const { pa, pb, n } of bundles.values()) {
      const [a, b] = [new THREE.Vector3(...pa), new THREE.Vector3(...pb)]
      if (a.distanceTo(b) < 0.002) continue
      const m = new THREE.MeshBasicMaterial({ color: '#74c0fc', transparent: true, opacity: focus ? 0.08 : 0.35, depthWrite: false })
      wires.add(new THREE.Mesh(new THREE.TubeGeometry(arc(a, b), 24, 0.0018 + 0.0005 * Math.sqrt(n), 6), m))
    }
    // conectores
    for (const [k, p] of positions) {
      const [c, ref] = k.split('\u0001')
      if (!inScope(c) && !focus?.conns.has(k)) continue
      const on = focus?.conns.has(k)
      const m = new THREE.Mesh(sphere, dot(colourOf.get(c), focus && !on ? 0.25 : 0.95))
      m.position.set(...p.pos)
      m.scale.setScalar(on ? 0.016 : 0.01)
      m.renderOrder = 10
      m.userData = { key: k, code: c, ref }
      marks.add(m)
    }
    // circuito em foco, com as cores dos fios
    if (focus) {
      focus.wires.forEach(({ code: c, w }, i) => {
        const [e1, e2] = ends(w)
        const [pa, pb] = [at(c, e1.ref), at(c, e2.ref)]
        if (!pa || !pb) return
        const [a, b] = [new THREE.Vector3(...pa), new THREE.Vector3(...pb)]
        if (a.distanceTo(b) < 0.002) return
        b.y += 0.0015 * (i % 5) // fios do mesmo feixe ligeiramente afastados
        const m = new THREE.MeshBasicMaterial({ color: WIRE[txt(w.colour).toUpperCase().split('/')[0]] || '#e9ecef', depthTest: false, transparent: true })
        const tube = new THREE.Mesh(new THREE.TubeGeometry(arc(a, b), 32, 0.0035, 8), m)
        tube.renderOrder = 9
        hi.add(tube)
      })
    }
    // enquadrar: o foco, ou o carro inteiro
    const pts = focus ? [...focus.conns].map((k) => positions.get(k)?.pos).filter(Boolean) : []
    const bb = pts.length ? new THREE.Box3().setFromPoints(pts.map((p) => new THREE.Vector3(...p))) : new THREE.Box3().setFromObject(t.model)
    const centre = bb.getCenter(new THREE.Vector3())
    const size = Math.max(bb.getSize(new THREE.Vector3()).length(), 0.35)
    t.controls.target.copy(centre)
    t.camera.position.copy(centre).add(new THREE.Vector3(1.1, 0.9, -1.2).normalize().multiplyScalar(size * 1.3))
  }, [positions, filter, focus, status, data, colourOf])

  // --- rato: hover nos conectores, clique para selecionar ou (modo pick) apanhar um ponto do modelo
  useEffect(() => {
    const t = three.current
    if (!t || status !== 'ready') return
    const el = t.renderer.domElement
    const ray = new THREE.Raycaster()
    const ndc = (e) => {
      const r = el.getBoundingClientRect()
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }
    const hitMark = (e) => {
      ray.setFromCamera(ndc(e), t.camera)
      return ray.intersectObjects(t.groups.marks.children)[0]?.object.userData
    }
    let down = null
    const move = (e) => {
      const m = hitMark(e)
      const r = el.getBoundingClientRect()
      setHover(m ? { ...m, x: e.clientX - r.left, y: e.clientY - r.top } : null)
      el.style.cursor = m || pick ? 'pointer' : 'grab'
    }
    const press = (e) => (down = [e.clientX, e.clientY])
    const release = (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return // foi arrastar, não clicar
      if (pick) {
        ray.setFromCamera(ndc(e), t.camera)
        const hit = ray.intersectObject(t.model, true)[0]
        if (!hit) return
        setPoint(hit.point.toArray())
        let o = hit.object
        while (o && !o.userData?.name) o = o.parent
        setPart(o?.userData.name || '')
        t.groups.pick.clear()
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), new THREE.MeshBasicMaterial({ color: '#ff4d4f', depthTest: false }))
        m.position.copy(hit.point)
        m.renderOrder = 11
        t.groups.pick.add(m)
      } else setSelected(hitMark(e) || null)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerdown', press)
    el.addEventListener('pointerup', release)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerdown', press)
      el.removeEventListener('pointerup', release)
    }
  }, [status, pick])
  useEffect(() => {
    if (!pick) {
      three.current?.groups.pick.clear()
      setPoint(null)
    }
  }, [pick])

  const all = data.list.flatMap((h) => [...h.H.conns.values()].filter((c) => txt(c.type).toUpperCase() !== 'SPLICE').map((c) => ({ code: h.code, ref: txt(c.ref) })))
  const scoped = all.filter((c) => !filter || c.code === filter)
  const unplaced = scoped.filter((c) => !positions.has(connKey(c.code, c.ref)))
  const info = (k) => {
    const [c, ref] = k.split('\u0001')
    const p = data.byCode.get(c)?.H.conns.get(ref)
    return { c, ref, p, place: positions.get(k) }
  }
  const addPick = () => {
    const [c, ref] = target.split('\u0001')
    const next = [...picks.filter((p) => !(p.code === c && p.ref === ref)), { code: c, ref, pos: point, part, at: new Date().toISOString().slice(0, 10) }]
    setPicks(next)
    savePicks(next)
    setTarget('')
  }
  const csvLines = picks.map((p) => [p.code, p.ref, '', ...p.pos.map((v) => v.toFixed(3)), `"pick ${p.at}${p.part ? ` · ${p.part.replaceAll('"', '')}` : ''}"`].join(',')).join('\n')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(csvLines)
    } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: csvLines })
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const sel = selected && info(selected.key)

  return (
    <Stack gap="md" mt="xl">
      <div>
        <Title order={2}>{pickPage ? 'Coordenadas' : '3D'} · {data.index.car}</Title>
        {pickPage ? (
          <Text size="sm" c="dimmed">Clica no CAD no sítio de um conector, escolhe qual é e carrega em Guardar. No fim, copia as linhas e manda-mas para eu as pôr no positions.csv.{positions.size > 0 && ` Faltam ${all.filter((c) => !positions.has(connKey(c.code, c.ref))).length} de ${all.length} conectores.`}</Text>
        ) : focus ? (
          <Text size="sm" c="dimmed">{focus.title} · <Anchor href={focus.back} size="sm">voltar</Anchor> · <Anchor href={href('3d')} size="sm">ver o carro todo</Anchor></Text>
        ) : (
          <Text size="sm" c="dimmed">{positions.size} de {all.length} conectores com posição. Os que faltam (caixas que não estão no CAD) põem-se com o modo pick.</Text>
        )}
      </div>
      <Group gap="lg" wrap="wrap">
        <NativeSelect aria-label="Harness" value={filter} onChange={(e) => setFilter(e.currentTarget.value)} style={{ flex: '0 0 220px' }}
          data={[{ value: '', label: 'Todos os harnesses' }, ...data.list.map((h) => ({ value: h.code, label: `${h.code} · ${h.meta.name}` }))]} />
        <Switch label="Raio-x" checked={xray} onChange={(e) => setXray(e.currentTarget.checked)} />
        <Switch label="Modo pick" checked={pick} onChange={(e) => setPick(e.currentTarget.checked)} />
      </Group>

      <div className="glass">
        <Paper radius={10} bg="dark.8" style={{ position: 'relative', overflow: 'hidden' }}>
          <div ref={box} className="viewer" />
          {status === 'loading' && (
            <Group gap="sm" style={{ position: 'absolute', inset: 0, justifyContent: 'center' }}><Loader size="sm" /><Text c="dimmed">A carregar o modelo 3D…</Text></Group>
          )}
          {status !== 'loading' && status !== 'ready' && <Alert color="red" m="md" style={{ position: 'absolute', top: 0 }}>{status}</Alert>}
          {hover && (
            <Paper p={6} radius="sm" bg="dark.6" withBorder style={{ position: 'absolute', left: hover.x + 12, top: hover.y + 12, pointerEvents: 'none', maxWidth: 260 }}>
              <Text size="xs" fw={600}>{hover.ref}</Text>
              <Text size="xs" c="dimmed">{data.byCode.get(hover.code)?.meta.name} · {positions.get(hover.key)?.source}</Text>
            </Paper>
          )}
          {pick && !point && <Text size="xs" c="dimmed" style={{ position: 'absolute', left: 12, bottom: 10 }}>Modo pick: clica no sítio do modelo onde fica o conector.</Text>}
        </Paper>
      </div>

      <Group gap="xs">
        {data.list.filter((h) => !filter || h.code === filter).map((h) => (
          <Badge key={h.code} variant="dot" color={colourOf.get(h.code)} styles={{ root: { textTransform: 'none' } }}>{h.code}</Badge>
        ))}
      </Group>

      {sel && (
        <Paper p="md" radius="md" bg="dark.7" withBorder>
          <Group justify="space-between" align="flex-start">
            <div>
              <Text fw={600}>{sel.ref} <Text span c="dimmed" size="sm">· {data.byCode.get(sel.c)?.meta.name}</Text></Text>
              <Text size="sm" c="dimmed">Posição: {sel.place ? `${fmt(sel.place.pos)} m · origem: ${sel.place.source}${sel.place.note ? ` (${sel.place.note})` : ''}` : '—'}</Text>
              <Group gap="md" mt={6}>
                <Anchor href={href('c', sel.c, sel.ref)} size="sm">Abrir conector →</Anchor>
                <Anchor href={href('3d', 'c', sel.c, sel.ref)} size="sm">Ver as ligações no 3D</Anchor>
                {boardOf(data.boards, sel.c, sel.ref) && (
                  <Anchor href={boardOf(data.boards, sel.c, sel.ref).url} target="_blank" rel="noopener noreferrer" size="sm">{boardOf(data.boards, sel.c, sel.ref).name} no Altium ↗</Anchor>
                )}
              </Group>
            </div>
            <CloseButton aria-label="Fechar" onClick={() => setSelected(null)} />
          </Group>
        </Paper>
      )}

      {pick && (
        <Paper p="md" radius="md" bg="dark.7" withBorder>
          <Stack gap="sm">
            <Text fw={600}>Modo pick</Text>
            {point ? (
              <Group gap="sm" wrap="wrap" align="flex-end">
                <div>
                  <Text size="sm" ff="monospace">x, y, z = {fmt(point)} m</Text>
                  {part && <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>Peça: {part}</Text>}
                </div>
                <NativeSelect aria-label="Conector" value={target} onChange={(e) => setTarget(e.currentTarget.value)} style={{ flex: '1 1 260px' }}
                  data={[{ value: '', label: 'Que conector fica aqui?' },
                    { group: 'Sem posição', items: unplaced.map((c) => ({ value: connKey(c.code, c.ref), label: `${c.ref} · ${c.code}` })) },
                    { group: 'Todos', items: scoped.map((c) => ({ value: connKey(c.code, c.ref), label: `${c.ref} · ${c.code}` })) }]} />
                <Button onClick={addPick} disabled={!target}>Guardar</Button>
              </Group>
            ) : <Text size="sm" c="dimmed">Clica no modelo para apanhar um ponto.</Text>}
            {picks.length > 0 && (
              <>
                <Text size="sm" c="dimmed">Guardados neste browser ({picks.length}). Para ficarem para toda a equipa, copia as linhas para o positions.csv do servidor.</Text>
                <Stack gap={2}>
                  {picks.map((p) => (
                    <Group key={p.code + p.ref} gap="xs" wrap="nowrap">
                      <Text size="sm" ff="monospace" style={{ overflowWrap: 'anywhere' }}>{p.code} · {p.ref} · {fmt(p.pos)}</Text>
                      <CloseButton size="sm" aria-label={`Apagar ${p.ref}`} onClick={() => { const n = picks.filter((x) => x !== p); setPicks(n); savePicks(n) }} />
                    </Group>
                  ))}
                </Stack>
                <Group gap="sm">
                  <Button variant="light" onClick={copy}>{copied ? 'Copiado ✓' : 'Copiar linhas para o positions.csv'}</Button>
                </Group>
              </>
            )}
          </Stack>
        </Paper>
      )}

      {!focus && unplaced.length > 0 && (
        <Text size="sm" c="dimmed">Sem posição ({unplaced.length}): {unplaced.slice(0, 40).map((c) => `${c.ref} (${c.code})`).join(', ')}{unplaced.length > 40 ? ' …' : ''}</Text>
      )}
    </Stack>
  )
}
