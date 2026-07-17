import type {
  CapabilityAuthoringDraft,
  CapabilityAuthoringDraftStatus,
  CapabilityAuthoringFinding,
  CapabilityBundleDraft,
  DesignSkillDraft,
  PluginPermissionScope,
} from '@dudesign/contracts'

const allowedStatusTransitions: Record<CapabilityAuthoringDraftStatus, CapabilityAuthoringDraftStatus[]> = {
  analyzing: ['needs_confirmation', 'lint_failed', 'preview_pending', 'archived'],
  needs_confirmation: ['analyzing', 'lint_failed', 'preview_pending', 'ready', 'archived'],
  lint_failed: ['analyzing', 'needs_confirmation', 'preview_pending', 'archived'],
  preview_pending: ['needs_confirmation', 'lint_failed', 'ready', 'archived'],
  ready: ['needs_confirmation', 'lint_failed', 'preview_pending', 'published_private', 'submitted_for_review', 'archived'],
  published_private: ['submitted_for_review', 'archived'],
  submitted_for_review: ['needs_confirmation', 'rejected', 'published_private', 'archived'],
  rejected: ['needs_confirmation', 'archived'],
  archived: [],
}

const safeUserRequestedScopes = new Set<PluginPermissionScope>([
  'readonly_context',
  'validation_only',
])

const dangerousInstructionPatterns: Array<{ code: string; pattern: RegExp; message: string }> = [
  {
    code: 'skill.prompt_injection',
    pattern: /\b(ignore|disregard)\s+(all\s+)?(previous|above|system|developer)\s+instructions?\b/i,
    message: 'Skill instructions cannot override system, developer, runtime, or safety instructions.',
  },
  {
    code: 'skill.safety_override',
    pattern: /\b(disable|bypass|override)\s+(the\s+)?(sandbox|guardrails?|safety|permission|path\s+checks?)\b/i,
    message: 'Skill instructions cannot disable or bypass safety and permission boundaries.',
  },
  {
    code: 'skill.shell_command',
    pattern: /(?:^|\s)(?:sudo|curl|wget|chmod|chown|rm\s+-rf|bash\s+-c|sh\s+-c|powershell)(?:\s|$)/im,
    message: 'User-authored declarative skills cannot contain shell or download commands.',
  },
  {
    code: 'skill.absolute_path',
    pattern: /(?:^|[\s"'`])(?:\/(?:etc|root|var|tmp|home|Users|workspace|app)\/|[A-Za-z]:\\)/m,
    message: 'User-authored declarative skills cannot reference absolute filesystem paths.',
  },
  {
    code: 'skill.executable_content',
    pattern: /<script\b|javascript:|child_process|process\.env|require\s*\(|import\s*\(/i,
    message: 'User-authored declarative skills cannot contain executable code or secret access.',
  },
]

const MAX_SKILL_TEXT_CHARS = 12_000
const MAX_SKILL_ITEM_CHARS = 2_000
const MAX_SKILL_ITEMS_PER_SECTION = 50

export function canTransitionCapabilityAuthoringDraft(
  from: CapabilityAuthoringDraftStatus,
  to: CapabilityAuthoringDraftStatus,
): boolean {
  return from === to || allowedStatusTransitions[from].includes(to)
}

export function transitionCapabilityAuthoringDraft(
  draft: CapabilityAuthoringDraft,
  status: CapabilityAuthoringDraftStatus,
  updatedAt: string,
): CapabilityAuthoringDraft {
  if (!canTransitionCapabilityAuthoringDraft(draft.status, status)) {
    throw new Error(`Invalid capability authoring draft transition: ${draft.status} -> ${status}`)
  }
  return {
    ...draft,
    status,
    updatedAt,
  }
}

export function lintCapabilityAuthoringDraft(draft: CapabilityAuthoringDraft): {
  findings: CapabilityAuthoringFinding[]
  recommendedStatus: CapabilityAuthoringDraftStatus
} {
  const findings: CapabilityAuthoringFinding[] = []

  lintSource(draft, findings)
  lintBundle(draft.candidateBundle, findings)

  const hasErrors = findings.some(finding => finding.severity === 'error')
  const hasUnconfirmedEvidence = collectBundleEvidence(draft.candidateBundle).some(evidence =>
    evidence.extractionMethod !== 'user_confirmed'
    && !draft.confirmedPaths.includes(evidence.targetPath),
  )

  return {
    findings,
    recommendedStatus: hasErrors
      ? 'lint_failed'
      : hasUnconfirmedEvidence || findings.some(finding => finding.severity === 'warning')
        ? 'needs_confirmation'
        : 'preview_pending',
  }
}

export function lintDesignSkillDraft(
  skill: DesignSkillDraft,
  path = 'candidateBundle.skills[0]',
): CapabilityAuthoringFinding[] {
  const findings: CapabilityAuthoringFinding[] = []
  const textSections: Array<[string, string[]]> = [
    ['rules', skill.rules],
    ['promptBlocks', skill.promptBlocks],
    ['negativeRules', skill.negativeRules],
    ['qualityChecklist', skill.qualityChecklist],
  ]

  if (!skill.name.trim()) findings.push(finding('error', 'skill.name_required', `${path}.name`, 'Skill name is required.'))
  if (!skill.description.trim()) findings.push(finding('error', 'skill.description_required', `${path}.description`, 'Skill description is required.'))
  if (!skill.category.trim()) findings.push(finding('error', 'skill.category_required', `${path}.category`, 'Skill category is required.'))
  if (skill.rules.length === 0) findings.push(finding('error', 'skill.rules_required', `${path}.rules`, 'At least one generation rule is required.'))
  if (skill.qualityChecklist.length === 0) {
    findings.push(finding('warning', 'skill.checklist_recommended', `${path}.qualityChecklist`, 'A quality checklist is recommended before preview or publication.'))
  }

  for (const [section, values] of textSections) {
    if (values.length > MAX_SKILL_ITEMS_PER_SECTION) {
      findings.push(finding('error', 'skill.too_many_items', `${path}.${section}`, `Skill ${section} cannot contain more than ${MAX_SKILL_ITEMS_PER_SECTION} items.`))
    }
    values.forEach((value, index) => {
      if (!value.trim()) {
        findings.push(finding('error', 'skill.empty_item', `${path}.${section}[${index}]`, 'Skill rule entries cannot be empty.'))
      }
      if (value.length > MAX_SKILL_ITEM_CHARS) {
        findings.push(finding('error', 'skill.item_too_long', `${path}.${section}[${index}]`, `Skill rule entries cannot exceed ${MAX_SKILL_ITEM_CHARS} characters.`))
      }
    })
  }

  const combinedText = [
    skill.name,
    skill.description,
    ...textSections.flatMap(([, values]) => values),
  ].join('\n')
  if (combinedText.length > MAX_SKILL_TEXT_CHARS) {
    findings.push(finding('error', 'skill.prompt_too_long', path, `Compiled declarative skill text cannot exceed ${MAX_SKILL_TEXT_CHARS} characters.`))
  }

  for (const dangerous of dangerousInstructionPatterns) {
    if (dangerous.pattern.test(combinedText)) {
      findings.push(finding('error', dangerous.code, path, dangerous.message))
    }
  }

  const elevatedScopes = skill.requestedScopes.filter(scope => !safeUserRequestedScopes.has(scope))
  if (elevatedScopes.length > 0) {
    findings.push(finding(
      'error',
      'skill.scope_elevation',
      `${path}.requestedScopes`,
      `Private declarative skills cannot request elevated scopes: ${elevatedScopes.join(', ')}.`,
    ))
  }

  if (skill.safetyLevel === 'safe' && skill.requestedScopes.length > 0) {
    findings.push(finding(
      'info',
      'skill.scope_requires_review',
      `${path}.requestedScopes`,
      'Requested scopes remain advisory until application-service authorization and administrator review.',
    ))
  }

  return findings
}

function lintSource(draft: CapabilityAuthoringDraft, findings: CapabilityAuthoringFinding[]): void {
  if (!draft.source.contentHash.trim()) {
    findings.push(finding('error', 'source.content_hash_required', 'source.contentHash', 'Authoring source must be frozen to a content hash.'))
  }
  if (draft.source.type === 'variation_artifact') {
    if (!draft.source.variationId || !draft.source.artifactId || draft.source.artifactVersion < 1) {
      findings.push(finding('error', 'source.artifact_version_required', 'source', 'Variation authoring sources require variation id, artifact id, and a positive artifact version.'))
    }
  }
}

function lintBundle(bundle: CapabilityBundleDraft, findings: CapabilityAuthoringFinding[]): void {
  if (
    bundle.templatePacks.length === 0
    && bundle.skills.length === 0
    && bundle.interactionParadigms.length === 0
    && bundle.dataContracts.length === 0
    && bundle.reviewProfiles.length === 0
  ) {
    findings.push(finding('error', 'bundle.empty', 'candidateBundle', 'Capability bundle draft must contain at least one candidate capability.'))
  }

  bundle.templatePacks.forEach((template, templateIndex) => {
    const path = `candidateBundle.templatePacks[${templateIndex}]`
    if (!template.name.trim()) findings.push(finding('error', 'template.name_required', `${path}.name`, 'Template draft name is required.'))
    if (template.sectionBlueprints.length === 0) {
      findings.push(finding('warning', 'template.sections_missing', `${path}.sectionBlueprints`, 'Template draft should contain at least one section blueprint.'))
    }
    if (Object.keys(template.designTokens.colors).length === 0) {
      findings.push(finding('warning', 'template.colors_missing', `${path}.designTokens.colors`, 'No reusable color tokens were extracted.'))
    }
    for (const [confidencePath, confidence] of Object.entries(template.confidence)) {
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        findings.push(finding('error', 'evidence.confidence_invalid', `${path}.confidence.${confidencePath}`, 'Confidence must be between 0 and 1.'))
      }
    }
  })

  bundle.skills.forEach((skill, skillIndex) => {
    findings.push(...lintDesignSkillDraft(skill, `candidateBundle.skills[${skillIndex}]`))
  })

  lintEvidenceCollection(bundle, findings)
  lintProfileIndexes(bundle, findings)
}

function lintEvidenceCollection(bundle: CapabilityBundleDraft, findings: CapabilityAuthoringFinding[]): void {
  const collections = [
    ...bundle.templatePacks.map((item, index) => ({
      path: `candidateBundle.templatePacks[${index}].sourceEvidence`,
      evidence: item.sourceEvidence,
    })),
    ...bundle.interactionParadigms.map((item, index) => ({
      path: `candidateBundle.interactionParadigms[${index}].sourceEvidence`,
      evidence: item.sourceEvidence,
    })),
    ...bundle.dataContracts.map((item, index) => ({
      path: `candidateBundle.dataContracts[${index}].sourceEvidence`,
      evidence: item.sourceEvidence,
    })),
    ...bundle.reviewProfiles.map((item, index) => ({
      path: `candidateBundle.reviewProfiles[${index}].sourceEvidence`,
      evidence: item.sourceEvidence,
    })),
  ]

  for (const collection of collections) {
    collection.evidence.forEach((evidence, evidenceIndex) => {
      if (!Number.isFinite(evidence.confidence) || evidence.confidence < 0 || evidence.confidence > 1) {
        findings.push(finding('error', 'evidence.confidence_invalid', `${collection.path}[${evidenceIndex}].confidence`, 'Evidence confidence must be between 0 and 1.'))
      }
      if (!evidence.sourcePath.trim() || !evidence.targetPath.trim()) {
        findings.push(finding('error', 'evidence.path_required', `${collection.path}[${evidenceIndex}]`, 'Evidence requires source and target paths.'))
      }
    })
  }
}

function collectBundleEvidence(bundle: CapabilityBundleDraft) {
  return [
    ...bundle.templatePacks.flatMap(item => item.sourceEvidence),
    ...bundle.interactionParadigms.flatMap(item => item.sourceEvidence),
    ...bundle.dataContracts.flatMap(item => item.sourceEvidence),
    ...bundle.reviewProfiles.flatMap(item => item.sourceEvidence),
  ]
}

function lintProfileIndexes(bundle: CapabilityBundleDraft, findings: CapabilityAuthoringFinding[]): void {
  const checks: Array<[string, number[], number]> = [
    ['templateDraftIndexes', bundle.recommendedCapabilityProfile.templateDraftIndexes, bundle.templatePacks.length],
    ['skillDraftIndexes', bundle.recommendedCapabilityProfile.skillDraftIndexes, bundle.skills.length],
    ['interactionDraftIndexes', bundle.recommendedCapabilityProfile.interactionDraftIndexes, bundle.interactionParadigms.length],
    ['dataContractDraftIndexes', bundle.recommendedCapabilityProfile.dataContractDraftIndexes, bundle.dataContracts.length],
    ['reviewProfileDraftIndexes', bundle.recommendedCapabilityProfile.reviewProfileDraftIndexes, bundle.reviewProfiles.length],
  ]
  for (const [field, indexes, collectionLength] of checks) {
    for (const index of indexes) {
      if (!Number.isInteger(index) || index < 0 || index >= collectionLength) {
        findings.push(finding('error', 'bundle.profile_index_invalid', `candidateBundle.recommendedCapabilityProfile.${field}`, `Capability profile references missing index ${index}.`))
      }
    }
  }
}

function finding(
  severity: CapabilityAuthoringFinding['severity'],
  code: string,
  path: string,
  message: string,
): CapabilityAuthoringFinding {
  return { severity, code, path, message }
}
