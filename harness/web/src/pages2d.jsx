import { useEffect, useMemo, useRef, useState } from 'react'
import { ActionIcon, Alert, Anchor, Badge, Button, Group, Progress, SegmentedControl, Select, SimpleGrid, Stack, Switch, Table, Text, Title } from '@mantine/core'
import { ends, txt } from './lib/harness.js'
import { bomCsv, bomOf, completeness, housingOf } from './lib/bom.js'
import { D, diagram, face, formboard, MISSING, spreadLabels, twist } from './lib/layout2d.js'
import { busById, CAN_BUSES, canPairs } from './lib/can.js'
import { Card, Colour, HarnessSelect, href, PartPhoto, Stats } from './pages.jsx'

const WIRE = { BK: '#adb5bd', BN: '#a0522d', RD: '#fa5252', OG: '#fd7e14', YE: '#fcc419', GN: '#40c057', BU: '#339af0', VT: '#9775fa', GY: '#ced4da', WH: '#f8f9fa', PK: '#f783ac', TQ: '#22b8cf' }
const wireColour = (w) => WIRE[txt(w.colour).toUpperCase().split('/')[0]] || '#868e96'
const eur = (v) => `${v.toFixed(2).replace('.', ',')} €`
const go = (h) => (location.hash = h)
const pct = (d, n) => (n ? Math.round((100 * d) / n) : 0)

// ---------------------------------------------------------------- o que falta a cada harness
export function Completeness({ data, h }) {
  const c = useMemo(() => completeness(h, data.catalog, (ref) => data.positionRows.some((r) => r.harness === h.code && r.ref === ref)), [data, h])
  return (
    <Card>
      <Group justify="space-between" mb="sm">
        <Text fw={500}>O que falta para ficar completo</Text>
        <Badge size="lg" variant="light" color={c.score >= 80 ? 'teal' : c.score >= 40 ? 'yellow' : 'red'}>{c.score}% completo</Badge>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" verticalSpacing={6}>
        {c.items.map(([label, done, n]) => (
          <div key={label}>
            <Group justify="space-between" gap={4}><Text size="sm">{label}</Text><Text size="xs" c="dimmed">{n ? `${done} / ${n}` : '—'}</Text></Group>
            <Progress value={pct(done, n)} size="sm" color={pct(done, n) === 100 ? 'teal' : 'blue'} aria-label={label} />
          </div>
        ))}
      </SimpleGrid>
      {!c.topology && <Text size="sm" c="dimmed" mt="sm">Sem topologia (troços e comprimentos do RapidHarness): o formboard e os comprimentos dos fios ficam por fazer.</Text>}
    </Card>
  )
}

// ---------------------------------------------------------------- BOM / lista de corte
export function BomPage({ data, code }) {
  const h = code && data.byCode.get(code)
  const rows = useMemo(() => data.list.map((x) => ({ h: x, bom: bomOf(x, data.catalog), c: completeness(x, data.catalog) })), [data])
  if (!h) {
    const total = rows.filter((r) => r.h.meta.category === 'car').reduce((s, r) => s + r.bom.cost, 0)
    return (
      <Stack gap="md" mt="xl">
        <Title order={2}>BOM e lista de corte</Title>
        <Group><HarnessSelect data={data} code={code} page="bom" /></Group>
        <Text size="sm" c="dimmed">Fichas, crimps e fio de cada harness, com o crimp escolhido pelo catálogo (lista da equipa no Notion). Custo estimado só com os preços conhecidos (1 unidade, sem IVA): não é cotação.</Text>
        <Stats items={[['custo estimado do carro', eur(total)], ['harnesses', rows.length]]} />
        <Table.ScrollContainer minWidth={760}>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Harness</Table.Th><Table.Th>Fichas com P/N</Table.Th><Table.Th>Pontas com crimp</Table.Th><Table.Th>Fio conhecido</Table.Th><Table.Th>Custo estimado</Table.Th><Table.Th>Completo</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {rows.map(({ h: x, bom, c }) => {
                const halves = bom.housings.reduce((s, y) => s + y.qty, 0)
                const withPn = bom.housings.filter((y) => y.pn).reduce((s, y) => s + y.qty, 0)
                const ends = bom.crimps.reduce((s, y) => s + y.qty, 0)
                const crimped = bom.crimps.filter((y) => y.pn).reduce((s, y) => s + y.qty, 0)
                const mm = bom.wire.reduce((s, y) => s + y.mm, 0)
                return (
                  <Table.Tr key={x.code}>
                    <Table.Td><Anchor href={href('bom', x.code)} size="sm">{x.meta.name}</Anchor> <Text span size="xs" c="dimmed">{x.code}</Text></Table.Td>
                    <Table.Td><Text size="sm">{withPn} / {halves}</Text></Table.Td>
                    <Table.Td><Text size="sm">{crimped} / {ends}</Text></Table.Td>
                    <Table.Td><Text size="sm">{mm ? `${(mm / 1000).toFixed(1)} m` : '—'}</Text></Table.Td>
                    <Table.Td><Text size="sm">{bom.cost ? eur(bom.cost) : '—'}</Text></Table.Td>
                    <Table.Td><Progress value={c.score} size="sm" w={90} aria-label={`${c.score}% completo`} /></Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Stack>
    )
  }
  const bom = rows.find((r) => r.h === h).bom
  const download = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + bomCsv(h.code, bom)], { type: 'text/csv;charset=utf-8' }))
    Object.assign(document.createElement('a'), { href: url, download: `BOM_${h.code}.csv` }).click()
    URL.revokeObjectURL(url)
  }
  const T = ({ head, children }) => (
    <Table.ScrollContainer minWidth={640}>
      <Table striped><Table.Thead><Table.Tr>{head.map((x) => <Table.Th key={x}>{x}</Table.Th>)}</Table.Tr></Table.Thead><Table.Tbody>{children}</Table.Tbody></Table>
    </Table.ScrollContainer>
  )
  const Pn = ({ pn }) => (pn
    ? <Group gap="sm" wrap="nowrap"><PartPhoto catalog={data.catalog} pn={pn} size={40} /><Text size="sm" ff="monospace">{pn}</Text></Group>
    : <Badge color="red" variant="light">por definir</Badge>)
  return (
    <Stack gap="md" mt="xl">
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>BOM · {h.meta.name}</Title>
        <Group gap="sm"><HarnessSelect data={data} code={code} page="bom" /><Button variant="light" onClick={download}>Descarregar CSV</Button></Group>
      </Group>
      <Stats items={[['custo estimado', bom.cost ? eur(bom.cost) : '—'], ['peças sem preço', bom.unpriced], ['fichas', bom.housings.reduce((s, x) => s + x.qty, 0)], ['crimps', bom.crimps.reduce((s, x) => s + x.qty, 0)]]} />
      <Title order={3}>Fichas</Title>
      <T head={['P/N', 'Qtd.', 'Família', 'Preço (1 un.)', 'Onde']}>
        {bom.housings.map((x) => (
          <Table.Tr key={x.pn}>
            <Table.Td><Pn pn={x.pn} /></Table.Td><Table.Td>{x.qty}</Table.Td><Table.Td><Text size="sm">{x.family || '—'}</Text></Table.Td>
            <Table.Td><Text size="sm">{x.price != null ? eur(x.price) : '—'}</Text></Table.Td>
            <Table.Td>
              <Group gap={6}>{x.refs.map((r) => <Anchor key={r} href={href('c', h.code, r)} size="sm">{r}</Anchor>)}</Group>
              {x.over.length > 0 && <Text size="xs" c="red.4">Pinout com mais pinos do que a ficha: {x.over.join(', ')}</Text>}
            </Table.Td>
          </Table.Tr>
        ))}
      </T>
      <Title order={3}>Crimps</Title>
      <Text size="sm" c="dimmed">Uma linha por P/N: quantas pontas de fio levam esse contacto. O contacto vem da coluna contact_pn da ficha ou, se estiver vazia, do catálogo pela ficha e pela secção do fio.</Text>
      <T head={['P/N', 'Qtd.', 'Família', 'Preço (1 un.)', 'Notas']}>
        {bom.crimps.map((x) => (
          <Table.Tr key={x.pn}>
            <Table.Td><Pn pn={x.pn} /></Table.Td><Table.Td>{x.qty}</Table.Td><Table.Td><Text size="sm">{x.family || '—'}</Text></Table.Td>
            <Table.Td><Text size="sm">{x.price != null ? eur(x.price) : '—'}</Text></Table.Td>
            <Table.Td><Text size="xs" c="dimmed">{x.why.join(' · ')}</Text></Table.Td>
          </Table.Tr>
        ))}
      </T>
      {bom.seals.length > 0 && (
        <T head={['Vedante de fio', 'Qtd.']}>{bom.seals.map((x) => <Table.Tr key={x.pn}><Table.Td><Pn pn={x.pn} /></Table.Td><Table.Td>{x.qty}</Table.Td></Table.Tr>)}</T>
      )}
      <Title order={3}>Lista de corte (fio)</Title>
      <T head={['Cor', 'Secção', 'P/N do cabo', 'Fios', 'Comprimento', 'Sem comprimento']}>
        {bom.wire.map((x) => (
          <Table.Tr key={`${x.colour}${x.csa}${x.pn}`}>
            <Table.Td><Colour code={x.colour} /></Table.Td><Table.Td><Text size="sm">{x.csa ? `${x.csa} mm²` : '—'}</Text></Table.Td>
            <Table.Td><Text size="sm" ff="monospace">{x.pn || '—'}</Text></Table.Td><Table.Td>{x.n}</Table.Td>
            <Table.Td><Text size="sm">{x.mm ? `${(x.mm / 1000).toFixed(2)} m` : '—'}</Text></Table.Td><Table.Td><Text size="sm" c={x.unknown ? 'yellow.4' : 'dimmed'}>{x.unknown || '—'}</Text></Table.Td>
          </Table.Tr>
        ))}
      </T>
      <Text size="xs" c="dimmed">Comprimentos pela topologia (sem folgas de serviço nem de crimp). Fotos dos fabricantes via Digi-Key.</Text>
      {bom.tools.length > 0 && <Text size="sm">Ferramentas de crimpar: {bom.tools.join(', ')}</Text>}
    </Stack>
  )
}

// ---------------------------------------------------------------- diagrama de ligações 2D
export function DiagramPage({ data, code }) {
  const h = data.byCode.get(code) || data.list.find((x) => x.code === data.index.hub) || data.list[0]
  // largura disponível → quantas colunas cabem (o desenho nunca passa a largura da página)
  const box = useRef(null)
  const [avail, setAvail] = useState(1200)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setAvail(Math.floor(e.contentRect.width)))
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  const columns = data.layout?.[h.code]?.columns // disposição como no carro (layout.json), se existir
  const d = useMemo(() => diagram(h, { avail, columns }), [h, avail, columns])
  const can = useMemo(() => canPairs(h), [h])
  const [hover, setHover] = useState(null)
  const [bus, setBus] = useState(null) // barramento CAN em destaque (clicar na legenda)
  const byWire = new Map(d.lines.map((l) => [l.w, l]))
  // cada par CAN desenha-se uma vez, entrançado; os outros fios são uma curva simples
  const drawn = new Set()
  const strands = []
  for (const l of d.lines) {
    if (drawn.has(l.w)) continue
    const mate = can.partner.get(l.w)
    const c = can.info.get(l.w)
    if (mate && byWire.get(mate)) {
      const t = twist(l.pts, byWire.get(mate).pts)
      strands.push({ w: l.w, d: t.a, c }, { w: mate, d: t.b, c: can.info.get(mate) })
      strands.push({ label: c.bus, at: t.mid, key: `${txt(l.w.wire_id)}-tag` })
      drawn.add(mate)
    } else strands.push({ w: l.w, d: l.d, c })
    drawn.add(l.w)
  }
  const buses = CAN_BUSES.map((b) => ({ ...b, n: [...can.partner.keys()].filter((w) => can.info.get(w).bus === b.id).length / 2 })).filter((b) => b.n)
  const loose = [...can.info].filter(([w, c]) => c.side !== 'S' && (!c.bus || !can.partner.has(w))).length
  const dim = (c) => bus && c?.bus !== bus
  return (
    <Stack gap="md" mt="xl">
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>Diagrama 2D · {h.meta.name}</Title>
        <Group gap="sm"><HarnessSelect data={data} code={h.code} page="diagram" /><View2D code={h.code} page="diagram" /></Group>
      </Group>
      <Text size="sm" c="dimmed">Cada caixa é uma ficha com os pinos que têm fio; cada linha é um fio, na sua cor. Clica num fio para o circuito completo, ou no nome da ficha para o pinout.</Text>
      {/* linha reservada para o fio debaixo do rato: tem sempre a mesma altura, para o diagrama não saltar */}
      <Text size="sm" ff="monospace" c={hover ? 'blue.3' : 'dimmed'} truncate="end" h={22} aria-live="polite">{hover || 'Passa o rato por um fio para ver qual é.'}</Text>
      {buses.length > 0 && (
        <Group gap="xs" wrap="wrap">
          <Text size="sm" c="dimmed">CAN (pares entrançados):</Text>
          {buses.map((b) => (
            <Badge key={b.id} component="button" onClick={() => setBus(bus === b.id ? null : b.id)} variant={bus === b.id ? 'filled' : 'outline'}
              style={{ cursor: 'pointer', textTransform: 'none', borderColor: b.colour, color: bus === b.id ? '#111' : b.colour, background: bus === b.id ? b.colour : undefined }}
              aria-pressed={bus === b.id}>{b.name} · {b.n}</Badge>
          ))}
          {loose > 0 && <Anchor href={href('validate', h.code)} size="sm" c="yellow.4">{loose} fio(s) CAN sem par →</Anchor>}
        </Group>
      )}
      {!d.boxes.length ? <Alert color="gray">Este harness ainda não tem ligações.</Alert> : (
        <div className="glass">
          <div className="diagram" ref={box}>
            <svg width={d.width} height={d.height} role="img" aria-label={`Diagrama de ligações do harness ${h.code}`} style={{ margin: '0 auto' }}>
              {strands.map((s) => s.label ? (
                <g key={s.key} transform={`translate(${s.at[0]},${s.at[1]})`} opacity={bus && bus !== s.label ? 0.15 : 1} pointerEvents="none">
                  <rect x="-17" y="-8" width="34" height="16" rx="8" fill="#14161d" stroke={busById.get(s.label).colour} />
                  <text textAnchor="middle" y="4" className="bus2d" fill={busById.get(s.label).colour}>{s.label}</text>
                </g>
              ) : (
                <path key={txt(s.w.wire_id)} d={s.d} className="wire2d" stroke={wireColour(s.w)} fill="none" style={dim(s.c) ? { opacity: 0.1 } : undefined}
                  onMouseEnter={() => setHover(`${txt(s.w.wire_id)} · ${txt(s.w.net)}${s.c?.bus ? ` · CAN ${busById.get(s.c.bus).name} ${s.c.side || ''}` : ''} · ${txt(s.w.from_ref)}:${txt(s.w.from_pin)} → ${txt(s.w.to_ref)}:${txt(s.w.to_pin)}`)}
                  onMouseLeave={() => setHover(null)} onClick={() => go(href('t', h.code, txt(s.w.wire_id)))}>
                  <title>{`${txt(s.w.wire_id)} · ${txt(s.w.net)}`}</title>
                </path>
              ))}
              {d.lines.flatMap((l) => [l.pts[0], l.pts[3]].map((p, i) => (
                <circle key={`${txt(l.w.wire_id)}-${i}`} cx={p[0]} cy={p[1]} r="2.6" fill={wireColour(l.w)} className="pin2d-dot" style={dim(can.info.get(l.w)) ? { opacity: 0.1 } : undefined} />
              )))}
              {d.boxes.map((b) => (
                <g key={b.ref} transform={`translate(${b.x},${b.y})`}>
                  <rect width={b.w} height={b.h} rx="8" className={b.placeholder ? 'box2d box2d-missing' : 'box2d'} />
                  {/* cabeçalho e linhas como no harness.design; a ficha vista de cima, com a face de encaixe escura */}
                  {!b.placeholder && <path d={`M0 8a8 8 0 0 1 8 -8H${b.w - 8}a8 8 0 0 1 8 8V${D.head - 4}H0Z`} className="box2d-head" />}
                  {!b.placeholder && (
                    <g transform={`translate(${b.w - 26},13) scale(0.62)`} aria-hidden="true">
                      <path d={`M${CONN.L} ${-CONN.W / 2}H5a5 5 0 0 0 -5 5V${CONN.W / 2 - 5}a5 5 0 0 0 5 5H${CONN.L}Z`} className="conn2d" />
                      <rect x={CONN.L} y={-CONN.W / 2 - 1} width={CONN.T} height={CONN.W + 2} rx="1" className="conn2d-face" />
                    </g>
                  )}
                  <text x="10" y="20" className="box2d-title" onClick={() => !b.placeholder && go(href('c', h.code, b.ref))}>
                    {b.ref.length > b.titleChars ? b.ref.slice(0, b.titleChars - 1) + '…' : b.ref}<title>{b.ref}</title>
                  </text>
                  {(b.placeholder || b.empty) && <text x="10" y={D.head + 13} className="pin2d-label">{b.placeholder ? MISSING : 'sem fios ligados'}</text>}
                  {/* largura estimada (título 13px ≈ 8px/letra, P/N 11px mono ≈ 6.7px/letra): só mostra se couber */}
                  {!b.placeholder && 20 + 8 * Math.min(b.ref.length, b.titleChars) + 12 + 6.7 * (txt(b.conn?.housing_pn) || txt(b.conn?.type)).length + 22 <= b.w && (
                    <text x={b.w - 32} y="20" textAnchor="end" className="box2d-sub">{txt(b.conn?.housing_pn) || txt(b.conn?.type).toLowerCase()}</text>
                  )}
                  {b.rows.map((pin, i) => {
                    const p = h.H.pins.get(`${b.ref}\u0000${pin}`)
                    return (
                      <g key={pin} transform={`translate(0,${D.head + i * D.row})`}>
                        {i > 0 && <line x1="6" x2={b.w - 6} className="box2d-row" />}
                        <text x="10" y="13" className="pin2d">{pin}</text>
                        <text x="44" y="13" className="pin2d-label">{txt(p?.label).length > b.labelChars ? txt(p?.label).slice(0, b.labelChars - 1) + '…' : txt(p?.label)}<title>{txt(p?.label)}</title></text>
                      </g>
                    )
                  })}
                </g>
              ))}
            </svg>
          </div>
        </div>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------- formboard 2D (troços à escala, desenho como no harness.design)
// as duas vistas 2D do mesmo harness, lado a lado no cabeçalho
function View2D({ code, page }) {
  return <SegmentedControl value={page} onChange={(v) => go(href(v, code))} data={[{ value: 'diagram', label: 'Ligações' }, { value: 'formboard', label: 'Formboard' }]} />
}

const PX_MM = 25.4 / 96 // 1 px CSS em mm (escala 1:1)
const lightWire = (c) => ['#fcc419', '#f8f9fa', '#ced4da', '#adb5bd', '#22b8cf', '#fd7e14', '#40c057', '#f783ac'].includes(c)
// ficha vista de cima (harness.design): corpo claro do lado do troço, face de encaixe escura na ponta; em mm, x para fora
const CONN = { L: 16, W: 15, T: 4 }

// cavidades de uma ficha: as do pinout e as que têm fio mas faltam no pinout
const cavities = (h, ref) => [...new Set([...h.H.pinsOf(ref).map((p) => txt(p.pin)), ...[...h.H.usage.keys()].filter((key) => key.startsWith(`${ref}\u0000`)).map((key) => key.split('\u0000')[1])])]
// onde fica a face: ficha deitada → por cima (ou por baixo); de pé → ao lado. dx/dy em px, a partir da ficha
function facePlace(n, fc) {
  const side = Math.abs(Math.cos(n.dir)) >= 0.5
  return side ? { dx: 0, dy: (Math.sin(n.dir) > 0.3 ? 1 : -1) * (fc.h / 2 + 70) } : { dx: (Math.cos(n.dir) >= 0 ? 1 : -1) * (fc.w / 2 + 70), dy: 0 }
}

// face de encaixe da ficha selecionada, presa à ficha por uma linha (tamanhos em px, k = mm por px)
function Pinout({ h, n, k, round, onPin }) {
  const ref = n.id
  const pins = cavities(h, ref)
  if (!pins.length) return null
  const fc = face(pins, round)
  const { dx, dy } = facePlace(n, fc)
  const [cx, cy] = [n.x + dx * k, n.y + dy * k]
  const pn = txt(h.H.conns.get(ref)?.housing_pn)
  return (
    <g>
      <line x1={n.x} y1={n.y} x2={cx - Math.sign(dx) * (fc.w / 2) * k} y2={cy - Math.sign(dy) * (fc.h / 2 + 6) * k} className="tether2d" strokeWidth={1.5 * k} />
      <g transform={`translate(${cx},${cy}) scale(${k})`}>
        <rect x={-fc.w * 0.13} y={-fc.h / 2 - 7} width={fc.w * 0.26} height="10" rx="3" className="face2d-key" />
        {round ? <circle r={fc.w / 2} className="face2d" /> : <rect x={-fc.w / 2} y={-fc.h / 2} width={fc.w} height={fc.h} rx="16" className="face2d" />}
        <text y={-fc.h / 2 - 16} textAnchor="middle" className="face2d-title" onClick={() => go(href('c', h.code, ref))}>{ref}{pn ? ` · ${pn}` : ''}<title>Abrir a ficha {ref}</title></text>
        {fc.pts.map(({ pin, x, y }) => {
          const ws = h.H.usage.get(`${ref}\u0000${pin}`) || []
          const c = ws.length ? wireColour(ws[0]) : null
          const label = txt(h.H.pins.get(`${ref}\u0000${pin}`)?.label)
          const info = `${ref}:${pin}${label ? ` · ${label}` : ''}${ws.map((w) => ` · ${txt(w.wire_id)} ${txt(w.colour)} → ${ends(w).filter((e) => e.ref !== ref || e.pin !== pin).map((e) => `${e.ref}:${e.pin}`).join('')}`).join('')}`
          return (
            <g key={pin} transform={`translate(${x},${y})`} className={ws.length ? 'cav2d cav2d-on' : 'cav2d'}
              onMouseEnter={() => onPin(info)} onMouseLeave={() => onPin(null)} onClick={() => ws.length && go(href('t', h.code, txt(ws[0].wire_id)))}>
              <circle r="10.5" fill={c || '#2c2e33'} />
              <text y="3.8" textAnchor="middle" fill={c ? (lightWire(c) ? '#111' : '#fff') : '#6a6e76'}>{pin}</text>
              <title>{info}</title>
            </g>
          )
        })}
      </g>
    </g>
  )
}

export function FormboardPage({ data, code }) {
  const h = data.byCode.get(code) || data.list.find((x) => x.code === 'ACCU') || data.list[0]
  const f = useMemo(() => formboard(h), [h])
  const [real, setReal] = useState(false)
  const [sel, setSel] = useState(null) // ficha selecionada: face de encaixe e os seus fios a cores
  const [hover, setHover] = useState(null)
  const [view, setView] = useState(null) // { cx, cy, k (mm por px) }; null = desenho inteiro
  const [size, setSize] = useState([1200, 640])
  const box = useRef(null)
  const svg = useRef(null)
  const cur = useRef(null)
  const drag = useRef({ pts: new Map(), moved: 0 })
  useEffect(() => (setSel(null), setView(null)), [h])
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize([Math.max(200, e.contentRect.width), Math.max(200, e.contentRect.height)]))
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [f, real])
  const [W, H] = size
  const pad = f ? 0.06 * Math.max(f.bbox.w, f.bbox.h) + 60 : 0
  const all = f && { x: f.bbox.x - pad, y: f.bbox.y - pad, w: f.bbox.w + 2 * pad, h: f.bbox.h + 2 * pad }
  const v = view || (f && { cx: all.x + all.w / 2, cy: all.y + all.h / 2, k: Math.max(all.w / W, all.h / H) })
  cur.current = v
  const zoomAt = (px, py, s) => setView(() => {
    const c = cur.current
    const k = Math.min(Math.max(c.k * s, 0.05), 20)
    const [mx, my] = [c.cx + (px - W / 2) * c.k, c.cy + (py - H / 2) * c.k] // ponto debaixo do rato fica no sítio
    return { cx: mx - (px - W / 2) * k, cy: my - (py - H / 2) * k, k }
  })
  useEffect(() => {
    const el = svg.current
    if (!el || real) return
    const wheel = (e) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(e.deltaY * 0.0015))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  })
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && setSel(null)
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [])

  const header = (
    <Group justify="space-between" wrap="wrap">
      <Title order={2}>Formboard · {h.meta.name}</Title>
      <Group gap="sm"><HarnessSelect data={data} code={h.code} page="formboard" /><View2D code={h.code} page="formboard" /></Group>
    </Group>
  )
  if (!f)
    return (
      <Stack gap="md" mt="xl">{header}
        <Alert color="gray" title="Sem topologia">Este harness ainda não tem troços (folha Segments). Transcreve o desenho do RapidHarness: um troço por linha, com os dois nós e o comprimento em mm.</Alert>
      </Stack>
    )

  // arrastar = mover, dois dedos = zoom; só captura o ponteiro depois de mexer, para os cliques chegarem às fichas
  const down = (e) => {
    drag.current.pts.set(e.pointerId, [e.clientX, e.clientY])
    if (drag.current.pts.size === 1) drag.current.moved = 0
  }
  const move = (e) => {
    const d = drag.current
    const last = d.pts.get(e.pointerId)
    if (!last || real) return
    const before = [...d.pts.values()]
    d.pts.set(e.pointerId, [e.clientX, e.clientY])
    d.moved += Math.hypot(e.clientX - last[0], e.clientY - last[1])
    if (d.moved > 5 && !svg.current.hasPointerCapture(e.pointerId)) svg.current.setPointerCapture(e.pointerId)
    if (d.pts.size === 2) {
      const after = [...d.pts.values()]
      const r = svg.current.getBoundingClientRect()
      const dist = (p) => Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1])
      zoomAt((after[0][0] + after[1][0]) / 2 - r.left, (after[0][1] + after[1][1]) / 2 - r.top, dist(before) / dist(after))
    } else if (d.moved > 5) setView(() => ({ ...cur.current, cx: cur.current.cx - (e.clientX - last[0]) * cur.current.k, cy: cur.current.cy - (e.clientY - last[1]) * cur.current.k }))
  }
  const up = (e) => drag.current.pts.delete(e.pointerId)
  const tap = (fn) => (e) => { e.stopPropagation(); if (drag.current.moved <= 5) fn() }

  const k = real ? PX_MM : v.k
  const vb = real ? [all.x, all.y, all.w, all.h] : [v.cx - (W / 2) * k, v.cy - (H / 2) * k, W * k, H * k]
  const at = new Map(f.nodes.map((n) => [n.id, n]))
  const u = Math.max(1, 0.9 * k) // as fichas nunca ficam mais pequenas do que ~14 px
  const thick = (n) => Math.max(1.6 * Math.sqrt(Math.max(1, n)), 3 * k) // diâmetro do troço: ~1,6 mm por fio de 0,5 mm²
  const mine = new Set(sel ? h.model.sheets.Wires.filter((w) => ends(w).some((e) => e.ref === sel)).map((w) => txt(w.wire_id)) : [])
  const connectors = f.nodes.filter((n) => n.kind === 'connector' || n.kind === 'drawing')
  // nome de cada ficha à frente da face de encaixe; os que chocam sobem ou descem uma linha
  const tip = u * (CONN.L + CONN.T) + 8 * k
  const items = connectors.map((n) => {
    const [c, sn] = [Math.cos(n.dir), Math.sin(n.dir)]
    return { x: n.x + c * tip, y: n.y + sn * tip + (Math.abs(c) < 0.5 ? Math.sign(sn) * 6 * k : 0), w: 8 * k * n.id.length, h: 15 * k, anchor: c > 0.5 ? 'start' : c < -0.5 ? 'end' : 'middle' }
  })
  const bodies = connectors.map((n) => ({ x: n.x + Math.cos(n.dir) * 10 * u - 10 * u, y: n.y + Math.sin(n.dir) * 10 * u - 10 * u, w: 20 * u, h: 20 * u }))
  const labelAt = new Map(spreadLabels(items, bodies).map((p, i) => [connectors[i].id, { ...items[i], ...p, from: items[i].y }]))
  const selNode = sel && at.get(sel)
  const roundOf = (ref) => /circular/i.test(housingOf(data.catalog, txt(h.H.conns.get(ref)?.housing_pn))?.family.name || '')
  // seleciona uma ficha e move o desenho só o preciso para a ficha e a sua face caberem
  const pick = (id, zoom = v.k) => {
    setSel(id)
    const n = id && at.get(id)
    const pins = n && cavities(h, id)
    if (!pins?.length || real) return
    const fc = face(pins, roundOf(id))
    const { dx, dy } = facePlace(n, fc)
    const m = 24
    const [x0, x1] = [Math.min(n.x / zoom - 60, n.x / zoom + dx - fc.w / 2 - m), Math.max(n.x / zoom + 60, n.x / zoom + dx + fc.w / 2 + m)]
    const [y0, y1] = [Math.min(n.y / zoom - 40, n.y / zoom + dy - fc.h / 2 - 30 - m), Math.max(n.y / zoom + 40, n.y / zoom + dy + fc.h / 2 + m)]
    const c = zoom === v.k ? v : { cx: n.x, cy: n.y }
    const fitIn = (lo, hi, mid, half) => (hi - lo > 2 * half ? (lo + hi) / 2 : Math.min(Math.max(mid, hi - half), lo + half))
    setView({ cx: fitIn(x0, x1, c.cx / zoom, W / 2) * zoom, cy: fitIn(y0, y1, c.cy / zoom, H / 2) * zoom, k: zoom })
  }
  const jump = (id) => (id ? pick(id, Math.min(v.k, 0.6)) : setSel(null))
  const splices = [...h.H.conns.values()].filter((c) => txt(c.type).toUpperCase() === 'SPLICE')
  const deg = (r) => (r * 180) / Math.PI
  return (
    <Stack gap="md" mt="xl">{header}
      <Group gap="sm" wrap="wrap">
        <Select aria-label="Ir para a ficha" placeholder="Ir para a ficha…" searchable clearable value={sel} onChange={jump} data={connectors.map((n) => n.id)} w={220} />
        {!real && (
          <Group gap={4}>
            <ActionIcon variant="default" size="lg" aria-label="Afastar" onClick={() => zoomAt(W / 2, H / 2, 1.4)}>−</ActionIcon>
            <ActionIcon variant="default" size="lg" aria-label="Aproximar" onClick={() => zoomAt(W / 2, H / 2, 1 / 1.4)}>+</ActionIcon>
            <Button variant="default" onClick={() => setView(null)}>Ajustar</Button>
          </Group>
        )}
        <Switch label="Escala 1:1 (para imprimir)" checked={real} onChange={(e) => setReal(e.currentTarget.checked)} />
      </Group>
      <Text size="sm" c="dimmed">{f.segs.length} troços · {(f.total / 1000).toFixed(2)} m de troncos. Arrasta para mover, roda o rato ou usa dois dedos para o zoom; clica numa ficha para ver a face de encaixe e os seus fios.</Text>
      <Text size="sm" ff="monospace" c={hover ? 'blue.3' : 'dimmed'} truncate="end" h={22} aria-live="polite">{hover || (sel ? `${sel}: ${mine.size} fio(s) · passa o rato por uma cavidade` : 'Passa o rato por um troço ou por uma ficha.')}</Text>
      <div className="glass">
        <div className={real ? 'diagram' : 'diagram board2d'} ref={real ? null : box}>
          <svg ref={svg} viewBox={vb.join(' ')} width={real ? `${all.w}mm` : W} height={real ? `${all.h}mm` : H} role="img" aria-label={`Formboard do harness ${h.code}`}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={tap(() => setSel(null))}>
            <defs>
              <pattern id="grid2d" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" className="grid2d" strokeWidth={k} /></pattern>
            </defs>
            <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} fill="url(#grid2d)" />
            {f.segs.map((s) => {
              const [a, b] = [at.get(s.a), at.get(s.b)]
              const on = s.wires.filter((w) => mine.has(w))
              const t = thick(s.wires.length)
              const ang = Math.atan2(b.y - a.y, b.x - a.x)
              const up_ = Math.abs(ang) > Math.PI / 2 ? ang + Math.PI : ang // texto nunca de pernas para o ar
              const [nx, ny] = [-Math.sin(ang), Math.cos(ang)]
              const gap = Math.max(1.2, 2 * k)
              return (
                <g key={s.id} opacity={sel && !on.length ? 0.35 : 1}
                  onMouseEnter={() => setHover(`${s.a} – ${s.b} · ${s.known ? `${s.len} mm` : 'sem comprimento no desenho'} · ${s.wires.length} fio(s)`)} onMouseLeave={() => setHover(null)}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={s.known ? 'seg2d' : 'seg2d seg2d-unknown'} strokeWidth={t} />
                  {!s.known && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="seg2d-dash" strokeWidth={t * 0.45} strokeDasharray={`${12 * k} ${10 * k}`} />}
                  {on.map((id, i) => {
                    const o = (i - (on.length - 1) / 2) * gap
                    return <line key={id} x1={a.x + nx * o} y1={a.y + ny * o} x2={b.x + nx * o} y2={b.y + ny * o} stroke={wireColour(h.H.wireById.get(id))} strokeWidth={Math.max(0.7, 1.5 * k)} strokeLinecap="round" />
                  })}
                  {Math.hypot(b.x - a.x, b.y - a.y) / k > 6.5 * 13 && <text transform={`translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2}) rotate(${deg(up_)})`} y={-(t / 2 + 6 * k)}
                    textAnchor="middle" className="seg2d-label" fontSize={11 * k}>
                    {s.known ? `${s.len} mm` : '? mm'}<tspan className="seg2d-count"> · {s.wires.length}</tspan>
                  </text>}
                </g>
              )
            })}
            {f.nodes.map((n) => {
              if (n.kind === 'branch') return <circle key={n.id} cx={n.x} cy={n.y} r={Math.max(2.5, 4 * k)} className="bp2d" />
              if (n.kind === 'splice')
                return (
                  <g key={n.id} transform={`translate(${n.x},${n.y})`}>
                    <rect x={-6 * u} y={-6 * u} width={12 * u} height={12 * u} transform="rotate(45)" className="spl2d" />
                    <text x={10 * u} y={-10 * u} className="node2d-label" fontSize={12 * k}>{n.id}</text>
                  </g>
                )
              const isSel = n.id === sel
              return (
                <g key={n.id} className="conn2d-g" opacity={sel && !isSel && !h.model.sheets.Wires.some((w) => mine.has(txt(w.wire_id)) && ends(w).some((e) => e.ref === n.id)) ? 0.45 : 1}
                  onClick={tap(() => (isSel ? setSel(null) : pick(n.id)))} onMouseEnter={() => setHover(`${n.id}${txt(h.H.conns.get(n.id)?.housing_pn) ? ` · ${txt(h.H.conns.get(n.id).housing_pn)}` : ''} · clica para a face de encaixe`)} onMouseLeave={() => setHover(null)}>
                  <g transform={`translate(${n.x},${n.y}) rotate(${deg(n.dir)}) scale(${u})`}>
                    <path d={`M${CONN.L} ${-CONN.W / 2}H5a5 5 0 0 0 -5 5V${CONN.W / 2 - 5}a5 5 0 0 0 5 5H${CONN.L}Z`} className={n.kind === 'drawing' ? 'conn2d conn2d-odd' : isSel ? 'conn2d conn2d-sel' : 'conn2d'} />
                    <rect x={CONN.L} y={-CONN.W / 2 - 1} width={CONN.T} height={CONN.W + 2} rx="1" className="conn2d-face" />
                  </g>
                  {Math.abs(labelAt.get(n.id).y - labelAt.get(n.id).from) > 20 * k && ( // nome longe da ficha: linha a ligá-los
                    <line x1={labelAt.get(n.id).x} y1={labelAt.get(n.id).from} x2={labelAt.get(n.id).x} y2={labelAt.get(n.id).y - Math.sign(labelAt.get(n.id).y - labelAt.get(n.id).from) * 7 * k} className="tether2d" strokeWidth={k} />
                  )}
                  <text x={labelAt.get(n.id).x} y={labelAt.get(n.id).y} fontSize={13 * k} textAnchor={labelAt.get(n.id).anchor} dominantBaseline="middle" className={isSel ? 'node2d-label node2d-sel' : 'node2d-label'}>{n.id}</text>
                </g>
              )
            })}
            {selNode && <Pinout h={h} n={selNode} k={real ? PX_MM : k} round={roundOf(sel)} onPin={setHover} />}
          </svg>
        </div>
      </div>
      <Group gap="lg" wrap="wrap">
        <Text size="sm"><Text span c="gray.5">▮</Text> ficha (a face escura é a de encaixe) · <Text span c="dimmed">●</Text> ramificação · <Text span c="grape.4">◆</Text> união (splice) · <Text span c="red.4">▮</Text> nome do desenho que não está no Excel · <Text span c="yellow.5">╍</Text> troço sem comprimento no desenho · traço mais grosso = mais fios</Text>
      </Group>
      {splices.length > 0 && (
        <Text size="sm" c="dimmed">Uniões (splices) {splices.some((c) => at.has(txt(c.ref))) ? '' : 'ainda sem sítio no formboard'}: {splices.map((c) => `${txt(c.ref)} (${h.H.usage.get(`${txt(c.ref)}\u0000S`)?.length || 0} fios)`).join(', ')}. Para a pôr no desenho, acrescenta o splice como nó na folha Segments.</Text>
      )}
      {f.unrouted.length > 0 && <Text size="sm" c="dimmed">{f.unrouted.length} fio(s) com uma ponta fora da topologia (sem rota nem comprimento): {f.unrouted.slice(0, 20).join(', ')}{f.unrouted.length > 20 ? ' …' : ''}</Text>}
    </Stack>
  )
}
