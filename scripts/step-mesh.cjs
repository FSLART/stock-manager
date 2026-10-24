// Converte um STEP numa malha leve para o visualizador 3D da página PCB. Ler um STEP de placa (~40 MB) demora
// ~1,5 min e ~600 MB de memória: corre uma vez no servidor, depois do envio, e o browser só descarrega a malha.
// Uso: node scripts/step-mesh.cjs placa.step placa.mesh  (escreve placa.mesh, ou placa.mesh.error se falhar)
// Formato: uint32 com o tamanho do cabeçalho JSON (múltiplo de 4), o cabeçalho [{ color: [r, g, b], positions, indices }]
// e, por cada cor, as posições (Float32, mm) e os índices dos triângulos (Uint32).
const fs = require('fs')
const [input, output] = process.argv.slice(2)

function toMesh(result) {
  const groups = new Map()
  for (const mesh of result.meshes) {
    const positions = mesh.attributes.position.array, indices = mesh.index.array
    // Cada face do STEP pode ter a sua cor (placa verde, pads dourados, serigrafia branca): agrupa os triângulos por cor.
    const faces = mesh.brep_faces?.length ? mesh.brep_faces : [{ first: 0, last: indices.length / 3 - 1, color: null }]
    for (const face of faces) {
      const color = (face.color ?? mesh.color ?? [0.6, 0.6, 0.6]).map(value => Math.round(value * 255))
      const key = color.join(',')
      const group = groups.get(key) ?? groups.set(key, { color, positions: [], indices: [], remap: new Map() }).get(key)
      const remap = group.remap.get(mesh) ?? group.remap.set(mesh, new Map()).get(mesh)
      for (let index = face.first * 3; index <= face.last * 3 + 2; index++) {
        const vertex = indices[index]
        if (!remap.has(vertex)) {
          remap.set(vertex, group.positions.length / 3)
          group.positions.push(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2])
        }
        group.indices.push(remap.get(vertex))
      }
    }
  }
  const list = [...groups.values()]
  let header = JSON.stringify(list.map(group => ({ color: group.color, positions: group.positions.length, indices: group.indices.length })))
  header = Buffer.from(header.padEnd(Math.ceil(header.length / 4) * 4))
  const length = Buffer.alloc(4)
  length.writeUInt32LE(header.length)
  return Buffer.concat([length, header, ...list.flatMap(group => [
    Buffer.from(new Float32Array(group.positions).buffer), Buffer.from(new Uint32Array(group.indices).buffer)])])
}

require('occt-import-js')().then(occt => {
  const result = occt.ReadStepFile(fs.readFileSync(input), { linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.005, angularDeflection: 0.5 })
  if (!result.success || !result.meshes.length) throw new Error('O STEP não tem geometria que se consiga ler')
  // Escreve ao lado e renomeia, para o servidor nunca enviar uma malha a meio.
  fs.writeFileSync(`${output}.tmp`, toMesh(result))
  fs.renameSync(`${output}.tmp`, output)
}).catch(error => {
  fs.writeFileSync(`${output}.error`, String(error?.message || error))
  process.exitCode = 1
}).finally(() => fs.rmSync(`${output}.part`, { force: true }))
