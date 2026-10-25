// Lê o Excel standard (T26_Harness.xlsx) para { sheets: {Wires: [linhas]}, headers, missing }.
// As colunas são lidas pelo nome do cabeçalho; as colunas de fórmula são ignoradas pelo validador.
import { read, utils } from 'xlsx'

export const SHEETS = ['Wires', 'Connectors', 'Pins', 'Parts', 'Segments', 'Nodes', 'Issues', 'Notes']

export function parseWorkbook(data) {
  const wb = read(data, { type: 'array' })
  const m = { missing: [], headers: {}, sheets: {} }
  for (const name of SHEETS) {
    const ws = wb.Sheets[name]
    if (!ws) {
      m.missing.push(name)
      m.headers[name] = []
      m.sheets[name] = []
      continue
    }
    m.headers[name] = (utils.sheet_to_json(ws, { header: 1 })[0] || []).map((h) => String(h ?? '').trim())
    m.sheets[name] = utils
      .sheet_to_json(ws, { defval: '' })
      .map((r) => ({ ...r, _row: r.__rowNum__ + 1 })) // nº da linha no Excel, para o relatório
      .filter((r) => Object.entries(r).some(([k, v]) => k !== '_row' && v !== ''))
  }
  return m
}
