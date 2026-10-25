// Prepara o CAD (GLB do SolidWorks) para o site: tira a parafusaria e troca a transmissão (vidro) por transparência,
// que obriga o three.js a desenhar a cena duas vezes por frame. Os nomes das peças ficam: as âncoras dependem deles.
// Precisa de @gltf-transform/cli@4.5.1 instalado na pasta de onde corre. Passos completos:
//   node strip-cad.mjs CAD.glb strip.glb
//   npx gltf-transform optimize strip.glb model.glb --flatten false --join false --instance false --palette false \
//     --simplify-error 0.002 --texture-compress webp --texture-size 512 --meshopt-level medium
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune } from '@gltf-transform/functions'
const [src, out] = process.argv.slice(2)
// \brivet: "DriveTrain" contém "rivet"
const FAST = /washer|\bnut\b|lock ?nut|hex nut|lugnut|screw|bolt|insert|\brivet|circlip|anel el|DIN ?9\d\d|stud|spacer|anilha|porca|parafuso/i
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(src)
let n = 0
for (const node of doc.getRoot().listNodes()) if (FAST.test(node.getName())) { node.dispose(); n++ }
for (const m of doc.getRoot().listMaterials()) {
  const t = m.getExtension('KHR_materials_transmission')
  if (!t) continue
  const [r, g, b] = m.getBaseColorFactor()
  m.setExtension('KHR_materials_transmission', null).setAlphaMode('BLEND').setBaseColorFactor([r, g, b, 1 - t.getTransmissionFactor()])
}
await doc.transform(prune())
console.log('removidos', n, 'nós; ficam', doc.getRoot().listNodes().length, 'nós,', doc.getRoot().listMeshes().length, 'malhas')
await io.write(out, doc)
