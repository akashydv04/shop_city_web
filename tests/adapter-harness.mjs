// Run the real TypeScript adapters with isolated config/auth and an in-memory
// HTTP boundary. No real accounts, tokens, or network writes. Rolldown (also
// used by Vite) compiles the modules in memory; typechecking is a separate step.
import { readdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { rolldown } from 'rolldown'

const root = fileURLToPath(new URL('../', import.meta.url))
const nodeRequire = createRequire(import.meta.url)
const compiled = new Map()
for (const path of [...readdirSync(resolve(root, 'src/services')).filter((name) => name.endsWith('.ts')).map((name) => `src/services/${name}`), 'src/data/demo.ts']) {
  const file = resolve(root, path)
  const bundle = await rolldown({ input: file, external: (_source, importer) => Boolean(importer) })
  try {
    const { output } = await bundle.generate({ format: 'cjs' })
    compiled.set(file, output.find((item) => item.type === 'chunk' && item.isEntry).code)
  } finally { await bundle.close() }
}

export function harness({ role = 'buyer', environment = 'dev', realAuth = false } = {}) {
  const calls = []
  const replies = []
  const cache = new Map()
  const storage = new Map()
  const config = { environment, apiBaseUrl: 'https://example.test', allowDemoFallback: false }
  const identity = { id: 'test-user', role }
  const authApi = {
    getIdentity: () => identity,
    isAuthenticated: () => true,
    hasRole: (expected) => identity.role === expected,
    headers: (input) => new Headers(input),
    clear: () => { identity.id = ''; identity.role = 'guest' },
  }
  const context = vm.createContext({
    console, Headers, Response, URL, URLSearchParams, setTimeout, clearTimeout,
    window: {
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
    },
    fetch: async (url, init = {}) => {
      calls.push({ url, ...init })
      if (!replies.length) throw new Error(`Unexpected HTTP request: ${url}`)
      const reply = replies.shift()
      if (reply instanceof Error) throw reply
      return new Response(reply.status === 204 ? null : JSON.stringify(reply.body), {
        status: reply.status, headers: { 'Content-Type': 'application/json' },
      })
    },
  })
  function load(path) {
    const file = resolve(root, path)
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const output = compiled.get(file)
    if (!output) throw new Error(`No compiled test module: ${file}`)
    function requireLocal(specifier) {
      if (specifier.endsWith('/config/environment')) return { appConfig: config }
      if (specifier.endsWith('/authApi') && !realAuth) return { authApi }
      if (!specifier.startsWith('.')) return nodeRequire(specifier)
      const base = resolve(dirname(file), specifier)
      const target = ['', '.ts', '.tsx'].map((extension) => base + extension).find(existsSync)
      if (!target) throw new Error(`Cannot resolve ${specifier}`)
      return load(target)
    }
    const run = vm.runInContext(`(function(require,module,exports){${output}\n})`, context, { filename: file })
    run(requireLocal, module, module.exports)
    return module.exports
  }
  return { load, calls, config, identity, reply: (body, status = 200) => replies.push({ body, status }), fail: (message) => replies.push(new Error(message)) }
}

export const plain = (value) => JSON.parse(JSON.stringify(value))
