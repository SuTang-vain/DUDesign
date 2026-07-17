import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

describe('PostgreSQL migration contracts', () => {
  it('references the canonical design variation table from refine operations', async () => {
    const migration = await readFile(
      fileURLToPath(new URL('../db/migrations/0021_refine_operations.sql', import.meta.url)),
      'utf8',
    )

    assert.match(migration, /references\s+design_variations\s*\(id\)/i)
    assert.doesNotMatch(migration, /references\s+variations\s*\(id\)/i)
  })
})
