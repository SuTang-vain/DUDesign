import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  ArtifactStore,
  ArtifactStoreGetResult,
  ArtifactStorePutInput,
  ArtifactStorePutResult,
  LocalArtifactStoreOptions,
} from './types.js'

const METADATA_SUFFIX = '.metadata.json'

export class LocalArtifactStore implements ArtifactStore {
  private readonly rootDir: string
  private readonly publicBaseUrl: string | null

  constructor(options: LocalArtifactStoreOptions) {
    this.rootDir = resolve(options.rootDir)
    this.publicBaseUrl = options.publicBaseUrl?.replace(/\/+$/, '') ?? null
  }

  async put(input: ArtifactStorePutInput): Promise<ArtifactStorePutResult> {
    const storageKey = normalizeStorageKey(input.workspaceId, input.artifactId, input.relativePath)
    const body = toUint8Array(input.body)
    const contentHash = sha256(body)
    const filePath = this.resolveStoragePath(storageKey)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, body)
    await writeFile(
      metadataPath(filePath),
      JSON.stringify({
        contentType: input.contentType,
        metadata: input.metadata ?? {},
        contentHash,
        sizeBytes: body.byteLength,
      }, null, 2),
    )
    return {
      storageKey,
      sizeBytes: body.byteLength,
      contentHash,
    }
  }

  async get(storageKey: string): Promise<ArtifactStoreGetResult> {
    const filePath = this.resolveStoragePath(storageKey)
    const [body, metadata, fileStat] = await Promise.all([
      readFile(filePath),
      readMetadata(filePath),
      stat(filePath),
    ])
    return {
      storageKey,
      contentType: metadata.contentType,
      sizeBytes: fileStat.size,
      body: new Uint8Array(body),
      metadata: metadata.metadata,
    }
  }

  async getSignedReadUrl(storageKey: string, options: { expiresInSeconds?: number } = {}): Promise<string> {
    this.resolveStoragePath(storageKey)
    if (this.publicBaseUrl) {
      const url = new URL(`${this.publicBaseUrl}/${encodeStorageKey(storageKey)}`)
      if (options.expiresInSeconds) {
        url.searchParams.set('expiresIn', String(options.expiresInSeconds))
      }
      return url.toString()
    }
    return pathToFileURL(this.resolveStoragePath(storageKey)).toString()
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = this.resolveStoragePath(storageKey)
    await Promise.all([
      rm(filePath, { force: true }),
      rm(metadataPath(filePath), { force: true }),
    ])
  }

  private resolveStoragePath(storageKey: string): string {
    const normalized = normalizeExistingStorageKey(storageKey)
    const filePath = resolve(this.rootDir, normalized)
    const rootWithSeparator = this.rootDir.endsWith(sep) ? this.rootDir : `${this.rootDir}${sep}`
    if (filePath !== this.rootDir && !filePath.startsWith(rootWithSeparator)) {
      throw new Error(`Storage key escapes artifact root: ${storageKey}`)
    }
    return filePath
  }
}

function normalizeStorageKey(workspaceId: string, artifactId: string, relativePath: string): string {
  const key = [workspaceId, 'artifacts', artifactId, relativePath].join('/')
  return normalizeExistingStorageKey(key)
}

function normalizeExistingStorageKey(storageKey: string): string {
  const normalized = storageKey.replaceAll('\\', '/').replace(/^\/+/, '')
  if (!normalized || normalized.split('/').some(part => part === '..' || part === '')) {
    throw new Error(`Invalid artifact storage key: ${storageKey}`)
  }
  return normalized
}

function toUint8Array(body: Uint8Array | string): Uint8Array {
  if (typeof body === 'string') return new TextEncoder().encode(body)
  return body
}

function sha256(body: Uint8Array): string {
  return `sha256:${createHash('sha256').update(body).digest('hex')}`
}

function metadataPath(filePath: string): string {
  return `${filePath}${METADATA_SUFFIX}`
}

async function readMetadata(filePath: string): Promise<{ contentType: string; metadata: Record<string, string> }> {
  const body = await readFile(metadataPath(filePath), 'utf8')
  const parsed = JSON.parse(body) as { contentType?: unknown; metadata?: unknown }
  return {
    contentType: typeof parsed.contentType === 'string' ? parsed.contentType : 'application/octet-stream',
    metadata: isStringRecord(parsed.metadata) ? parsed.metadata : {},
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object') return false
  return Object.values(value)
    .every(item => typeof item === 'string')
}

function encodeStorageKey(storageKey: string): string {
  return storageKey.split('/').map(encodeURIComponent).join('/')
}

export function storageKeyToRelativePath(rootDir: string, storageKey: string): string {
  return relative(resolve(rootDir), resolve(rootDir, normalizeExistingStorageKey(storageKey)))
}
