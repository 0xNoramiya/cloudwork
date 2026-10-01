import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import type { Connect, Plugin } from 'vite'

// Local API used by the Cloudworks UI during `vite dev` and `vite preview`:
//   /api/health             → which provider keys exist in the server environment (never the keys)
//   /api/proxy/<provider>/… → streaming pass-through to model providers (avoids browser CORS)
//   /api/fetch?url=…        → fetch a web page and return readable text (researcher tool)
//   /api/search?q=…         → DuckDuckGo HTML search results (researcher tool)
//   /api/webhook            → POST the deliverable to a user-configured webhook (approval-gated in the UI)

const SENTINEL = 'use-server-key'

// *_UPSTREAM env vars let you point a provider at a gateway or a local mock (see dev/mock-llm.mjs).
const TARGETS: Record<string, { base: string; env: string; header: 'x-api-key' | 'authorization' }> = {
  anthropic: { base: process.env.ANTHROPIC_UPSTREAM || 'https://api.anthropic.com', env: 'ANTHROPIC_API_KEY', header: 'x-api-key' },
  openai: { base: process.env.OPENAI_UPSTREAM || 'https://api.openai.com', env: 'OPENAI_API_KEY', header: 'authorization' },
  openrouter: { base: process.env.OPENROUTER_UPSTREAM || 'https://openrouter.ai/api', env: 'OPENROUTER_API_KEY', header: 'authorization' },
}

const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'origin', 'referer', 'cookie', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest'])

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

function decodeB64url(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

async function proxy(req: IncomingMessage, res: ServerResponse, rest: string) {
  const [provider, ...parts] = rest.split('/')
  let targetBase: string
  let spec = TARGETS[provider]
  let path = parts.join('/')
  if (provider === 'custom') {
    targetBase = decodeB64url(parts[0] ?? '')
    path = parts.slice(1).join('/')
    if (!/^https?:\/\//.test(targetBase)) return json(res, 400, { error: 'Bad custom target' })
    spec = { base: targetBase, env: 'CUSTOM_LLM_API_KEY', header: 'authorization' }
  } else if (!spec) {
    return json(res, 404, { error: `Unknown provider ${provider}` })
  } else {
    targetBase = spec.base
  }
  const url = `${targetBase.replace(/\/+$/, '')}/${path}`
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k) && typeof v === 'string') headers[k] = v
  }
  // Swap the placeholder for a key from the server environment when the browser has none.
  const envKey = process.env[spec.env]
  if (spec.header === 'x-api-key' && headers['x-api-key'] === SENTINEL) {
    if (!envKey) return json(res, 401, { error: { type: 'authentication_error', message: `No key in browser and ${spec.env} is not set on the server.` } })
    headers['x-api-key'] = envKey
  }
  if (spec.header === 'authorization' && headers.authorization === `Bearer ${SENTINEL}`) {
    if (envKey) headers.authorization = `Bearer ${envKey}`
    else delete headers.authorization
  }
  delete headers['anthropic-dangerous-direct-browser-access']
  if (provider === 'openrouter') {
    headers['http-referer'] = 'http://localhost/cloudworks'
    headers['x-title'] = 'Cloudworks'
  }
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
  const ac = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) ac.abort()
  })
  let upstream: Response
  try {
    upstream = await fetch(url, { method: req.method, headers, body, signal: ac.signal })
  } catch (e) {
    return json(res, 502, { error: { type: 'proxy_error', message: `Upstream unreachable: ${(e as Error).message}` } })
  }
  res.statusCode = upstream.status
  upstream.headers.forEach((v, k) => {
    // Upstream CORS headers are dropped: Vite's own CORS policy decides which pages may read /api responses.
    if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k) && !k.startsWith('access-control-')) res.setHeader(k, v)
  })
  if (!upstream.body) return res.end()
  try {
    for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk)
  } catch {
    /* client went away */
  }
  res.end()
}

function htmlToText(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim()
  const main = html.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? html
  const text = main
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
  return { title, text }
}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 || // this-network, private, loopback, multicast/reserved
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local (cloud metadata)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  )
}

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIPv4(ip)
  const v6 = ip.toLowerCase()
  const mapped = v6.match(/^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/)
  if (mapped) {
    if (mapped[1]) return isPrivateIPv4(mapped[1])
    const hi = parseInt(mapped[2], 16)
    const lo = parseInt(mapped[3], 16)
    return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
  }
  return v6 === '::' || v6 === '::1' || /^(?:f[cd]|fe[89ab]|ff)/.test(v6) || v6.startsWith('64:ff9b:') || v6.startsWith('2001:db8:')
}

/** Throws unless the URL is http(s) and every address its host resolves to is public (checked per redirect hop). */
async function assertPublicUrl(u: URL): Promise<void> {
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs are allowed')
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Only public hosts are allowed')
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true })).map((a) => a.address)
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new Error('Only public hosts are allowed')
}

/** DNS lookup that refuses private addresses at connect time, so a host can't pass the check and then rebind. */
const publicLookup = ((hostname: string, options: { all?: boolean }, cb: (err: Error | null, address?: string | LookupAddress[], family?: number) => void) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err)
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) return cb(new Error('Only public hosts are allowed'))
    if (options.all) cb(null, addrs)
    else cb(null, addrs[0].address, addrs[0].family)
  })
}) as unknown as LookupFunction

type Page = { status: number; type: string; location?: string; body: string }

function getOnce(u: URL, headers: Record<string, string>, signal: AbortSignal, maxBytes: number): Promise<Page> {
  return new Promise((resolve, reject) => {
    const send = u.protocol === 'https:' ? httpsRequest : httpRequest
    const req = send(u, { method: 'GET', headers: { ...headers, 'accept-encoding': 'gzip, deflate, br' }, lookup: publicLookup, signal }, (res) => {
      const status = res.statusCode ?? 0
      const type = String(res.headers['content-type'] ?? '')
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        return resolve({ status, type, location: res.headers.location, body: '' })
      }
      const enc = String(res.headers['content-encoding'] ?? '')
      const stream = enc.includes('br') ? res.pipe(createBrotliDecompress()) : enc.includes('gzip') ? res.pipe(createGunzip()) : enc.includes('deflate') ? res.pipe(createInflate()) : res
      const chunks: Buffer[] = []
      let got = 0
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve({ status, type, body: new TextDecoder().decode(Buffer.concat(chunks)) })
      }
      stream.on('data', (c: Buffer) => {
        if (done) return
        chunks.push(c)
        got += c.length
        if (got >= maxBytes) {
          finish()
          res.destroy()
        }
      })
      stream.on('end', finish)
      stream.on('error', (e) => (done ? undefined : reject(e)))
    })
    req.on('error', reject)
    req.end()
  })
}

/** GET with manual redirects (each hop re-validated), connect-time address checks and a streamed size cap. */
async function fetchPublic(start: URL, headers: Record<string, string>, signal: AbortSignal, maxBytes: number): Promise<Page & { url: string }> {
  let url = start
  for (let hop = 0; hop < 6; hop++) {
    await assertPublicUrl(url)
    const page = await getOnce(url, headers, signal, maxBytes)
    if (page.location) {
      url = new URL(page.location, url)
      continue
    }
    return { ...page, url: url.toString() }
  }
  throw new Error('Too many redirects')
}

async function fetchPage(res: ServerResponse, target: string) {
  let u: URL
  try {
    u = new URL(target)
  } catch {
    return json(res, 400, { error: 'Invalid URL' })
  }
  try {
    await assertPublicUrl(u)
  } catch (e) {
    return json(res, 400, { error: (e as Error).message })
  }
  // Wikipedia articles: use the plain-text extracts API instead of scraping page chrome and maintenance banners.
  const wiki = u.hostname.match(/^([a-z-]+)\.(?:m\.)?wikipedia\.org$/)
  if (wiki && u.pathname.startsWith('/wiki/')) {
    try {
      const title = decodeURIComponent(u.pathname.slice(6))
      const api = `https://${wiki[1]}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&redirects=1&format=json&titles=${encodeURIComponent(title)}`
      const r = await fetch(api, { headers: { 'user-agent': 'Cloudworks/1.0 (local research agent)' }, signal: AbortSignal.timeout(10000) })
      const j = (await r.json()) as { query?: { pages?: Record<string, { title: string; extract?: string }> } }
      const page = Object.values(j.query?.pages ?? {})[0]
      if (page?.extract) {
        const max = 14000
        return json(res, 200, { url: u.toString(), title: `${page.title} - Wikipedia`, text: page.extract.slice(0, max), truncated: page.extract.length > max })
      }
    } catch {
      /* fall through to a normal page fetch */
    }
  }
  try {
    const page = await fetchPublic(
      u,
      { 'user-agent': 'Mozilla/5.0 (Cloudworks research agent)', accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' },
      AbortSignal.timeout(12000),
      2_000_000,
    )
    const { url: finalUrl, body: raw, type } = page
    if (page.status < 200 || page.status >= 300) return json(res, 502, { error: `Page returned HTTP ${page.status}` })
    const { title, text } = type.includes('html') ? htmlToText(raw) : { title: u.hostname, text: raw }
    const max = 14000
    json(res, 200, { url: finalUrl, title, text: text.slice(0, max), truncated: text.length > max })
  } catch (e) {
    json(res, 502, { error: `Fetch failed: ${(e as Error).message}` })
  }
}

type Hit = { title: string; url: string; snippet: string }

async function searchDuckDuckGo(q: string): Promise<Hit[]> {
  const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' },
    signal: AbortSignal.timeout(8000),
  })
  const html = await r.text()
  const results: Hit[] = []
  const strip = (s = '') => htmlToText(s).text.replace(/\s+/g, ' ').trim()
  // One chunk per result, so each snippet is matched inside its own result (a lazy gap would match nothing).
  for (const block of html.split(/(?=<a[^>]+class="result__a")/).slice(1)) {
    const link = block.match(/^<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!link) continue
    let url = link[1].replace(/&amp;/g, '&')
    try {
      const uddg = url.match(/[?&]uddg=([^&]+)/)
      if (uddg) url = decodeURIComponent(uddg[1])
    } catch {
      continue
    }
    if (url.startsWith('//')) url = `https:${url}`
    if (!/^https?:/.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue
    const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)?.[1]
    results.push({ title: strip(link[2]), url, snippet: strip(snippet) })
    if (results.length >= 8) break
  }
  return results
}

const GENERIC = new Set('best practices practice edge cases case trends trend competitors competitor overview pros cons vs versus guide how to what is are the a an of for and in on with 2024 2025 2026 2027 latest top review reviews examples example'.split(' '))

function queryVariants(q: string): string[] {
  const words = q.split(/\s+/).filter(Boolean)
  const core = words.filter((w) => !GENERIC.has(w.toLowerCase()))
  const variants = [words.join(' '), core.join(' '), core.slice(0, 2).join(' '), ...core.slice(0, 3)]
  return [...new Set(variants.filter(Boolean))]
}

/** Wikipedia's search API: dependable and keyless. Falls back to simpler variants of the query. */
async function searchWikipedia(q: string): Promise<Hit[]> {
  let lastError: Error | null = null
  for (const query of queryVariants(q)) {
    let hits: { title: string; snippet: string }[] = []
    try {
      const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=6&srsearch=${encodeURIComponent(query)}`, {
        headers: { 'user-agent': 'Cloudworks/1.0 (local research agent)' },
        signal: AbortSignal.timeout(8000),
      })
      const j = (await r.json()) as { query?: { search?: { title: string; snippet: string }[] } }
      hits = j.query?.search ?? []
    } catch (e) {
      lastError = e as Error
      continue
    }
    if (hits.length) {
      return hits.map((h) => ({
        title: h.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`,
        snippet: `${htmlToText(h.snippet).text.replace(/\s+/g, ' ').trim()}${query !== q ? ` (matched “${query}”)` : ''}`,
      }))
    }
  }
  if (lastError) throw lastError
  return []
}

async function search(res: ServerResponse, q: string) {
  if (!q.trim()) return json(res, 400, { error: 'Empty query' })
  const errors: string[] = []
  for (const [engine, fn] of [
    ['duckduckgo', searchDuckDuckGo],
    ['wikipedia', searchWikipedia],
  ] as const) {
    try {
      const results = await fn(q)
      if (results.length) return json(res, 200, { engine, results })
      errors.push(`${engine}: no results`)
    } catch (e) {
      errors.push(`${engine}: ${(e as Error).message}`)
    }
  }
  json(res, 502, { error: `Search failed (${errors.join('; ')})`, engine: 'none' })
}

async function webhook(req: IncomingMessage, res: ServerResponse) {
  let body: { url?: string; payload?: unknown }
  try {
    body = JSON.parse((await readBody(req)).toString('utf8') || '{}') as typeof body
  } catch {
    return json(res, 400, { error: 'Body must be JSON: {"url": "https://…", "payload": …}' })
  }
  if (!body.url || !/^https:\/\//.test(body.url)) return json(res, 400, { error: 'Webhook URL must be https://' })
  try {
    const r = await fetch(body.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body.payload), signal: AbortSignal.timeout(10000) })
    json(res, r.ok ? 200 : 502, { status: r.status, ok: r.ok })
  } catch (e) {
    json(res, 502, { error: (e as Error).message })
  }
}

function middleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/')) return next()
    const u = new URL(url, 'http://local')
    const p = u.pathname
    if (p === '/api/health') {
      return json(res, 200, {
        ok: true,
        serverKeys: Object.fromEntries(Object.entries(TARGETS).map(([id, t]) => [id, Boolean(process.env[t.env])])),
      })
    }
    // A failed handler answers with an error instead of becoming an unhandled rejection that kills the server.
    const guard = (work: Promise<unknown>) =>
      void work.catch((e: Error) => {
        if (!res.headersSent) json(res, 500, { error: `Internal error: ${e.message}` })
        else res.end()
      })
    if (p.startsWith('/api/proxy/')) return guard(proxy(req, res, p.slice('/api/proxy/'.length) + u.search))
    if (p === '/api/fetch') return guard(fetchPage(res, u.searchParams.get('url') ?? ''))
    if (p === '/api/search') return guard(search(res, u.searchParams.get('q') ?? ''))
    if (p === '/api/webhook' && req.method === 'POST') return guard(webhook(req, res))
    json(res, 404, { error: 'Unknown API route' })
  }
}

export function cloudworksApi(): Plugin {
  return {
    name: 'cloudworks-api',
    configureServer(server) {
      server.middlewares.use(middleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware())
    },
  }
}
