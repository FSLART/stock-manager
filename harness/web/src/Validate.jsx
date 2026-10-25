import { useState } from 'react'
import { Alert, Anchor, Badge, Button, FileButton, Group, Paper, Stack, Table, Text, TextInput, Title, UnstyledButton } from '@mantine/core'
import { SEVERITIES, validate } from './lib/validate.js'
import { Card, href, SEV } from './pages.jsx'

export function Report({ findings, code }) {
  const [sev, setSev] = useState(null)
  const [q, setQ] = useState('')
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.sev === s).length]))
  const shown = findings.filter(
    (f) => (!sev || f.sev === sev) && (!q || `${f.rule} ${f.sheet} ${f.msg}`.toLowerCase().includes(q.toLowerCase())),
  )
  // leva ao circuito do fio ou à ficha, se o finding apontar para um
  const target = (f) => (f.links?.[0] ? href('t', f.links[0].code, f.links[0].id)
    : code && f.wires?.[0] ? href('t', code, f.wires[0]) : code && f.refs?.[0] ? href('c', code, f.refs[0]) : null)

  return (
    <Stack gap="md">
      <Group gap="sm" wrap="wrap">
        {SEVERITIES.map((s) => (
          <UnstyledButton key={s} onClick={() => setSev(sev === s ? null : s)} aria-pressed={sev === s}>
            <Badge size="lg" color={SEV[s].color} variant={sev === s ? 'filled' : 'light'}>
              {counts[s]} {SEV[s].label}
            </Badge>
          </UnstyledButton>
        ))}
        <TextInput placeholder="Procurar (ex.: AMS J11, W-HV, RESET)" aria-label="Procurar no relatório" value={q}
          onChange={(e) => setQ(e.currentTarget.value)} style={{ flex: '1 1 220px' }} />
      </Group>
      {!findings.length ? (
        <Alert color="teal" title="Sem problemas">Nenhuma regra falhou.</Alert>
      ) : (
        <Table.ScrollContainer minWidth={640}>
          <Table striped highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr><Table.Th w={90}>Gravidade</Table.Th><Table.Th w={100}>Regra</Table.Th><Table.Th w={140}>Onde</Table.Th><Table.Th>Problema</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shown.map((f, i) => (
                <Table.Tr key={i}>
                  <Table.Td><Badge color={SEV[f.sev].color} variant="light">{SEV[f.sev].label}</Badge></Table.Td>
                  <Table.Td><Text size="xs" ff="monospace">{f.rule}</Text></Table.Td>
                  <Table.Td>
                    {target(f) ? <Anchor href={target(f)} size="sm">{f.sheet}{f.row ? ` · linha ${f.row}` : ''}</Anchor>
                      : <Text size="sm">{f.sheet}{f.row ? ` · linha ${f.row}` : ''}</Text>}
                  </Table.Td>
                  <Table.Td><Text size="sm" style={{ overflowWrap: 'anywhere' }}>{f.msg}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Text size="xs" c="dimmed">A mostrar {shown.length} de {findings.length}.</Text>
    </Stack>
  )
}

export default function Validate({ data, code }) {
  const [other, setOther] = useState(null)
  const [error, setError] = useState('')
  const [over, setOver] = useState(false)

  async function load(file) {
    if (!file) return
    setError('')
    try {
      const { parseWorkbook } = await import('./lib/model.js')
      const m = parseWorkbook(new Uint8Array(await file.arrayBuffer()))
      setOther({ name: file.name, model: m, findings: validate(m, data?.catalog) })
    } catch (e) {
      setOther(null)
      setError(`Não consegui ler ${file.name}: ${e.message}`)
    }
  }

  return (
    <Stack gap="xl" mt="xl">
      {data && code && data.byCode.get(code) && (
        <Stack gap="md">
          <div>
            <Anchor href={href('validate')} size="sm">← todos os harnesses</Anchor>
            <Title order={2}>Validação · {data.byCode.get(code).meta.name}</Title>
            <Text size="sm" c="dimmed">Corre sozinha sobre o {data.byCode.get(code).meta.file} guardado no site, sempre que abres a página.</Text>
          </div>
          <Report key={code} findings={data.byCode.get(code).findings} code={code} />
        </Stack>
      )}
      {data && !code && (
        <Stack gap="md">
          <div>
            <Title order={2}>Validação do {data.index.car}</Title>
            <Text size="sm" c="dimmed">Corre sozinha sobre os Excels guardados no site, sempre que abres a página.</Text>
          </div>
          <Card>
            <Table.ScrollContainer minWidth={560}>
              <Table highlightOnHover>
                <Table.Thead><Table.Tr><Table.Th>Harness</Table.Th>{SEVERITIES.map((s) => <Table.Th key={s}>{SEV[s].label}</Table.Th>)}</Table.Tr></Table.Thead>
                <Table.Tbody>
                  {data.list.map((h) => (
                    <Table.Tr key={h.code}>
                      <Table.Td><Anchor href={href('validate', h.code)} size="sm">{h.meta.name}</Anchor> <Text span size="xs" c="dimmed">{h.code}</Text></Table.Td>
                      {SEVERITIES.map((s) => {
                        const n = h.findings.filter((f) => f.sev === s).length
                        return <Table.Td key={s}>{n ? <Badge color={SEV[s].color} variant="light">{n}</Badge> : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
                      })}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
          <Title order={3}>Entre harnesses</Title>
          <Text size="sm" c="dimmed">O que só se vê juntando os harnesses pelos conectores que os ligam.</Text>
          <Report findings={data.carFindings} />
        </Stack>
      )}

      <Stack gap="md">
        <div>
          <Title order={3}>Verificar uma versão nova</Title>
          <Text size="sm" c="dimmed">Antes de substituir o ficheiro guardado. O ficheiro é lido no teu browser e não é enviado nem guardado.</Text>
        </div>
        <div className="glass">
          <Paper className="drop" data-over={over} p="lg" radius={10} bg="dark.8"
            onDragOver={(e) => (e.preventDefault(), setOver(true))}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => (e.preventDefault(), setOver(false), load(e.dataTransfer.files[0]))}>
            <Group justify="space-between" wrap="wrap" gap="md">
              <div>
                <Text fw={500}>{other ? other.name : 'Larga aqui um .xlsx'}</Text>
                <Text size="sm" c="dimmed">
                  {other ? `${other.model.sheets.Wires.length} fios · ${other.model.sheets.Connectors.length} conectores · ${other.model.sheets.Pins.length} pinos`
                    : 'Folhas esperadas: Wires, Connectors, Pins, Parts, Segments, Nodes, Issues'}
                </Text>
              </div>
              <FileButton onChange={load} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
                {(props) => <Button {...props} variant="default">Escolher ficheiro</Button>}
              </FileButton>
            </Group>
          </Paper>
        </div>
        {error && <Alert color="red" title="Erro">{error}</Alert>}
        {other && <Report key={other.name} findings={other.findings} />}
      </Stack>
    </Stack>
  )
}
