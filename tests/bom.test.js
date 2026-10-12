import { expect, it } from 'vitest'
import { parseBom } from '../frontend/src/bom.js'

it('reads semicolon BOMs with a byte order mark and quoted multiline descriptions', () => {
  expect(parseBom('\ufeffReferências;Valor;Quantidade;MPN;Descrição\r\n"R1,R2";10k;2;RC10K;"Resistor; precision\n1%"')).toEqual([{ reference: 'R1,R2', value: '10k', quantity: 2, partNumber: 'RC10K', description: 'Resistor; precision\n1%', footprint: '—' }])
})
it('counts references when quantities are absent and reads simple files without headers', () => {
  expect(parseBom('Reference,Value\n"R1 R2",10k')[0].quantity).toBe(2)
  expect(parseBom('R1,10k,1')[0]).toMatchObject({ reference: 'R1', value: '10k', quantity: 1 })
})
it('rejects malformed quoting and invalid component counts instead of guessing', () => {
  expect(() => parseBom('Reference,Value,Qty\nR1,10k,-2')).toThrow('quantidade')
  expect(() => parseBom('Reference,Value,Qty\nR1,10k,2.5')).toThrow('quantidade')
  expect(() => parseBom('Reference,Value\n"R1,10k')).toThrow('aspas')
  expect(() => parseBom('Reference,Value,Qty\nR1,,2')).toThrow('valor')
})
