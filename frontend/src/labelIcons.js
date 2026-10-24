import resistor from './assets/component-icons/circuit-resistor.svg?raw'
import connector from './assets/component-icons/plug.svg?raw'
import capacitor from './assets/component-icons/circuit-capacitor.svg?raw'
import led from './assets/component-icons/bulb.svg?raw'
import diode from './assets/component-icons/circuit-diode.svg?raw'
import transistor from './assets/component-icons/transistor.svg?raw'
import potentiometer from './assets/component-icons/adjustments-horizontal.svg?raw'
import inductor from './assets/component-icons/circuit-inductor.svg?raw'
import crystal from './assets/component-icons/wave-sine.svg?raw'
import chip from './assets/component-icons/cpu.svg?raw'
import { componentKind } from './defaultImages.js'

// Ícones para as etiquetas. Os de eletrónica são os Tabler do inventário (licença embutida por defaultImages.js);
// os restantes estão desenhados aqui no mesmo estilo: 24 x 24, traço 2, cor do texto.
const tabler = svg => svg.replace(/<!--[\s\S]*?-->/, '').trim()
const draw = paths => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`

// Peças cheias, como nos desenhos técnicos de ferragens: os furos e os encaixes são buracos (evenodd), não tinta branca,
// para ficarem certos tanto no papel branco como no editor escuro.
const solid = d => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="${d}"/></svg>`
const circle = r => `M${12 - r} 12a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`

// Parafuso deitado, cheio e roscado. Medidas em grossuras da haste (1 = grossura), eixo em y = 0; 0,6 por mm de comprimento.
// Acima de 24 mm a haste cresce a um terço e para nos 72 mm, para um M10x100 caber inteiro na etiqueta.
const mm = value => +value.toFixed(2)
function screwShape(head, length) {
  // Cabeça: [comprimento ao longo do parafuso, meia altura, forma].
  const box = (w, r) => `M0 ${mm(-r)}h${mm(w)}v${mm(2 * r)}h${mm(-w)}z`
  const half = (w, r) => [w, r, `M${mm(w)} ${mm(-r)}A${mm(w)} ${mm(r)} 0 0 0 ${mm(w)} ${mm(r)}z`]
  const sunk = (x, r) => `M${mm(x)} ${mm(-r)}L${mm(x + r - 0.5)} -0.5V0.5L${mm(x)} ${mm(r)}z`
  const heads = {
    'screw-socket': [1.1, 0.9, box(1.1, 0.9)],
    'screw-countersunk': [0.65, 1.15, sunk(0, 1.15)],
    'screw-oval': [0.95, 1.15, `M0.3 -1.15A0.3 1.15 0 0 0 0.3 1.15z${sunk(0.3, 1.15)}`],
    screw: [0.7, 1.05, `M0.25 -1.05h0.45v2.1h-0.45a0.25 0.25 0 0 1 -0.25 -0.25v-1.6a0.25 0.25 0 0 1 0.25 -0.25z`],
    'screw-button': half(0.6, 1.05),
    'screw-truss': half(0.5, 1.3),
    bolt: [0.75, 1, box(0.75, 1)],
    'screw-flange': [0.78, 1.2, `${box(0.6, 0.85)}M0.6 -1.2h0.18v2.4h-0.18z`],
    'screw-set': [0, 0.5, ''],
  }
  if (!heads[head]) return null
  const [start, r, shape] = heads[head]
  // As de embutir contam para o comprimento do parafuso.
  const sunken = head === 'screw-countersunk' || head === 'screw-oval'
  const drawn = length <= 24 ? length : Math.min(24 + (length - 24) / 3, 40)
  const shank = Math.max(0.6 * drawn - (sunken ? start : 0), 1), end = start + shank
  // Rosca fina, como nas etiquetas de caixas de parafusos: a haste é cheia e só as arestas têm dentes miúdos
  // (passo ~0,3, fundo 0,12), a de baixo desfasada meio passo. Acaba antes da ponta, que fica lisa e chanfrada.
  const last = end - 0.2
  const teeth = Math.max(3, Math.round((last - start) / 0.3)), step = (last - start) / teeth
  const xs = Array.from({ length: teeth + 1 }, (_, index) => start + index * step)
  const top = xs.slice(1).map(x => `L${mm(x - step / 2)} -0.38L${mm(x)} -0.5`).join('')
  const tip = `L${mm(end - 0.1)} -0.5L${mm(end)} -0.4V0.4L${mm(end - 0.1)} 0.5`
  const bottom = xs.slice(1).reverse().map(x => `L${mm(x - step / 2)} 0.5L${mm(x - step)} 0.38`).join('')
  return { width: end, r, body: `<path d="${shape}M${mm(start)} -0.5${top}${tip}${bottom}L${mm(start)} 0.5z"/>` }
}
// O desenho da etiqueta: a rosca e o comprimento vêm do título ("M3x10").
export function screwDrawing(head, title) {
  const length = Math.min(Math.max(Number(String(title).match(/M\d+(?:[.,]\d+)?\s*[x×]\s*(\d+(?:[.,]\d+)?)/i)?.[1]?.replace(',', '.')) || 10, 2), 200)
  const screw = screwShape(head, length)
  return screw ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${mm(-screw.r)} ${mm(screw.width)} ${mm(2 * screw.r)}" fill="currentColor">${screw.body}</svg>` : ''
}
// O mesmo parafuso, curto e de pé, para o seletor: o que se escolhe é o que sai na etiqueta.
function screwIcon(head) {
  const { width, r, body } = screwShape(head, 5)
  const scale = Math.min(21 / width, 20 / (2 * r))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><g transform="translate(12 ${mm((24 - width * scale) / 2)}) rotate(90) scale(${mm(scale)})">${body}</g></svg>`
}

export const ICON_GROUPS = [
  ['Eletrónica', [
    ['resistor', 'Resistência', tabler(resistor)],
    ['capacitor', 'Condensador', tabler(capacitor)],
    ['inductor', 'Indutor', tabler(inductor)],
    ['diode', 'Díodo', tabler(diode)],
    ['led', 'LED', tabler(led)],
    ['transistor', 'Transístor', tabler(transistor)],
    ['chip', 'Circuito integrado', tabler(chip)],
    ['crystal', 'Cristal', tabler(crystal)],
    ['potentiometer', 'Potenciómetro', tabler(potentiometer)],
    ['connector', 'Conector', tabler(connector)],
    ['fuse', 'Fusível', draw('<path d="M2 12h3M19 12h3"/><rect x="5" y="9" width="14" height="6" rx="1"/><path d="M5 12h14"/>')],
    ['battery', 'Bateria', draw('<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 11v2M8 12h4M10 10v4"/>')],
    ['switch', 'Interruptor', draw('<circle cx="6" cy="15" r="1.5"/><circle cx="18" cy="15" r="1.5"/><path d="M2 15h2.5M19.5 15h2.5M7.3 14.2l9 -5.2"/>')],
    ['cable', 'Cabo', draw('<path d="M3 17c4 0 4 -10 9 -10s5 10 9 10"/>')],
  ]],
  // Parafusos vistos de lado: a cabeça muda, a haste roscada é sempre a mesma.
  ['Parafusos (cabeça)', [
    ['screw-socket', 'Parafuso cilíndrico (Allen)'], ['screw-countersunk', 'Parafuso de embutir'], ['screw-oval', 'Parafuso lentilha'],
    ['screw', 'Parafuso panela'], ['screw-button', 'Parafuso abaulado'], ['screw-truss', 'Parafuso de cabeça larga'], ['bolt', 'Parafuso sextavado'],
    ['screw-flange', 'Parafuso sextavado com flange'], ['screw-set', 'Parafuso sem cabeça (grub)'],
  ].map(([key, name]) => [key, name, screwIcon(key)])],
  // Encaixes vistos de cima: cabeça redonda cheia com o encaixe recortado.
  ['Encaixe', [
    ['drive-slot', 'Encaixe de fenda', solid(`${circle(9.5)}M5.5 10.6h13v2.8h-13z`)],
    ['drive-phillips', 'Encaixe Phillips', solid(`${circle(9.5)}M10.6 5.8h2.8v4.8h4.8v2.8h-4.8v4.8h-2.8v-4.8h-4.8v-2.8h4.8z`)],
    ['drive-pozidriv', 'Encaixe Pozidriv', solid(`${circle(9.5)}M11 5.8h2v5.2h5.2v2h-5.2v5.2h-2v-5.2h-5.2v-2h5.2zM8.2 8.2h1.7v1.7h-1.7zM14.1 8.2h1.7v1.7h-1.7zM8.2 14.1h1.7v1.7h-1.7zM14.1 14.1h1.7v1.7h-1.7z`)],
    ['drive-hex', 'Encaixe Allen', solid(`${circle(9.5)}M12 7.2l4.2 2.4v4.8l-4.2 2.4l-4.2 -2.4v-4.8z`)],
    ['drive-torx', 'Encaixe Torx', solid(`${circle(9.5)}M12 6.6L13.4 9.4L16.6 9.3L14.9 12L16.6 14.7L13.4 14.6L12 17.4L10.6 14.6L7.4 14.7L9.1 12L7.4 9.3L10.6 9.4z`)],
    ['drive-square', 'Encaixe quadrado', solid(`${circle(9.5)}M9.2 9.2h5.6v5.6h-5.6z`)],
    // Cabeça sextavada vista de cima (para parafusos sextavados).
    ['drive-hex-head', 'Cabeça sextavada (topo)', solid('M12 2.5l8.2 4.75v9.5l-8.2 4.75l-8.2 -4.75v-9.5z')],
  ]],
  ['Porcas', [
    ['nut', 'Porca sextavada', solid(`M12 2.5l8.2 4.75v9.5l-8.2 4.75l-8.2 -4.75v-9.5z${circle(4.2)}`)],
    ['nut-nyloc', 'Porca autoblocante', draw('<path d="M5 11h14v8h-14z"/><path d="M9.5 11v8M14.5 11v8"/><path d="M7 11v-3a1 1 0 0 1 1 -1h8a1 1 0 0 1 1 1v3"/>')],
    ['nut-flange', 'Porca com flange', draw('<path d="M7 5h10v9h-10z"/><path d="M10.3 5v9M13.7 5v9"/><path d="M4 14h16v3h-16z"/>')],
    ['nut-cap', 'Porca cega', draw('<path d="M6 13h12v6h-12z"/><path d="M10 13v6M14 13v6"/><path d="M7 13a5 5 0 0 1 10 0"/>')],
    ['nut-wing', 'Porca borboleta', draw('<path d="M9 11h6v8h-6z"/><path d="M9 16c-3 0 -5 -4 -5 -10c3 0 5 3 5 6M15 16c3 0 5 -4 5 -10c-3 0 -5 3 -5 6"/>')],
    ['nut-square', 'Porca quadrada', solid(`M4 4h16v16h-16z${circle(4.2)}`)],
    ['insert', 'Inserto roscado', draw('<path d="M8 4h8v16h-8z"/><path d="M8 8l8 2M8 12l8 2M8 16l8 2"/>')],
  ]],
  ['Anilhas', [
    ['washer', 'Anilha lisa', solid(`${circle(9.5)}${circle(4.5)}`)],
    ['washer-fender', 'Anilha larga', solid(`${circle(9.5)}${circle(2.3)}`)],
    ['washer-split', 'Anilha de pressão', solid('M21.4 10.3A9.5 9.5 0 1 0 21.4 13.7L16.4 12.8A4.5 4.5 0 1 1 16.4 11.2z')],
    ['washer-external', 'Anilha dentada exterior', draw('<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="3"/><path d="M17.5 14.3L20.3 15.4M14.3 17.5L15.4 20.3M9.7 17.5L8.6 20.3M6.5 14.3L3.7 15.4M6.5 9.7L3.7 8.6M9.7 6.5L8.6 3.7M14.3 6.5L15.4 3.7M17.5 9.7L20.3 8.6"/>')],
    ['washer-internal', 'Anilha dentada interior', draw('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M16.6 13.9L14.8 13.1M13.9 16.6L13.1 14.8M10.1 16.6L10.9 14.8M7.4 13.9L9.2 13.1M7.4 10.1L9.2 10.9M10.1 7.4L10.9 9.2M13.9 7.4L13.1 9.2M16.6 10.1L14.8 10.9"/>')],
  ]],
  ['Outras ferragens', [
    ['standoff', 'Espaçador', draw('<path d="M7 7h10v10h-10z"/><path d="M10 7v10M14 7v10M12 3v4M12 17v4"/>')],
    ['spring', 'Mola', draw('<path d="M8 3h8M8 21h8"/><path d="M16 3l-8 3l8 3l-8 3l8 3l-8 3l8 3"/>')],
  ]],
]
export const ICONS = Object.fromEntries(ICON_GROUPS.flatMap(([, icons]) => icons.map(([key, name, svg]) => [key, { name, svg }])))

// Do mais específico para o mais geral: "Parafusos sextavados" fica sextavado, "Parafusos" fica panela.
const hardware = [[/embutir|escarea|countersunk|flat head/, 'screw-countersunk'], [/allen|cilindric|socket/, 'screw-socket'], [/sextavad|hex/, 'bolt'],
  [/autoblocante|nyloc/, 'nut-nyloc'], [/borboleta|wing/, 'nut-wing'], [/inserto|insert/, 'insert'], [/pressao|grower|split|lock washer/, 'washer-split'],
  [/parafuso|screw/, 'screw'], [/perno|bolt/, 'bolt'], [/porca|nut/, 'nut'], [/anilha|washer/, 'washer'], [/espacador|standoff|spacer/, 'standoff'], [/mola|spring/, 'spring'],
  [/fusive|fuse/, 'fuse'], [/bateria|pilha|battery/, 'battery'], [/interruptor|switch|botao|button/, 'switch'], [/cabo|fio|cable|wire/, 'cable']]
// Ícone sugerido para a categoria de um componente; o que não se reconhece fica como circuito integrado.
export function iconFor(category) {
  const name = String(category || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return hardware.find(([pattern]) => pattern.test(name))?.[1] || componentKind(category) || 'chip'
}
