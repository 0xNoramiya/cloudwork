/// <reference lib="webworker" />
// Runs untrusted model-written JavaScript away from the page: no DOM, and network globals removed.

interface RunRequest {
  id: string
  code: string
  tests?: string
}

interface TestResult {
  name: string
  passed: boolean
  error?: string
  ms: number
}

const scope = self as unknown as Record<string, unknown>
for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel']) {
  try {
    scope[k] = undefined
  } catch {
    /* some globals are read-only; they stay but the worker has no credentials or DOM */
  }
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return String(v)
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

function makeExpect(actual: unknown, negate = false) {
  const check = (ok: boolean, msg: string) => {
    if (negate ? ok : !ok) throw new Error(negate ? `Expected NOT: ${msg}` : msg)
  }
  const api = {
    toBe: (exp: unknown) => check(Object.is(actual, exp), `Expected ${fmt(exp)} but got ${fmt(actual)}`),
    toEqual: (exp: unknown) => check(deepEqual(actual, exp), `Expected ${fmt(exp)} but got ${fmt(actual)}`),
    toStrictEqual: (exp: unknown) => check(deepEqual(actual, exp), `Expected ${fmt(exp)} but got ${fmt(actual)}`),
    toBeTruthy: () => check(Boolean(actual), `Expected truthy but got ${fmt(actual)}`),
    toBeFalsy: () => check(!actual, `Expected falsy but got ${fmt(actual)}`),
    toBeNull: () => check(actual === null, `Expected null but got ${fmt(actual)}`),
    toBeUndefined: () => check(actual === undefined, `Expected undefined but got ${fmt(actual)}`),
    toBeDefined: () => check(actual !== undefined, `Expected a defined value`),
    toContain: (item: unknown) =>
      check(
        (typeof actual === 'string' && typeof item === 'string' && actual.includes(item)) ||
          (Array.isArray(actual) && actual.some((x) => deepEqual(x, item))),
        `Expected ${fmt(actual)} to contain ${fmt(item)}`,
      ),
    toHaveLength: (n: number) =>
      check((actual as { length?: number })?.length === n, `Expected length ${n} but got ${(actual as { length?: number })?.length}`),
    toBeGreaterThan: (n: number) => check((actual as number) > n, `Expected ${fmt(actual)} > ${n}`),
    toBeGreaterThanOrEqual: (n: number) => check((actual as number) >= n, `Expected ${fmt(actual)} >= ${n}`),
    toBeLessThan: (n: number) => check((actual as number) < n, `Expected ${fmt(actual)} < ${n}`),
    toBeLessThanOrEqual: (n: number) => check((actual as number) <= n, `Expected ${fmt(actual)} <= ${n}`),
    toBeCloseTo: (n: number, digits = 2) =>
      check(Math.abs((actual as number) - n) < 10 ** -digits / 2, `Expected ${fmt(actual)} ≈ ${n}`),
    toMatch: (re: RegExp | string) =>
      check(typeof actual === 'string' && new RegExp(re).test(actual), `Expected ${fmt(actual)} to match ${String(re)}`),
    toThrow: (msg?: string | RegExp) => {
      let threw = false
      let err: unknown
      try {
        ;(actual as () => unknown)()
      } catch (e) {
        threw = true
        err = e
      }
      const text = err instanceof Error ? err.message : String(err)
      const matches = msg === undefined || (typeof msg === 'string' ? text.includes(msg) : msg.test(text))
      check(threw && matches, `Expected function to throw${msg ? ` ${String(msg)}` : ''}`)
    },
  }
  return api
}

function expect(actual: unknown) {
  return Object.assign(makeExpect(actual), { not: makeExpect(actual, true) })
}

function assert(cond: unknown, msg = 'Assertion failed') {
  if (!cond) throw new Error(msg)
}
assert.equal = (a: unknown, b: unknown, msg?: string) => {
  // eslint-disable-next-line eqeqeq
  if (a != b) throw new Error(msg ?? `Expected ${fmt(a)} == ${fmt(b)}`)
}
assert.strictEqual = (a: unknown, b: unknown, msg?: string) => {
  if (!Object.is(a, b)) throw new Error(msg ?? `Expected ${fmt(a)} === ${fmt(b)}`)
}
assert.deepStrictEqual = (a: unknown, b: unknown, msg?: string) => {
  if (!deepEqual(a, b)) throw new Error(msg ?? `Expected ${fmt(a)} to deep-equal ${fmt(b)}`)
}
assert.deepEqual = assert.deepStrictEqual
assert.ok = assert
assert.throws = (fn: () => unknown) => {
  try {
    fn()
  } catch {
    return
  }
  throw new Error('Expected function to throw')
}

/** Make ESM/CommonJS-flavoured snippets runnable as a plain script body. */
function normalize(src: string): string {
  return src
    .replace(/^\s*import\s[^;\n]*;?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^\s*export\s+(?=(async\s+)?function|const|let|var|class)/gm, '')
    .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '')
    .replace(/^\s*(const|let|var)\s+\{[^}]*\}\s*=\s*require\([^)]*\);?\s*$/gm, '')
    .replace(/^\s*(const|let|var)\s+\w+\s*=\s*require\(['"]\.\/[^)]*\);?\s*$/gm, '')
}

self.onmessage = async (e: MessageEvent<RunRequest>) => {
  const { id, code, tests } = e.data
  const logs: string[] = []
  const push = (level: string) => (...args: unknown[]) =>
    logs.push(`${level === 'log' ? '' : `[${level}] `}${args.map((a) => (typeof a === 'string' ? a : fmt(a))).join(' ')}`.slice(0, 500))
  const sandboxConsole = { log: push('log'), info: push('info'), warn: push('warn'), error: push('error'), debug: push('debug') }
  const registered: { name: string; fn: () => unknown }[] = []
  const test = (name: string, fn: () => unknown) => registered.push({ name, fn })
  const describe = (_name: string, fn: () => unknown) => fn()
  const moduleObj = { exports: {} as Record<string, unknown> }
  const require = (name: string) => {
    if (name === 'assert' || name === 'node:assert') return assert
    throw new Error(`require('${name}') is not available in the sandbox`)
  }

  let lastValue: unknown
  try {
    const body = `"use strict";\n${normalize(code)}\n;\n${tests ? normalize(tests) : ''}`
    const fn = new Function('test', 'it', 'describe', 'expect', 'assert', 'console', 'module', 'exports', 'require', body)
    lastValue = fn(test, test, describe, expect, assert, sandboxConsole, moduleObj, moduleObj.exports, require)
  } catch (err) {
    postMessage({ id, ok: false, error: `${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`, logs, results: [] })
    return
  }

  const results: TestResult[] = []
  for (const t of registered) {
    const start = performance.now()
    try {
      await t.fn()
      results.push({ name: t.name, passed: true, ms: Math.round(performance.now() - start) })
    } catch (err) {
      results.push({
        name: t.name,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
        ms: Math.round(performance.now() - start),
      })
    }
  }
  postMessage({ id, ok: true, results, logs, value: lastValue === undefined ? undefined : fmt(lastValue) })
}
