import { engine } from './engine/engine'
import { loadWorld, startAutosave } from './engine/persist'
import { getWorld, mutate, useWorld } from './state/store'

/** Restore the saved world, start the engine loop, and probe the local API proxy. */
export async function boot() {
  await loadWorld()
  const params = new URLSearchParams(window.location.search)
  if (params.has('lowq')) mutate((s) => void (s.settings.quality = 'low'))
  startAutosave()
  engine.start()
  await probeProxy()
  ;(window as unknown as { __cw: unknown }).__cw = { engine, mutate, world: getWorld, store: useWorld }
}

/** Detect the local API proxy. Retries through slow dev-server startups; only a definite "no API here" disables it. */
async function probeProxy() {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch('/api/health', { signal: AbortSignal.timeout(5000) })
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) break
      const j = (await r.json()) as { ok: boolean; serverKeys: Record<string, boolean> }
      mutate((s) => {
        s.ui.proxyAvailable = Boolean(j.ok)
        for (const p of s.settings.providers) {
          p.serverKey = Boolean(j.serverKeys?.[p.id])
          if (p.proxyAutoOff) {
            p.useProxy = true
            p.proxyAutoOff = false
          }
        }
      })
      return
    } catch {
      await new Promise((res) => setTimeout(res, 1500))
    }
  }
  mutate((s) => {
    s.ui.proxyAvailable = false
    // Static hosting: providers must be called directly from the browser (some block CORS).
    for (const p of s.settings.providers) {
      if (p.useProxy) p.proxyAutoOff = true
      p.useProxy = false
      p.serverKey = false
    }
  })
}
