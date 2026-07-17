import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { LocalArtifactStore } from '@dudesign/artifact-store'
import type { CapabilityBundleDraft } from '@dudesign/contracts'
import type { RequestContext } from '../auth.js'
import { InMemoryStore } from '../store.js'
import { CapabilityAuthoringApplicationService } from './capabilityAuthoringApplicationService.js'

describe('CapabilityAuthoringApplicationService', () => {
  let rootDir: string
  let store: InMemoryStore
  let artifacts: LocalArtifactStore
  let service: CapabilityAuthoringApplicationService

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'dudesign-capability-authoring-'))
    store = new InMemoryStore()
    artifacts = new LocalArtifactStore({ rootDir })
    service = new CapabilityAuthoringApplicationService(store, artifacts)
  })

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  it('freezes a variation HTML source from repository facts', async () => {
    const fixture = await createVariationFixture(store)

    const result = await service.createDraft(ownerContext(store), {
      workspaceId: store.devWorkspace.id,
      source: {
        type: 'variation_artifact',
        variationId: fixture.variationId,
        artifactId: fixture.artifactId,
      },
    })

    assert.deepEqual(result.draft.source, {
      type: 'variation_artifact',
      variationId: fixture.variationId,
      artifactId: fixture.artifactId,
      artifactVersion: 3,
      contentHash: 'sha256:authoring-html-v3',
    })
    assert.equal(result.draft.status, 'analyzing')
  })

  it('rejects source artifacts from another workspace', async () => {
    const fixture = await createVariationFixture(store)

    await assert.rejects(
      () => service.createDraft(ownerContext(store), {
        workspaceId: store.altWorkspace.id,
        source: {
          type: 'variation_artifact',
          variationId: fixture.variationId,
          artifactId: fixture.artifactId,
        },
      }),
      error => hasErrorCode(error, 403, 'WORKSPACE_FORBIDDEN'),
    )
  })

  it('lints candidate bundles and advances confirmed drafts to preview pending', async () => {
    const created = await service.createDraft(ownerContext(store), {
      workspaceId: store.devWorkspace.id,
      source: {
        type: 'manual',
        contentHash: 'sha256:manual-authoring',
      },
      candidateBundle: templateBundle(),
    })
    assert.equal(created.draft.status, 'needs_confirmation')

    const updated = await service.updateDraft(ownerContext(store), created.draft.id, {
      workspaceId: store.devWorkspace.id,
      confirmedPaths: ['templatePacks[0].designTokens.colors.surface'],
    })
    assert.equal(updated.draft.status, 'preview_pending')
    assert.deepEqual(updated.draft.confirmedPaths, ['templatePacks[0].designTokens.colors.surface'])
  })

  it('keeps drafts private to their owner even inside a workspace query', async () => {
    const created = await service.createDraft(ownerContext(store), {
      workspaceId: store.devWorkspace.id,
      source: {
        type: 'manual',
        contentHash: 'sha256:private-authoring',
      },
    })

    await assert.rejects(
      () => service.getDraft(userContext(store.altUser.id), created.draft.id, store.devWorkspace.id),
      error => hasErrorCode(error, 403, 'WORKSPACE_FORBIDDEN'),
    )
  })

  it('analyzes frozen HTML and CSS artifacts into a non-empty template draft', async () => {
    const fixture = await createVariationFixture(store)
    const htmlResult = await artifacts.put({
      workspaceId: store.devWorkspace.id,
      artifactId: fixture.artifactId,
      relativePath: 'index.html',
      contentType: 'text/html; charset=utf-8',
      body: '<main><section class="hero"><h1>Knowledge card</h1></section><section class="card-grid"><article class="fact-card">A</article><article class="fact-card">B</article></section></main>',
    })
    const htmlArtifact = await store.getArtifactById(fixture.artifactId)
    assert.ok(htmlArtifact)
    await store.saveArtifact({
      ...htmlArtifact,
      version: 3,
      storageKey: htmlResult.storageKey,
      contentHash: htmlResult.contentHash,
      sizeBytes: htmlResult.sizeBytes,
    })
    const cssArtifact = await store.createArtifact({
      workspaceId: store.devWorkspace.id,
      sessionId: fixture.sessionId,
      variationId: fixture.variationId,
      parentArtifactId: fixture.artifactId,
      kind: 'asset',
      version: 3,
      storageKey: `${store.devWorkspace.id}/artifacts/pending/styles/app.css`,
      entryPath: 'styles/app.css',
      contentHash: 'sha256:pending',
      sizeBytes: 0,
    })
    const cssResult = await artifacts.put({
      workspaceId: store.devWorkspace.id,
      artifactId: cssArtifact.id,
      relativePath: 'styles/app.css',
      contentType: 'text/css; charset=utf-8',
      body: ':root{--surface:#fff;--accent:#2454ff;--space-md:16px}.fact-card{padding:16px;border-radius:8px}@media(max-width:600px){.card-grid{display:block}}',
    })
    await store.saveArtifact({
      ...cssArtifact,
      storageKey: cssResult.storageKey,
      contentHash: cssResult.contentHash,
      sizeBytes: cssResult.sizeBytes,
    })
    const created = await service.createDraft(ownerContext(store), {
      workspaceId: store.devWorkspace.id,
      source: {
        type: 'variation_artifact',
        variationId: fixture.variationId,
        artifactId: fixture.artifactId,
      },
    })

    const analyzed = await service.analyzeDraft(
      ownerContext(store),
      created.draft.id,
      store.devWorkspace.id,
    )
    const template = analyzed.draft.candidateBundle.templatePacks[0]
    assert.ok(template)
    assert.ok(Object.keys(template.designTokens.colors).length > 0)
    assert.ok(template.sectionBlueprints.length > 0)
    assert.ok(template.componentBlueprints.some(component => component.repeatable))
    assert.equal(template.htmlExamples[0]?.artifactId, fixture.artifactId)
    assert.equal(analyzed.draft.status, 'needs_confirmation')
  })

  it('sanitizes the HTML example into a separate artifact and passes static preview smoke', async () => {
    const fixture = await createVariationFixture(store)
    const htmlResult = await artifacts.put({
      workspaceId: store.devWorkspace.id,
      artifactId: fixture.artifactId,
      relativePath: 'index.html',
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><head><title>Safe template</title><style>
        :root{--surface:#fff;--accent:#2454ff}.card{padding:16px;border-radius:8px}
      </style></head><body><main><section class="hero"><h1>Reusable knowledge template</h1><p>Clear factual summary with enough visible content for preview.</p></section><section><article class="card">Fact A</article><article class="card">Fact B</article></section></main></body></html>`,
    })
    await updateFixtureHtmlArtifact(store, fixture.artifactId, htmlResult)
    const created = await service.createDraft(ownerContext(store), {
      workspaceId: store.devWorkspace.id,
      source: {
        type: 'variation_artifact',
        variationId: fixture.variationId,
        artifactId: fixture.artifactId,
      },
    })
    const analyzed = await service.analyzeDraft(ownerContext(store), created.draft.id, store.devWorkspace.id)
    await service.updateDraft(ownerContext(store), created.draft.id, {
      workspaceId: store.devWorkspace.id,
      confirmedPaths: analyzed.draft.candidateBundle.templatePacks.flatMap(template =>
        template.sourceEvidence.map(item => item.targetPath),
      ),
    })
    const sanitized = await service.sanitizeDraft(ownerContext(store), created.draft.id, store.devWorkspace.id)
    const sanitizedExample = sanitized.draft.candidateBundle.templatePacks[0]?.htmlExamples[0]
    assert.equal(sanitizedExample?.sanitizationStatus, 'passed')
    assert.match(sanitizedExample?.sanitization?.sanitizedContentHash ?? '', /^sha256:/)
    assert.ok(sanitizedExample?.sanitizedArtifactId)
    const sanitizedArtifact = await store.getArtifactById(sanitizedExample!.sanitizedArtifactId!)
    assert.equal(sanitizedArtifact?.parentArtifactId, fixture.artifactId)
    const sanitizedAgain = await service.sanitizeDraft(ownerContext(store), created.draft.id, store.devWorkspace.id)
    assert.equal(
      sanitizedAgain.draft.candidateBundle.templatePacks[0]?.htmlExamples[0]?.sanitizedArtifactId,
      sanitizedExample?.sanitizedArtifactId,
    )

    const previewed = await service.previewDraft(ownerContext(store), created.draft.id, store.devWorkspace.id)
    const preview = previewed.draft.candidateBundle.templatePacks[0]?.htmlExamples[0]?.previewSmoke
    assert.equal(preview?.staticStatus, 'pass')
    assert.equal(preview?.pixelStatus, 'not_run')
    assert.equal(preview?.status, 'passed')
    assert.equal(previewed.draft.status, 'ready')
  })

  it('blocks preview until HTML sanitization has passed', async () => {
    const created = await service.createDraft(ownerContext(store), {
      workspaceId: store.devWorkspace.id,
      source: { type: 'manual', contentHash: 'sha256:no-preview' },
      candidateBundle: templateBundle(),
    })
    await assert.rejects(
      () => service.previewDraft(ownerContext(store), created.draft.id, store.devWorkspace.id),
      error => hasErrorCode(error, 409, 'CAPABILITY_DRAFT_NOT_SANITIZED'),
    )
  })

  it('keeps sanitizer warnings visible for human confirmation after producing a safe artifact', async () => {
    const fixture = await createVariationFixture(store)
    const htmlResult = await artifacts.put({
      workspaceId: store.devWorkspace.id,
      artifactId: fixture.artifactId,
      relativePath: 'index.html',
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><body><script src="https://cdn.example.com/app.js"></script><main onclick="run()"><h1>Reusable template with enough visible text</h1><p>owner@example.com api_key=sk-test-secret-123456</p></main></body></html>',
    })
    await updateFixtureHtmlArtifact(store, fixture.artifactId, htmlResult)
    const created = await service.createDraft(ownerContext(store), {
      workspaceId: store.devWorkspace.id,
      source: { type: 'variation_artifact', variationId: fixture.variationId, artifactId: fixture.artifactId },
    })
    await service.analyzeDraft(ownerContext(store), created.draft.id, store.devWorkspace.id)
    const sanitized = await service.sanitizeDraft(ownerContext(store), created.draft.id, store.devWorkspace.id)

    assert.equal(sanitized.draft.candidateBundle.templatePacks[0]?.htmlExamples[0]?.sanitizationStatus, 'passed')
    assert.equal(sanitized.draft.status, 'needs_confirmation')
    assert.ok(sanitized.draft.findings.some(finding => finding.code === 'html_example.script_removed'))
    assert.ok(sanitized.draft.findings.some(finding => finding.code === 'html_example.sensitive_text_redacted'))
  })

  it('does not become ready while extracted evidence is still unconfirmed', async () => {
    const fixture = await createVariationFixture(store)
    const htmlResult = await artifacts.put({
      workspaceId: store.devWorkspace.id,
      artifactId: fixture.artifactId,
      relativePath: 'index.html',
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><head><title>Unconfirmed</title><style>:root{--surface:#fff}.card{padding:16px}</style></head><body><main><h1>Reusable template draft</h1><p>Enough visible content for the static quality gate to pass.</p><article class="card">Fact</article></main></body></html>',
    })
    await updateFixtureHtmlArtifact(store, fixture.artifactId, htmlResult)
    const created = await service.createDraft(ownerContext(store), {
      workspaceId: store.devWorkspace.id,
      source: { type: 'variation_artifact', variationId: fixture.variationId, artifactId: fixture.artifactId },
    })
    await service.analyzeDraft(ownerContext(store), created.draft.id, store.devWorkspace.id)
    await service.sanitizeDraft(ownerContext(store), created.draft.id, store.devWorkspace.id)
    const previewed = await service.previewDraft(ownerContext(store), created.draft.id, store.devWorkspace.id)

    assert.equal(previewed.draft.candidateBundle.templatePacks[0]?.htmlExamples[0]?.previewSmoke?.status, 'passed')
    assert.equal(previewed.draft.status, 'needs_confirmation')
  })

  it('publishes a ready draft as an immutable private template and audits the action', async () => {
    const ready = await createReadyDraftFixture({ store, artifacts, service })
    const published = await service.publishPrivateDraft(ownerContext(store), ready.draftId, {
      workspaceId: store.devWorkspace.id,
      name: 'Published private authoring template',
    })

    assert.equal(published.draft.status, 'published_private')
    assert.equal(published.draft.publishedTemplateId, published.template.id)
    assert.equal(published.template.source, 'user')
    assert.equal(published.template.visibility, 'private')
    assert.equal(published.template.status, 'published')
    assert.equal(published.template.version, '1.0.0')
    assert.equal(published.template.createdByUserId, store.devUser.id)
    const publishedHtmlExample = requireInlineHtml(
      published.template.htmlExamples?.[0],
      'published template must contain inline HTML',
    )
    assert.ok(publishedHtmlExample.includes('Reusable publish template'))
    assert.doesNotMatch(publishedHtmlExample, /<script\b/i)
    assert.equal(published.audit.action, 'capability.template.published_private')
    assert.equal(published.audit.metadata.draftId, ready.draftId)
    assert.equal((await store.getDesignTemplatePackVersion(
      published.template.id,
      '1.0.0',
      store.devUser.id,
      store.devWorkspace.id,
    ))?.pack.name, 'Published private authoring template')

    await assert.rejects(
      () => service.publishPrivateDraft(ownerContext(store), ready.draftId, {
        workspaceId: store.devWorkspace.id,
      }),
      error => hasErrorCode(error, 409, 'CAPABILITY_DRAFT_NOT_READY'),
    )
  })

  it('exports and imports a governed capability bundle with all capability kinds and HTML examples', async () => {
    const ready = await createReadyDraftFixture({ store, artifacts, service })
    const current = await service.getDraft(ownerContext(store), ready.draftId, store.devWorkspace.id)
    const enrichedBundle: CapabilityBundleDraft = {
      ...current.draft.candidateBundle,
      skills: [{
        schemaVersion: 'dudesign-skill-draft.v1',
        name: 'Knowledge summary guidance',
        description: 'Generate concise fact summaries.',
        category: 'content',
        rules: ['Keep facts concise.'],
        promptBlocks: [],
        negativeRules: [],
        qualityChecklist: ['Summary is visible.'],
        allowedTemplateCategories: ['knowledge'],
        requestedScopes: ['readonly_context'],
        safetyLevel: 'safe',
      }],
      interactionParadigms: [{
        schemaVersion: 'dudesign-interaction-draft.v1',
        name: 'Expandable facts',
        category: 'disclosure',
        description: 'Reveal secondary details.',
        bestFor: ['dense facts'],
        avoidFor: [],
        requiredDataShape: ['facts[]'],
        sourceEvidence: [],
      }],
      dataContracts: [{
        schemaVersion: 'dudesign-data-contract-draft.v1',
        name: 'Entry facts',
        description: 'Fact payload.',
        jsonSchema: { type: 'object' },
        requiredFields: ['title'],
        sourceEvidence: [],
      }],
      reviewProfiles: [{
        schemaVersion: 'dudesign-review-profile-draft.v1',
        name: 'Fact review',
        description: 'Validate evidence.',
        rules: [{ id: 'fact_source', severity: 'error', description: 'Facts require sources.', evidenceRequired: true }],
        sourceEvidence: [],
      }],
      recommendedCapabilityProfile: {
        templateDraftIndexes: [0],
        skillDraftIndexes: [0],
        interactionDraftIndexes: [0],
        dataContractDraftIndexes: [0],
        reviewProfileDraftIndexes: [0],
      },
    }
    const stored = store.capabilityAuthoringDrafts.get(ready.draftId)
    assert.ok(stored)
    store.capabilityAuthoringDrafts.set(ready.draftId, { ...stored, candidateBundle: enrichedBundle })

    const exported = await service.exportCapabilityBundle(ownerContext(store), ready.draftId, {
      workspaceId: store.devWorkspace.id,
      licenseDeclaration: 'user_owned_or_authorized',
    })
    const imported = await service.importCapabilityBundleDraft(ownerContext(store), {
      workspaceId: store.devWorkspace.id,
      bundleBase64: Buffer.from(exported.body).toString('base64'),
    })

    assert.equal(imported.draft.source.type, 'capability_bundle_zip')
    assert.equal(imported.draft.candidateBundle.skills[0]?.name, 'Knowledge summary guidance')
    assert.equal(imported.draft.candidateBundle.interactionParadigms[0]?.name, 'Expandable facts')
    assert.equal(imported.draft.candidateBundle.dataContracts[0]?.name, 'Entry facts')
    assert.equal(imported.draft.candidateBundle.reviewProfiles[0]?.name, 'Fact review')
    const importedExample = imported.draft.candidateBundle.templatePacks[0]?.htmlExamples[0]
    assert.equal(importedExample?.sanitizationStatus, 'passed')
    assert.ok(importedExample?.authoringAssetId)
    assert.equal((await store.listCapabilityAuthoringAssets(imported.draft.id, store.devUser.id, store.devWorkspace.id)).length, 1)

    const confirmed = await service.updateDraft(ownerContext(store), imported.draft.id, {
      workspaceId: store.devWorkspace.id,
      confirmedPaths: imported.draft.candidateBundle.templatePacks.flatMap(template => template.sourceEvidence.map(item => item.targetPath)),
    })
    assert.notEqual(confirmed.draft.status, 'lint_failed')
    const previewed = await service.previewDraft(ownerContext(store), imported.draft.id, store.devWorkspace.id)
    assert.equal(previewed.draft.candidateBundle.templatePacks[0]?.htmlExamples[0]?.previewSmoke?.status, 'passed')
  })

  it('rolls a private template back by creating a new version without mutating history', async () => {
    const ready = await createReadyDraftFixture({ store, artifacts, service })
    const published = await service.publishPrivateDraft(ownerContext(store), ready.draftId, {
      workspaceId: store.devWorkspace.id,
      name: 'Rollback template v1',
    })
    await store.saveDesignTemplatePack({
      ...published.template,
      name: 'Rollback template v2',
      version: '1.0.1',
      designTokens: {
        ...published.template.designTokens,
        colors: { ...published.template.designTokens.colors, accent: '#ff0000' },
      },
    })

    const rolledBack = await service.rollbackPrivateTemplate(ownerContext(store), published.template.id, {
      workspaceId: store.devWorkspace.id,
      sourceVersion: '1.0.0',
      reason: 'Restore reviewed initial direction.',
    })

    assert.equal(rolledBack.rolledBackFromVersion, '1.0.1')
    assert.equal(rolledBack.restoredSourceVersion, '1.0.0')
    assert.equal(rolledBack.template.version, '1.0.2')
    assert.equal(rolledBack.template.name, 'Rollback template v1')
    assert.equal(rolledBack.audit.action, 'capability.template.rolled_back')
    assert.equal((await store.getDesignTemplatePackVersion(
      published.template.id,
      '1.0.0',
      store.devUser.id,
      store.devWorkspace.id,
    ))?.pack.name, 'Rollback template v1')
    assert.equal((await store.getDesignTemplatePackVersion(
      published.template.id,
      '1.0.1',
      store.devUser.id,
      store.devWorkspace.id,
    ))?.pack.name, 'Rollback template v2')
    assert.equal((await store.getDesignTemplatePackVersion(
      published.template.id,
      '1.0.2',
      store.devUser.id,
      store.devWorkspace.id,
    ))?.pack.name, 'Rollback template v1')

    await assert.rejects(
      () => service.rollbackPrivateTemplate(ownerContext(store), published.template.id, {
        workspaceId: store.devWorkspace.id,
        sourceVersion: '1.0.2',
      }),
      error => hasErrorCode(error, 409, 'DESIGN_TEMPLATE_ALREADY_CURRENT'),
    )
    await assert.rejects(
      () => service.rollbackPrivateTemplate(userContext(store.altUser.id), published.template.id, {
        workspaceId: store.altWorkspace.id,
        sourceVersion: '1.0.0',
      }),
      error => hasErrorCode(error, 404, 'DESIGN_TEMPLATE_NOT_FOUND'),
    )
  })

  it('exports DESIGN.md and portable JSON and imports both back into governed drafts', async () => {
    const ready = await createReadyDraftFixture({ store, artifacts, service })
    const published = await service.publishPrivateDraft(ownerContext(store), ready.draftId, {
      workspaceId: store.devWorkspace.id,
      name: 'Round trip private template',
    })

    const jsonDownload = await service.exportTemplatePackJson(
      ownerContext(store),
      published.template.id,
      store.devWorkspace.id,
    )
    const jsonDocument = JSON.parse(new TextDecoder().decode(jsonDownload.body))
    const importedJson = await service.importTemplatePackJsonDraft(ownerContext(store), {
      workspaceId: store.devWorkspace.id,
      document: jsonDocument,
    })
    const jsonDraft = importedJson.draft.candidateBundle.templatePacks[0]
    assert.equal(importedJson.draft.source.type, 'template_pack_json')
    assert.equal(importedJson.draft.status, 'needs_confirmation')
    assert.deepEqual(jsonDraft?.designTokens, published.template.designTokens)
    assert.deepEqual(jsonDraft?.rationale, published.template.rationale)
    assert.equal(jsonDraft?.htmlExamples.length, 0)
    assert.ok(importedJson.draft.findings.some(finding => finding.code === 'template_pack.html_examples_not_portable'))

    const designMdDownload = await service.exportTemplateDesignMd(
      ownerContext(store),
      published.template.id,
      store.devWorkspace.id,
    )
    const designMd = new TextDecoder().decode(designMdDownload.body)
    const importedDesignMd = await service.importDesignMdDraft(ownerContext(store), {
      workspaceId: store.devWorkspace.id,
      designMd,
    })
    const designMdDraft = importedDesignMd.draft.candidateBundle.templatePacks[0]
    assert.equal(importedDesignMd.draft.source.type, 'design_md')
    assert.equal(designMdDraft?.name, published.template.name)
    assert.deepEqual(designMdDraft?.designTokens.colors, published.template.designTokens.colors)
    assert.deepEqual(designMdDraft?.designTokens.spacing, published.template.designTokens.spacing)

    const auditActions = store.listAuditLogs({ limit: 20 }).map(audit => audit.action)
    assert.ok(auditActions.includes('capability.template.exported_json'))
    assert.ok(auditActions.includes('capability.template.exported_design_md'))
    assert.ok(auditActions.includes('capability.template.imported_json_draft'))
    assert.ok(auditActions.includes('capability.template.imported_design_md_draft'))

    jsonDocument.template.name = 'Tampered portable template'
    await assert.rejects(
      () => service.importTemplatePackJsonDraft(ownerContext(store), {
        workspaceId: store.devWorkspace.id,
        document: jsonDocument,
      }),
      error => hasErrorCode(error, 400, 'TEMPLATE_PACK_HASH_MISMATCH'),
    )
  })

  it('does not export another user private template', async () => {
    const ready = await createReadyDraftFixture({ store, artifacts, service })
    const published = await service.publishPrivateDraft(ownerContext(store), ready.draftId, {
      workspaceId: store.devWorkspace.id,
    })
    await assert.rejects(
      () => service.exportTemplatePackJson(
        userContext(store.altUser.id),
        published.template.id,
        store.altWorkspace.id,
      ),
      error => hasErrorCode(error, 404, 'DESIGN_TEMPLATE_NOT_FOUND'),
    )
  })
})

function requireInlineHtml(value: unknown, message: string): string {
  if (typeof value !== 'string') throw new TypeError(message)
  return value
}

async function createReadyDraftFixture(input: {
  store: InMemoryStore
  artifacts: LocalArtifactStore
  service: CapabilityAuthoringApplicationService
}) {
  const fixture = await createVariationFixture(input.store)
  const htmlResult = await input.artifacts.put({
    workspaceId: input.store.devWorkspace.id,
    artifactId: fixture.artifactId,
    relativePath: 'index.html',
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><html><head><title>Publish template</title><style>:root{--surface:#fff;--accent:#2454ff}.card{padding:16px}</style></head><body><main><h1>Reusable publish template</h1><p>Reviewed visible content for private template publication.</p><article class="card">Fact A</article><article class="card">Fact B</article></main></body></html>',
  })
  await updateFixtureHtmlArtifact(input.store, fixture.artifactId, htmlResult)
  const created = await input.service.createDraft(ownerContext(input.store), {
    workspaceId: input.store.devWorkspace.id,
    source: { type: 'variation_artifact', variationId: fixture.variationId, artifactId: fixture.artifactId },
  })
  const analyzed = await input.service.analyzeDraft(ownerContext(input.store), created.draft.id, input.store.devWorkspace.id)
  await input.service.updateDraft(ownerContext(input.store), created.draft.id, {
    workspaceId: input.store.devWorkspace.id,
    confirmedPaths: analyzed.draft.candidateBundle.templatePacks.flatMap(template =>
      template.sourceEvidence.map(item => item.targetPath),
    ),
  })
  await input.service.sanitizeDraft(ownerContext(input.store), created.draft.id, input.store.devWorkspace.id)
  const previewed = await input.service.previewDraft(ownerContext(input.store), created.draft.id, input.store.devWorkspace.id)
  assert.equal(previewed.draft.status, 'ready')
  return { draftId: created.draft.id, fixture }
}

async function updateFixtureHtmlArtifact(
  store: InMemoryStore,
  artifactId: string,
  stored: { storageKey: string; contentHash: string; sizeBytes: number },
) {
  const artifact = await store.getArtifactById(artifactId)
  assert.ok(artifact)
  await store.saveArtifact({
    ...artifact,
    version: 3,
    storageKey: stored.storageKey,
    contentHash: stored.contentHash,
    sizeBytes: stored.sizeBytes,
  })
}

async function createVariationFixture(
  store: InMemoryStore,
) {
  const session = await store.createSession({
    userId: store.devUser.id,
    workspaceId: store.devWorkspace.id,
    mode: 'new_html',
  })
  const job = await store.createJob({
    session,
    prompt: 'Authoring fixture',
    sourceMode: 'new_html',
    variationCount: 1,
    templateRequirements: {},
  })
  const [variation] = await store.createVariations({ job, count: 1 })
  const artifact = await store.createMockArtifact({
    artifactId: 'art_authoring_html',
    workspaceId: store.devWorkspace.id,
    sessionId: session.id,
    variationId: variation!.id,
    entryPath: 'index.html',
  })
  await store.saveArtifact({
    ...artifact,
    version: 3,
    storageKey: `${store.devWorkspace.id}/artifacts/${artifact.id}/index.html`,
    contentHash: 'sha256:authoring-html-v3',
    sizeBytes: 128,
  })
  return { sessionId: session.id, variationId: variation!.id, artifactId: artifact.id }
}

function templateBundle(): CapabilityBundleDraft {
  return {
    templatePacks: [{
      schemaVersion: 'dudesign-template-draft.v2',
      name: 'Authoring template',
      description: null,
      designTokens: {
        colors: { surface: '#ffffff' },
        typography: {},
        spacing: { md: 16 },
        rounded: {},
        components: {},
      },
      rationale: {
        overview: null,
        colors: null,
        typography: null,
        layout: null,
        elevation: null,
        shapes: null,
        components: null,
        dos: [],
        donts: [],
        sections: {},
      },
      responsiveRules: [],
      sectionBlueprints: [{
        id: 'section_summary',
        name: 'Summary',
        role: 'summary',
        order: 0,
        required: true,
        layout: 'single-column',
        evidencePaths: ['manual.summary'],
      }],
      componentBlueprints: [],
      interactionParadigmIds: [],
      htmlExamples: [],
      sourceEvidence: [{
        sourcePath: 'manual.colors.surface',
        sourceExcerpt: '#ffffff',
        targetPath: 'templatePacks[0].designTokens.colors.surface',
        extractionMethod: 'deterministic',
        confidence: 0.95,
      }],
      confidence: {
        'designTokens.colors.surface': 0.95,
      },
    }],
    skills: [],
    interactionParadigms: [],
    dataContracts: [],
    reviewProfiles: [],
    recommendedCapabilityProfile: {
      templateDraftIndexes: [0],
      skillDraftIndexes: [],
      interactionDraftIndexes: [],
      dataContractDraftIndexes: [],
      reviewProfileDraftIndexes: [],
    },
  }
}

function ownerContext(store: InMemoryStore): RequestContext {
  return userContext(store.devUser.id)
}

function userContext(userId: string): RequestContext {
  return {
    requestId: 'req_capability_authoring_test',
    userId,
    adminRole: null,
    authMode: 'dev',
  }
}

function hasErrorCode(error: unknown, status: number, code: string): boolean {
  const record = error as { status?: number; code?: string }
  return record.status === status && record.code === code
}
