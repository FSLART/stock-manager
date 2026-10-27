import { useEffect, useState } from 'react'
import { Accordion, Alert, Anchor, Badge, Box, Button, Group, HoverCard, NativeSelect, Paper, SimpleGrid, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core'
import { boardOf, pinKey, qKey, splitQ, txt } from './lib/harness.js'
import { SEVERITIES } from './lib/validate.js'
import { completeness, crimpFor, housingOf, photoOf } from './lib/bom.js'
import { busById, canOf } from './lib/can.js'
import { Completeness } from './pages2d.jsx'

export const href = (...parts) => '#/' + parts.filter((p) => p !== undefined && p !== '').map(encodeURIComponent).join('/')
export const SEV = {
  critical: { label: 'Crítico', color: 'red' },
  error: { label: 'Erro', color: 'orange' },
  warning: { label: 'Aviso', color: 'yellow' },
  info: { label: 'Info', color: 'gray' },
}
const CATEGORY = { car: null, offboard: { label: 'fora do carro', color: 'grape' }, test: { label: 'teste', color: 'gray' } }
const COLOURS = { BK: '#212529', BN: '#8d5524', RD: '#e03131', OG: '#f76707', YE: '#fcc419', GN: '#2f9e44', BU: '#1c7ed6',
  VT: '#7048e8', GY: '#868e96', WH: '#f1f3f5', PK: '#f783ac', TQ: '#15aabf' }
const up = (v) => txt(v).toUpperCase()
const isOpen = (i) => !['fechado', 'closed'].includes(txt(i.status).toLowerCase())
const count = (fs, s) => fs.filter((f) => f.sev === s).length
const gender = (v) => ({ M: 'macho', F: 'fêmea' })[up(v)] || 'género por definir'
const Altium = ({ board, size = 'sm' }) => <Anchor href={board.url} target="_blank" rel="noopener noreferrer" size={size}>{board.name} no Altium ↗</Anchor>

export function Colour({ code, w = 28 }) {
  const cs = up(code).split('/').map((c) => COLOURS[c]).filter(Boolean)
  if (!cs.length) return <Text span c="dimmed" size="sm">{txt(code) || '—'}</Text>
  const bg = cs.length > 1 ? `repeating-linear-gradient(90deg, ${cs[0]} 0 6px, ${cs[1]} 6px 9px)` : cs[0]
  return (
    <Group gap={6} wrap="nowrap">
      <Box w={w} h={8} aria-hidden style={{ background: bg, borderRadius: 4, boxShadow: '0 0 0 1px #0008 inset' }} />
      <Text span size="sm" ff="monospace">{txt(code)}</Text>
    </Group>
  )
}
const HCode = ({ code }) => <Anchor href={href('h', code)} size="xs" c="dimmed" ff="monospace">{code}</Anchor>
const RefLink = ({ code, r }) => <Anchor href={href('c', code, r)} size="sm">{r}</Anchor>
const PinLink = ({ code, r, p }) => (
  <Text span size="sm" style={{ whiteSpace: 'nowrap' }}>
    <RefLink code={code} r={r} />:<Text span ff="monospace" size="sm">{p}</Text>
  </Text>
)
const WireLink = ({ code, id }) => <Anchor href={href('t', code, id)} ff="monospace" size="sm">{id}</Anchor>
// foto do fabricante (sem cópia local): link para a página do produto; se a imagem falhar, desaparece
export function PartPhoto({ catalog, pn, size = 56 }) {
  const p = photoOf(catalog, txt(pn))
  const [broken, setBroken] = useState(false)
  if (!p || broken) return null
  const img = (px, lazy) => (
    <img src={p.image} alt={`Foto de ${txt(pn)}`} width={px} height={px} loading={lazy ? 'lazy' : undefined} referrerPolicy="no-referrer"
      onError={() => setBroken(true)} style={{ objectFit: 'contain', background: '#fff', borderRadius: 6, display: 'block' }} />
  )
  // ao passar o rato, a mesma foto em grande (220 px ≈ o tamanho original da Digi-Key)
  return (
    <HoverCard openDelay={120} closeDelay={60} position="right" shadow="md" withinPortal>
      <HoverCard.Target>
        <Anchor href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`${txt(pn)} — página do produto`} style={{ flex: 'none' }}>
          {img(size, true)}
        </Anchor>
      </HoverCard.Target>
      <HoverCard.Dropdown p="xs">
        {img(220, false)}
        <Text size="xs" ff="monospace" mt={6} ta="center">{txt(pn)}</Text>
        <Text size="xs" c="dimmed" ta="center">clica para abrir a página do produto</Text>
      </HoverCard.Dropdown>
    </HoverCard>
  )
}

// uma metade do conector: foto da ficha, género, P/N e o crimp que leva (com foto)
function Half({ data, conn, title }) {
  const crimp = txt(conn?.contact_pn) || housingOf(data.catalog, txt(conn?.housing_pn))?.housing.contacts?.[0] || ''
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <PartPhoto catalog={data.catalog} pn={conn?.housing_pn} />
      <div style={{ minWidth: 0 }}>
        {title}
        <Text size="sm" c="dimmed">{gender(conn?.gender)} · {txt(conn?.housing_pn) || 'P/N por definir'}</Text>
        {crimp && (
          <Group gap={6} mt={4} wrap="nowrap">
            <PartPhoto catalog={data.catalog} pn={crimp} size={32} />
            <Text size="xs" c="dimmed">crimp {crimp}</Text>
          </Group>
        )}
      </div>
    </Group>
  )
}

// etiqueta do barramento CAN de um fio (PWT, DATA, AUT, DTI, CHG), com H/L
export function Bus({ w, H }) {
  const c = canOf(w, H)
  if (!c?.bus) return null
  const b = busById.get(c.bus)
  return <Badge size="xs" variant="outline" style={{ borderColor: b.colour, color: b.colour, textTransform: 'none' }} title={`CAN ${b.name}${c.likely ? ` — ${c.likely}` : ''}`}>{b.id}{c.side === 'S' ? ' blind.' : c.side ? ` ${c.side}` : ''}{c.likely ? '?' : ''}</Badge>
}

const Hv = ({ on }) => (on ? <Badge color="orange" variant="filled" size="sm">HV</Badge> : null)
const Empty = ({ children }) => <Text c="dimmed" size="sm">{children}</Text>
const SevBadges = ({ findings, size = 'md' }) => (
  <Group gap={6}>
    {SEVERITIES.slice(0, 3).map((s) => count(findings, s) > 0 && (
      <Badge key={s} color={SEV[s].color} variant="light" size={size}>{count(findings, s)} {SEV[s].label}</Badge>
    ))}
    {!SEVERITIES.slice(0, 3).some((s) => count(findings, s)) && <Badge color="teal" variant="light" size={size}>sem erros</Badge>}
  </Group>
)

function Findings({ list }) {
  if (!list.length) return null
  return (
    <Stack gap={6}>
      {list.map((f, i) => (
        <Group key={i} gap="sm" wrap="nowrap" align="flex-start">
          <Badge color={SEV[f.sev].color} variant="light" style={{ flex: 'none' }}>{SEV[f.sev].label}</Badge>
          <Text size="sm" style={{ overflowWrap: 'anywhere' }}>{f.msg}</Text>
        </Group>
      ))}
    </Stack>
  )
}

export const Card = ({ children, ...p }) => (
  <Paper p="lg" radius="md" bg="dark.7" withBorder {...p}>{children}</Paper>
)
export const Stats = ({ items }) => (
  <Card>
    <SimpleGrid cols={{ base: 2, sm: items.length }} spacing="lg">
      {items.map(([label, n]) => (
        <div key={label}>
          <Text fz={32} fw={600} lh={1}>{n}</Text>
          <Text size="sm" c="dimmed">{label}</Text>
        </div>
      ))}
    </SimpleGrid>
  </Card>
)

// filtro de harness partilhado pelas listas
export function HarnessSelect({ data, code, page }) {
  return (
    <NativeSelect aria-label="Harness" value={code || ''} style={{ flex: '0 0 220px' }}
      onChange={(e) => (location.hash = href(page, e.currentTarget.value))}
      data={[{ value: '', label: 'Todos os harnesses' }, ...data.list.map((h) => ({ value: h.code, label: `${h.code} · ${h.meta.name}` }))]} />
  )
}
const scope = (data, code) => (code ? data.list.filter((h) => h.code === code) : data.list)

// ---------------------------------------------------------------- carro (todos os harnesses)
export function CarOverview({ data }) {
  const [q, setQ] = useState('')
  const all = (k) => data.list.reduce((s, h) => s + h.model.sheets[k].length, 0)
  const needle = q.trim().toLowerCase()
  const hit = (...vals) => vals.some((v) => txt(v).toLowerCase().includes(needle))
  const conns = needle ? data.list.flatMap((h) => [...h.H.conns.values()].filter((c) => hit(c.ref, c.device, c.housing_pn)).map((c) => ({ h, c }))).slice(0, 24) : []
  const wires = needle ? data.list.flatMap((h) => h.model.sheets.Wires.filter((w) => hit(w.wire_id, w.net, w.from_ref, w.to_ref, w.description)).map((w) => ({ code: h.code, w }))) : []
  const order = { car: 0, offboard: 1, test: 2 }
  const cards = [...data.list.map((h) => ({ ...h.meta, h })), ...data.missing].sort(
    (a, b) => order[a.category] - order[b.category] || (a.code === data.index.hub ? -1 : b.code === data.index.hub ? 1 : 0) || (b.wires || 0) - (a.wires || 0))

  return (
    <Stack gap="xl" mt="xl">
      <div>
        <Title order={1} fz={{ base: 28, sm: 36 }} lh={1.15}>Cablagem · {data.index.car}</Title>
        <Text c="dimmed" mt="sm">Todos os harnesses da pasta Harness · gerado em {data.index.generated}</Text>
      </div>
      <Stack gap="sm">
        <TextInput size="md" placeholder="Procurar em todos os harnesses: conector, fio, net ou P/N (ex.: ACCU J1, SDC, CAN)" aria-label="Procurar"
          value={q} onChange={(e) => setQ(e.currentTarget.value)} />
        {needle && !conns.length && !wires.length && <Empty>Sem resultados. Tenta a referência de um conector, fio, sinal ou P/N.</Empty>}
        {conns.length > 0 && (
          <Group gap="xs">{conns.map(({ h, c }) => (
            <Badge key={h.code + c.ref} component="a" href={href('c', h.code, txt(c.ref))} variant="light" size="lg" style={{ cursor: 'pointer', textTransform: 'none' }}>
              {txt(c.ref)} · {h.code}
            </Badge>))}
          </Group>
        )}
        {wires.length > 0 && <WireTable rows={wires} data={data} scopeKey={q} />}
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
        {cards.map((m) => {
          const cat = CATEGORY[m.category]
          const h = m.h
          return (
            <Card key={m.code} component="a" href={href('h', m.code)} style={{ textDecoration: 'none', color: 'inherit', height: '100%' }}>
              <Group justify="space-between" wrap="nowrap" gap="xs" mb={4}>
                <Text fw={600} truncate>{m.name}</Text>
                <Group gap={4} wrap="nowrap" style={{ flex: 'none' }}>
                  {cat && <Badge size="xs" variant="light" color={cat.color}>{cat.label}</Badge>}
                  <Badge size="xs" variant="outline" color="gray">{m.code}</Badge>
                </Group>
              </Group>
              {h ? (
                <>
                  <Text size="sm" c="dimmed" mb="xs">{m.wires} fios · {m.connectors} conectores · {h.model.sheets.Issues.filter(isOpen).length} problemas · {completeness(h, data.catalog).score}% completo</Text>
                  {m.wires ? <SevBadges findings={h.findings} size="sm" /> : <Badge color="gray" variant="light" size="sm">Excel ainda sem ligações</Badge>}
                </>
              ) : (
                <Badge color="gray" variant="light" size="sm">sem Excel</Badge>
              )}
            </Card>
          )
        })}
      </SimpleGrid>
      <Stats items={[['harnesses', data.list.length + data.missing.length], ['fios', all('Wires')], ['fichas', all('Connectors')],
        ['pinos', all('Pins')], ['acoplamentos', data.index.mates.length]]} />
      {data.carFindings.some((f) => f.sev !== 'info') && (
        <details className="issue-details">
          <summary>Problemas entre harnesses · {SEVERITIES.filter((sev) => sev !== 'info' && count(data.carFindings, sev)).map((sev) => `${count(data.carFindings, sev)} ${SEV[sev].label}`).join(' · ')}</summary>
          <Stack gap="md" mt="sm">
            <Findings list={data.carFindings.filter((f) => f.sev !== 'info')} />
            <Anchor href={href('validate')} size="sm">Ver validação e origem dos problemas →</Anchor>
          </Stack>
        </details>
      )}
      {data.boards?.folder && <Anchor href={data.boards.folder} target="_blank" rel="noopener noreferrer" size="sm">Projetos das placas no Altium 365 ↗</Anchor>}
    </Stack>
  )
}

// ---------------------------------------------------------------- um harness
export function HarnessPage({ data, code }) {
  const h = data.byCode.get(code)
  const meta = h?.meta || data.missing.find((m) => m.code === code)
  if (!meta) return <Alert color="red" mt="xl" title="Não encontrado">Não existe o harness "{code}".</Alert>
  const cat = CATEGORY[meta.category]
  const mates = data.index.mates.filter((m) => m.a === code || m.b === code)
  const notes = h?.model.sheets.Notes || []
  return (
    <Stack gap="lg" mt="xl">
      <div>
        <Group gap="sm">
          <Title order={2}>{meta.name}</Title>
          <Badge variant="outline" color="gray">{code}</Badge>
          {cat && <Badge variant="light" color={cat.color}>{cat.label}</Badge>}
        </Group>
        <Text size="sm" c="dimmed">Pasta {meta.folder} · {meta.sources.join(', ') || 'vazia'}</Text>
      </div>
      {!h ? <Alert color="gray" title="Sem Excel">Esta pasta ainda não tem um Excel de pinouts.</Alert> : (
        <>
          <Stats items={[['fios', h.model.sheets.Wires.length], ['fichas', h.model.sheets.Connectors.length],
            ['pinos', h.model.sheets.Pins.length], ['problemas abertos', h.model.sheets.Issues.filter(isOpen).length]]} />
          <Group gap="lg">
            <Anchor href={href('connectors', code)}>Conectores →</Anchor>
            <Anchor href={href('wires', code)}>Fios →</Anchor>
            <Anchor href={href('issues', code)}>Problemas →</Anchor>
            <Anchor href={href('validate', code)}>Validação →</Anchor>
            <Anchor href={href('diagram', code)}>Diagrama 2D →</Anchor>
            <Anchor href={href('formboard', code)}>Formboard →</Anchor>
            <Anchor href={href('bom', code)}>BOM / lista de corte →</Anchor>
          </Group>
          <SevBadges findings={h.findings} />
          <Completeness data={data} h={h} />
          {!meta.curated && (
            <Text size="sm" c="dimmed">Migrado automaticamente do Excel antigo: as ligações que não batem nas duas pontas ficaram como estavam e estão na folha Issues para a equipa decidir.</Text>
          )}
          {mates.length > 0 && (
            <div>
              <Title order={4} mb="xs">Liga a outros harnesses</Title>
              <Group gap="xs">{mates.map((m) => {
                const other = m.a === code ? m.b : m.a
                return <Badge key={m.ref + other} component="a" href={href('c', code, m.ref)} variant="light" size="lg" style={{ cursor: 'pointer', textTransform: 'none' }}>{m.ref} ⇄ {other}</Badge>
              })}</Group>
            </div>
          )}
          {notes.length > 0 && (
            <div>
              <Title order={4} mb="xs">Notas da equipa (do Excel)</Title>
              <Stack gap={4}>{notes.map((n, i) => <Text key={i} size="sm" c="dimmed">• {txt(n.note)}</Text>)}</Stack>
            </div>
          )}
          <HarnessLinks data={data} h={h} />
        </>
      )}
    </Stack>
  )
}

// as ligações do harness: cada ficha com o seu pinout, e a lista de todos os fios
function HarnessLinks({ data, h }) {
  const conns = [...h.H.conns.values()].filter((c) => up(c.type) !== 'SPLICE').map((c) => {
    const ref = txt(c.ref)
    const pins = h.H.pinsOf(ref)
    return { ref, c, pins: pins.length, used: pins.filter((p) => h.H.usage.has(pinKey(ref, txt(p.pin)))).length }
  }).sort((a, b) => b.used - a.used)
  const [open, setOpen] = useState(conns.slice(0, 3).map((x) => x.ref))
  const wires = h.model.sheets.Wires.map((w) => ({ code: h.code, w }))
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3}>Ligações · {conns.length} fichas</Title>
        <Group gap="sm">
          <Button size="xs" variant="default" onClick={() => setOpen(conns.map((x) => x.ref))}>Abrir todas</Button>
          <Button size="xs" variant="default" onClick={() => setOpen([])}>Fechar todas</Button>
        </Group>
      </Group>
      <Accordion multiple value={open} onChange={setOpen} variant="separated" radius="md">
        {conns.map(({ ref, c, pins, used }) => {
          const mate = data.car.mateOf.get(`${h.code}\u0001${ref}`)
          const board = boardOf(data.boards, h.code, ref)
          return (
            <Accordion.Item key={ref} value={ref}>
              <Accordion.Control>
                <Group gap="sm" wrap="wrap">
                  <Text fw={600}>{ref}</Text>
                  <Text size="sm" c="dimmed">{used} / {pins} pinos com fio</Text>
                  {mate && <Badge variant="light" size="sm" style={{ textTransform: 'none' }}>⇄ {mate.code}</Badge>}
                  {board && <Badge variant="light" color="grape" size="sm" style={{ textTransform: 'none' }}>placa {board.name}</Badge>}
                  {up(c.type) === 'STUD' && <Badge variant="light" color="gray" size="sm">perno</Badge>}
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                {open.includes(ref) && <Pinout data={data} code={h.code} refName={ref} />}
                <Anchor href={href('c', h.code, ref)} size="sm">Página da ficha {ref} →</Anchor>
              </Accordion.Panel>
            </Accordion.Item>
          )
        })}
      </Accordion>
      <Title order={3} mt="md">Todos os fios · {wires.length}</Title>
      {wires.length ? <WireTable rows={wires} data={data} scopeKey={h.code} /> : <Empty>Este Excel ainda não tem ligações.</Empty>}
    </Stack>
  )
}

// ---------------------------------------------------------------- conectores
export function Connectors({ data, code }) {
  const [q, setQ] = useState('')
  const rows = scope(data, code).flatMap((h) => [...h.H.conns.values()].map((c) => ({ h, c })))
    .filter(({ c }) => !q || `${c.ref} ${c.device} ${c.housing_pn}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <Stack gap="md" mt="xl">
      <Title order={2}>Conectores</Title>
      <Group gap="sm" wrap="wrap">
        <HarnessSelect data={data} code={code} page="connectors" />
        <TextInput placeholder="Filtrar (ref, dispositivo, P/N)" aria-label="Filtrar conectores" value={q} onChange={(e) => setQ(e.currentTarget.value)} style={{ flex: '1 1 220px' }} />
      </Group>
      <Table.ScrollContainer minWidth={820}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr><Table.Th>Harness</Table.Th><Table.Th>Ref</Table.Th><Table.Th>Tipo</Table.Th><Table.Th>P/N</Table.Th><Table.Th>Pinos com fio</Table.Th><Table.Th>Outra ficha</Table.Th><Table.Th>Problemas</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(({ h, c }) => {
              const ref = txt(c.ref)
              const pins = h.H.pinsOf(ref)
              const used = pins.filter((p) => h.H.usage.has(pinKey(ref, txt(p.pin)))).length
              const probs = h.findings.filter((f) => f.refs.includes(ref) && f.sev !== 'info').length
              const mate = data.car.mateOf.get(`${h.code}\u0001${ref}`)
              return (
                <Table.Tr key={h.code + ref}>
                  <Table.Td><HCode code={h.code} /></Table.Td>
                  <Table.Td><RefLink code={h.code} r={ref} /></Table.Td>
                  <Table.Td><Text size="sm">{txt(c.type)}</Text></Table.Td>
                  <Table.Td><Text size="sm" ff="monospace">{txt(c.housing_pn) || '—'}</Text></Table.Td>
                  <Table.Td><Text size="sm">{used} / {pins.length}</Text></Table.Td>
                  <Table.Td>{mate ? <Anchor href={href('c', mate.code, mate.ref)} size="sm">⇄ {mate.code}</Anchor>
                    : boardOf(data.boards, h.code, ref) ? <Altium board={boardOf(data.boards, h.code, ref)} />
                    : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
                  <Table.Td>{probs ? <Badge color="yellow" variant="light">{probs}</Badge> : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text size="xs" c="dimmed">{rows.length} conectores</Text>
    </Stack>
  )
}

// crimp de uma ponta: P/N e de onde veio, ou porque falta
const Crimp = ({ c }) => (c.pn
  ? <Text size="sm" ff="monospace" c={c.ok === false ? 'red.4' : undefined} title={[c.source, c.family?.name, c.guess, c.ok === false && 'AWG fora da gama'].filter(Boolean).join(' · ')}>{c.pn}</Text>
  : <Text size="xs" c="dimmed" title={c.why}>por definir</Text>)

// pinout de uma ficha: pino → fio → para onde vai, e o que continua na outra ficha (se for entre harnesses)
function Pinout({ data, code, refName }) {
  const h = data.byCode.get(code)
  const mate = data.car.mateOf.get(`${code}\u0001${refName}`)
  const M = mate && data.byCode.get(mate.code)
  const rows = h.H.pinsOf(refName).flatMap((p) => {
    const ws = h.H.usage.get(pinKey(refName, txt(p.pin))) || []
    return ws.length ? ws.map((w, i) => ({ p, w, first: i === 0 })) : [{ p, w: null, first: true }]
  })
  const other = (w, pin) => (txt(w.from_ref) === refName && txt(w.from_pin) === pin ? ['to_ref', 'to_pin'] : ['from_ref', 'from_pin']).map((k) => txt(w[k]))
  const across = (pin) => {
    const w = M?.H.usage.get(pinKey(refName, pin))?.[0]
    return w ? { w, to: other(w, pin) } : null
  }

  return (
    <Table.ScrollContainer minWidth={mate ? 1000 : 820}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr><Table.Th>Pino</Table.Th><Table.Th>Sinal</Table.Th><Table.Th>Dir.</Table.Th><Table.Th>Tensão</Table.Th><Table.Th>Fio</Table.Th><Table.Th>Cor</Table.Th><Table.Th>mm²</Table.Th><Table.Th>Crimp</Table.Th><Table.Th>Liga a</Table.Th>
              {mate && <Table.Th>Do outro lado ({mate.code})</Table.Th>}</Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(({ p, w, first }, i) => {
              const pin = txt(p.pin)
              const x = first && mate ? across(pin) : null
              return (
                <Table.Tr key={i}>
                  <Table.Td><Text size="sm" ff="monospace" fw={600}>{first ? pin : ''}</Text></Table.Td>
                  <Table.Td><Text size="sm">{first ? txt(p.label) : ''}</Text></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{first ? txt(p.dir) : ''}</Text></Table.Td>
                  <Table.Td><Text size="sm">{first ? txt(p.voltage) : ''}</Text></Table.Td>
                  {w ? (
                    <>
                      <Table.Td><WireLink code={code} id={txt(w.wire_id)} /> <Hv on={up(w.hv) === 'Y'} /></Table.Td>
                      <Table.Td><Colour code={w.colour} /></Table.Td>
                      <Table.Td><Text size="sm">{txt(w.csa_mm2)}</Text></Table.Td>
                      <Table.Td><Crimp c={crimpFor(data.catalog, h.H.conns.get(refName), w)} /></Table.Td>
                      <Table.Td><PinLink code={code} r={other(w, pin)[0]} p={other(w, pin)[1]} /></Table.Td>
                    </>
                  ) : (
                    <Table.Td colSpan={5}><Text size="sm" c="dimmed">{up(p.dir) === 'NC' ? 'NC' : 'sem fio'}</Text></Table.Td>
                  )}
                  {mate && <Table.Td>{x ? <><WireLink code={mate.code} id={txt(x.w.wire_id)} /> → <PinLink code={mate.code} r={x.to[0]} p={x.to[1]} /></> : first && <Text size="sm" c="dimmed">—</Text>}</Table.Td>}
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
  )
}

export function Connector({ data, code, refName }) {
  const h = data.byCode.get(code)
  const c = h?.H.conns.get(refName)
  if (!c) return <Alert color="red" mt="xl" title="Não encontrado">Não existe o conector "{refName}" no harness {code}.</Alert>
  const mate = data.car.mateOf.get(`${code}\u0001${refName}`)
  const M = mate && data.byCode.get(mate.code)
  const half = mate && M?.H.conns.get(mate.ref) // a outra ficha deste conector
  const board = boardOf(data.boards, code, refName)
  const info = [
    ['Tipo', c.type], ['Dispositivo', c.device], ['Ficha (cabo)', c.housing_pn], ['Contraparte', c.mate_pn],
    ['Contacto / crimp', c.contact_pn], ['Fabricante', c.manufacturer], ['HV rated', c.hv_rated], ['Peça no 3D', c.anchor_3d],
    ['Posição (m)', [c.x_m, c.y_m, c.z_m].every((v) => txt(v) !== '') ? [c.x_m, c.y_m, c.z_m].join(', ') : ''],
  ]
  return (
    <Stack gap="lg" mt="xl">
      <div>
        <Group gap="sm">
          <Title order={2}>{refName}</Title>
          <Badge variant="light">{txt(c.type)}</Badge>
          <Hv on={up(c.hv_rated) === 'Y'} />
          {board && <Button component="a" href={board.url} target="_blank" rel="noopener noreferrer" size="xs" variant="light">Abrir {board.name} no Altium 365 ↗</Button>}
        </Group>
        <Text size="sm" c="dimmed">Harness <Anchor href={href('h', code)} size="sm">{h.meta.name} ({code})</Anchor>
          {mate && <> · acopla com o mesmo conector no <Anchor href={href('c', mate.code, mate.ref)} size="sm">{M.meta.name} ({mate.code})</Anchor></>}
          {' · '}<Anchor href={href('3d', 'c', code, refName)} size="sm">ver no 3D</Anchor>
        </Text>
      </div>
      {up(c.type) === 'CONNECTOR' && (
        <Card>
          <Text size="sm" c="dimmed" mb="xs">O conector {refName} tem duas fichas, uma macho e uma fêmea:</Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Half data={data} conn={c} title={<Text fw={500}>Esta ficha · harness {code}</Text>} />
            <div>
              {half ? (
                <Half data={data} conn={half} title={<Text fw={500}><Anchor href={href('c', mate.code, mate.ref)} inherit>Ficha do harness {mate.code}</Anchor></Text>} />
              ) : board ? (
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <PartPhoto catalog={data.catalog} pn={c.mate_pn} />
                  <div>
                    <Text fw={500}>Header na placa {board.name}</Text>
                    <Text size="sm" c="dimmed">{txt(c.mate_pn) || 'P/N por definir'} · <Altium board={board} /></Text>
                  </div>
                </Group>
              ) : (
                <>
                  <Text fw={500}>Outra ficha</Text>
                  <Text size="sm" c="dimmed">{txt(c.mate_pn) ? `${txt(c.mate_pn)} · ` : ''}não está em nenhum harness nem placa conhecida</Text>
                </>
              )}
            </div>
          </SimpleGrid>
          {half && up(c.gender) && up(c.gender) === up(half.gender) && (
            <Text c="red.4" size="sm" mt="xs">As duas fichas estão marcadas como {gender(c.gender)} — uma tem de ser macho e a outra fêmea.</Text>
          )}
          {data.catalog?.photos && <Text size="xs" c="dimmed" mt="xs">Fotos dos fabricantes (via Digi-Key); clica numa para abrir a página do produto.</Text>}
        </Card>
      )}
      <Card>
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="sm" verticalSpacing="sm">
          {info.map(([k, v]) => (
            <div key={k}>
              <Text size="xs" c="dimmed">{k}</Text>
              <Text size="sm" ff={/Ficha|Contra|Contacto|Peça/.test(k) ? 'monospace' : undefined}>{txt(v) || '—'}</Text>
            </div>
          ))}
        </SimpleGrid>
        {txt(c.notes) && <Text size="sm" c="dimmed" mt="md">{txt(c.notes)}</Text>}
      </Card>
      <Findings list={h.findings.filter((f) => f.refs.includes(refName) && f.sev !== 'info')} />
      <Title order={3}>Pinout</Title>
      <Pinout data={data} code={code} refName={refName} />
    </Stack>
  )
}

// ---------------------------------------------------------------- fios
function WireTable({ rows, data, scopeKey = '' }) {
  const [limit, setLimit] = useState(100)
  useEffect(() => setLimit(100), [scopeKey])
  return (
    <Stack gap="sm">
    <Table.ScrollContainer minWidth={980}>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr><Table.Th>Harness</Table.Th><Table.Th>Fio</Table.Th><Table.Th>Net</Table.Th><Table.Th>De</Table.Th><Table.Th>Para</Table.Th><Table.Th>Cor</Table.Th><Table.Th>mm²</Table.Th><Table.Th>mm</Table.Th><Table.Th>Problema</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.slice(0, limit).map(({ code, w }) => (
            <Table.Tr key={code + (txt(w.wire_id) || w._row)}>
              <Table.Td><HCode code={code} /></Table.Td>
              <Table.Td><WireLink code={code} id={txt(w.wire_id)} /> <Hv on={up(w.hv) === 'Y'} /></Table.Td>
              <Table.Td><Group gap={6} wrap="nowrap"><Text size="sm" ff="monospace">{txt(w.net)}</Text><Bus w={w} H={data?.byCode.get(code)?.H} /></Group></Table.Td>
              <Table.Td><PinLink code={code} r={txt(w.from_ref)} p={txt(w.from_pin)} /></Table.Td>
              <Table.Td><PinLink code={code} r={txt(w.to_ref)} p={txt(w.to_pin)} /></Table.Td>
              <Table.Td><Colour code={w.colour} /></Table.Td>
              <Table.Td><Text size="sm">{txt(w.csa_mm2) || '—'}</Text></Table.Td>
              <Table.Td><Text size="sm">{txt(w.length_mm) || '—'}</Text></Table.Td>
              <Table.Td><Text size="sm" c="orange.4">{txt(w.issue)}</Text></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
    <Group justify="space-between" gap="sm">
      <Text size="sm" c="dimmed" role="status">A mostrar {Math.min(limit, rows.length)} de {rows.length} fios.</Text>
      {limit < rows.length && <Button variant="default" onClick={() => setLimit((n) => n + 100)}>Mostrar mais {Math.min(100, rows.length - limit)} fios</Button>}
    </Group>
    </Stack>
  )
}

export function Wires({ data, code }) {
  const [q, setQ] = useState('')
  const [hvOnly, setHvOnly] = useState(false)
  const [issueOnly, setIssueOnly] = useState(false)
  const n = q.trim().toLowerCase()
  const all = scope(data, code).flatMap((h) => h.model.sheets.Wires.map((w) => ({ code: h.code, w })))
  const rows = all.filter(({ w }) => (!hvOnly || up(w.hv) === 'Y') && (!issueOnly || txt(w.issue)) &&
    (!n || [w.wire_id, w.net, w.from_ref, w.from_pin, w.to_ref, w.colour, w.description].some((v) => txt(v).toLowerCase().includes(n))))
  return (
    <Stack gap="md" mt="xl">
      <Title order={2}>Fios</Title>
      <Group gap="lg" wrap="wrap">
        <HarnessSelect data={data} code={code} page="wires" />
        <TextInput placeholder="Filtrar (fio, net, conector, cor)" aria-label="Filtrar fios" value={q} onChange={(e) => setQ(e.currentTarget.value)} style={{ flex: '1 1 220px' }} />
        <Switch label="Só HV" checked={hvOnly} onChange={(e) => setHvOnly(e.currentTarget.checked)} />
        <Switch label="Só com problemas" checked={issueOnly} onChange={(e) => setIssueOnly(e.currentTarget.checked)} />
      </Group>
      {rows.length ? <WireTable rows={rows} data={data} scopeKey={`${code}|${q}|${hvOnly}|${issueOnly}`} />
        : <Empty>Sem fios com estes filtros. Altera a pesquisa ou desativa os filtros.</Empty>}
      <Text size="xs" c="dimmed">{rows.length} de {all.length} fios · clica num fio para ver o circuito completo.</Text>
    </Stack>
  )
}

// ---------------------------------------------------------------- trace de um circuito (atravessa harnesses)
function PinCard({ data, q, active }) {
  const { code, ref, pin } = splitQ(q)
  const p = data.byCode.get(code)?.H.pins.get(pinKey(ref, pin))
  return (
    <Paper p="sm" radius="md" bg={active ? 'dark.5' : 'dark.7'} withBorder style={{ minWidth: 0 }}>
      <Group gap={6} wrap="nowrap"><Badge size="xs" variant="outline" color="gray" style={{ flex: 'none' }}>{code}</Badge><PinLink code={code} r={ref} p={pin} /></Group>
      <Text size="xs" c="dimmed" truncate>{[txt(p?.label), txt(p?.dir), txt(p?.voltage)].filter(Boolean).join(' · ') || '—'}</Text>
      {boardOf(data.boards, code, ref) && <Altium board={boardOf(data.boards, code, ref)} size="xs" />}
    </Paper>
  )
}

// ordena fios e acoplamentos pela ordem em que se percorre o circuito, a partir do fio escolhido
function walk(c, start) {
  const edges = [
    ...c.wires.map(({ code, w }) => ({ kind: 'wire', code, w, a: qKey(code, txt(w.from_ref), txt(w.from_pin)), b: qKey(code, txt(w.to_ref), txt(w.to_pin)) })),
    ...c.links.map((l) => ({ kind: 'link', l, a: l.qa, b: l.qb })),
  ]
  const at = new Map()
  for (const e of edges) for (const k of [e.a, e.b]) at.set(k, [...(at.get(k) || []), e])
  const first = edges.find((e) => e.w === start) || edges[0]
  const seen = new Set([first])
  const out = [{ ...first }]
  const queue = [first.a, first.b]
  const visited = new Set(queue)
  while (queue.length) {
    const k = queue.shift()
    for (const e of at.get(k) || []) {
      if (seen.has(e)) continue
      seen.add(e)
      const [from, to] = e.a === k ? [e.a, e.b] : [e.b, e.a]
      out.push({ ...e, a: from, b: to })
      if (!visited.has(to)) visited.add(to), queue.push(to)
    }
  }
  return out
}

export function Trace({ data, code, wireId }) {
  const h = data.byCode.get(code)
  const w = h?.H.wireById.get(wireId)
  if (!w) return <Alert color="red" mt="xl" title="Não encontrado">Não existe o fio "{wireId}" no harness {code}.</Alert>
  const local = h.H.circuitOf.get(w)
  const c = data.car.circuitOf.get(w) || { keys: local.keys.map((k) => `${code}\u0001${k}`), wires: local.wires.map((x) => ({ code, w: x })), links: [] }
  const steps = walk(c, w)
  const ids = new Set(c.wires.map((x) => `${x.code}/${txt(x.w.wire_id)}`))
  const codes = [...new Set(c.wires.map((x) => x.code))]
  const nets = [...new Set(c.wires.map((x) => txt(x.w.net)).filter(Boolean))].join(' / ')
  const findings = [
    // só o que é deste circuito (as mensagens agregadas do harness inteiro ficam na página de validação)
    ...data.list.flatMap((x) => x.findings.filter((f) => f.wires?.length <= 10 && f.wires.some((id) => ids.has(`${x.code}/${id}`)))),
    ...data.carFindings.filter((f) => f.links?.some((l) => ids.has(`${l.code}/${l.id}`))),
  ]
  return (
    <Stack gap="lg" mt="xl">
      <div>
        <Text size="sm" c="dimmed">Circuito</Text>
        <Title order={2} ff="monospace" style={{ wordBreak: 'break-word' }}>{nets || wireId}</Title>
        <Text size="sm" c="dimmed">{c.keys.length} pinos · {c.wires.length} fio(s) · {codes.length > 1 ? `atravessa ${codes.join(' → ')}` : `harness ${codes[0]}`}
          {' · '}<Anchor href={href('3d', 't', code, wireId)} size="sm">ver no 3D</Anchor></Text>
      </div>
      <Findings list={findings} />
      <Stack gap="sm">
        {steps.map((s, i) => {
          if (s.kind === 'link')
            return (
              <div key={i} className="trace-row">
                <PinCard data={data} q={s.a} />
                <Stack gap={2} align="center">
                  <Text size="xs" c="teal.4" fw={600}>⇄ acoplamento</Text>
                  <Box w="100%" h={0} aria-hidden style={{ borderTop: '2px dashed var(--mantine-color-teal-6)' }} />
                  <Text size="xs" c="dimmed">{s.l.ref}:{s.l.pin}</Text>
                </Stack>
                <PinCard data={data} q={s.b} />
              </div>
            )
          const on = s.w === w
          return (
            <div key={i} className="trace-row">
              <PinCard data={data} q={s.a} active={on} />
              <Stack gap={2} align="center">
                <Group gap={4} wrap="nowrap"><WireLink code={s.code} id={txt(s.w.wire_id)} /><Hv on={up(s.w.hv) === 'Y'} /><Bus w={s.w} H={data.byCode.get(s.code)?.H} /></Group>
                <Box w="100%" h={on ? 6 : 4} aria-hidden style={{ background: COLOURS[up(s.w.colour).split('/')[0]] || '#555', borderRadius: 3, opacity: on ? 1 : 0.7 }} />
                <Text size="xs" c="dimmed">{[txt(s.w.colour), txt(s.w.csa_mm2) && `${txt(s.w.csa_mm2)} mm²`, txt(s.w.length_mm) && `${txt(s.w.length_mm)} mm`].filter(Boolean).join(' · ')}</Text>
              </Stack>
              <PinCard data={data} q={s.b} active={on} />
            </div>
          )
        })}
      </Stack>
      {txt(w.description) && <Text size="sm" c="dimmed">{txt(w.wire_id)}: {txt(w.description)}</Text>}
    </Stack>
  )
}

// ---------------------------------------------------------------- issues
export function Issues({ data, code }) {
  const sevColor = { 'crítico': 'red', importante: 'orange', menor: 'yellow', info: 'gray' }
  const [openOnly, setOpenOnly] = useState(true)
  return (
    <Stack gap="md" mt="xl">
      <Title order={2}>Problemas</Title>
      <Text size="sm" c="dimmed">Problemas encontrados nos Excels originais. A decisão vai para a coluna team_decision do Excel de cada harness.</Text>
      <Group gap="lg">
        <HarnessSelect data={data} code={code} page="issues" />
        <Switch label="Só por resolver" checked={openOnly} onChange={(e) => setOpenOnly(e.currentTarget.checked)} />
      </Group>
      {scope(data, code).map((h) => {
        const list = h.model.sheets.Issues.filter((i) => !openOnly || isOpen(i))
        if (!list.length) return null
        return (
          <Stack key={h.code} gap="xs">
            <Title order={4}><Anchor href={href('h', h.code)} inherit>{h.meta.name}</Anchor> <Text span c="dimmed" fz="sm">{h.code} · {list.length}</Text></Title>
            <Table.ScrollContainer minWidth={900}>
              <Table striped verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr><Table.Th w={70}>ID</Table.Th><Table.Th w={110}>Gravidade</Table.Th><Table.Th>Problema</Table.Th><Table.Th w={260}>Aplicado</Table.Th><Table.Th w={160}>Fios</Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {list.map((i) => {
                    const ws = h.model.sheets.Wires.filter((w) => txt(w.issue).split(/,\s*/).includes(txt(i.id)))
                    return (
                      <Table.Tr key={txt(i.id)}>
                        <Table.Td><Text size="sm" ff="monospace" fw={600}>{txt(i.id)}</Text><Text size="xs" c="dimmed">{txt(i.status)}</Text></Table.Td>
                        <Table.Td><Badge color={sevColor[txt(i.severity)] || 'gray'} variant="light">{txt(i.severity)}</Badge></Table.Td>
                        <Table.Td><Text size="sm" fw={500}>{txt(i.where)}</Text><Text size="sm" c="dimmed">{txt(i.problem)}</Text>
                          {txt(i.team_decision) && <Text size="sm" c="teal.4">Decisão: {txt(i.team_decision)}</Text>}</Table.Td>
                        <Table.Td><Text size="sm">{txt(i.applied_here)}</Text></Table.Td>
                        <Table.Td><Group gap={6}>{ws.slice(0, 12).map((w) => <WireLink key={txt(w.wire_id)} code={h.code} id={txt(w.wire_id)} />)}{ws.length > 12 && <Text size="xs" c="dimmed">+{ws.length - 12}</Text>}</Group></Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Stack>
        )
      })}
    </Stack>
  )
}
