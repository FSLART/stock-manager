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
// Haste roscada comum aos parafusos vistos de lado, da base da cabeça (top) até à ponta.
const shank = top => `<path d="M10 ${top}V21h4V${top}"/><path d="M10 ${top + 4}l4 -1.2M10 ${top + 7.5}l4 -1.2M10 ${top + 11}l4 -1.2"/>`
const draw = paths => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`

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
    ['screw-socket', 'Parafuso cilíndrico (Allen)', draw(`<rect x="7" y="3" width="10" height="5" rx="1"/><path d="M10.5 3v2h3v-2"/>${shank(8)}`)],
    ['screw-countersunk', 'Parafuso de embutir', draw(`<path d="M5 4h14l-5 5h-4z"/>${shank(9)}`)],
    ['screw-oval', 'Parafuso lentilha', draw(`<path d="M5 6c2 -3.5 12 -3.5 14 0l-5 4h-4z"/>${shank(10)}`)],
    ['screw', 'Parafuso panela', draw(`<path d="M6 8v-3a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v3z"/>${shank(8)}`)],
    ['screw-button', 'Parafuso abaulado', draw(`<path d="M5 8a7 5 0 0 1 14 0z"/>${shank(8)}`)],
    ['screw-truss', 'Parafuso de cabeça larga', draw(`<path d="M2.5 8c1.5 -4.5 17.5 -4.5 19 0z"/>${shank(8)}`)],
    ['bolt', 'Parafuso sextavado', draw(`<path d="M6 3h12v5h-12z"/><path d="M10 3v5M14 3v5"/>${shank(8)}`)],
    ['screw-flange', 'Parafuso sextavado com flange', draw(`<path d="M7 3h10v3h-10z"/><path d="M10 3v3M14 3v3"/><path d="M4.5 6h15v2h-15z"/>${shank(8)}`)],
    ['screw-set', 'Parafuso sem cabeça (grub)', draw(`<path d="M10 3v18h4v-18z"/><path d="M11 3v1.5h2v-1.5"/><path d="M10 8l4 -1.2M10 11.5l4 -1.2M10 15l4 -1.2M10 18.5l4 -1.2"/>`)],
  ]],
  // Encaixes vistos de cima, na cabeça redonda.
  ['Encaixe', [
    ['drive-slot', 'Encaixe de fenda', draw('<circle cx="12" cy="12" r="9"/><path d="M6 11h12v2h-12z"/>')],
    ['drive-phillips', 'Encaixe Phillips', draw('<circle cx="12" cy="12" r="9"/><path d="M12 6.5v11M6.5 12h11"/>')],
    ['drive-pozidriv', 'Encaixe Pozidriv', draw('<circle cx="12" cy="12" r="9"/><path d="M12 6.5v11M6.5 12h11M9 9l1.2 1.2M15 9l-1.2 1.2M9 15l1.2 -1.2M15 15l-1.2 -1.2"/>')],
    ['drive-hex', 'Encaixe Allen', draw('<circle cx="12" cy="12" r="9"/><path d="M12 7.5l3.9 2.25v4.5l-3.9 2.25l-3.9 -2.25v-4.5z"/>')],
    ['drive-torx', 'Encaixe Torx', draw('<circle cx="12" cy="12" r="9"/><path d="M12 7.4L13.2 9.8L16 9.7L14.5 12L16 14.3L13.2 14.2L12 16.6L10.8 14.2L8 14.3L9.5 12L8 9.7L10.7 9.8z"/>')],
    ['drive-square', 'Encaixe quadrado', draw('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5h5v5h-5z"/>')],
    // Cabeça sextavada vista de cima (para parafusos sextavados), cheia como nas etiquetas Gridfinity.
    ['drive-hex-head', 'Cabeça sextavada (topo)', draw('<path d="M12 3l7.8 4.5v9l-7.8 4.5l-7.8 -4.5v-9z" fill="currentColor"/>')],
  ]],
  ['Porcas', [
    ['nut', 'Porca sextavada', draw('<path d="M12 3l7.8 4.5v9l-7.8 4.5l-7.8 -4.5v-9z"/><circle cx="12" cy="12" r="3.5"/>')],
    ['nut-nyloc', 'Porca autoblocante', draw('<path d="M5 11h14v8h-14z"/><path d="M9.5 11v8M14.5 11v8"/><path d="M7 11v-3a1 1 0 0 1 1 -1h8a1 1 0 0 1 1 1v3"/>')],
    ['nut-flange', 'Porca com flange', draw('<path d="M7 5h10v9h-10z"/><path d="M10.3 5v9M13.7 5v9"/><path d="M4 14h16v3h-16z"/>')],
    ['nut-cap', 'Porca cega', draw('<path d="M6 13h12v6h-12z"/><path d="M10 13v6M14 13v6"/><path d="M7 13a5 5 0 0 1 10 0"/>')],
    ['nut-wing', 'Porca borboleta', draw('<path d="M9 11h6v8h-6z"/><path d="M9 16c-3 0 -5 -4 -5 -10c3 0 5 3 5 6M15 16c3 0 5 -4 5 -10c-3 0 -5 3 -5 6"/>')],
    ['nut-square', 'Porca quadrada', draw('<path d="M5 5h14v14h-14z"/><circle cx="12" cy="12" r="3.5"/>')],
    ['insert', 'Inserto roscado', draw('<path d="M8 4h8v16h-8z"/><path d="M8 8l8 2M8 12l8 2M8 16l8 2"/>')],
  ]],
  ['Anilhas', [
    ['washer', 'Anilha lisa', draw('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/>')],
    ['washer-fender', 'Anilha larga', draw('<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="2"/>')],
    ['washer-split', 'Anilha de pressão', draw('<path d="M19.9 10.6A8 8 0 1 0 19.9 13.4L15.9 12.7A4 4 0 1 1 15.9 11.3z"/>')],
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

// Parafuso deitado e cheio, como nas etiquetas de caixas Gridfinity: a cabeça ocupa a altura toda e a haste cresce com o
// comprimento do título ("M3x10"). Medidas em diâmetros da haste (1 = grossura); 0,6 por mm de comprimento.
// Acima de 24 mm a haste aparece partida, para um M5x40 não ocupar a etiqueta inteira.
const mm = value => +value.toFixed(2)
export function screwDrawing(head, title) {
  const length = Math.min(Math.max(Number(String(title).match(/M\d+(?:[.,]\d+)?\s*[x×]\s*(\d+(?:[.,]\d+)?)/i)?.[1]?.replace(',', '.')) || 10, 2), 200)
  // Cabeça: [comprimento ao longo do parafuso, meia altura, forma com o eixo em y = 0].
  const box = (w, r) => `<rect y="${mm(-r)}" width="${mm(w)}" height="${mm(2 * r)}"/>`
  const half = (w, r) => [w, r, `<path d="M${mm(w)} ${mm(-r)}A${mm(w)} ${mm(r)} 0 0 0 ${mm(w)} ${mm(r)}z"/>`]
  const sunk = (x, r) => `<path d="M${mm(x)} ${mm(-r)}L${mm(x + r - 0.5)} -0.5V0.5L${mm(x)} ${mm(r)}z"/>`
  const heads = {
    'screw-socket': [1, 0.8, box(1, 0.8)],
    'screw-countersunk': [0.5, 1, sunk(0, 1)],
    'screw-oval': [0.75, 1, `<path d="M0.25 -1A0.25 1 0 0 0 0.25 1z"/>${sunk(0.25, 1)}`],
    screw: [0.6, 0.9, `<rect y="-0.9" width="0.6" height="1.8" rx="0.2"/>`],
    'screw-button': half(0.55, 0.9),
    'screw-truss': half(0.45, 1.15),
    bolt: [0.65, 0.85, box(0.65, 0.85)],
    'screw-flange': [0.65, 1.05, `${box(0.5, 0.75)}<rect x="0.5" y="-1.05" width="0.15" height="2.1"/>`],
    'screw-set': [0, 0.5, ''],
  }
  if (!heads[head]) return ''
  const [start, r, shape] = heads[head]
  // As de embutir contam para o comprimento do parafuso.
  const sunken = head === 'screw-countersunk' || head === 'screw-oval'
  const shank = Math.max(0.6 * Math.min(length, 24) - (sunken ? start : 0), 1), gap = length > 24 ? 0.6 : 0
  const split = start + shank * 0.55
  const rod = gap ? `<rect x="${mm(start)}" y="-0.5" width="${mm(split - start)}" height="1"/><rect x="${mm(split + gap)}" y="-0.5" width="${mm(start + shank - split)}" height="1"/>`
    : `<rect x="${mm(start)}" y="-0.5" width="${mm(shank)}" height="1"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${mm(-r)} ${mm(start + shank + gap)} ${mm(2 * r)}" fill="currentColor">${shape}${rod}</svg>`
}
