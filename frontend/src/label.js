// O código 2D das etiquetas Mouser e DigiKey (Data Matrix) segue a ISO/IEC 15434: campos separados por GS,
// cada um começa por um identificador (dígitos e uma letra), ex. "1PMIC6270YM5-TR" ou "Q20".
// O PDF417 das etiquetas Microchip usa os mesmos identificadores, separados por vírgulas.
// A encomenda é K na Mouser e 1K na DigiKey; a fatura é 11K na Mouser e 10K na DigiKey (lá 11K é outra coisa).
const FIELDS = { '1P': 'mpn', Q: 'qty', '1V': 'manufacturer', K: 'order', '1K': 'order', '10K': 'invoice', '11K': 'invoice', '4L': 'country', '30P': 'supplierPart' }

export function parseLabel(text) {
  // Alguns leitores devolvem os separadores como símbolos visíveis (␝, ␞, ␠); repõe os caracteres originais.
  const plain = String(text).replace(/[␀-␠]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x2400))
  // Na ISO 15434 uma vírgula pode fazer parte de um valor (ex. o fabricante), por isso só se separa por GS.
  const fields = plain.startsWith('[)>') ? plain.split(/[\x1d\x1e\x04]/) : plain.split(',')
  const label = {}
  for (const field of fields) {
    const [, id, value] = field.match(/^(\d{0,2}[A-Z])(.+)$/) || []
    if (FIELDS[id] && !(FIELDS[id] in label)) label[FIELDS[id]] = value.trim()
  }
  if (!label.mpn) return null
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
