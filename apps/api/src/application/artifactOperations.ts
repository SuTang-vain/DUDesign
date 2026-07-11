import type { ArtifactStore } from '@dudesign/artifact-store'
import type { Artifact, DesignVariation } from '@dudesign/domain'
import { posix } from 'node:path'
import type { DesignJobQueue, ScreenshotJobQueuePayload } from '../designJobQueue.js'
import { createId } from '../id.js'
import type { ApplicationRepository } from '../repository.js'

export async function enqueueArtifactScreenshotJob(input: {
  store: ApplicationRepository
  queue: DesignJobQueue
  artifact: Artifact
  variation: DesignVariation
  reason: Extract<ScreenshotJobQueuePayload['reason'], 'repair_requested' | 'restore_requested'>
}) {
  const job = await input.store.getJobById(input.variation.jobId)
  return input.queue.enqueueScreenshotJob({
    jobId: input.variation.jobId,
    sessionId: input.artifact.sessionId,
    variationId: input.variation.id,
    artifactId: input.artifact.id,
    idempotencyKey: screenshotQueueIdempotencyKey(input.artifact.id, input.reason),
    userId: job?.userId ?? input.store.devUser.id,
    workspaceId: input.artifact.workspaceId,
    source: 'repair',
    reason: input.reason,
    createdAt: new Date().toISOString(),
  })
}

export async function createArtifactExportZip(input: {
  store: ApplicationRepository
  artifacts: ArtifactStore
  variationId: string
  sourceArtifact: Artifact
  filename: string
  html: string
  reuseKey?: string
}): Promise<Artifact> {
  const assets = await input.store.getVariationAssetArtifacts(input.variationId, input.sourceArtifact.id)
  const files: Array<{ path: string; body: Uint8Array | string }> = [{
    path: input.sourceArtifact.entryPath ?? 'index.html',
    body: input.html,
  }]
  for (const asset of assets) {
    if (!asset.entryPath) continue
    const stored = await input.artifacts.get(asset.storageKey)
    files.push({ path: asset.entryPath, body: stored.body })
  }
  const manifest = {
    kind: 'dudesign.export',
    variationId: input.variationId,
    sourceArtifactId: input.sourceArtifact.id,
    sourceVersion: input.sourceArtifact.version,
    files: files.map(file => file.path),
    exportedAt: new Date().toISOString(),
  }
  const body = createZipArchive([
    ...files,
    { path: 'dudesign-export.json', body: JSON.stringify(manifest, null, 2) },
  ])
  const exportArtifactId = input.reuseKey
    ? `export_${input.sourceArtifact.id}_${input.reuseKey}`
    : `export_${input.sourceArtifact.id}`
  const stored = await input.artifacts.put({
    workspaceId: input.sourceArtifact.workspaceId,
    artifactId: exportArtifactId,
    relativePath: input.filename,
    contentType: 'application/zip',
    body,
    metadata: {
      kind: 'export_zip',
      sourceArtifactId: input.sourceArtifact.id,
      variationId: input.variationId,
      files: manifest.files.join('\n'),
    },
  })
  return input.store.createArtifact({
    workspaceId: input.sourceArtifact.workspaceId,
    sessionId: input.sourceArtifact.sessionId,
    variationId: input.variationId,
    parentArtifactId: input.sourceArtifact.id,
    kind: 'export_zip',
    version: input.sourceArtifact.version,
    storageKey: stored.storageKey,
    entryPath: input.filename,
    contentHash: stored.contentHash,
    sizeBytes: stored.sizeBytes,
    metadata: {
      sourceArtifactId: input.sourceArtifact.id,
      files: manifest.files,
    },
  })
}

function screenshotQueueIdempotencyKey(
  artifactId: string,
  reason: Extract<ScreenshotJobQueuePayload['reason'], 'repair_requested' | 'restore_requested'>,
): string {
  if (reason === 'repair_requested') return `queue:screenshot:${reason}:${artifactId}:${createId('repair')}`
  return `queue:screenshot:${reason}:${artifactId}`
}

function normalizeArtifactPath(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) {
    throw new Error(`Invalid artifact path: ${path}`)
  }
  if (normalized.split('/').some(part => part === '..' || part === '')) {
    throw new Error(`Artifact path escapes workspace: ${path}`)
  }
  const clean = posix.normalize(normalized)
  if (clean === '.' || clean.startsWith('../') || clean === '..' || posix.isAbsolute(clean)) {
    throw new Error(`Artifact path escapes workspace: ${path}`)
  }
  return clean
}

function createZipArchive(files: Array<{ path: string; body: Uint8Array | string }>): Uint8Array {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const path = normalizeArtifactPath(file.path)
    const name = encoder.encode(path)
    const body = typeof file.body === 'string' ? encoder.encode(file.body) : file.body
    const crc = crc32(body)
    const localHeader = concatBytes([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(body.byteLength), u32(body.byteLength), u16(name.byteLength), u16(0), name,
    ])
    localParts.push(localHeader, body)
    centralParts.push(concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(body.byteLength), u32(body.byteLength), u16(name.byteLength),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]))
    offset += localHeader.byteLength + body.byteLength
  }
  const centralDirectory = concatBytes(centralParts)
  const end = concatBytes([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralDirectory.byteLength), u32(offset), u16(0),
  ])
  return concatBytes([...localParts, centralDirectory, end])
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2)
  new DataView(out.buffer).setUint16(0, value, true)
  return out
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value >>> 0, true)
  return out
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]!
  return (crc ^ 0xffffffff) >>> 0
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})
