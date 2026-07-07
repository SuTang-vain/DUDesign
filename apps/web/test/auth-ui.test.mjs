import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('auth UI source contract', () => {
  it('exposes password, Google, and GitHub sign-in options', async () => {
    const source = await readFile(resolve(root, 'src/app/login/page.tsx'), 'utf8')

    assert.match(source, /loginUser/)
    assert.match(source, /registerUser/)
    assert.match(source, /Continue with Google/)
    assert.match(source, /Continue with GitHub/)
    assert.match(source, /withOAuthRedirect/)
  })

  it('uses session auth endpoints with browser credentials', async () => {
    const source = await readFile(resolve(root, 'src/lib/api.ts'), 'utf8')

    assert.match(source, /return getJson\('\/api\/auth\/me'\)/)
    assert.match(source, /postJson\('\/api\/auth\/login'/)
    assert.match(source, /postJson\('\/api\/auth\/register'/)
    assert.match(source, /credentials: 'include'/)
  })
})
