// Apps Script só aceita um HTML: as imagens (já em WebP) vão embebidas.
import circuito from '../../backend/static/home/lart-circuito.webp?inline'
import garagem from '../../backend/static/home/lart-garagem.webp?inline'
import testes from '../../backend/static/home/lart-testes.webp?inline'
import soldadura from '../../backend/static/home/lart-soldadura.webp?inline'
export default [circuito, garagem, testes, soldadura]
export { default as scanPhoto } from '../../backend/static/tutorial/mouser-label.webp?inline'
