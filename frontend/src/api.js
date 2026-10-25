const PENDING_KEY = 'stock.pending.v1'
const DATA_KEY = 'stock.data.v1'

export function readStored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback }
  catch { return fallback }
}

export function writeStored(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true }
  catch { return false }
}

const routes = {
  data: () => ['/api/data', 'GET'],
  move: () => ['/api/move', 'POST'],
  importItems: () => ['/api/items/import', 'POST'],
  newCategory: () => ['/api/categories', 'POST'],
  deleteCategory: p => [`/api/categories/${encodeURIComponent(p.name)}`, 'DELETE'],
  deleteItem: p => [`/api/items/${p.id}`, 'DELETE'],
  step: p => [`/api/items/${p.id}/step`, 'POST'],
  editItem: p => [`/api/items/${p.id}`, 'PATCH'],
  setLocation: () => ['/api/items/location', 'POST'],
  editLocation: () => ['/api/locations', 'PATCH'],
  deleteLocation: () => ['/api/locations', 'DELETE'],
  saveLabel: () => ['/api/labels', 'POST'],
  pcbProjects: () => ['/api/pcb-projects', 'GET'],
  savePcbProjects: () => ['/api/pcb-projects', 'POST'],
  deletePcbProject: p => [`/api/pcb-projects/${encodeURIComponent(p.id)}`, 'DELETE'],
  deleteLabels: () => ['/api/labels', 'DELETE'],
  editCategory: p => [`/api/categories/${encodeURIComponent(p.originalName)}`, 'PATCH'],
  savePart: () => ['/api/parts', 'POST'],
  lookupPart: p => [`/api/parts/lookup?mpn=${encodeURIComponent(p.mpn)}`, 'GET'],
  movements: () => ['/api/movements', 'GET'],
  consumeItems: () => ['/api/items/consume', 'POST'],
  revertMovements: () => ['/api/movements/revert', 'POST'],
  // PIN (desativado): authPeople: () => ['/api/auth/people', 'GET'],
  // PIN (desativado): login: () => ['/api/auth/login', 'POST'],
  logout: () => ['/api/auth/logout', 'POST'],
  people: () => ['/api/people', 'GET'],
  // PIN (desativado): newPerson: () => ['/api/people', 'POST'],
  editPerson: p => [`/api/people/${p.id}`, 'PATCH'],
  deletePerson: p => [`/api/people/${p.id}`, 'DELETE'],
}

export function createApi({ onUnauthorized } = {}) {
  const appsScript = Boolean(globalThis.google?.script?.run)
  let syncing = false

  function callGoogle(action, payload) {
    return new Promise((resolve, reject) => {
      google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).api(action, payload)
    })
  }

  function requestFor(action, payload = {}) {
    const [url, method] = routes[action](payload)
    return { url, method, body: method === 'GET' ? null : payload }
  }

  async function http({ url, method, body }) {
    let response
    try {
      response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch (cause) {
      const error = new Error('Sem ligação ao servidor', { cause })
      error.offline = true
      throw error
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(data.error || 'Erro no servidor')
      // O servidor pede login para alterar o stock; a App mostra o popup.
      error.login = Boolean(data.login)
      if (error.login) onUnauthorized?.()
      throw error
    }
    return data
  }

  async function direct(action, payload = {}) {
    if (appsScript) {
      if (!navigator.onLine) {
        const error = new Error('Sem ligação ao servidor')
        error.offline = true
        throw error
      }
      return callGoogle(action, payload)
    }
    return http(requestFor(action, payload))
  }

  async function request(action, payload = {}) {
    try { return await direct(action, payload) }
    catch (error) {
      if (action === 'data' || !(error.offline || !navigator.onLine)) throw error
      const requests = readStored(PENDING_KEY, [])
      // Preserve each deployment's existing queue format during migration.
      requests.push(appsScript ? { action, payload } : requestFor(action, payload))
      if (!writeStored(PENDING_KEY, requests)) {
        throw new Error('Sem ligação. Este browser não permite guardar a operação offline.')
      }
      return { queued: true, msg: 'Sem ligação. Operação guardada e será sincronizada quando o servidor voltar.' }
    }
  }

  async function load() {
    try {
      const data = await request('data')
      writeStored(DATA_KEY, data)
      return data
    } catch (error) {
      const cached = readStored(DATA_KEY, null)
      if (!cached) throw error
      return cached
    }
  }

  async function syncPending(notify = () => {}) {
    if (syncing || !navigator.onLine) return 0
    syncing = true
    let count = 0
    try {
      // Re-read after each await so writes queued meanwhile are never lost.
      while (true) {
        const pending = readStored(PENDING_KEY, [])[0]
        if (!pending) break
        try {
          if (pending.action) await direct(pending.action, pending.payload || {})
          else await http(pending)
          count++
        } catch (error) {
          // Sem ligação ou sem sessão: a operação fica na fila para depois do login.
          if (error.offline || error.login || !navigator.onLine) break
          notify(error.message || 'Uma operação offline não foi aceite pelo servidor')
        }
        const requests = readStored(PENDING_KEY, [])
        requests.shift()
        if (!writeStored(PENDING_KEY, requests)) break
      }
    } finally { syncing = false }
    return count
  }

  // Recebe um ficheiro ou um link; o link é descarregado pelo servidor.
  async function uploadImage(file) {
    if (appsScript && typeof file === 'string') throw new Error('Links de imagem só funcionam no servidor local; descarrega a imagem e carrega o ficheiro')
    if (appsScript) return (await callGoogle('uploadImage', { data: await jpegBase64(file) })).url
    const body = new FormData()
    if (typeof file === 'string') body.append('url', file)
    else {
      // Sem descodificador no browser (HEIC em alguns), vai o original e o servidor reduz ou recusa.
      const small = await shrink(file).then(canvas => new Promise(done => canvas.toBlob(done, 'image/jpeg', 0.82))).catch(() => null)
      body.append('image', small || file, small ? 'foto.jpg' : file.name)
    }
    const response = await fetch('/api/images', { method: 'POST', body })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a imagem')
    return data.url
  }

  // Modelos STEP de PCB ficam em backend/uploads; o projeto guarda só o link.
  async function uploadStep(file) {
    if (appsScript) throw new Error('Os ficheiros STEP só podem ser guardados no servidor stocklart.pt')
    const body = new FormData()
    body.append('step', file)
    const response = await fetch('/api/pcb-step', { method: 'POST', body })
    const data = await response.json().catch(() => ({}))
    if (data.login) onUnauthorized?.()
    if (response.status === 413) throw new Error('O ficheiro STEP passa do limite de 40 MB')
    if (!response.ok) throw new Error(data.error || 'Não foi possível enviar o ficheiro STEP')
    return data.url
  }

  // direct não usa a fila offline: login, histórico e pessoas precisam do servidor.
  return { request, direct, load, syncPending, uploadImage, uploadStep, importInventory: items => direct('importItems', { items }) }
}

// Uma foto de telemóvel (3–12 MB) fica com 800 px no lado maior, sem margens: ~100 KB e cabe no limite de 5 MB.
async function shrink(file, size = 800) {
  let bitmap
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }) }
  catch { throw new Error('O ficheiro enviado não é uma imagem válida') }
  try {
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    // Um PNG transparente ficaria preto em JPEG.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally { bitmap.close() }
}
const jpegBase64 = async file => (await shrink(file)).toDataURL('image/jpeg', 0.82).split(',')[1]
