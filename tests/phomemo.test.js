import { expect, it } from 'vitest'
import { HEAD_DOTS, dots, labelCommands, shouldRotate } from '../frontend/src/phomemo.js'

// ImageData a branco com os pontos pretos indicados ([x, y]).
function image(width, height, black = []) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (const [x, y] of black) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3)
  return { width, height, data }
}

it('rotates a label only when it is wider than 55 mm and fits lying down', () => {
  expect([dots(55), HEAD_DOTS]).toEqual([440, 440])
  expect(shouldRotate({ width: 55, height: 25 }, 'auto')).toBe(false)
  expect(shouldRotate({ width: 40, height: 30 }, 'auto')).toBe(false)
  expect(shouldRotate({ width: 70, height: 25 }, 'auto')).toBe(true)
  expect(shouldRotate({ width: 70, height: 60 }, 'auto')).toBe(false)
  expect(shouldRotate({ width: 40, height: 30 }, 'rotated')).toBe(true)
  expect(shouldRotate({ width: 55, height: 25 }, 'normal')).toBe(false)
})

it('builds M110 commands with the image centred on the 55 mm width, one bit per dot', () => {
  const bytes = [...labelCommands(image(8, 2, [[0, 0], [7, 1]]))]
  // velocidade, densidade e papel com espaço entre etiquetas
  expect(bytes.slice(0, 11)).toEqual([0x1b, 0x4e, 0x0d, 5, 0x1b, 0x4e, 0x04, 10, 0x1f, 0x11, 0x0a])
  // GS v 0: 55 bytes por linha, 2 linhas
  expect(bytes.slice(11, 19)).toEqual([0x1d, 0x76, 0x30, 0, 55, 0, 2, 0])
  const rows = bytes.slice(19, 19 + 110)
  // (440 - 8) / 2 = 216: o primeiro ponto cai no byte 27, bit 0; o último (223) no fim do mesmo byte, na linha 2
  expect(rows.map((value, index) => value && [index, value]).filter(Boolean)).toEqual([[27, 0x80], [55 + 27, 0x01]])
  expect(bytes.slice(19 + 110)).toEqual([0x1f, 0xf0, 0x05, 0x00, 0x1f, 0xf0, 0x03, 0x00])
})

it('splits tall images into blocks of 255 lines and marks continuous paper', () => {
  const bytes = labelCommands(image(440, 300), { media: 'continuous' })
  expect(bytes[10]).toBe(0x0b)
  expect([...bytes.slice(11, 19)]).toEqual([0x1d, 0x76, 0x30, 0, 55, 0, 255, 0])
  const second = 19 + 255 * 55
  expect([...bytes.slice(second, second + 8)]).toEqual([0x1d, 0x76, 0x30, 0, 55, 0, 45, 0])
  expect(bytes.length).toBe(11 + 2 * 8 + 300 * 55 + 8)
})
