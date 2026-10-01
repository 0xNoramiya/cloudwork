// Mock LLM server for testing the live (non-demo) pipeline without real keys.
// Speaks Anthropic Messages SSE (POST /v1/messages) and OpenAI chat completions SSE (POST /v1/chat/completions).
import http from 'node:http'

const PORT = Number(process.env.MOCK_PORT || 5299)
const log = []

function pickResponse(system, messages, tools) {
  const last = messages[messages.length - 1]
  const lastText = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '')
  const all = messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n')
  if (/Return ONLY a JSON object/.test(system)) {
    return 'Here is the plan:\n```json\n' + JSON.stringify({
      title: 'Mock launch kit',
      summary: 'Research, pricing and copy in a small parallel plan (mock model).',
      deliverable: 'A short launch kit.',
      tasks: [
        { key: 't1', title: 'Quick market scan', role: 'researcher', description: 'Scan the market.', dependsOn: [], estimateMinutes: 1 },
        { key: 't2', title: 'Tiny helper function', role: 'coder', description: 'Write a JS function add(a,b) with tests.', dependsOn: [], estimateMinutes: 1 },
        { key: 't3', title: 'Price the tiers', role: 'analyst', description: 'Propose tiers.', dependsOn: ['t1'], estimateMinutes: 1 },
        { key: 't4', title: 'Write the copy', role: 'writer', description: 'Write the copy.', dependsOn: ['t1', 't3'], estimateMinutes: 1 },
      ],
    }) + '\n```'
  }
  if (/Return ONLY a JSON array/.test(system)) return JSON.stringify([{ text: `Mock fact learned at ${new Date().toISOString().slice(11, 19)}: tiers work best in threes.`, kind: 'fact', tags: ['pricing', 'mock'] }])
  if (/VERDICT: PASS/.test(system)) return 'SUMMARY: Looks correct (mock reviewer).\n\nAll good.\n\nVERDICT: PASS'
  if (/Assemble the crew/.test(system)) return 'SUMMARY: Final mock deliverable.\n\n# Mock launch kit\n\nEverything assembled.\n\n## Next steps\n- Ship it.'
  if (/You are Sage/.test(system) && /## Tools/.test(system) && !/Tool result/.test(all)) return '```tool\n{"tool": "memory_search", "query": "pricing"}\n```'
  if (/You are Bolt/.test(system)) {
    return 'SUMMARY: Wrote add() with tests (mock).\n\n```javascript file=solution.js\nfunction add(a, b) { return a + b }\n```\n\n```javascript file=tests.js\ntest("adds", () => { expect(add(2, 3)).toBe(5) })\ntest("negatives", () => { expect(add(-1, -1)).toBe(-2) })\n```'
  }
  if (/follow-up question/.test(system)) return 'I am a mock model, but I can confirm the live chat path works end to end.'
  if (/connection test/.test(system)) return 'OK'
  return `SUMMARY: Mock output for the task.\n\n## Result\n${lastText.slice(0, 80).replace(/\n/g, ' ')}…\n\nDISCOVERY: Mock models are great for testing pipelines.`
}

function chunks(text) {
  const out = []
  for (let i = 0; i < text.length; i += 12) out.push(text.slice(i, i + 12))
  return out
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function anthropic(req, res, body) {
  const text = pickResponse(typeof body.system === 'string' ? body.system : JSON.stringify(body.system), body.messages, body.tools)
  const search = (body.tools ?? []).some((t) => String(t.type).startsWith('web_search'))
  log.push({ at: Date.now(), api: 'anthropic', model: body.model, betas: req.headers['anthropic-beta'], effort: body.output_config?.effort, fallbacks: body.fallbacks, tools: (body.tools ?? []).map((t) => t.type), key: String(req.headers['x-api-key']).slice(0, 8) })
  if (!req.headers['x-api-key']) {
    res.writeHead(401, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'missing key' } }))
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  send('message_start', { type: 'message_start', message: { id: 'msg_mock', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 321, output_tokens: 1 } } })
  send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
  for (const c of chunks(text)) {
    send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: c } })
    await sleep(15)
  }
  send('content_block_stop', { type: 'content_block_stop', index: 0 })
  send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: Math.ceil(text.length / 4), ...(search ? { server_tool_use: { web_search_requests: 2 } } : {}) } })
  send('message_stop', { type: 'message_stop' })
  res.end()
}

async function openai(req, res, body) {
  const sys = body.messages.find((m) => m.role === 'system')?.content ?? ''
  const text = pickResponse(sys, body.messages.filter((m) => m.role !== 'system'))
  log.push({ at: Date.now(), api: 'openai', model: body.model, auth: String(req.headers.authorization).slice(0, 14) })
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  for (const c of chunks(text)) {
    res.write(`data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta: { content: c }, finish_reason: null }] })}\n\n`)
    await sleep(15)
  }
  res.write(`data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: body.stream_options ? { prompt_tokens: 200, completion_tokens: Math.ceil(text.length / 4), total_tokens: 0 } : undefined })}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
}

http
  .createServer(async (req, res) => {
    const chunksIn = []
    for await (const c of req) chunksIn.push(c)
    const body = chunksIn.length ? JSON.parse(Buffer.concat(chunksIn).toString('utf8')) : {}
    if (req.url === '/log') {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify(log))
    }
    const path = (req.url ?? '').split('?')[0]
    if (path.endsWith('/v1/messages')) return anthropic(req, res, body)
    if (path.endsWith('/chat/completions')) return openai(req, res, body)
    res.writeHead(404)
    res.end('not found')
  })
  .listen(PORT, () => console.log(`mock llm on :${PORT}`))
