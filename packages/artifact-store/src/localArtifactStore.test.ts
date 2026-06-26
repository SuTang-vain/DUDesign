import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it } from 'node:test'
import { LocalArtifactStore } from './localArtifactStore.js'

describe('LocalArtifactStore', () => {
  it('stores, reads, signs, and deletes artifacts under the configured root', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'dudesign-artifacts-'))
    const store = new LocalArtifactStore({ rootDir })

    const put = await store.put({
      workspaceId: 'ws_dev',
      artifactId: 'art_123',
      relativePath: 'v1/index.html',
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><p>Hello</p>',
      metadata: {
        kind: 'html',
        version: '1',
      },
    })

    assert.equal(put.storageKey, 'ws_dev/artifacts/art_123/v1/index.html')
    assert.equal(put.sizeBytes > 0, true)
    assert.match(put.contentHash, /^sha256:/)

    const fileBody = await readFile(join(rootDir, put.storageKey), 'utf8')
    assert.equal(fileBody, '<!doctype html><p>Hello</p>')

    const got = await store.get(put.storageKey)
    assert.equal(got.contentType, 'text/html; charset=utf-8')
    assert.equal(new TextDecoder().decode(got.body), '<!doctype html><p>Hello</p>')
    assert.deepEqual(got.metadata, { kind: 'html', version: '1' })

    const url = await store.getSignedReadUrl(put.storageKey)
    assert.match(url, /^file:\/\//)

    await store.delete(put.storageKey)
    await assert.rejects(() => store.get(put.storageKey))
  })

  it('rejects storage keys that escape the artifact root', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'dudesign-artifacts-'))
    const store = new LocalArtifactStore({ rootDir })

    await assert.rejects(() => store.get('../outside.html'), /Invalid artifact storage key/)
    await assert.rejects(() => store.put({
      workspaceId: 'ws_dev',
      artifactId: 'art_123',
      relativePath: '../outside.html',
      contentType: 'text/html',
      body: 'bad',
    }), /Invalid artifact storage key/)
  })
})
