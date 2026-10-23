// O código 2D das etiquetas Mouser e DigiKey (Data Matrix) segue a ISO/IEC 15434: campos separados por GS,
// cada um começa por um identificador (dígitos e uma letra), ex. "1PMIC6270YM5-TR" ou "Q20".
// O PDF417 das etiquetas Microchip usa os mesmos identificadores, separados por vírgulas.
// A encomenda é K na Mouser e 1K na DigiKey; a fatura é 11K na Mouser e 10K na DigiKey (lá 11K é outra coisa).
const FIELDS = { '1P': 'mpn', Q: 'qty', '1V': 'manufacturer', K: 'order', '1K': 'order', '10K': 'invoice', '11K': 'invoice', '4L': 'country', '30P': 'supplierPart' }
// As etiquetas de fábrica da TE usam identificadores próprios de duas letras: PN é o código TE (o P/N da Mouser/DigiKey), QT a quantidade.
const TE_FIELDS = { PN: 'mpn', QT: 'qty', PO: 'order' }

export function parseLabel(text) {
  // Alguns leitores devolvem os separadores como símbolos visíveis (␝, ␞, ␠); repõe os caracteres originais.
  const plain = String(text).replace(/[␀-␠]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x2400))
  // Na ISO 15434 uma vírgula pode fazer parte de um valor (ex. o fabricante), por isso só se separa por GS.
  const fields = plain.startsWith('[)>') ? plain.split(/[\x1d\x1e\x04]/) : plain.split(',')
  // "QT20" só existe na TE: na norma a quantidade (Q) tem apenas dígitos.
  const te = fields.some(field => /^QT\d+$/.test(field))
  const label = {}
  for (const field of fields) {
    const [, id, value] = field.match(te ? /^([A-Z]{2})(.+)$/ : /^(\d{0,2}[A-Z])(.+)$/) || []
    const name = (te ? TE_FIELDS : FIELDS)[id]
    if (name && !(name in label)) label[name] = value.trim()
  }
  if (!label.mpn) return null
  if (te) label.manufacturer = 'TE Connectivity'
  // As etiquetas da TE Connectivity não trazem o fabricante (1V), só o código de catálogo TE no campo P,
  // sempre no formato N-NNNNNNN-N (ex. 1-1614883-3), que nenhuma Mouser/DigiKey usa.
  const catalogCode = fields.map(field => field.match(/^P(.+)$/)?.[1]?.trim()).find(Boolean)
  if (!label.manufacturer && /^\d-\d{6,7}-\d$/.test(catalogCode ?? '')) label.manufacturer = 'TE Connectivity'
  label.qty = Number.parseInt(label.qty, 10) || 1
  return label
}

// Unsharp mask em cinzento: realça as arestas de fotografias pouco nítidas antes de procurar os códigos.
export function sharpen({ data, width, height }, radius = 3, amount = 2) {
  const gray = Float32Array.from({ length: width * height }, (_, i) => (data[4 * i] + data[4 * i + 1] + data[4 * i + 2]) / 3)
  // Desfoque em caixa separável: primeiro ao longo das linhas, depois das colunas.
  const blur = (source, step, length, stride, lines) => {
    const out = new Float32Array(source.length)
    for (let line = 0; line < lines; line++) {
      for (let pos = 0; pos < length; pos++) {
        let sum = 0, count = 0
        for (let k = Math.max(0, pos - radius); k <= Math.min(length - 1, pos + radius); k++) { sum += source[line * stride + k * step]; count++ }
        out[line * stride + pos * step] = sum / count
      }
    }
    return out
  }
  const blurred = blur(blur(gray, 1, width, width, height), width, height, 1, width)
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < gray.length; i++) {
    out[4 * i] = out[4 * i + 1] = out[4 * i + 2] = gray[i] + amount * (gray[i] - blurred[i])
    out[4 * i + 3] = 255
  }
  return { data: out, width, height, colorSpace: 'srgb' }
}
