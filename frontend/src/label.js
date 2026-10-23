// O código 2D das etiquetas Mouser e DigiKey segue a ISO/IEC 15434: campos separados por GS,
// cada um começa por um identificador (dígitos e uma letra), ex. "1PMIC6270YM5-TR" ou "Q20".
// Nas etiquetas Microchip (EIA-556) cada código de barras é um só campo com o mesmo identificador.
// A encomenda é K na Mouser e 1K na DigiKey; a fatura é 11K na Mouser e 10K na DigiKey (lá 11K é outra coisa).
const FIELDS = { '1P': 'mpn', Q: 'qty', '1V': 'manufacturer', K: 'order', '1K': 'order', '10K': 'invoice', '11K': 'invoice', '4L': 'country', '30P': 'supplierPart' }

// Recebe o texto de um código ou de todos os códigos de uma imagem. Os códigos 2D vêm primeiro e ganham,
// porque um código de barras sem identificador (ex. o P/N Mouser "QS5…") podia parecer um campo.
export function parseLabel(texts) {
  const joined = [texts].flat().map(String).sort((a, b) => b.startsWith('[)>') - a.startsWith('[)>')).join('\x1d')
  // Alguns leitores devolvem os separadores como símbolos visíveis (␝, ␞, ␠); repõe os caracteres originais.
  const plain = joined.replace(/[\u2400-\u2420]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x2400))
  const label = {}
  for (const field of plain.split(/[\x1d\x1e\x04]/)) {
    const [, id, value] = field.match(/^(\d{0,2}[A-Z])(.+)$/) || []
    if (FIELDS[id] && !(FIELDS[id] in label)) label[FIELDS[id]] = value.trim()
  }
  if (!label.mpn) return null
  label.qty = Number.parseInt(label.qty, 10) || 1
  return label
}
