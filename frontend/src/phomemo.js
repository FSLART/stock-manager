// Phomemo M110 (e irmãs M120/M220): etiquetas a 203 dpi, a preto e branco, por Bluetooth (Web Bluetooth) ou como PNG
// para a app do telemóvel. Comandos como no driver aberto phomemo-tools (rastertopm110).
export const DPI = 203
export const HEAD_DOTS = 440 // largura máxima de impressão: 55 mm (rolo de 55 mm), 55 bytes por linha
const MM = DPI / 25.4
export const dots = mm => Math.round(mm * MM)

// Etiqueta mais larga do que os 55 mm mas que cabe deitada: roda 90° e sai ao comprido do rolo.
export const shouldRotate = (label, orientation) => orientation === 'auto'
  ? dots(label.width) > HEAD_DOTS && dots(label.height) <= HEAD_DOTS
  : orientation === 'rotated'

// Só as regras das etiquetas vão para dentro do SVG; o resto da página não interessa e uma imagem não lê a folha de estilos.
function labelCss() {
  return [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules] } catch { return [] } })
    .filter(rule => /drawer-label|bin-/.test(rule.selectorText || '')).map(rule => rule.cssText).join('\n')
}

// Desenha o elemento da etiqueta (DrawerLabel, sem zoom) num canvas a 203 dpi, passando por um SVG com foreignObject.
export async function renderLabel(element, label) {
  const width = label.width / 25.4 * 96, height = label.height / 25.4 * 96 // px CSS
  const html = new XMLSerializer().serializeToString(element)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dots(label.width)}" height="${dots(label.height)}" viewBox="0 0 ${width} ${height}">`
    + `<foreignObject width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml"><style>${labelCss()}</style>${html}</div></foreignObject></svg>`
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()
  const canvas = Object.assign(document.createElement('canvas'), { width: dots(label.width), height: dots(label.height) })
  const context = canvas.getContext('2d')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

// Roda 90° (sentido dos ponteiros) e passa a preto e branco puro, que é o que a impressora térmica faz.
export function forPrinter(source, rotate) {
  const canvas = Object.assign(document.createElement('canvas'), rotate ? { width: source.height, height: source.width } : { width: source.width, height: source.height })
  const context = canvas.getContext('2d')
  if (rotate) { context.translate(canvas.width, 0); context.rotate(Math.PI / 2) }
  context.drawImage(source, 0, 0)
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < image.data.length; i += 4) {
    const black = image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114 < 160
    image.data.fill(black ? 0 : 255, i, i + 3)
    image.data[i + 3] = 255
  }
  context.putImageData(image, 0, 0)
  return canvas
}

// Uma etiqueta em comandos para a M110: velocidade, densidade e tipo de papel, a imagem em blocos "GS v 0"
// (1 bit por ponto, 1 = preto) centrada nos 440 pontos (55 mm), e no fim avança até à próxima etiqueta.
// image é um ImageData já a preto e branco; mais larga do que isso é cortada dos dois lados.
export function labelCommands(image, { media = 'gaps', density = 10 } = {}) {
  const bytesPerLine = HEAD_DOTS / 8, offset = Math.floor((HEAD_DOTS - image.width) / 2)
  const out = [0x1b, 0x4e, 0x0d, 5, 0x1b, 0x4e, 0x04, density, 0x1f, 0x11, media === 'continuous' ? 0x0b : 0x0a]
  for (let top = 0; top < image.height; top += 255) {
    const lines = Math.min(255, image.height - top)
    out.push(0x1d, 0x76, 0x30, 0x00, bytesPerLine & 0xff, bytesPerLine >> 8, lines & 0xff, lines >> 8)
    for (let y = top; y < top + lines; y++) {
      const row = new Uint8Array(bytesPerLine)
      for (let x = 0; x < image.width; x++) {
        const dot = x + offset
        if (dot < 0 || dot >= HEAD_DOTS || image.data[(y * image.width + x) * 4] >= 128) continue
        row[dot >> 3] |= 0x80 >> (dot & 7)
      }
      out.push(...row)
    }
  }
  out.push(0x1f, 0xf0, 0x05, 0x00, 0x1f, 0xf0, 0x03, 0x00)
  return Uint8Array.from(out)
}

export const bluetoothAvailable = () => Boolean(globalThis.navigator?.bluetooth)

// Escolhe a impressora (o Chrome mostra a lista), envia cada etiqueta e desliga. Pedaços pequenos e, sem confirmação
// da impressora, uma pausa entre eles: mais lento, mas não se perdem bytes quando o buffer dela enche.
export async function printOverBluetooth(commands) {
  const device = await navigator.bluetooth.requestDevice({
    filters: ['M1', 'M2', 'Q'].map(namePrefix => ({ namePrefix })).concat({ services: [0xff00] }),
    optionalServices: [0xff00],
  })
  const server = await device.gatt.connect()
  try {
    const characteristic = await (await server.getPrimaryService(0xff00)).getCharacteristic(0xff02)
    const write = characteristic.properties.write
      ? chunk => characteristic.writeValueWithResponse(chunk)
      : async chunk => { await characteristic.writeValueWithoutResponse(chunk); await new Promise(done => setTimeout(done, 20)) }
    for (const bytes of commands) {
      for (let start = 0; start < bytes.length; start += 128) await write(bytes.slice(start, start + 128))
    }
  } finally { server.disconnect() }
}
