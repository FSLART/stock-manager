import { vi } from 'vitest'

// Servidor falso dos projetos PCB: guarda o que o POST manda e devolve-o no GET; o resto vai ao fetch que já estava.
export function pcbServer(projects = []) {
  const fallback = fetch.getMockImplementation()
  const reply = body => ({ ok: true, json: async () => structuredClone(body) })
  fetch.mockImplementation(vi.fn(async (url, options = {}) => {
    if (url === '/api/pcb-projects' && options.method === 'POST') {
      for (const project of JSON.parse(options.body).projects) {
        const index = projects.findIndex(entry => entry.id === project.id)
        if (index < 0) projects.unshift(project); else projects[index] = project
      }
      return reply({ msg: 'ok' })
    }
    if (url === '/api/pcb-projects') return reply({ projects })
    if (url.startsWith('/api/pcb-projects/')) {
      projects.splice(projects.findIndex(entry => entry.id === decodeURIComponent(url.split('/').pop())), 1)
      return reply({ msg: 'ok' })
    }
    return fallback(url, options)
  }))
  return projects
}
