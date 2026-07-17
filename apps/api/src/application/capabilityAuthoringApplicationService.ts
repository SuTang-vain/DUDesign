import { createHash } from 'node:crypto'
import type { ArtifactStore } from '@dudesign/artifact-store'
import type {
  CapabilityAuthoringDraft,
  CapabilityAuthoringSource,
  CapabilityBundleDraft,
  CreateCapabilityAuthoringDraftRequest,
  DesignTemplatePack,
  ExportCapabilityBundleRequest,
  HtmlExampleReference,
  ImportCapabilityBundleDraftRequest,
  ImportDesignMdDraftRequest,
  ImportDesignTemplatePackJsonDraftRequest,
  PublishCapabilityAuthoringDraftRequest,
  RollbackPrivateDesignTemplateRequest,
  UpdateCapabilityAuthoringDraftRequest,
} from '@dudesign/contracts'
import type { WorkspaceMemberRole } from '@dudesign/domain'
import type { RequestContext } from '../auth.js'
import {
  lintCapabilityAuthoringDraft,
  transitionCapabilityAuthoringDraft,
} from '../capabilityAuthoring.js'
import { createId, nowIso } from '../id.js'
import { analyzeHtmlArtifactQuality, analyzeHtmlArtifactQualityWithPixelGate } from '../artifactQuality.js'
import { sanitizeHtmlExample } from '../htmlExampleSanitizer.js'
import { extractHtmlTemplateDraft } from '../htmlTemplateExtractor.js'
import { exportDesignTemplatePackToDesignMd, importDesignMd } from '../designTemplatePack.js'
import {
  exportPortableDesignTemplatePack,
  importPortableDesignTemplatePack,
  portableTemplateToDraft,
} from '../portableDesignTemplatePack.js'
import {
  createCapabilityBundleArchive,
  parseCapabilityBundleArchive,
} from '../capabilityBundleArchive.js'
import type { ApplicationRepository } from '../repository.js'

export class CapabilityAuthoringApplicationService {
  constructor(
    private readonly store: ApplicationRepository,
    private readonly artifacts: ArtifactStore,
  ) {}

  async createDraft(ctx: RequestContext, input: CreateCapabilityAuthoringDraftRequest) {
    assertCreateDraftInput(input)
    await this.requireWorkspaceAccess(input.workspaceId, ctx.userId, 'editor')
    const source = await this.resolveSource(ctx.userId, input.workspaceId, input.source)
    const now = nowIso()
    let draft: CapabilityAuthoringDraft = {
      id: createId('cad'),
      ownerUserId: ctx.userId,
      workspaceId: input.workspaceId,
      source,
      status: input.candidateBundle ? 'needs_confirmation' : 'analyzing',
      candidateBundle: input.candidateBundle ?? emptyCapabilityBundleDraft(),
      findings: [],
      confirmedPaths: [],
      createdAt: now,
      updatedAt: now,
    }

    if (input.candidateBundle) draft = applyLintResult(draft, now)
    return { draft: await this.store.saveCapabilityAuthoringDraft(draft) }
  }

  async listDrafts(ctx: RequestContext, workspaceId: string) {
    await this.requireWorkspaceAccess(workspaceId, ctx.userId, 'viewer')
    return {
      drafts: await this.store.listCapabilityAuthoringDrafts(ctx.userId, workspaceId),
    }
  }

  async getDraft(ctx: RequestContext, draftId: string, workspaceId: string) {
    await this.requireWorkspaceAccess(workspaceId, ctx.userId, 'viewer')
    const draft = await this.requireDraft(draftId, ctx.userId, workspaceId)
    return { draft }
  }

  async updateDraft(
    ctx: RequestContext,
    draftId: string,
    input: UpdateCapabilityAuthoringDraftRequest,
  ) {
    assertUpdateDraftInput(input)
    await this.requireWorkspaceAccess(input.workspaceId, ctx.userId, 'editor')
    const current = await this.requireDraft(draftId, ctx.userId, input.workspaceId)
    if (isImmutableStatus(current.status)) {
      throw applicationError(409, 'CAPABILITY_DRAFT_IMMUTABLE', `Draft cannot be edited while status is ${current.status}.`)
    }
    const now = nowIso()
    const updated: CapabilityAuthoringDraft = {
      ...current,
      ...(input.candidateBundle && { candidateBundle: input.candidateBundle }),
      ...(input.confirmedPaths && { confirmedPaths: uniqueStrings(input.confirmedPaths) }),
      updatedAt: now,
    }
    return {
      draft: await this.store.saveCapabilityAuthoringDraft(applyLintResult(updated, now)),
    }
  }

  async lintDraft(ctx: RequestContext, draftId: string, workspaceId: string) {
    await this.requireWorkspaceAccess(workspaceId, ctx.userId, 'editor')
    const current = await this.requireDraft(draftId, ctx.userId, workspaceId)
    if (isImmutableStatus(current.status)) {
      throw applicationError(409, 'CAPABILITY_DRAFT_IMMUTABLE', `Draft cannot be linted while status is ${current.status}.`)
    }
    const now = nowIso()
    return {
      draft: await this.store.saveCapabilityAuthoringDraft(applyLintResult(current, now)),
    }
  }

  async analyzeDraft(ctx: RequestContext, draftId: string, workspaceId: string) {
    await this.requireWorkspaceAccess(workspaceId, ctx.userId, 'editor')
    const current = await this.requireDraft(draftId, ctx.userId, workspaceId)
    if (isImmutableStatus(current.status)) {
      throw applicationError(409, 'CAPABILITY_DRAFT_IMMUTABLE', `Draft cannot be analyzed while status is ${current.status}.`)
    }
    if (current.source.type !== 'variation_artifact') {
      throw applicationError(400, 'CAPABILITY_SOURCE_ANALYZER_UNSUPPORTED', 'HTML extraction currently requires a variation artifact source.')
    }
    const context = await this.store.getVariationArtifactContext(
      current.source.variationId,
      current.source.artifactId,
    )
    if (context.mismatch || !context.artifact || context.artifact.kind !== 'html') {
      throw applicationError(409, 'CAPABILITY_SOURCE_DRIFTED', 'Frozen HTML source is no longer available for this variation.')
    }
    const artifact = context.artifact
    if (
      artifact.version !== current.source.artifactVersion
      || artifact.contentHash !== current.source.contentHash
    ) {
      throw applicationError(409, 'CAPABILITY_SOURCE_DRIFTED', 'Frozen HTML source version or content hash has changed.')
    }
    const html = await this.readArtifactText(artifact.storageKey)
    const assetArtifacts = await this.store.getVariationAssetArtifacts(current.source.variationId, artifact.id)
    const cssFiles: Array<{ path: string; content: string }> = []
    for (const asset of assetArtifacts) {
      if (!asset.entryPath || !asset.entryPath.toLowerCase().endsWith('.css')) continue
      cssFiles.push({
        path: asset.entryPath,
        content: await this.readArtifactText(asset.storageKey),
      })
    }
    const template = extractHtmlTemplateDraft({
      name: context.variation?.title?.trim() || `Extracted template ${artifact.id}`,
      description: 'Extracted from a frozen DUDesign HTML variation artifact.',
      html,
      cssFiles,
      source: {
        artifactId: artifact.id,
        artifactVersion: artifact.version,
        contentHash: artifact.contentHash,
        entryPath: artifact.entryPath ?? 'index.html',
      },
    })
    const now = nowIso()
    const analyzed: CapabilityAuthoringDraft = {
      ...current,
      candidateBundle: {
        templatePacks: [template],
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
      },
      confirmedPaths: [],
      updatedAt: now,
    }
    return {
      draft: await this.store.saveCapabilityAuthoringDraft(applyLintResult(analyzed, now)),
    }
  }

  async sanitizeDraft(ctx: RequestContext, draftId: string, workspaceId: string) {
    await this.requireWorkspaceAccess(workspaceId, ctx.userId, 'editor')
    const current = await this.requireDraft(draftId, ctx.userId, workspaceId)
    if (isImmutableStatus(current.status)) {
      throw applicationError(409, 'CAPABILITY_DRAFT_IMMUTABLE', `Draft cannot be sanitized while status is ${current.status}.`)
    }
    if (current.source.type !== 'variation_artifact') {
      throw applicationError(400, 'CAPABILITY_SOURCE_SANITIZER_UNSUPPORTED', 'HTML sanitization currently requires a variation artifact source.')
    }
    if (current.candidateBundle.templatePacks.length === 0) {
      throw applicationError(409, 'CAPABILITY_DRAFT_NOT_ANALYZED', 'Analyze the draft before sanitizing HTML examples.')
    }
    const sourceArtifact = await this.requireFrozenHtmlArtifact(current)
    const sourceHtml = await this.readArtifactText(sourceArtifact.storageKey)
    const sanitized = sanitizeHtmlExample(sourceHtml)
    const now = nowIso()
    let sanitizedArtifactId: string | null = null
    if (sanitized.status === 'passed' && sanitized.contentHash) {
      const reusableArtifact = await reusableSanitizedArtifact(this.store, current, sanitized.contentHash)
      if (reusableArtifact) {
        sanitizedArtifactId = reusableArtifact.id
      } else {
        const artifactId = createId('art')
        const stored = await this.artifacts.put({
          workspaceId,
          artifactId,
          relativePath: `capability-authoring/${current.id}/sanitized.html`,
          contentType: 'text/html; charset=utf-8',
          body: sanitized.html,
          metadata: {
            kind: 'capability_authoring_sanitized_html',
            draftId: current.id,
            sourceArtifactId: sourceArtifact.id,
          },
        })
        const artifact = await this.store.createArtifact({
          artifactId,
          workspaceId,
          sessionId: sourceArtifact.sessionId,
          variationId: sourceArtifact.variationId,
          parentArtifactId: sourceArtifact.id,
          kind: 'asset',
          version: sourceArtifact.version,
          storageKey: stored.storageKey,
          entryPath: `capability-authoring/${current.id}/sanitized.html`,
          contentHash: stored.contentHash,
          sizeBytes: stored.sizeBytes,
          metadata: {
            kind: 'capability_authoring_sanitized_html',
            draftId: current.id,
            sourceArtifactId: sourceArtifact.id,
          },
        })
        sanitizedArtifactId = artifact.id
      }
    }
    const candidateBundle = {
      ...current.candidateBundle,
      templatePacks: current.candidateBundle.templatePacks.map(template => ({
        ...template,
        htmlExamples: template.htmlExamples.map(example => ({
          ...example,
          sanitizationStatus: sanitized.status,
          sanitizedArtifactId,
          sanitization: {
            sanitizedContentHash: sanitized.contentHash,
            findings: sanitized.findings.map(({ severity, code, path, message }) => ({ severity, code, path, message })),
            sanitizedAt: now,
          },
          previewSmoke: null,
          notes: uniqueStrings([
            ...example.notes,
            sanitized.status === 'passed'
              ? 'Sanitized HTML is stored as a separate artifact and may proceed to preview smoke.'
              : 'Sanitization failed; resolve blocking findings before preview.',
          ]),
        })),
      })),
    }
    const linted = applyLintResult({ ...current, candidateBundle, updatedAt: now }, now)
    const findings = mergeFindings(linted.findings, sanitized.findings)
    const targetStatus = sanitized.status === 'failed'
      ? 'lint_failed'
      : linted.status === 'needs_confirmation' || hasUnconfirmedWarnings(findings, current.confirmedPaths)
        ? 'needs_confirmation'
        : 'preview_pending'
    const next = transitionCapabilityAuthoringDraft({ ...linted, findings }, targetStatus, now)
    return { draft: await this.store.saveCapabilityAuthoringDraft(next) }
  }

  async previewDraft(ctx: RequestContext, draftId: string, workspaceId: string) {
    await this.requireWorkspaceAccess(workspaceId, ctx.userId, 'editor')
    const current = await this.requireDraft(draftId, ctx.userId, workspaceId)
    if (isImmutableStatus(current.status)) {
      throw applicationError(409, 'CAPABILITY_DRAFT_IMMUTABLE', `Draft cannot be previewed while status is ${current.status}.`)
    }
    const examples = current.candidateBundle.templatePacks.flatMap(template => template.htmlExamples)
    const example = examples.find(item => item.sanitizationStatus === 'passed' && (item.sanitizedArtifactId || item.authoringAssetId))
    if (!example) {
      throw applicationError(409, 'CAPABILITY_DRAFT_NOT_SANITIZED', 'Sanitize an HTML example before running preview smoke.')
    }
    const resolvedExample = await this.resolveReviewedHtmlExample(current, example)
    const html = resolvedExample.html
    const staticQuality = analyzeHtmlArtifactQuality(html)
    const pixelEnabled = capabilityAuthoringPixelGateEnabled()
    const combined = pixelEnabled
      ? await analyzeHtmlArtifactQualityWithPixelGate(html, {
          enabled: true,
          timeoutMs: capabilityAuthoringPixelGateTimeoutMs(),
        })
      : staticQuality
    const pixelIssues = pixelEnabled
      ? combined.issues.filter(issue => !staticQuality.issues.includes(issue))
      : []
    const pixelStatus = !pixelEnabled
      ? 'not_run' as const
      : pixelIssues.length === 0
        ? 'pass' as const
        : combined.status === 'fail'
          ? 'fail' as const
          : 'warn' as const
    const previewStatus = combined.status === 'pass'
      ? 'passed' as const
      : combined.status === 'fail'
        ? 'failed' as const
        : 'warning' as const
    const now = nowIso()
    const candidateBundle = {
      ...current.candidateBundle,
      templatePacks: current.candidateBundle.templatePacks.map(template => ({
        ...template,
        htmlExamples: template.htmlExamples.map(item => sameHtmlExample(item, example)
          ? {
              ...item,
              previewSmoke: {
                status: previewStatus,
                staticStatus: staticQuality.status,
                pixelStatus,
                issues: combined.issues,
                checkedAt: now,
              },
            }
          : item),
      })),
    }
    const previewFindings = combined.issues.map((issue, index) => ({
      severity: combined.status === 'fail' ? 'error' as const : 'warning' as const,
      code: `html_example.preview_${combined.status}_${index + 1}`,
      path: 'candidateBundle.templatePacks[].htmlExamples[].previewSmoke',
      message: issue,
    }))
    const linted = applyLintResult({ ...current, candidateBundle, updatedAt: now }, now)
    const findings = mergeFindings(linted.findings, sanitizerFindings(candidateBundle), previewFindings)
    const targetStatus = previewStatus === 'passed'
      ? linted.status === 'preview_pending' && !hasUnconfirmedWarnings(findings, current.confirmedPaths)
        ? 'ready'
        : 'needs_confirmation'
      : previewStatus === 'failed'
        ? 'lint_failed'
        : 'needs_confirmation'
    const next = transitionCapabilityAuthoringDraft({ ...linted, findings }, targetStatus, now)
    return { draft: await this.store.saveCapabilityAuthoringDraft(next) }
  }

  async publishPrivateDraft(
    ctx: RequestContext,
    draftId: string,
    input: PublishCapabilityAuthoringDraftRequest,
  ) {
    if (!isPlainObject(input)) throw applicationError(400, 'INVALID_REQUEST', 'Request body must be an object.')
    requiredString(input.workspaceId, 'workspaceId')
    if (input.name !== undefined && typeof input.name !== 'string') {
      throw applicationError(400, 'INVALID_REQUEST', 'name must be a string.')
    }
    if (input.description !== undefined && input.description !== null && typeof input.description !== 'string') {
      throw applicationError(400, 'INVALID_REQUEST', 'description must be a string or null.')
    }
    await this.requireWorkspaceAccess(input.workspaceId, ctx.userId, 'editor')
    const current = await this.requireDraft(draftId, ctx.userId, input.workspaceId)
    if (current.status !== 'ready') {
      throw applicationError(409, 'CAPABILITY_DRAFT_NOT_READY', 'Draft must pass confirmation, sanitization, and preview smoke before private publication.')
    }
    if (current.candidateBundle.templatePacks.length !== 1) {
      throw applicationError(409, 'CAPABILITY_TEMPLATE_COUNT_UNSUPPORTED', 'Private template publication currently requires exactly one template draft.')
    }
    const templateDraft = current.candidateBundle.templatePacks[0]!
    const example = templateDraft.htmlExamples.find(item =>
      item.sanitizationStatus === 'passed'
      && item.previewSmoke?.status === 'passed'
      && (item.sanitizedArtifactId || item.authoringAssetId),
    )
    if (!example) {
      throw applicationError(409, 'CAPABILITY_PUBLISH_GATE_FAILED', 'A sanitized HTML example with a passing preview smoke is required.')
    }
    const reviewedExample = await this.resolveReviewedHtmlExample(current, example)
    const sanitizedHtml = reviewedExample.html
    const template: DesignTemplatePack = {
      schemaVersion: '2026-07-01.dudesign-template-pack.v1',
      id: privateTemplateIdForDraft(current.id),
      source: 'user',
      format: 'dudesign-template-v1',
      visibility: 'private',
      status: 'published',
      name: normalizedTemplateName(input.name, templateDraft.name),
      description: input.description === undefined
        ? templateDraft.description
        : normalizedTemplateDescription(input.description),
      version: '1.0.0',
      designTokens: structuredClone(templateDraft.designTokens),
      rationale: {
        ...structuredClone(templateDraft.rationale),
        sections: {
          ...templateDraft.rationale.sections,
          ...Object.fromEntries(templateDraft.sectionBlueprints.map(section => [
            section.id,
            `${section.name}: ${section.role}${section.layout ? `; ${section.layout}` : ''}`,
          ])),
        },
      },
      previewArtifactId: reviewedExample.artifactId,
      lintStatus: 'passed',
      createdByUserId: ctx.userId,
      htmlExamples: [sanitizedHtml],
    }
    await this.store.saveDesignTemplatePack(template)
    const now = nowIso()
    const publishedDraft = transitionCapabilityAuthoringDraft({
      ...current,
      publishedTemplateId: template.id,
    }, 'published_private', now)
    await this.store.saveCapabilityAuthoringDraft(publishedDraft)
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole ?? 'support',
      action: 'capability.template.published_private',
      targetType: 'design_template',
      targetId: template.id,
      reason: 'Publish a reviewed capability authoring draft as a private template.',
      metadata: {
        actorType: 'user',
        draftId: current.id,
        workspaceId: current.workspaceId,
        templateVersion: template.version,
        sourceType: current.source.type,
        sourceContentHash: current.source.contentHash,
        sanitizedArtifactId: reviewedExample.artifactId,
        authoringAssetId: example.authoringAssetId ?? null,
        unpublishedBundleCounts: {
          skills: current.candidateBundle.skills.length,
          interactionParadigms: current.candidateBundle.interactionParadigms.length,
          dataContracts: current.candidateBundle.dataContracts.length,
          reviewProfiles: current.candidateBundle.reviewProfiles.length,
        },
      },
    })
    return { draft: publishedDraft, template, audit }
  }

  async rollbackPrivateTemplate(
    ctx: RequestContext,
    templateId: string,
    input: RollbackPrivateDesignTemplateRequest,
  ) {
    if (!isPlainObject(input)) throw applicationError(400, 'INVALID_REQUEST', 'Request body must be an object.')
    requiredString(input.workspaceId, 'workspaceId')
    requiredString(input.sourceVersion, 'sourceVersion')
    if (input.reason !== undefined && input.reason !== null && typeof input.reason !== 'string') {
      throw applicationError(400, 'INVALID_REQUEST', 'reason must be a string or null.')
    }
    await this.requireWorkspaceAccess(input.workspaceId, ctx.userId, 'editor')
    const current = await this.store.getDesignTemplatePackById(templateId, ctx.userId, input.workspaceId)
    if (!current) throw applicationError(404, 'DESIGN_TEMPLATE_NOT_FOUND', `Design template not found: ${templateId}`)
    if (current.source !== 'user' || current.visibility !== 'private' || current.createdByUserId !== ctx.userId) {
      throw applicationError(403, 'DESIGN_TEMPLATE_ROLLBACK_FORBIDDEN', 'Only your private user templates can be rolled back through this endpoint.')
    }
    const sourceVersion = await this.store.getDesignTemplatePackVersion(
      templateId,
      input.sourceVersion,
      ctx.userId,
      input.workspaceId,
    )
    if (!sourceVersion) {
      throw applicationError(404, 'DESIGN_TEMPLATE_VERSION_NOT_FOUND', `Design template version not found: ${input.sourceVersion}`)
    }
    if (sourceVersion.version === current.version) {
      throw applicationError(409, 'DESIGN_TEMPLATE_ALREADY_CURRENT', 'Requested source version is already current.')
    }
    const nextVersion = nextPatchVersion(current.version)
    const restored: DesignTemplatePack = {
      ...structuredClone(sourceVersion.pack),
      id: current.id,
      source: 'user',
      visibility: 'private',
      status: 'published',
      version: nextVersion,
      createdByUserId: ctx.userId,
      rationale: {
        ...structuredClone(sourceVersion.pack.rationale),
        overview: [
          sourceVersion.pack.rationale.overview,
          `Restored from version ${sourceVersion.version}; rollback created immutable version ${nextVersion}.`,
        ].filter(Boolean).join(' '),
      },
    }
    await this.store.saveDesignTemplatePack(restored)
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole ?? 'support',
      action: 'capability.template.rolled_back',
      targetType: 'design_template',
      targetId: current.id,
      reason: input.reason?.trim() || null,
      metadata: {
        actorType: 'user',
        workspaceId: input.workspaceId,
        rolledBackFromVersion: current.version,
        restoredSourceVersion: sourceVersion.version,
        createdVersion: nextVersion,
        sourceVersionContentHash: sourceVersion.contentHash,
      },
    })
    return {
      template: restored,
      rolledBackFromVersion: current.version,
      restoredSourceVersion: sourceVersion.version,
      audit,
    }
  }

  async exportTemplateDesignMd(ctx: RequestContext, templateId: string, workspaceId: string) {
    const template = await this.requireReadableTemplate(ctx, templateId, workspaceId)
    await this.recordUserCapabilityAudit(ctx, {
      action: 'capability.template.exported_design_md',
      targetType: 'design_template',
      targetId: template.id,
      metadata: { workspaceId, templateVersion: template.version, format: 'design-md' },
    })
    return {
      filename: `${filenameBase(template.name)}-${template.version}-DESIGN.md`,
      contentType: 'text/markdown; charset=utf-8',
      body: new TextEncoder().encode(exportDesignTemplatePackToDesignMd(template)),
    }
  }

  async exportTemplatePackJson(ctx: RequestContext, templateId: string, workspaceId: string) {
    const template = await this.requireReadableTemplate(ctx, templateId, workspaceId)
    const document = exportPortableDesignTemplatePack(template, nowIso())
    await this.recordUserCapabilityAudit(ctx, {
      action: 'capability.template.exported_json',
      targetType: 'design_template',
      targetId: template.id,
      metadata: {
        workspaceId,
        templateVersion: template.version,
        format: document.manifest.format,
        contentHash: document.manifest.contentHash,
      },
    })
    return {
      filename: `${filenameBase(template.name)}-${template.version}.template-pack.json`,
      contentType: 'application/json; charset=utf-8',
      body: new TextEncoder().encode(JSON.stringify(document, null, 2)),
    }
  }

  async importDesignMdDraft(ctx: RequestContext, input: ImportDesignMdDraftRequest) {
    if (!isPlainObject(input)) throw applicationError(400, 'INVALID_REQUEST', 'Request body must be an object.')
    requiredString(input.workspaceId, 'workspaceId')
    const designMd = requiredString(input.designMd, 'designMd')
    await this.requireWorkspaceAccess(input.workspaceId, ctx.userId, 'editor')
    const imported = importDesignMd(designMd, {
      source: 'imported',
      visibility: 'private',
      status: 'draft',
      createdByUserId: ctx.userId,
    })
    const portableDocument = exportPortableDesignTemplatePack(imported.pack, nowIso())
    const draft = await this.createImportedDraft({
      ctx,
      workspaceId: input.workspaceId,
      source: {
        type: 'design_md',
        contentHash: `sha256:${createHash('sha256').update(designMd).digest('hex')}`,
      },
      templateDraft: portableTemplateToDraft(portableDocument.template, portableDocument.manifest.contentHash),
      sourceFindings: imported.findings.map(item => ({
        severity: item.severity,
        code: `design_md.${item.code}`,
        path: item.path,
        message: item.message,
      })),
    })
    await this.recordUserCapabilityAudit(ctx, {
      action: 'capability.template.imported_design_md_draft',
      targetType: 'capability_authoring_draft',
      targetId: draft.id,
      metadata: { workspaceId: input.workspaceId, contentHash: draft.source.contentHash },
    })
    return { draft }
  }

  async importTemplatePackJsonDraft(ctx: RequestContext, input: ImportDesignTemplatePackJsonDraftRequest) {
    if (!isPlainObject(input)) throw applicationError(400, 'INVALID_REQUEST', 'Request body must be an object.')
    requiredString(input.workspaceId, 'workspaceId')
    await this.requireWorkspaceAccess(input.workspaceId, ctx.userId, 'editor')
    const imported = importPortableDesignTemplatePack(input.document)
    const draft = await this.createImportedDraft({
      ctx,
      workspaceId: input.workspaceId,
      source: {
        type: 'template_pack_json',
        contentHash: input.document.manifest.contentHash,
      },
      templateDraft: imported.draft,
      sourceFindings: [{
        severity: 'info',
        code: 'template_pack.portable_core_imported',
        path: 'candidateBundle.templatePacks[0]',
        message: 'Portable template core imported. Environment-bound preview and HTML example assets are intentionally excluded.',
      }],
    })
    await this.recordUserCapabilityAudit(ctx, {
      action: 'capability.template.imported_json_draft',
      targetType: 'capability_authoring_draft',
      targetId: draft.id,
      metadata: {
        workspaceId: input.workspaceId,
        contentHash: input.document.manifest.contentHash,
        sourceTemplateId: input.document.manifest.sourceTemplateId,
        sourceTemplateVersion: input.document.manifest.sourceTemplateVersion,
      },
    })
    return { draft }
  }

  async exportCapabilityBundle(
    ctx: RequestContext,
    draftId: string,
    input: ExportCapabilityBundleRequest,
  ) {
    if (!isPlainObject(input)) throw applicationError(400, 'INVALID_REQUEST', 'Request body must be an object.')
    requiredString(input.workspaceId, 'workspaceId')
    if (input.licenseDeclaration !== undefined && !['user_owned_or_authorized', 'unspecified'].includes(input.licenseDeclaration)) {
      throw applicationError(400, 'INVALID_REQUEST', 'licenseDeclaration is invalid.')
    }
    if (input.licenseNotes !== undefined && input.licenseNotes !== null && typeof input.licenseNotes !== 'string') {
      throw applicationError(400, 'INVALID_REQUEST', 'licenseNotes must be a string or null.')
    }
    await this.requireWorkspaceAccess(input.workspaceId, ctx.userId, 'viewer')
    const draft = await this.requireDraft(draftId, ctx.userId, input.workspaceId)
    if (!['ready', 'published_private'].includes(draft.status)) {
      throw applicationError(409, 'CAPABILITY_BUNDLE_NOT_READY', 'Capability bundle export requires a ready or privately published draft.')
    }
    const htmlExamples = []
    for (const [templateIndex, template] of draft.candidateBundle.templatePacks.entries()) {
      for (const [exampleIndex, example] of template.htmlExamples.entries()) {
        if (example.sanitizationStatus !== 'passed') {
          throw applicationError(409, 'CAPABILITY_BUNDLE_EXAMPLE_NOT_SANITIZED', 'All exported HTML examples must pass sanitization.')
        }
        const resolved = await this.resolveReviewedHtmlExample(draft, example)
        htmlExamples.push({ templateIndex, exampleIndex, html: resolved.html })
      }
    }
    const archive = createCapabilityBundleArchive({
      draft,
      htmlExamples,
      bundleId: createId('capbundle'),
      createdAt: nowIso(),
      licenseDeclaration: input.licenseDeclaration ?? 'unspecified',
      licenseNotes: input.licenseNotes?.trim().slice(0, 1000) || null,
    })
    await this.recordUserCapabilityAudit(ctx, {
      action: 'capability.bundle.exported',
      targetType: 'capability_authoring_draft',
      targetId: draft.id,
      metadata: {
        workspaceId: draft.workspaceId,
        bundleId: archive.manifest.bundleId,
        contentHash: archive.contentHash,
        counts: archive.manifest.counts,
      },
    })
    return {
      filename: `${filenameBase(archive.manifest.name)}.capability-bundle.zip`,
      contentType: 'application/zip',
      body: archive.body,
    }
  }

  async importCapabilityBundleDraft(ctx: RequestContext, input: ImportCapabilityBundleDraftRequest) {
    if (!isPlainObject(input)) throw applicationError(400, 'INVALID_REQUEST', 'Request body must be an object.')
    requiredString(input.workspaceId, 'workspaceId')
    const bundleBase64 = requiredString(input.bundleBase64, 'bundleBase64')
    await this.requireWorkspaceAccess(input.workspaceId, ctx.userId, 'editor')
    if (bundleBase64.length > 12 * 1024 * 1024 || bundleBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(bundleBase64)) {
      throw applicationError(400, 'CAPABILITY_BUNDLE_BASE64_INVALID', 'bundleBase64 is not valid canonical base64 or exceeds the request limit.')
    }
    let archiveBody: Uint8Array
    try {
      archiveBody = new Uint8Array(Buffer.from(bundleBase64, 'base64'))
    } catch {
      throw applicationError(400, 'CAPABILITY_BUNDLE_BASE64_INVALID', 'bundleBase64 is invalid.')
    }
    const parsed = parseCapabilityBundleArchive(archiveBody)
    const now = nowIso()
    const draftId = createId('cad')
    const baseBundle: CapabilityBundleDraft = {
      ...structuredClone(parsed.portableDraft),
      templatePacks: parsed.portableDraft.templatePacks.map(template => {
        const { htmlExamplePaths: _paths, ...portable } = template
        return { ...portable, htmlExamples: [] }
      }),
    }
    let draft: CapabilityAuthoringDraft = {
      id: draftId,
      ownerUserId: ctx.userId,
      workspaceId: input.workspaceId,
      source: {
        type: 'capability_bundle_zip',
        contentHash: parsed.contentHash,
        sourceBundleId: parsed.manifest.bundleId,
      },
      status: 'analyzing',
      candidateBundle: baseBundle,
      findings: [],
      confirmedPaths: [],
      publishedTemplateId: null,
      createdAt: now,
      updatedAt: now,
    }
    await this.store.saveCapabilityAuthoringDraft(draft)
    const importedFindings: CapabilityAuthoringDraft['findings'] = []
    for (const example of parsed.htmlExamples) {
      const sanitized = sanitizeHtmlExample(example.html)
      importedFindings.push(...sanitized.findings)
      if (sanitized.status !== 'passed' || !sanitized.contentHash) continue
      const assetId = createId('caa')
      const entryPath = `bundle-imports/${draftId}/${example.path}`
      const stored = await this.artifacts.put({
        workspaceId: input.workspaceId,
        artifactId: assetId,
        relativePath: entryPath,
        contentType: 'text/html; charset=utf-8',
        body: sanitized.html,
        metadata: {
          kind: 'capability_authoring_html_example',
          draftId,
          bundleId: parsed.manifest.bundleId,
        },
      })
      const asset = await this.store.saveCapabilityAuthoringAsset({
        id: assetId,
        draftId,
        ownerUserId: ctx.userId,
        workspaceId: input.workspaceId,
        kind: 'html_example',
        storageKey: stored.storageKey,
        entryPath,
        contentType: 'text/html',
        contentHash: stored.contentHash,
        sizeBytes: stored.sizeBytes,
        metadata: { bundlePath: example.path, sourceContentHash: example.contentHash },
        createdAt: now,
      })
      baseBundle.templatePacks[example.templateIndex]?.htmlExamples.push({
        artifactId: null,
        artifactVersion: null,
        authoringAssetId: asset.id,
        contentHash: asset.contentHash,
        entryPath: example.path,
        sanitizationStatus: 'passed',
        sanitizedArtifactId: null,
        sanitization: {
          sanitizedContentHash: asset.contentHash,
          findings: sanitized.findings.map(({ severity, code, path, message }) => ({ severity, code, path, message })),
          sanitizedAt: now,
        },
        previewSmoke: null,
        notes: ['Imported from a verified Capability Bundle ZIP and re-sanitized locally.'],
      })
    }
    const linted = applyLintResult({ ...draft, candidateBundle: baseBundle, updatedAt: now }, now)
    const findings = mergeFindings(linted.findings, importedFindings, [{
      severity: 'info',
      code: 'capability_bundle.imported',
      path: 'candidateBundle',
      message: 'Capability Bundle manifest, file hashes, provenance, and embedded HTML examples were verified before import.',
    }])
    const status = findings.some(item => item.severity === 'error') ? 'lint_failed' : 'needs_confirmation'
    draft = transitionCapabilityAuthoringDraft({ ...linted, findings }, status, now)
    await this.store.saveCapabilityAuthoringDraft(draft)
    await this.recordUserCapabilityAudit(ctx, {
      action: 'capability.bundle.imported_draft',
      targetType: 'capability_authoring_draft',
      targetId: draft.id,
      metadata: {
        workspaceId: draft.workspaceId,
        bundleId: parsed.manifest.bundleId,
        contentHash: parsed.contentHash,
        counts: parsed.manifest.counts,
        licenseDeclaration: parsed.provenance.license.declaration,
      },
    })
    return { draft }
  }

  private async resolveSource(
    userId: string,
    workspaceId: string,
    input: CreateCapabilityAuthoringDraftRequest['source'],
  ): Promise<CapabilityAuthoringSource> {
    if (input.type === 'variation_artifact') {
      const context = await this.store.getVariationArtifactContext(input.variationId, input.artifactId)
      if (!context.variation) throw applicationError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${input.variationId}`)
      const job = await this.store.getJobById(context.variation.jobId)
      if (!job) throw applicationError(404, 'JOB_NOT_FOUND', `Design job not found: ${context.variation.jobId}`)
      if (job.workspaceId !== workspaceId) {
        throw applicationError(400, 'CAPABILITY_SOURCE_WORKSPACE_MISMATCH', 'Variation does not belong to the authoring workspace.')
      }
      await this.requireWorkspaceAccess(job.workspaceId, userId, 'viewer')
      if (context.mismatch) {
        throw applicationError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
      }
      const artifact = context.artifact
      if (!artifact) throw applicationError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${input.artifactId}`)
      if (artifact.kind !== 'html') {
        throw applicationError(400, 'CAPABILITY_SOURCE_KIND_UNSUPPORTED', 'Variation authoring source must be an HTML artifact.')
      }
      return {
        type: 'variation_artifact',
        variationId: input.variationId,
        artifactId: artifact.id,
        artifactVersion: artifact.version,
        contentHash: artifact.contentHash,
      }
    }

    if (input.type === 'design_md' || input.type === 'product_spec_markdown') {
      if (input.artifactId) {
        const artifact = await this.store.getArtifactById(input.artifactId)
        if (!artifact) throw applicationError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${input.artifactId}`)
        if (artifact.workspaceId !== workspaceId) {
          throw applicationError(400, 'CAPABILITY_SOURCE_WORKSPACE_MISMATCH', 'Source artifact does not belong to the authoring workspace.')
        }
        return {
          type: input.type,
          artifactId: artifact.id,
          contentHash: artifact.contentHash,
        }
      }
      const contentHash = normalizedContentHash(input.contentHash)
      if (!contentHash) {
        throw applicationError(400, 'CAPABILITY_SOURCE_HASH_REQUIRED', 'Document authoring source requires artifactId or contentHash.')
      }
      return {
        type: input.type,
        contentHash,
      }
    }

    return {
      type: 'manual',
      createdByUserId: userId,
      contentHash: normalizedContentHash(input.contentHash)
        ?? createHash('sha256').update(`manual:${userId}:${workspaceId}:${nowIso()}`).digest('hex'),
    }
  }

  private async requireDraft(draftId: string, userId: string, workspaceId: string): Promise<CapabilityAuthoringDraft> {
    const draft = await this.store.getCapabilityAuthoringDraftById(draftId, userId, workspaceId)
    if (!draft) throw applicationError(404, 'CAPABILITY_DRAFT_NOT_FOUND', `Capability authoring draft not found: ${draftId}`)
    return draft
  }

  private async requireReadableTemplate(ctx: RequestContext, templateId: string, workspaceId: string) {
    await this.requireWorkspaceAccess(workspaceId, ctx.userId, 'viewer')
    const template = await this.store.getDesignTemplatePackById(templateId, ctx.userId, workspaceId)
    if (!template) throw applicationError(404, 'DESIGN_TEMPLATE_NOT_FOUND', `Design template not found: ${templateId}`)
    return template
  }

  private async createImportedDraft(input: {
    ctx: RequestContext
    workspaceId: string
    source: CapabilityAuthoringSource
    templateDraft: CapabilityBundleDraft['templatePacks'][number]
    sourceFindings: CapabilityAuthoringDraft['findings']
  }): Promise<CapabilityAuthoringDraft> {
    const now = nowIso()
    const base: CapabilityAuthoringDraft = {
      id: createId('cad'),
      ownerUserId: input.ctx.userId,
      workspaceId: input.workspaceId,
      source: input.source,
      status: 'needs_confirmation',
      candidateBundle: {
        templatePacks: [input.templateDraft],
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
      },
      findings: [],
      confirmedPaths: [],
      publishedTemplateId: null,
      createdAt: now,
      updatedAt: now,
    }
    const linted = applyLintResult(base, now)
    const missingExamples = {
      severity: 'warning' as const,
      code: 'template_pack.html_examples_not_portable',
      path: 'candidateBundle.templatePacks[0].htmlExamples',
      message: 'Portable DESIGN.md/JSON does not include HTML example bodies; attach or extract a reviewed example before private publication.',
    }
    const findings = mergeFindings(linted.findings, input.sourceFindings, [missingExamples])
    const next = transitionCapabilityAuthoringDraft({ ...linted, findings },
      findings.some(item => item.severity === 'error') ? 'lint_failed' : 'needs_confirmation',
      now)
    return this.store.saveCapabilityAuthoringDraft(next)
  }

  private async recordUserCapabilityAudit(
    ctx: RequestContext,
    input: {
      action: string
      targetType: string
      targetId: string
      metadata: Record<string, unknown>
    },
  ) {
    return this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole ?? 'support',
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: null,
      metadata: { actorType: 'user', ...input.metadata },
    })
  }

  private async readArtifactText(storageKey: string): Promise<string> {
    const stored = await this.artifacts.get(storageKey)
    return new TextDecoder().decode(stored.body)
  }

  private async resolveReviewedHtmlExample(draft: CapabilityAuthoringDraft, example: HtmlExampleReference) {
    const expectedHash = example.sanitization?.sanitizedContentHash
    if (!expectedHash) {
      throw applicationError(409, 'CAPABILITY_SANITIZED_HASH_MISSING', 'Reviewed HTML example does not have a sanitized content hash.')
    }
    if (example.sanitizedArtifactId) {
      const artifact = await this.store.getArtifactById(example.sanitizedArtifactId)
      if (!artifact || artifact.workspaceId !== draft.workspaceId || artifact.contentHash !== expectedHash) {
        throw applicationError(409, 'CAPABILITY_SANITIZED_ARTIFACT_DRIFTED', 'Sanitized HTML artifact is missing or no longer matches the reviewed draft.')
      }
      return { html: await this.readArtifactText(artifact.storageKey), artifactId: artifact.id }
    }
    if (example.authoringAssetId) {
      const asset = await this.store.getCapabilityAuthoringAssetById(example.authoringAssetId, draft.ownerUserId, draft.workspaceId)
      if (!asset || asset.draftId !== draft.id || asset.contentHash !== expectedHash) {
        throw applicationError(409, 'CAPABILITY_AUTHORING_ASSET_DRIFTED', 'Authoring HTML asset is missing or no longer matches the reviewed draft.')
      }
      return { html: await this.readArtifactText(asset.storageKey), artifactId: null }
    }
    throw applicationError(409, 'CAPABILITY_SANITIZED_ARTIFACT_MISSING', 'Sanitized HTML example is not available.')
  }

  private async requireFrozenHtmlArtifact(draft: CapabilityAuthoringDraft) {
    if (draft.source.type !== 'variation_artifact') {
      throw applicationError(400, 'CAPABILITY_SOURCE_UNSUPPORTED', 'A frozen variation HTML source is required.')
    }
    const context = await this.store.getVariationArtifactContext(draft.source.variationId, draft.source.artifactId)
    const artifact = context.artifact
    if (context.mismatch || !artifact || artifact.kind !== 'html') {
      throw applicationError(409, 'CAPABILITY_SOURCE_DRIFTED', 'Frozen HTML source is no longer available.')
    }
    if (artifact.version !== draft.source.artifactVersion || artifact.contentHash !== draft.source.contentHash) {
      throw applicationError(409, 'CAPABILITY_SOURCE_DRIFTED', 'Frozen HTML source version or content hash has changed.')
    }
    return artifact
  }

  private async requireWorkspaceAccess(
    workspaceId: string,
    userId: string,
    minRole: WorkspaceMemberRole,
  ): Promise<void> {
    if (!userId) throw applicationError(401, 'UNAUTHENTICATED', 'Authentication required.')
    const workspace = await this.store.getWorkspaceById(workspaceId)
    if (!workspace) throw applicationError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${workspaceId}`)
    const member = await this.store.getWorkspaceMember(workspaceId, userId)
    const effectiveRole = member?.status === 'active'
      ? member.role
      : workspace.ownerId === userId
        ? 'owner'
        : null
    if (!effectiveRole || !roleAllows(effectiveRole, minRole)) {
      throw applicationError(403, 'WORKSPACE_FORBIDDEN', 'You do not have access to this workspace.')
    }
  }
}

function emptyCapabilityBundleDraft(): CapabilityBundleDraft {
  return {
    templatePacks: [],
    skills: [],
    interactionParadigms: [],
    dataContracts: [],
    reviewProfiles: [],
    recommendedCapabilityProfile: {
      templateDraftIndexes: [],
      skillDraftIndexes: [],
      interactionDraftIndexes: [],
      dataContractDraftIndexes: [],
      reviewProfileDraftIndexes: [],
    },
  }
}

function applyLintResult(draft: CapabilityAuthoringDraft, updatedAt: string): CapabilityAuthoringDraft {
  const lint = lintCapabilityAuthoringDraft(draft)
  const next = {
    ...draft,
    findings: lint.findings,
    updatedAt,
  }
  return transitionCapabilityAuthoringDraft(next, lint.recommendedStatus, updatedAt)
}

function isImmutableStatus(status: CapabilityAuthoringDraft['status']): boolean {
  return status === 'published_private'
    || status === 'submitted_for_review'
    || status === 'rejected'
    || status === 'archived'
}

function normalizedContentHash(value: string | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))]
}

function mergeFindings(...groups: CapabilityAuthoringDraft['findings'][]): CapabilityAuthoringDraft['findings'] {
  const result = new Map<string, CapabilityAuthoringDraft['findings'][number]>()
  for (const item of groups.flat()) {
    result.set(`${item.severity}:${item.code}:${item.path}:${item.message}`, item)
  }
  return [...result.values()]
}

function sanitizerFindings(bundle: CapabilityBundleDraft): CapabilityAuthoringDraft['findings'] {
  return bundle.templatePacks.flatMap(template => template.htmlExamples.flatMap(example =>
    (example.sanitization?.findings ?? []).map(item => ({
      severity: item.severity,
      code: item.code,
      path: item.path,
      message: item.message,
    })),
  ))
}

function hasUnconfirmedWarnings(
  findings: CapabilityAuthoringDraft['findings'],
  confirmedPaths: string[],
): boolean {
  const confirmed = new Set(confirmedPaths)
  return findings.some(item => item.severity === 'warning' && !confirmed.has(item.path))
}

function capabilityAuthoringPixelGateEnabled(): boolean {
  return /^(1|true|yes)$/i.test(process.env.DUDESIGN_CAPABILITY_AUTHORING_PIXEL_GATE ?? '')
}

function capabilityAuthoringPixelGateTimeoutMs(): number | undefined {
  const value = Number(process.env.DUDESIGN_CAPABILITY_AUTHORING_PIXEL_GATE_TIMEOUT_MS)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function nextPatchVersion(version: string): string {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) {
    throw applicationError(409, 'DESIGN_TEMPLATE_VERSION_UNSUPPORTED', `Template version is not semantic versioning: ${version}`)
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

function privateTemplateIdForDraft(draftId: string): string {
  return `dtp_private_${createHash('sha256').update(draftId).digest('hex').slice(0, 16)}`
}

function normalizedTemplateName(value: string | undefined, fallback: string): string {
  const normalized = (value?.trim() || fallback.trim()).replace(/\s+/g, ' ').slice(0, 120)
  if (!normalized) throw applicationError(400, 'DESIGN_TEMPLATE_NAME_REQUIRED', 'Template name is required.')
  return normalized
}

function normalizedTemplateDescription(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ').slice(0, 500)
  return normalized || null
}

function filenameBase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'dudesign-template'
}

function sameHtmlExample(left: HtmlExampleReference, right: HtmlExampleReference): boolean {
  if (left.sanitizedArtifactId && right.sanitizedArtifactId) return left.sanitizedArtifactId === right.sanitizedArtifactId
  if (left.authoringAssetId && right.authoringAssetId) return left.authoringAssetId === right.authoringAssetId
  return left === right
}

async function reusableSanitizedArtifact(
  store: ApplicationRepository,
  draft: CapabilityAuthoringDraft,
  contentHash: string,
) {
  const artifactIds = draft.candidateBundle.templatePacks.flatMap(template =>
    template.htmlExamples.map(example => example.sanitizedArtifactId).filter((id): id is string => Boolean(id)),
  )
  for (const artifactId of artifactIds) {
    const artifact = await store.getArtifactById(artifactId)
    if (
      artifact
      && artifact.workspaceId === draft.workspaceId
      && artifact.contentHash === contentHash
      && artifact.metadata.kind === 'capability_authoring_sanitized_html'
      && artifact.metadata.draftId === draft.id
    ) {
      return artifact
    }
  }
  return null
}

function assertCreateDraftInput(input: CreateCapabilityAuthoringDraftRequest): void {
  if (!isPlainObject(input)) throw applicationError(400, 'INVALID_REQUEST', 'Request body must be an object.')
  requiredString(input.workspaceId, 'workspaceId')
  if (!isPlainObject(input.source) || typeof input.source.type !== 'string') {
    throw applicationError(400, 'INVALID_REQUEST', 'source is required.')
  }
  if (!['design_md', 'product_spec_markdown', 'variation_artifact', 'manual'].includes(input.source.type)) {
    throw applicationError(400, 'INVALID_REQUEST', 'Unsupported capability authoring source type.')
  }
  if (input.source.type === 'variation_artifact') {
    requiredString(input.source.variationId, 'source.variationId')
    requiredString(input.source.artifactId, 'source.artifactId')
  }
  if (input.candidateBundle !== undefined && !isCapabilityBundleDraftShape(input.candidateBundle)) {
    throw applicationError(400, 'INVALID_REQUEST', 'candidateBundle has an invalid shape.')
  }
}

function assertUpdateDraftInput(input: UpdateCapabilityAuthoringDraftRequest): void {
  if (!isPlainObject(input)) throw applicationError(400, 'INVALID_REQUEST', 'Request body must be an object.')
  requiredString(input.workspaceId, 'workspaceId')
  if (input.candidateBundle !== undefined && !isCapabilityBundleDraftShape(input.candidateBundle)) {
    throw applicationError(400, 'INVALID_REQUEST', 'candidateBundle has an invalid shape.')
  }
  if (input.confirmedPaths !== undefined && (
    !Array.isArray(input.confirmedPaths)
    || input.confirmedPaths.some(path => typeof path !== 'string')
  )) {
    throw applicationError(400, 'INVALID_REQUEST', 'confirmedPaths must be an array of strings.')
  }
}

function isCapabilityBundleDraftShape(value: unknown): value is CapabilityBundleDraft {
  if (!isPlainObject(value) || !isPlainObject(value.recommendedCapabilityProfile)) return false
  return Array.isArray(value.templatePacks)
    && Array.isArray(value.skills)
    && Array.isArray(value.interactionParadigms)
    && Array.isArray(value.dataContracts)
    && Array.isArray(value.reviewProfiles)
    && Array.isArray(value.recommendedCapabilityProfile.templateDraftIndexes)
    && Array.isArray(value.recommendedCapabilityProfile.skillDraftIndexes)
    && Array.isArray(value.recommendedCapabilityProfile.interactionDraftIndexes)
    && Array.isArray(value.recommendedCapabilityProfile.dataContractDraftIndexes)
    && Array.isArray(value.recommendedCapabilityProfile.reviewProfileDraftIndexes)
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw applicationError(400, 'INVALID_REQUEST', `${path} is required.`)
  }
  return value.trim()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const WORKSPACE_ROLE_RANK: Record<WorkspaceMemberRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
}

function roleAllows(actual: WorkspaceMemberRole, required: WorkspaceMemberRole): boolean {
  return WORKSPACE_ROLE_RANK[actual] >= WORKSPACE_ROLE_RANK[required]
}

function applicationError(status: number, code: string, message: string): Error & { status: number; code: string } {
  const error = new Error(message) as Error & { status: number; code: string }
  error.status = status
  error.code = code
  return error
}
