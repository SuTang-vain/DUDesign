import type { ArtifactQualitySummary, AutomationLoopProfile } from '@dudesign/contracts'

export type AutomationLoopStopReason =
  | 'max_attempts_reached'
  | 'max_cost_reached'
  | 'max_duration_reached'
  | 'quality_failed'
  | 'quality_passed'
  | 'runtime_unavailable'
  | 'runtime_contract_mismatch'
  | 'repeated_failure'
  | 'cancelled'

export type AutomationLoopStopDecision = {
  shouldStop: boolean
  reason: AutomationLoopStopReason | null
  message: string | null
  recoverable: boolean
}

export type AutomationLoopEvaluationInput = {
  profile: AutomationLoopProfile
  attempts: number
  elapsedMs: number
  costCents: number
  quality: ArtifactQualitySummary
  runtimeStatus?: 'available' | 'unavailable' | 'contract_mismatch'
  cancelled?: boolean
  previousIssueFingerprints?: string[]
}

export type AutomationRepairFinding = {
  id: string
  source: 'static_rule' | 'template_rule' | 'pixel_gate'
  severity: 'error' | 'warning'
  message: string
  repairHint: string
}

export function evaluateAutomationLoopStop(input: AutomationLoopEvaluationInput): AutomationLoopStopDecision {
  if (input.cancelled) return stop('cancelled')
  if (input.runtimeStatus === 'contract_mismatch') return stop('runtime_contract_mismatch')
  if (input.runtimeStatus === 'unavailable') return stop('runtime_unavailable')
  if (input.quality.status === 'pass') return stop('quality_passed')
  if (input.elapsedMs >= input.profile.maxDurationMs) return stop('max_duration_reached')
  if (input.profile.maxCostCents !== null && input.costCents >= input.profile.maxCostCents) return stop('max_cost_reached')
  if (isRepeatedFailure(input.quality.issues, input.previousIssueFingerprints ?? [])) return stop('repeated_failure')
  if (input.attempts >= input.profile.maxRepairAttempts) {
    return stop(input.quality.status === 'fail' ? 'max_attempts_reached' : 'quality_failed')
  }
  return {
    shouldStop: false,
    reason: null,
    message: null,
    recoverable: true,
  }
}

export function automationLoopUserMessage(reason: AutomationLoopStopReason): string {
  switch (reason) {
    case 'quality_passed':
      return 'The generated page passed the configured quality checks.'
    case 'max_attempts_reached':
      return 'Automatic repair reached its attempt limit. The current version is preserved and you can continue with a manual instruction.'
    case 'max_cost_reached':
      return 'Automatic repair stopped to avoid exceeding the configured cost limit. The current version is preserved.'
    case 'max_duration_reached':
      return 'Automatic repair took too long and was stopped to avoid blocking the task. The current version is preserved.'
    case 'quality_failed':
      return 'The page still has quality issues. Add a more specific instruction to continue refining it.'
    case 'runtime_unavailable':
      return 'The design runtime is temporarily unavailable. The current artifact is preserved and the task can be continued later.'
    case 'runtime_contract_mismatch':
      return 'The runtime compatibility contract changed, so automatic repair stopped to protect this task.'
    case 'repeated_failure':
      return 'Automatic repair encountered the same quality issue repeatedly. A manual instruction is needed to move forward.'
    case 'cancelled':
      return 'Automatic repair was cancelled.'
  }
}

export function automationIssueFingerprint(issues: string[]): string {
  return issues
    .map(issue => issue.toLowerCase().replace(/artifact v\d+/g, 'artifact').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .sort()
    .join('|')
}

export function buildAutomationRepairPrompt(input: {
  issues: string[]
  specFindings?: AutomationRepairFinding[]
  originalPrompt: string
  templateSummary?: string | null
}): string {
  const issueList = input.issues.length > 0
    ? input.issues.map(issue => `- ${issue}`).join('\n')
    : '- The artifact did not pass the configured quality gate.'
  const templateSummary = input.templateSummary?.trim()
  const specFindings = input.specFindings ?? []
  const specFindingList = specFindings.length
    ? [
      '',
      'Structured dynamic encyclopedia spec findings:',
      ...specFindings.map(finding =>
        `- [${finding.severity}] ${finding.id} (${finding.source}): ${finding.message} Repair hint: ${finding.repairHint}`,
      ),
    ]
    : []
  const targetedInstructions = targetedRepairInstructions(specFindings, input.issues)
  return [
    'DUDesign automatic repair request.',
    '',
    'The current HTML artifact failed quality checks:',
    issueList,
    ...specFindingList,
    ...targetedInstructions,
    '',
    `Original user goal: ${input.originalPrompt.trim()}`,
    templateSummary ? `Design context to preserve: ${templateSummary}` : '',
    '',
    'Repair only the concrete quality issues above.',
    'Keep the original product goal, visual direction, selected template, and user constraints.',
    'Return a complete self-contained HTML/CSS/JS artifact.',
    'Small inline JavaScript is allowed only for local UI controls such as tabs, page switchers, accordions, modal dialogs, reveal buttons, and local state updates.',
    'Do not introduce external scripts, build steps, absolute paths, shell commands, remote API calls, or unbundled network assets.',
  ].filter(line => line.length > 0).join('\n')
}

function targetedRepairInstructions(findings: AutomationRepairFinding[], issues: string[]): string[] {
  const instructions: string[] = []
  const findingIds = new Set(findings.map(finding => finding.id))

  if (issues.some(issue => /fixed-card layout is invalid|fixed-card interaction is unusable/i.test(issue))) {
    instructions.push(
      '',
      'Required fixed-card geometry repair:',
      '- Keep the outer 788x492, 380x456, or 300x360 frame centered in the viewport with overflow:hidden and box-sizing:border-box.',
      '- Remove or move secondary modules until every visible interactive control fits completely inside the frame.',
      '- Ensure the center point of every visible button/tab is not covered by member cards, graphs, panels, overlays, or decorative layers.',
      '- Prefer one primary interaction surface. Reduce summary, fact, relation, comparison, or timeline modules that compete for the same fixed height.',
      '- Do not repair geometry findings by changing only copy, aria attributes, or event listeners.',
    )
  }

  if (issues.some(issue => /desktop democase-derived first view/i.test(issue))) {
    instructions.push(
      '',
      'Required democase composition repair:',
      '- Rebuild the first view around one topic promise, one dominant visual or interaction stage, and one obvious next action.',
      '- Keep at most one primary selector group and one optional local disclosure group. Move all other choices into the selected state, paging, or a modal.',
      '- Remove equal-weight fact tiles, KPI/stat rows, duplicate metadata, source panels, tag clouds, and secondary modules that compete with the main stage.',
      '- Preserve the information by revealing it through the existing interaction; do not delete required facts and do not merely shrink cards or text.',
      '- Timeline and origin cards show one active phase; relation/member cards show one map and one selected detail; comparison cards show one active dimension; route/map cards show one selected stop or POI.',
      '- Use whitespace deliberately. Do not fill every grid cell or replace one overloaded dashboard with another card grid.',
    )
  }

  if (issues.some(issue => /not adapted to a 300x360|hides every page-switching tab|no visible primary interaction|visible primary tabs|visible controls in total|additional topic controls|equal-level visible items|does not keep a visible topic title|does not keep enough visible core topic text|initial view is overloaded|clips .* visible core text blocks|duplicate controls for the same labelled actions|separate control groups|undersized interactive controls|does not expose a local disclosure interaction|does not change visible content|disclosure interaction could not be activated/i.test(issue))) {
    instructions.push(
      '',
      'Required 300x360 extreme-small repair:',
      '- Add a dedicated 300x360 layout and make the rendered outer frame exactly 300x360 CSS px, including border and padding.',
      '- Keep the topic title, one concise essential summary or fact, and the necessary page-switching tab or primary reveal action visible on the first view.',
      '- Recompose the compact DOM/CSS state around exactly one primary navigation group. Use either two or three tabs/segmented buttons, two or three entity or phase choices, or one reveal action; keep at most one additional local detail action.',
      '- Reduce first-view information density. Move secondary facts into a local tab, page switcher, accordion, detail panel, or modal that opens after a tap.',
      '- Keep exactly one concise core fact or summary in the initial state. Remove duplicate metadata, source rows, decorative labels, repeated summaries, and secondary fact cards instead of cropping them at the frame edge.',
      '- Make the next action self-evident with a short Chinese affordance such as 查看更多、切换阶段、查看关系 or a visible page indicator; do not add instructional prose.',
      '- Keep each retained control directly tappable, at least 24x24 CSS px, fully inside the frame, and unobscured at its center point.',
      '- If using an SVG viewBox or canvas, remember its rendered CSS bounding box is what matters: do not count SVG user-space coordinates or pointer-events: bounding-box as a 24px hit target. Prefer HTML/CSS buttons for compact controls, or add a transparent hit layer whose measured browser bounding box is at least 24x24 CSS px after scaling.',
      '- Apply a strict control budget in the initial 300x360 state: at most three primary tabs or choices and at most two additional visible topic controls. Replace longer chip/node/member rows with previous/next controls, a single selector, or a secondary detail state.',
      '- If the quality report says the compact state exposes too many tabs or topic controls, hide or aggregate the excess in the initial state; do not merely shrink the labels or reduce font size.',
      '- If controls or control groups are duplicated, keep only one compact navigation group and one optional detail action. Timeline phases, relation nodes, and comparison dimensions must not be repeated in a second toolbar or footer.',
      '- Relation/member compact state: keep one selector with at most three nodes or members; remove the competing relationship-tab row. Timeline/origin compact state: show one active phase plus one compact phase switcher. Comparison compact state: show one active dimension plus one compact selector; remove the second target/view tab row. Progressive-disclosure compact state: use accordion toggles or tabs for categories, never both.',
      '- Hide deferred desktop modules with display:none in the compact initial state. Do not move them outside the frame, crop them with overflow, or leave transparent controls in pointer hit-testing.',
      '- Remove duplicate interaction layers at 300x360. When HTML fallback controls represent SVG/canvas nodes, make the SVG/canvas nodes non-interactive and non-focusable in the compact state.',
      '- Check the actual browser rectangles of all retained controls; no last-row item may wrap beyond, clip against, or sit outside the 300x360 frame.',
      '- Make the retained control change visible content or accessible state locally; do not leave decorative or fake tabs.',
      '- Add an unoverridden [hidden] { display:none !important; } rule (or an equally specific inactive-panel rule). Grid/flex declarations such as .tab-panel { display:grid } must never override the HTML hidden state.',
      '- After switching tabs or compact states, only the active panel may participate in layout or pointer hit-testing. Inactive panels must be display:none and must not cover controls even when they are visually transparent.',
      '- Do not solve the small viewport by scrolling, scaling down the desktop card, hiding every control, or removing the topic identity.',
    )
  }

  if (issues.some(issue => /relation_map|relation(?:ship)?(?:[- ]|\s).*(?:visible controls|topic controls|tabs)|(?:visible controls|topic controls).*relation/i.test(issue))) {
    instructions.push(
      '',
      'Required relation/member compact repair:',
      '- At 300x360 keep exactly one visible selector group with 2-3 directly selectable relation or member buttons. Hide the relationship-category tab row and every duplicate compact tab.',
      '- Remove reset, 查看更多, modal triggers, source rows, legends, counts, and decorative badges from the initial compact state; selecting a node is the next action.',
      '- Keep one replacing detail surface with one relationship label, one selected name, and at most two short Chinese sentences. Additional nodes must replace the same slots or be reached through one short 更多/下一组 control.',
      '- On desktop, keep the relation graph bounded to one primary node group and one detail surface; do not add a second navigation row merely to expose more relationships.',
    )
  }

  if (findingIds.has('encyclopedia.marketing_pattern_risk')) {
    instructions.push(
      '',
      'Required topic-card semantic repair:',
      '- Remove proof rows, proof pills, testimonials, CTA rhythms, pricing, signup, conversion, and social-proof structures.',
      '- Reallocate that space to the assigned template primary interaction and topic-specific visual hierarchy.',
    )
  }

  if (findingIds.has('encyclopedia.neutral_tone_risk')
    || issues.some(issue => /promotional|superlative|marketing-like claims/i.test(issue))) {
    instructions.push(
      '',
      'Required neutral editorial copy repair:',
      '- Remove superlatives, promotional adjectives, conversion language, and unsupported conclusions.',
      '- Rewrite claims as short, attributable facts; use neutral labels such as「资料待核实」when evidence is not available.',
      '- Do not add proof, ranking, testimonial, CTA, or “best/leading/most” language to fill space.',
    )
  }

  if (findingIds.has('encyclopedia.chinese_only_required')
    || findingIds.has('encyclopedia.excessive_english_phrases')
    || issues.some(issue => /primarily in Chinese|multi-word English phrases|汉字占比/i.test(issue))) {
    instructions.push(
      '',
      'Required Chinese-first copy repair:',
      '- Rewrite all non-proper-noun UI labels, helper text, tabs, buttons, and descriptions in Simplified Chinese.',
      '- Keep English only for names, official titles, album/work names, or short source quotations with clear attribution.',
      '- Do not use English phrases such as View More, Member Details, Explore, Summary, or Timeline as UI copy when a Chinese label is available.',
      '- Make the body prose Chinese share at least 60 percent after the rewrite; preserve the topic name and proper nouns.',
    )
  }

  if (findingIds.has('encyclopedia.primary_interaction_missing')) {
    instructions.push(
      '',
      'Required primary interaction repair:',
      '- Add one visible, meaningful local interaction that matches the assigned template and changes a bounded content state.',
      '- Keep supporting facts subordinate to this interaction instead of adding more static summary sections.',
    )
  }

  if (findingIds.has('encyclopedia.member_template_mismatch')) {
    instructions.push(
      '',
      'Required member-map template repair:',
      '- Make member exploration the dominant surface: show at least two selectable members and one bounded detail panel.',
      '- Clicking a member must update the selected member name, role, and relationship context locally.',
      '- Do not let a generic timeline, summary, proof row, or marketing hero replace the member selection experience.',
    )
  }

  if (findingIds.has('encyclopedia.relation_template_mismatch')) {
    instructions.push(
      '',
      'Required relationship-map template repair:',
      '- Show labeled relationship nodes/edges or a clearly grouped relationship list as the primary visual.',
      '- Add one local relation filter or node selection state; every visible relation label must remain inside the fixed frame.',
    )
  }

  if (findingIds.has('encyclopedia.compare_template_mismatch')) {
    instructions.push(
      '',
      'Required comparison template repair:',
      '- Show at least two entities against explicit labeled dimensions, differences, or shared traits.',
      '- Add a local switch or highlight state that changes the comparison without external navigation.',
    )
  }

  if (findingIds.has('encyclopedia.expandable_template_mismatch')) {
    instructions.push(
      '',
      'Required progressive-disclosure template repair:',
      '- Add concise expandable fact sections with visible expanded/collapsed state and bounded content.',
      '- Keep expanded content within the fixed card; use tabs or a modal for overflow instead of scrolling.',
    )
  }

  if (findingIds.has('encyclopedia.fake_tab_interaction')) {
    instructions.push(
      '',
      'Required tab interaction repair:',
      '- Keep visible tab controls only if they are real buttons with role="tab", aria-selected, and aria-controls.',
      '- Add matching role="tabpanel" sections with stable ids and hidden states.',
      '- Add scoped inline JavaScript that switches aria-selected and hidden when a tab is clicked.',
    )
  }

  if (findingIds.has('encyclopedia.fake_page_switcher_interaction')) {
    instructions.push(
      '',
      'Required page switcher repair:',
      '- Keep pagination/page-switch controls only if they switch between local page panels.',
      '- Add hidden states for inactive panels and a scoped inline click handler that updates the active page.',
      '- Do not rely on scrolling to reveal overflow content.',
    )
  }

  if (findingIds.has('encyclopedia.fake_modal_interaction')) {
    instructions.push(
      '',
      'Required modal interaction repair:',
      '- Keep modal/detail/reveal controls only if they open a local modal or detail panel.',
      '- Add accessible open/close buttons, aria-expanded or aria-hidden state updates, and focus-safe local handlers.',
      '- Do not navigate to external pages or call network APIs for modal content.',
    )
  }

  if (findingIds.has('encyclopedia.no_scroll_frame_required')
    || findingIds.has('encyclopedia.overflow_scroll_blocked')
    || findingIds.has('encyclopedia.scroll_container_class_blocked')) {
    instructions.push(
      '',
      'Required no-scroll frame repair:',
      '- Preserve a fixed dynamic encyclopedia frame and set overflow:hidden on the outer frame.',
      '- Remove .scroll-container and every overflow:auto, overflow:scroll, overflow-y:auto, and overflow-y:scroll declaration from the artifact, including modal bodies.',
      '- Route extra content through tabs, page switchers, accordions, or local modal panels.',
    )
  }

  if (findingIds.has('encyclopedia.duplicate_dynamic_card_root')
    || issues.some(issue => /declares \d+ dynamic card roots/i.test(issue))) {
    instructions.push(
      '',
      'Required single-root repair:',
      '- Keep exactly one [data-dudesign-template] dynamic card root in the document.',
      '- Remove duplicated <main>/<section> card shells and merge their required content into the single surviving root; do not hide a duplicate root with opacity or off-screen positioning.',
    )
  }

  return instructions
}

function stop(reason: AutomationLoopStopReason): AutomationLoopStopDecision {
  return {
    shouldStop: true,
    reason,
    message: automationLoopUserMessage(reason),
    recoverable: reason !== 'quality_passed' && reason !== 'cancelled',
  }
}

function isRepeatedFailure(issues: string[], previousFingerprints: string[]): boolean {
  if (issues.length === 0 || previousFingerprints.length === 0) return false
  return previousFingerprints.includes(automationIssueFingerprint(issues))
}
