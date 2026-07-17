import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { unzipSync, zipSync } from 'fflate'
import type { CapabilityAuthoringDraft } from '@dudesign/contracts'
import { createCapabilityBundleArchive, parseCapabilityBundleArchive } from './capabilityBundleArchive.js'

describe('Capability Bundle ZIP archive', () => {
  it('round-trips every capability kind, HTML examples, and privacy-safe provenance', () => {
    const archive = createCapabilityBundleArchive({
      draft: fixtureDraft(),
      htmlExamples: [{ templateIndex: 0, exampleIndex: 0, html: '<!doctype html><html><body><main>Example</main></body></html>' }],
      bundleId: 'capbundle_roundtrip',
      createdAt: '2026-07-13T00:00:00.000Z',
      licenseDeclaration: 'user_owned_or_authorized',
      licenseNotes: 'Created by owner@example.com from /Users/owner/private/example.html',
    })

    const parsed = parseCapabilityBundleArchive(archive.body)

    assert.equal(parsed.manifest.counts.templatePacks, 1)
    assert.equal(parsed.manifest.counts.skills, 1)
    assert.equal(parsed.manifest.counts.interactionParadigms, 1)
    assert.equal(parsed.manifest.counts.dataContracts, 1)
    assert.equal(parsed.manifest.counts.reviewProfiles, 1)
    assert.equal(parsed.manifest.counts.htmlExamples, 1)
    assert.equal(parsed.htmlExamples[0]?.html.includes('Example'), true)
    assert.equal(parsed.portableDraft.skills[0]?.name, 'Summary guidance')
    assert.equal(parsed.provenance.privacy.ownerIdentityIncluded, false)
    assert.equal(parsed.provenance.license.notes?.includes('owner@example.com'), false)
    assert.equal(parsed.portableDraft.templatePacks[0]?.sourceEvidence[0]?.sourcePath, '[redacted-path]')
  })

  it('rejects a file whose body no longer matches the manifest hash', () => {
    const archive = createCapabilityBundleArchive({
      draft: fixtureDraft(),
      htmlExamples: [{ templateIndex: 0, exampleIndex: 0, html: '<main>Original</main>' }],
      bundleId: 'capbundle_tamper',
      createdAt: '2026-07-13T00:00:00.000Z',
      licenseDeclaration: 'unspecified',
      licenseNotes: null,
    })
    const files = unzipSync(archive.body)
    files['examples/template-001/example-001.html'] = new TextEncoder().encode('<main>Tampered</main>')

    assert.throws(
      () => parseCapabilityBundleArchive(zipSync(files)),
      error => (error as { code?: string }).code === 'CAPABILITY_BUNDLE_HASH_MISMATCH',
    )
  })

  it('rejects undeclared archive entries', () => {
    const archive = createCapabilityBundleArchive({
      draft: fixtureDraft(),
      htmlExamples: [],
      bundleId: 'capbundle_extra',
      createdAt: '2026-07-13T00:00:00.000Z',
      licenseDeclaration: 'unspecified',
      licenseNotes: null,
    })
    const files = unzipSync(archive.body)
    files['extra.txt'] = new TextEncoder().encode('not declared')

    assert.throws(
      () => parseCapabilityBundleArchive(zipSync(files)),
      error => (error as { code?: string }).code === 'CAPABILITY_BUNDLE_UNDECLARED_FILE',
    )
  })
})

function fixtureDraft(): CapabilityAuthoringDraft {
  const now = '2026-07-13T00:00:00.000Z'
  return {
    id: 'cad_bundle_fixture',
    ownerUserId: 'usr_private',
    workspaceId: 'ws_private',
    source: { type: 'manual', createdByUserId: 'usr_private', contentHash: 'sha256:source' },
    status: 'ready',
    candidateBundle: {
      templatePacks: [{
        schemaVersion: 'dudesign-template-draft.v2',
        name: 'Portable knowledge card',
        description: 'A complete portable template.',
        designTokens: { colors: { surface: '#fff' }, typography: {}, spacing: {}, rounded: {}, components: {} },
        rationale: { overview: null, colors: null, typography: null, layout: null, elevation: null, shapes: null, components: null, dos: [], donts: [], sections: {} },
        responsiveRules: [],
        sectionBlueprints: [],
        componentBlueprints: [],
        interactionParadigmIds: [],
        htmlExamples: [],
        sourceEvidence: [{ sourcePath: '/Users/owner/private/example.html', sourceExcerpt: 'owner@example.com', targetPath: 'templatePacks[0]', extractionMethod: 'user_confirmed', confidence: 1 }],
        confidence: { template: 1 },
      }],
      skills: [{ schemaVersion: 'dudesign-skill-draft.v1', name: 'Summary guidance', description: 'Guide concise summaries.', category: 'content', rules: ['Summarize facts.'], promptBlocks: [], negativeRules: [], qualityChecklist: ['Facts are visible.'], allowedTemplateCategories: ['knowledge'], requestedScopes: ['readonly_context'], safetyLevel: 'safe' }],
      interactionParadigms: [{ schemaVersion: 'dudesign-interaction-draft.v1', name: 'Expandable facts', category: 'disclosure', description: 'Expand details.', bestFor: ['dense facts'], avoidFor: [], requiredDataShape: [], sourceEvidence: [] }],
      dataContracts: [{ schemaVersion: 'dudesign-data-contract-draft.v1', name: 'Entry facts', description: 'Fact fields.', jsonSchema: { type: 'object' }, requiredFields: ['title'], sourceEvidence: [] }],
      reviewProfiles: [{ schemaVersion: 'dudesign-review-profile-draft.v1', name: 'Fact review', description: 'Check fact integrity.', rules: [{ id: 'review_fact', severity: 'error', description: 'Facts need evidence.', evidenceRequired: true }], sourceEvidence: [] }],
      recommendedCapabilityProfile: { templateDraftIndexes: [0], skillDraftIndexes: [0], interactionDraftIndexes: [0], dataContractDraftIndexes: [0], reviewProfileDraftIndexes: [0] },
    },
    findings: [],
    confirmedPaths: [],
    publishedTemplateId: null,
    createdAt: now,
    updatedAt: now,
  }
}
