import { createHash } from 'node:crypto'
import type {
  DesignTemplateDraftV2,
  DesignTemplatePack,
  DesignTemplatePackExportDocument,
  PortableDesignTemplatePack,
} from '@dudesign/contracts'

export const DESIGN_TEMPLATE_PACK_EXPORT_SCHEMA_VERSION = '2026-07-13.dudesign-template-pack-export.v1' as const

const omittedFields = [
  'id',
  'source',
  'visibility',
  'status',
  'previewArtifactId',
  'createdByUserId',
  'htmlExamples',
]

export function exportPortableDesignTemplatePack(
  pack: DesignTemplatePack,
  exportedAt: string,
): DesignTemplatePackExportDocument {
  const template: PortableDesignTemplatePack = {
    schemaVersion: pack.schemaVersion,
    ...(pack.parentPackId !== undefined && { parentPackId: pack.parentPackId }),
    ...(pack.templateRole !== undefined && { templateRole: pack.templateRole }),
    ...(pack.supportedProductModes !== undefined && { supportedProductModes: [...pack.supportedProductModes] }),
    ...(pack.supportedEntryCategories !== undefined && { supportedEntryCategories: [...pack.supportedEntryCategories] }),
    format: pack.format,
    name: pack.name,
    description: pack.description,
    version: pack.version,
    designTokens: structuredClone(pack.designTokens),
    rationale: structuredClone(pack.rationale),
    lintStatus: pack.lintStatus,
  }
  return {
    schemaVersion: DESIGN_TEMPLATE_PACK_EXPORT_SCHEMA_VERSION,
    manifest: {
      format: 'dudesign-template-pack-json',
      contentHash: portableTemplateHash(template),
      exportedAt,
      sourceTemplateId: pack.id,
      sourceTemplateVersion: pack.version,
      examplesIncluded: false,
      omittedFields: [...omittedFields],
    },
    template,
  }
}

export function importPortableDesignTemplatePack(
  document: DesignTemplatePackExportDocument,
): { template: PortableDesignTemplatePack; draft: DesignTemplateDraftV2 } {
  if (!isPortableExportDocument(document)) {
    throw portableError('INVALID_TEMPLATE_PACK_EXPORT', 'Template Pack JSON export document has an invalid shape or schema version.')
  }
  const actualHash = portableTemplateHash(document.template)
  if (actualHash !== document.manifest.contentHash) {
    throw portableError('TEMPLATE_PACK_HASH_MISMATCH', 'Template Pack JSON content hash does not match its manifest.')
  }
  return {
    template: structuredClone(document.template),
    draft: portableTemplateToDraft(document.template, document.manifest.contentHash),
  }
}

export function portableTemplateToDraft(
  template: PortableDesignTemplatePack,
  contentHash: string,
): DesignTemplateDraftV2 {
  const sectionBlueprints = Object.entries(template.rationale.sections).map(([name, content], index) => ({
    id: `section_imported_${String(index + 1).padStart(2, '0')}`,
    name,
    role: 'imported_section',
    order: index,
    required: index === 0,
    layout: content || null,
    evidencePaths: [`template.rationale.sections.${name}`],
  }))
  const componentBlueprints = Object.keys(template.designTokens.components).map((name, index) => ({
    id: `component_imported_${String(index + 1).padStart(2, '0')}`,
    name,
    role: 'imported_component',
    repeatable: false,
    states: [],
    interactionParadigmIds: [],
    evidencePaths: [`template.designTokens.components.${name}`],
  }))
  return {
    schemaVersion: 'dudesign-template-draft.v2',
    name: template.name,
    description: template.description,
    designTokens: structuredClone(template.designTokens),
    rationale: structuredClone(template.rationale),
    responsiveRules: [],
    sectionBlueprints,
    componentBlueprints,
    interactionParadigmIds: [],
    htmlExamples: [],
    sourceEvidence: [{
      sourcePath: 'template',
      sourceExcerpt: `${template.name} ${template.version}`,
      targetPath: 'templatePacks[0]',
      extractionMethod: 'deterministic',
      confidence: 1,
    }],
    confidence: {
      designTokens: 1,
      rationale: 1,
      portableContentHash: contentHash ? 1 : 0,
    },
  }
}

export function portableTemplateHash(template: PortableDesignTemplatePack): string {
  return `sha256:${createHash('sha256').update(stableStringify(template)).digest('hex')}`
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function isPortableExportDocument(value: unknown): value is DesignTemplatePackExportDocument {
  if (!value || typeof value !== 'object') return false
  const document = value as Partial<DesignTemplatePackExportDocument>
  if (document.schemaVersion !== DESIGN_TEMPLATE_PACK_EXPORT_SCHEMA_VERSION) return false
  if (!document.manifest || !document.template) return false
  return document.manifest.format === 'dudesign-template-pack-json'
    && typeof document.manifest.contentHash === 'string'
    && typeof document.manifest.sourceTemplateId === 'string'
    && typeof document.manifest.sourceTemplateVersion === 'string'
    && document.manifest.examplesIncluded === false
    && typeof document.template.name === 'string'
    && typeof document.template.version === 'string'
    && Boolean(document.template.designTokens)
    && Boolean(document.template.rationale)
}

function portableError(code: string, message: string): Error & { status: number; code: string } {
  const error = new Error(message) as Error & { status: number; code: string }
  error.status = 400
  error.code = code
  return error
}
