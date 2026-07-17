import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import type {
  CapabilityAuthoringDraft,
  CapabilityBundleManifest,
  CapabilityBundlePortableDraft,
  CapabilityBundleProvenance,
  DesignTemplateDraftV2,
} from '@dudesign/contracts'
import { redactAdminText } from './adminRedaction.js'

export const CAPABILITY_BUNDLE_SCHEMA_VERSION = '2026-07-13.dudesign-capability-bundle.v1' as const
export const CAPABILITY_BUNDLE_PROVENANCE_SCHEMA_VERSION = '2026-07-13.dudesign-capability-bundle-provenance.v1' as const

const MANIFEST_PATH = 'manifest.json'
const PORTABLE_DRAFT_PATH = 'capability/draft.json' as const
const PROVENANCE_PATH = 'provenance.json' as const
const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024
const MAX_FILE_COUNT = 64
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_UNCOMPRESSED_BYTES = 16 * 1024 * 1024

export type CapabilityBundleHtmlExampleInput = {
  templateIndex: number
  exampleIndex: number
  html: string
}

export type ParsedCapabilityBundle = {
  manifest: CapabilityBundleManifest
  provenance: CapabilityBundleProvenance
  portableDraft: CapabilityBundlePortableDraft
  htmlExamples: Array<{
    templateIndex: number
    exampleIndex: number
    path: string
    html: string
    contentHash: string
  }>
  contentHash: string
}

export function createCapabilityBundleArchive(input: {
  draft: CapabilityAuthoringDraft
  htmlExamples: CapabilityBundleHtmlExampleInput[]
  bundleId: string
  createdAt: string
  licenseDeclaration: CapabilityBundleProvenance['license']['declaration']
  licenseNotes: string | null
}): { body: Uint8Array; manifest: CapabilityBundleManifest; contentHash: string } {
  const examplesByTemplate = new Map<number, CapabilityBundleHtmlExampleInput[]>()
  for (const example of input.htmlExamples) {
    const examples = examplesByTemplate.get(example.templateIndex) ?? []
    examples.push(example)
    examplesByTemplate.set(example.templateIndex, examples)
  }
  const portableDraft: CapabilityBundlePortableDraft = {
    ...redactBundleDraft(input.draft.candidateBundle),
    templatePacks: input.draft.candidateBundle.templatePacks.map((template, templateIndex) => {
      const { htmlExamples: _omitted, ...portableTemplate } = redactTemplateDraft(template)
      return {
        ...portableTemplate,
        htmlExamplePaths: (examplesByTemplate.get(templateIndex) ?? [])
          .sort((left, right) => left.exampleIndex - right.exampleIndex)
          .map(example => examplePath(example.templateIndex, example.exampleIndex)),
      }
    }),
  }
  const provenance: CapabilityBundleProvenance = {
    schemaVersion: CAPABILITY_BUNDLE_PROVENANCE_SCHEMA_VERSION,
    source: {
      type: input.draft.source.type,
      contentHash: input.draft.source.contentHash,
    },
    exportedFrom: {
      draftId: input.draft.id,
      draftStatus: input.draft.status,
      publishedTemplateId: input.draft.publishedTemplateId ?? null,
    },
    license: {
      declaration: input.licenseDeclaration,
      notes: redactAdminText(input.licenseNotes),
    },
    privacy: {
      ownerIdentityIncluded: false,
      workspaceIdentityIncluded: false,
      sourceFilesystemPathsIncluded: false,
    },
    exportedAt: input.createdAt,
  }
  const files: Record<string, Uint8Array> = {
    [PORTABLE_DRAFT_PATH]: jsonBytes(portableDraft),
    [PROVENANCE_PATH]: jsonBytes(provenance),
  }
  for (const example of input.htmlExamples) {
    files[examplePath(example.templateIndex, example.exampleIndex)] = textBytes(example.html)
  }
  const manifestFiles = Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, body]) => ({
      path,
      kind: path === PORTABLE_DRAFT_PATH
        ? 'portable_draft' as const
        : path === PROVENANCE_PATH
          ? 'provenance' as const
          : 'html_example' as const,
      mediaType: path.endsWith('.html') ? 'text/html' : 'application/json',
      sizeBytes: body.byteLength,
      contentHash: sha256(body),
    }))
  const manifest: CapabilityBundleManifest = {
    schemaVersion: CAPABILITY_BUNDLE_SCHEMA_VERSION,
    bundleId: input.bundleId,
    name: normalizedBundleName(input.draft),
    format: 'dudesign-capability-bundle-zip',
    portableDraftPath: PORTABLE_DRAFT_PATH,
    provenancePath: PROVENANCE_PATH,
    files: manifestFiles,
    counts: {
      templatePacks: portableDraft.templatePacks.length,
      skills: portableDraft.skills.length,
      interactionParadigms: portableDraft.interactionParadigms.length,
      dataContracts: portableDraft.dataContracts.length,
      reviewProfiles: portableDraft.reviewProfiles.length,
      htmlExamples: input.htmlExamples.length,
    },
    createdAt: input.createdAt,
  }
  files[MANIFEST_PATH] = jsonBytes(manifest)
  const body = zipSync(files, { level: 6, mtime: new Date('1980-01-01T00:00:00.000Z') })
  return { body, manifest, contentHash: sha256(body) }
}

export function parseCapabilityBundleArchive(body: Uint8Array): ParsedCapabilityBundle {
  if (body.byteLength === 0 || body.byteLength > MAX_ARCHIVE_BYTES) {
    throw bundleError('CAPABILITY_BUNDLE_SIZE_INVALID', `Capability bundle ZIP must be between 1 and ${MAX_ARCHIVE_BYTES} bytes.`)
  }
  let totalBytes = 0
  let fileCount = 0
  const seenPaths = new Set<string>()
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(body, {
      filter(file) {
        if (file.name.endsWith('/')) return false
        const path = normalizeArchivePath(file.name)
        if (seenPaths.has(path)) throw bundleError('CAPABILITY_BUNDLE_DUPLICATE_PATH', `Capability bundle contains a duplicate file path: ${path}`)
        seenPaths.add(path)
        fileCount += 1
        totalBytes += file.originalSize
        if (fileCount > MAX_FILE_COUNT) throw bundleError('CAPABILITY_BUNDLE_FILE_LIMIT', `Capability bundle cannot contain more than ${MAX_FILE_COUNT} files.`)
        if (file.originalSize > MAX_FILE_BYTES) throw bundleError('CAPABILITY_BUNDLE_FILE_TOO_LARGE', `Capability bundle file exceeds ${MAX_FILE_BYTES} bytes: ${file.name}`)
        if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) throw bundleError('CAPABILITY_BUNDLE_UNCOMPRESSED_LIMIT', `Capability bundle exceeds ${MAX_TOTAL_UNCOMPRESSED_BYTES} uncompressed bytes.`)
        return true
      },
    })
  } catch (error) {
    if (isBundleError(error)) throw error
    throw bundleError('CAPABILITY_BUNDLE_ZIP_INVALID', error instanceof Error ? error.message : 'Capability bundle ZIP could not be decoded.')
  }
  const paths = Object.keys(files)
  if (!files[MANIFEST_PATH]) throw bundleError('CAPABILITY_BUNDLE_MANIFEST_MISSING', 'Capability bundle manifest.json is required.')
  const manifest = parseJson<CapabilityBundleManifest>(files[MANIFEST_PATH]!, MANIFEST_PATH)
  assertManifest(manifest)
  const declaredPaths = new Set(manifest.files.map(file => file.path))
  for (const path of paths) {
    if (path !== MANIFEST_PATH && !declaredPaths.has(path)) {
      throw bundleError('CAPABILITY_BUNDLE_UNDECLARED_FILE', `Capability bundle contains an undeclared file: ${path}`)
    }
  }
  if (declaredPaths.size !== manifest.files.length) {
    throw bundleError('CAPABILITY_BUNDLE_DUPLICATE_PATH', 'Capability bundle manifest contains duplicate file paths.')
  }
  for (const file of manifest.files) {
    const actual = files[file.path]
    if (!actual) throw bundleError('CAPABILITY_BUNDLE_FILE_MISSING', `Capability bundle file is missing: ${file.path}`)
    if (actual.byteLength !== file.sizeBytes || sha256(actual) !== file.contentHash) {
      throw bundleError('CAPABILITY_BUNDLE_HASH_MISMATCH', `Capability bundle file hash or size does not match the manifest: ${file.path}`)
    }
  }
  const portableDraft = parseJson<CapabilityBundlePortableDraft>(files[manifest.portableDraftPath]!, manifest.portableDraftPath)
  const provenance = parseJson<CapabilityBundleProvenance>(files[manifest.provenancePath]!, manifest.provenancePath)
  assertPortableDraft(portableDraft)
  assertProvenance(provenance)
  assertCounts(manifest, portableDraft)
  const htmlExamples: ParsedCapabilityBundle['htmlExamples'] = []
  const referencedExamplePaths = new Set<string>()
  portableDraft.templatePacks.forEach((template, templateIndex) => {
    template.htmlExamplePaths.forEach((path, exampleIndex) => {
      normalizeArchivePath(path)
      if (referencedExamplePaths.has(path)) {
        throw bundleError('CAPABILITY_BUNDLE_DUPLICATE_EXAMPLE', `Capability bundle HTML example is referenced more than once: ${path}`)
      }
      referencedExamplePaths.add(path)
      const manifestFile = manifest.files.find(file => file.path === path)
      if (!manifestFile || manifestFile.kind !== 'html_example' || manifestFile.mediaType !== 'text/html') {
        throw bundleError('CAPABILITY_BUNDLE_EXAMPLE_INVALID', `Template HTML example is not declared correctly: ${path}`)
      }
      const exampleBody = files[path]
      if (!exampleBody) throw bundleError('CAPABILITY_BUNDLE_FILE_MISSING', `Template HTML example is missing: ${path}`)
      htmlExamples.push({
        templateIndex,
        exampleIndex,
        path,
        html: new TextDecoder().decode(exampleBody),
        contentHash: manifestFile.contentHash,
      })
    })
  })
  if (htmlExamples.length !== manifest.counts.htmlExamples) {
    throw bundleError('CAPABILITY_BUNDLE_COUNT_MISMATCH', 'Capability bundle HTML example count does not match the manifest.')
  }
  const declaredExamplePaths = manifest.files.filter(file => file.kind === 'html_example').map(file => file.path)
  if (declaredExamplePaths.length !== referencedExamplePaths.size || declaredExamplePaths.some(path => !referencedExamplePaths.has(path))) {
    throw bundleError('CAPABILITY_BUNDLE_ORPHAN_EXAMPLE', 'Every bundled HTML example must be referenced by exactly one template draft.')
  }
  return { manifest, provenance, portableDraft, htmlExamples, contentHash: sha256(body) }
}

function redactBundleDraft(bundle: CapabilityAuthoringDraft['candidateBundle']): Omit<CapabilityBundlePortableDraft, 'templatePacks'> {
  return {
    skills: structuredClone(bundle.skills),
    interactionParadigms: bundle.interactionParadigms.map(item => ({ ...structuredClone(item), sourceEvidence: redactEvidence(item.sourceEvidence) })),
    dataContracts: bundle.dataContracts.map(item => ({ ...structuredClone(item), sourceEvidence: redactEvidence(item.sourceEvidence) })),
    reviewProfiles: bundle.reviewProfiles.map(item => ({ ...structuredClone(item), sourceEvidence: redactEvidence(item.sourceEvidence) })),
    recommendedCapabilityProfile: structuredClone(bundle.recommendedCapabilityProfile),
  }
}

function redactTemplateDraft(template: DesignTemplateDraftV2): DesignTemplateDraftV2 {
  return { ...structuredClone(template), sourceEvidence: redactEvidence(template.sourceEvidence) }
}

function redactEvidence(evidence: DesignTemplateDraftV2['sourceEvidence']) {
  return evidence.map(item => ({
    ...structuredClone(item),
    sourcePath: redactAdminText(item.sourcePath) ?? '[redacted-path]',
    sourceExcerpt: redactAdminText(item.sourceExcerpt) ?? '',
  }))
}

function assertManifest(value: CapabilityBundleManifest): void {
  if (!isObject(value) || value.schemaVersion !== CAPABILITY_BUNDLE_SCHEMA_VERSION || value.format !== 'dudesign-capability-bundle-zip') {
    throw bundleError('CAPABILITY_BUNDLE_MANIFEST_INVALID', 'Capability bundle manifest schema or format is invalid.')
  }
  if (value.portableDraftPath !== PORTABLE_DRAFT_PATH || value.provenancePath !== PROVENANCE_PATH || !Array.isArray(value.files)) {
    throw bundleError('CAPABILITY_BUNDLE_MANIFEST_INVALID', 'Capability bundle entrypoints are invalid.')
  }
  for (const file of value.files) {
    if (!isObject(file) || typeof file.path !== 'string' || typeof file.contentHash !== 'string' || typeof file.sizeBytes !== 'number') {
      throw bundleError('CAPABILITY_BUNDLE_MANIFEST_INVALID', 'Capability bundle file declaration is invalid.')
    }
    normalizeArchivePath(file.path)
    if (!['portable_draft', 'provenance', 'html_example'].includes(file.kind)
      || !['application/json', 'text/html'].includes(file.mediaType)
      || file.sizeBytes < 0
      || !/^sha256:[a-f0-9]{64}$/.test(file.contentHash)) {
      throw bundleError('CAPABILITY_BUNDLE_MANIFEST_INVALID', `Capability bundle file declaration is invalid: ${file.path}`)
    }
  }
  if (value.files.filter(file => file.kind === 'portable_draft' && file.path === PORTABLE_DRAFT_PATH).length !== 1
    || value.files.filter(file => file.kind === 'provenance' && file.path === PROVENANCE_PATH).length !== 1
    || value.files.some(file => file.path === MANIFEST_PATH)) {
    throw bundleError('CAPABILITY_BUNDLE_MANIFEST_INVALID', 'Capability bundle entrypoint declarations are invalid.')
  }
}

function assertPortableDraft(value: CapabilityBundlePortableDraft): void {
  if (!isObject(value) || !Array.isArray(value.templatePacks) || !Array.isArray(value.skills)
    || !Array.isArray(value.interactionParadigms) || !Array.isArray(value.dataContracts)
    || !Array.isArray(value.reviewProfiles) || !isObject(value.recommendedCapabilityProfile)) {
    throw bundleError('CAPABILITY_BUNDLE_DRAFT_INVALID', 'Capability bundle portable draft has an invalid shape.')
  }
  if (value.templatePacks.some(template => !isObject(template) || !Array.isArray(template.htmlExamplePaths))) {
    throw bundleError('CAPABILITY_BUNDLE_DRAFT_INVALID', 'Capability bundle template draft has an invalid HTML example index.')
  }
}

function assertProvenance(value: CapabilityBundleProvenance): void {
  if (!isObject(value) || value.schemaVersion !== CAPABILITY_BUNDLE_PROVENANCE_SCHEMA_VERSION
    || !isObject(value.source) || !isObject(value.license) || !isObject(value.privacy)) {
    throw bundleError('CAPABILITY_BUNDLE_PROVENANCE_INVALID', 'Capability bundle provenance is invalid.')
  }
  if (value.privacy.ownerIdentityIncluded !== false || value.privacy.workspaceIdentityIncluded !== false
    || value.privacy.sourceFilesystemPathsIncluded !== false) {
    throw bundleError('CAPABILITY_BUNDLE_PRIVACY_INVALID', 'Capability bundle provenance must not include private identity or filesystem path data.')
  }
}

function assertCounts(manifest: CapabilityBundleManifest, draft: CapabilityBundlePortableDraft): void {
  const actual = [draft.templatePacks.length, draft.skills.length, draft.interactionParadigms.length, draft.dataContracts.length, draft.reviewProfiles.length]
  const expected = [manifest.counts.templatePacks, manifest.counts.skills, manifest.counts.interactionParadigms, manifest.counts.dataContracts, manifest.counts.reviewProfiles]
  if (actual.some((value, index) => value !== expected[index])) {
    throw bundleError('CAPABILITY_BUNDLE_COUNT_MISMATCH', 'Capability bundle capability counts do not match the manifest.')
  }
}

function normalizeArchivePath(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw bundleError('CAPABILITY_BUNDLE_PATH_INVALID', `Capability bundle path is invalid: ${path}`)
  }
  if (normalized.split('/').some(part => !part || part === '..' || part === '.')) {
    throw bundleError('CAPABILITY_BUNDLE_PATH_INVALID', `Capability bundle path escapes its root: ${path}`)
  }
  const clean = posix.normalize(normalized)
  if (clean !== normalized || posix.isAbsolute(clean) || clean.startsWith('../')) {
    throw bundleError('CAPABILITY_BUNDLE_PATH_INVALID', `Capability bundle path escapes its root: ${path}`)
  }
  return clean
}

function examplePath(templateIndex: number, exampleIndex: number): string {
  return `examples/template-${String(templateIndex + 1).padStart(3, '0')}/example-${String(exampleIndex + 1).padStart(3, '0')}.html`
}

function normalizedBundleName(draft: CapabilityAuthoringDraft): string {
  return (draft.candidateBundle.templatePacks[0]?.name.trim() || `DUDesign capability ${draft.id}`).slice(0, 120)
}

function parseJson<T>(body: Uint8Array, path: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(body)) as T
  } catch (error) {
    throw bundleError('CAPABILITY_BUNDLE_JSON_INVALID', `Capability bundle JSON is invalid at ${path}: ${error instanceof Error ? error.message : 'parse failed'}`)
  }
}

function jsonBytes(value: unknown): Uint8Array {
  return textBytes(`${JSON.stringify(value, null, 2)}\n`)
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function sha256(body: Uint8Array): string {
  return `sha256:${createHash('sha256').update(body).digest('hex')}`
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function bundleError(code: string, message: string): Error & { status: number; code: string } {
  const error = new Error(message) as Error & { status: number; code: string }
  error.status = 400
  error.code = code
  return error
}

function isBundleError(error: unknown): error is Error & { status: number; code: string } {
  return error instanceof Error && 'code' in error && String((error as { code?: unknown }).code).startsWith('CAPABILITY_BUNDLE_')
}
