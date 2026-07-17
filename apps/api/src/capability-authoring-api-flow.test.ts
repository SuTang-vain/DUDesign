import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type {
  CapabilityAuthoringDraftResponse,
  ListCapabilityAuthoringDraftsResponse,
  PublishCapabilityAuthoringDraftResponse,
  RollbackPrivateDesignTemplateResponse,
} from '@dudesign/contracts'
import { ApplicationService } from './service.js'
import { InMemoryStore } from './store.js'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'

describe('Capability authoring API flow', () => {
  let harness: ApiFlowHarness

  before(async () => {
    harness = await startApiFlowHarness(new ApplicationService({
      store: new InMemoryStore(),
      consumeQueue: false,
    }))
  })

  after(async () => {
    await harness.close()
  })

  it('creates, lists, updates, and lints a private manual draft', async () => {
    const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
    const created = await requestJson<CapabilityAuthoringDraftResponse>('/api/capability-authoring/drafts', {
      method: 'POST',
      body: {
        workspaceId: bootstrap.workspace.id,
        source: {
          type: 'manual',
          contentHash: 'sha256:api-authoring',
        },
      },
    })
    assert.equal(created.draft.status, 'analyzing')

    const listed = await getJson<ListCapabilityAuthoringDraftsResponse>(
      `/api/capability-authoring/drafts?workspaceId=${encodeURIComponent(bootstrap.workspace.id)}`,
    )
    assert.equal(listed.drafts.some(draft => draft.id === created.draft.id), true)

    const updated = await requestJson<CapabilityAuthoringDraftResponse>(
      `/api/capability-authoring/drafts/${created.draft.id}`,
      {
        method: 'PATCH',
        body: {
          workspaceId: bootstrap.workspace.id,
          candidateBundle: validBundle(),
          confirmedPaths: ['templatePacks[0].designTokens.colors.surface'],
        },
      },
    )
    assert.equal(updated.draft.status, 'preview_pending')

    const linted = await requestJson<CapabilityAuthoringDraftResponse>(
      `/api/capability-authoring/drafts/${created.draft.id}/lint`,
      {
        method: 'POST',
        body: {
          workspaceId: bootstrap.workspace.id,
        },
      },
    )
    assert.equal(linted.draft.status, 'preview_pending')

    const detail = await getJson<CapabilityAuthoringDraftResponse>(
      `/api/capability-authoring/drafts/${created.draft.id}?workspaceId=${encodeURIComponent(bootstrap.workspace.id)}`,
    )
    assert.equal(detail.draft.source.contentHash, 'sha256:api-authoring')
  })

  it('returns a client error for malformed authoring input', async () => {
    const response = await fetch(`${harness.baseUrl}/api/capability-authoring/drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: { type: 'manual' },
      }),
    })
    assert.equal(response.status, 400)
    const payload = await response.json() as { error: { code: string } }
    assert.equal(payload.error.code, 'INVALID_REQUEST')
  })

  it('analyzes a frozen variation artifact through the HTTP API', async () => {
    const store = harness.service.store
    const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
    const session = await store.createSession({
      userId: 'usr_dev',
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
    })
    const job = await store.createJob({
      session,
      prompt: 'API HTML extraction fixture',
      sourceMode: 'new_html',
      variationCount: 1,
      templateRequirements: {},
    })
    const [variation] = await store.createVariations({ job, count: 1 })
    const artifact = await store.createMockArtifact({
      workspaceId: bootstrap.workspace.id,
      sessionId: session.id,
      variationId: variation!.id,
      entryPath: 'index.html',
    })
    const stored = await harness.service.artifacts.put({
      workspaceId: bootstrap.workspace.id,
      artifactId: artifact.id,
      relativePath: 'index.html',
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><head><title>API extraction</title><style>:root{--surface:#fff;--space-md:16px}.card{padding:16px}@media(max-width:600px){.grid{display:block}}</style></head><body><main><section class="hero"><h1>Reusable capability template</h1><p>Visible summary content for deterministic preview quality validation.</p></section><section class="grid"><article class="card">Fact A</article><article class="card">Fact B</article></section></main></body></html>',
    })
    await store.saveArtifact({
      ...artifact,
      storageKey: stored.storageKey,
      contentHash: stored.contentHash,
      sizeBytes: stored.sizeBytes,
    })

    const created = await requestJson<CapabilityAuthoringDraftResponse>('/api/capability-authoring/drafts', {
      method: 'POST',
      body: {
        workspaceId: bootstrap.workspace.id,
        source: {
          type: 'variation_artifact',
          variationId: variation!.id,
          artifactId: artifact.id,
        },
      },
    })
    const analyzed = await requestJson<CapabilityAuthoringDraftResponse>(
      `/api/capability-authoring/drafts/${created.draft.id}/analyze`,
      {
        method: 'POST',
        body: { workspaceId: bootstrap.workspace.id },
      },
    )
    const template = analyzed.draft.candidateBundle.templatePacks[0]
    assert.ok(template)
    assert.ok(Object.keys(template.designTokens.colors).length > 0)
    assert.ok(template.sectionBlueprints.length > 0)
    assert.equal(template.htmlExamples[0]?.artifactId, artifact.id)

    await requestJson<CapabilityAuthoringDraftResponse>(
      `/api/capability-authoring/drafts/${created.draft.id}`,
      {
        method: 'PATCH',
        body: {
          workspaceId: bootstrap.workspace.id,
          confirmedPaths: analyzed.draft.candidateBundle.templatePacks.flatMap(pack =>
            pack.sourceEvidence.map(item => item.targetPath),
          ),
        },
      },
    )

    const sanitized = await requestJson<CapabilityAuthoringDraftResponse>(
      `/api/capability-authoring/drafts/${created.draft.id}/sanitize`,
      {
        method: 'POST',
        body: { workspaceId: bootstrap.workspace.id },
      },
    )
    const sanitizedExample = sanitized.draft.candidateBundle.templatePacks[0]?.htmlExamples[0]
    assert.equal(sanitizedExample?.sanitizationStatus, 'passed')
    assert.ok(sanitizedExample?.sanitizedArtifactId)

    const previewed = await requestJson<CapabilityAuthoringDraftResponse>(
      `/api/capability-authoring/drafts/${created.draft.id}/preview`,
      {
        method: 'POST',
        body: { workspaceId: bootstrap.workspace.id },
      },
    )
    assert.equal(previewed.draft.status, 'ready')
    assert.equal(previewed.draft.candidateBundle.templatePacks[0]?.htmlExamples[0]?.previewSmoke?.status, 'passed')

    const published = await requestJson<PublishCapabilityAuthoringDraftResponse>(
      `/api/capability-authoring/drafts/${created.draft.id}/publish-private`,
      {
        method: 'POST',
        body: {
          workspaceId: bootstrap.workspace.id,
          name: 'API published private template',
        },
      },
    )
    assert.equal(published.draft.status, 'published_private')
    assert.equal(published.draft.publishedTemplateId, published.template.id)
    assert.equal(published.template.version, '1.0.0')
    assert.equal(published.template.visibility, 'private')
    assert.equal((published.audit as { action?: string }).action, 'capability.template.published_private')

    const bundleExport = await fetch(
      `${harness.baseUrl}/api/capability-authoring/drafts/${created.draft.id}/export-bundle`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId: bootstrap.workspace.id,
          licenseDeclaration: 'user_owned_or_authorized',
        }),
      },
    )
    assert.equal(bundleExport.ok, true)
    assert.match(bundleExport.headers.get('content-disposition') ?? '', /capability-bundle\.zip/)
    const bundleBody = new Uint8Array(await bundleExport.arrayBuffer())
    const importedBundle = await requestJson<CapabilityAuthoringDraftResponse>(
      '/api/capability-authoring/import-bundle',
      {
        method: 'POST',
        body: {
          workspaceId: bootstrap.workspace.id,
          bundleBase64: Buffer.from(bundleBody).toString('base64'),
        },
      },
    )
    assert.equal(importedBundle.draft.source.type, 'capability_bundle_zip')
    assert.ok(importedBundle.draft.candidateBundle.templatePacks[0]?.htmlExamples[0]?.authoringAssetId)
    const importedBundlePreview = await requestJson<CapabilityAuthoringDraftResponse>(
      `/api/capability-authoring/drafts/${importedBundle.draft.id}/preview`,
      {
        method: 'POST',
        body: { workspaceId: bootstrap.workspace.id },
      },
    )
    assert.equal(importedBundlePreview.draft.candidateBundle.templatePacks[0]?.htmlExamples[0]?.previewSmoke?.status, 'passed')

    await store.saveDesignTemplatePack({
      ...published.template,
      name: 'API published private template v2',
      version: '1.0.1',
    })
    const rolledBack = await requestJson<RollbackPrivateDesignTemplateResponse>(
      `/api/design-templates/${published.template.id}/rollback`,
      {
        method: 'POST',
        body: {
          workspaceId: bootstrap.workspace.id,
          sourceVersion: '1.0.0',
          reason: 'API rollback smoke.',
        },
      },
    )
    assert.equal(rolledBack.template.version, '1.0.2')
    assert.equal(rolledBack.restoredSourceVersion, '1.0.0')
    assert.equal((rolledBack.audit as { action?: string }).action, 'capability.template.rolled_back')

    const jsonExport = await fetch(
      `${harness.baseUrl}/api/design-templates/${published.template.id}/export/template-pack-json?workspaceId=${encodeURIComponent(bootstrap.workspace.id)}`,
    )
    assert.equal(jsonExport.ok, true)
    assert.match(jsonExport.headers.get('content-disposition') ?? '', /template-pack\.json/)
    const jsonDocument = await jsonExport.json()
    const importedJson = await requestJson<CapabilityAuthoringDraftResponse>(
      '/api/capability-authoring/import-template-pack-json',
      {
        method: 'POST',
        body: { workspaceId: bootstrap.workspace.id, document: jsonDocument },
      },
    )
    assert.equal(importedJson.draft.source.type, 'template_pack_json')
    assert.deepEqual(
      importedJson.draft.candidateBundle.templatePacks[0]?.designTokens,
      rolledBack.template.designTokens,
    )

    const designMdExport = await fetch(
      `${harness.baseUrl}/api/design-templates/${published.template.id}/export/design-md?workspaceId=${encodeURIComponent(bootstrap.workspace.id)}`,
    )
    assert.equal(designMdExport.ok, true)
    assert.match(designMdExport.headers.get('content-disposition') ?? '', /DESIGN\.md/)
    const designMd = await designMdExport.text()
    assert.match(designMd, /name: API published private template/)
    const importedDesignMd = await requestJson<CapabilityAuthoringDraftResponse>(
      '/api/capability-authoring/import-design-md',
      {
        method: 'POST',
        body: { workspaceId: bootstrap.workspace.id, designMd },
      },
    )
    assert.equal(importedDesignMd.draft.source.type, 'design_md')
    assert.equal(importedDesignMd.draft.candidateBundle.templatePacks[0]?.name, rolledBack.template.name)
  })

  async function getJson<T>(path: string): Promise<T> {
    return requestJson<T>(path, { method: 'GET' })
  }

  async function requestJson<T>(
    path: string,
    input: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown },
  ): Promise<T> {
    const response = await fetch(`${harness.baseUrl}${path}`, {
      method: input.method,
      ...(input.body === undefined ? {} : {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input.body),
      }),
    })
    if (!response.ok) assert.fail(`${path} failed with ${response.status}: ${await response.text()}`)
    return response.json() as Promise<T>
  }
})

function validBundle() {
  return {
    templatePacks: [{
      schemaVersion: 'dudesign-template-draft.v2',
      name: 'API draft template',
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
        id: 'summary',
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
        sourcePath: 'manual.surface',
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
