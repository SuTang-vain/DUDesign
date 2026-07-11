import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { describe, it } from 'node:test'

const repoRoot = resolve(import.meta.dirname, '../../..')

describe('architecture boundaries', () => {
  it('keeps BabeL-O and Nexus implementation details out of the user web source', async () => {
    const files = await sourceFiles(join(repoRoot, 'apps/web/src'))
    const violations: string[] = []
    const forbidden = [
      /\bNexusEvent\b/,
      /\bBABELO_[A-Z0-9_]+\b/,
      /\/v1\/(?:sessions|agents|stream)\b/,
    ]

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      if (forbidden.some(pattern => pattern.test(source))) {
        violations.push(relativePath(file))
      }
    }

    assert.deepEqual(violations, [])
  })

  it('keeps runtime lane diagnostics out of the user design job snapshot contract', async () => {
    const source = await readFile(join(repoRoot, 'packages/contracts/src/api.ts'), 'utf8')
    const snapshotBlock = extractTypeBlock(source, 'DesignJobSnapshotResponse')

    for (const field of ['runtimeLaneId', 'runtimeBackendId', 'runtimeLeaseId', 'runtimeChildSessionId', 'runtimeAgentJobId']) {
      assert.equal(snapshotBlock.includes(field), false, `${field} must remain in Admin diagnostics, not DesignJobSnapshotResponse`)
    }
    assert.match(snapshotBlock, /execution:\s*UserVariationExecution/)
  })

  it('requires unknown runtime providers to fail fast instead of falling back to mock', async () => {
    const source = await readFile(join(repoRoot, 'apps/api/src/serviceFactory.ts'), 'utf8')

    assert.match(source, /runtimeProvider === 'mock'/)
    assert.match(source, /Unsupported DUDESIGN_RUNTIME_PROVIDER/)
  })

  it('keeps extracted application services independent from the ApplicationService facade', async () => {
    const applicationRoot = join(repoRoot, 'apps/api/src/application')
    const files = await sourceFiles(applicationRoot)
    const violations: string[] = []

    for (const file of files) {
      if (file.endsWith('.test.ts')) continue
      const source = await readFile(file, 'utf8')
      if (/from ['"]\.\.\/service\.js['"]/.test(source) || /\bApplicationService\b/.test(source)) {
        violations.push(relativePath(file))
      }
    }

    assert.deepEqual(violations, [])
  })
})

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files = await Promise.all(entries.map(async entry => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : []
  }))
  return files.flat()
}

function extractTypeBlock(source: string, typeName: string): string {
  const start = source.indexOf(`export type ${typeName} = {`)
  assert.notEqual(start, -1, `Missing exported type ${typeName}`)
  let depth = 0
  for (let index = source.indexOf('{', start); index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  throw new Error(`Unterminated exported type ${typeName}`)
}

function relativePath(file: string): string {
  return file.slice(repoRoot.length + 1)
}
