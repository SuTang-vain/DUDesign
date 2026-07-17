import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AutomationLoopProfile } from '@dudesign/contracts'
import {
  automationIssueFingerprint,
  automationLoopUserMessage,
  buildAutomationRepairPrompt,
  evaluateAutomationLoopStop,
} from './automationLoop.js'

const standardProfile: AutomationLoopProfile = {
  id: 'loop_standard',
  name: 'Standard',
  description: 'Run static quality checks and allow limited automated repair.',
  maxRepairAttempts: 1,
  maxCostCents: 200,
  maxDurationMs: 300000,
  qualityGates: ['static'],
  repairStrategy: 'minimal_refine',
}

describe('Automation Loop stop conditions', () => {
  it('stops when quality passes', () => {
    const decision = evaluateAutomationLoopStop({
      profile: standardProfile,
      attempts: 0,
      elapsedMs: 1000,
      costCents: 0,
      quality: { status: 'pass', issues: [] },
    })

    assert.equal(decision.shouldStop, true)
    assert.equal(decision.reason, 'quality_passed')
    assert.equal(decision.recoverable, false)
  })

  it('stops at max attempts with a recoverable user-facing reason', () => {
    const decision = evaluateAutomationLoopStop({
      profile: standardProfile,
      attempts: 1,
      elapsedMs: 1000,
      costCents: 0,
      quality: { status: 'fail', issues: ['Body is empty.'] },
    })

    assert.equal(decision.shouldStop, true)
    assert.equal(decision.reason, 'max_attempts_reached')
    assert.equal(decision.recoverable, true)
    assert.match(decision.message ?? '', /attempt limit/i)
  })

  it('stops at max cost and max duration before scheduling repair', () => {
    assert.equal(evaluateAutomationLoopStop({
      profile: standardProfile,
      attempts: 0,
      elapsedMs: 1000,
      costCents: 200,
      quality: { status: 'fail', issues: ['External scripts are blocked.'] },
    }).reason, 'max_cost_reached')

    assert.equal(evaluateAutomationLoopStop({
      profile: standardProfile,
      attempts: 0,
      elapsedMs: 300000,
      costCents: 0,
      quality: { status: 'fail', issues: ['External scripts are blocked.'] },
    }).reason, 'max_duration_reached')
  })

  it('stops on runtime unavailable or contract mismatch', () => {
    assert.equal(evaluateAutomationLoopStop({
      profile: standardProfile,
      attempts: 0,
      elapsedMs: 1000,
      costCents: 0,
      quality: { status: 'fail', issues: ['Body is empty.'] },
      runtimeStatus: 'unavailable',
    }).reason, 'runtime_unavailable')

    assert.equal(evaluateAutomationLoopStop({
      profile: standardProfile,
      attempts: 0,
      elapsedMs: 1000,
      costCents: 0,
      quality: { status: 'fail', issues: ['Body is empty.'] },
      runtimeStatus: 'contract_mismatch',
    }).reason, 'runtime_contract_mismatch')
  })

  it('detects repeated failure fingerprints', () => {
    const fingerprint = automationIssueFingerprint(['Artifact v1 needs attention: Body is empty.'])
    const decision = evaluateAutomationLoopStop({
      profile: standardProfile,
      attempts: 0,
      elapsedMs: 1000,
      costCents: 0,
      quality: { status: 'fail', issues: ['Artifact v2 needs attention: Body is empty.'] },
      previousIssueFingerprints: [fingerprint],
    })

    assert.equal(decision.reason, 'repeated_failure')
  })

  it('allows another repair attempt when no stop condition is met', () => {
    const decision = evaluateAutomationLoopStop({
      profile: standardProfile,
      attempts: 0,
      elapsedMs: 1000,
      costCents: 10,
      quality: { status: 'fail', issues: ['External stylesheets may not be bundled.'] },
    })

    assert.equal(decision.shouldStop, false)
    assert.equal(decision.reason, null)
  })
})

describe('Automation Loop repair prompt and messages', () => {
  it('builds a minimal repair prompt without unsafe execution instructions', () => {
    const prompt = buildAutomationRepairPrompt({
      issues: ['Body is empty.', 'External scripts are blocked in preview.'],
      originalPrompt: 'Create a landing page for an invoicing app.',
      templateSummary: 'Premium Product Launch',
    })

    assert.match(prompt, /DUDesign automatic repair request/)
    assert.match(prompt, /Body is empty/)
    assert.match(prompt, /Original user goal: Create a landing page/)
    assert.match(prompt, /Premium Product Launch/)
    assert.match(prompt, /Return a complete self-contained HTML\/CSS\/JS artifact/)
    assert.doesNotMatch(prompt, /npm install|sudo|rm -rf/i)
  })

  it('includes structured dynamic encyclopedia spec findings in repair prompts', () => {
    const prompt = buildAutomationRepairPrompt({
      issues: [
        'Dynamic encyclopedia spec review failed.',
        'Timeline child template is missing milestone content.',
      ],
      specFindings: [
        {
          id: 'encyclopedia.no_scroll_frame_required',
          source: 'template_rule',
          severity: 'warning',
          message: 'Dynamic encyclopedia cards must declare a non-scrolling frame.',
          repairHint: 'Set overflow:hidden and route overflow content through tabs, page switchers, or modal dialogs.',
        },
        {
          id: 'encyclopedia.timeline_template_mismatch',
          source: 'template_rule',
          severity: 'error',
          message: 'The selected timeline child template needs visible timeline or milestone content.',
          repairHint: 'Add a timeline section with dated or phased milestones.',
        },
      ],
      originalPrompt: '生成百度百科动态百科词条卡片。',
      templateSummary: 'Dynamic Encyclopedia Timeline Card',
    })

    assert.equal(prompt, [
      'DUDesign automatic repair request.',
      'The current HTML artifact failed quality checks:',
      '- Dynamic encyclopedia spec review failed.',
      '- Timeline child template is missing milestone content.',
      'Structured dynamic encyclopedia spec findings:',
      '- [warning] encyclopedia.no_scroll_frame_required (template_rule): Dynamic encyclopedia cards must declare a non-scrolling frame. Repair hint: Set overflow:hidden and route overflow content through tabs, page switchers, or modal dialogs.',
      '- [error] encyclopedia.timeline_template_mismatch (template_rule): The selected timeline child template needs visible timeline or milestone content. Repair hint: Add a timeline section with dated or phased milestones.',
      'Required no-scroll frame repair:',
      '- Preserve a fixed dynamic encyclopedia frame and set overflow:hidden on the outer frame.',
      '- Remove .scroll-container and every overflow:auto, overflow:scroll, overflow-y:auto, and overflow-y:scroll declaration from the artifact, including modal bodies.',
      '- Route extra content through tabs, page switchers, accordions, or local modal panels.',
      'Original user goal: 生成百度百科动态百科词条卡片。',
      'Design context to preserve: Dynamic Encyclopedia Timeline Card',
      'Repair only the concrete quality issues above.',
      'Keep the original product goal, visual direction, selected template, and user constraints.',
      'Return a complete self-contained HTML/CSS/JS artifact.',
      'Small inline JavaScript is allowed only for local UI controls such as tabs, page switchers, accordions, modal dialogs, reveal buttons, and local state updates.',
      'Do not introduce external scripts, build steps, absolute paths, shell commands, remote API calls, or unbundled network assets.',
    ].join('\n'))
  })

  it('adds targeted repair instructions for fake dynamic encyclopedia interactions', () => {
    const prompt = buildAutomationRepairPrompt({
      issues: ['Dynamic encyclopedia tab controls look clickable but do not switch content.'],
      specFindings: [
        {
          id: 'encyclopedia.fake_tab_interaction',
          source: 'template_rule',
          severity: 'warning',
          message: 'Visible tab controls require matching panels and local state switching.',
          repairHint: 'Add role=tab buttons, role=tabpanel sections, and inline click handlers.',
        },
      ],
      originalPrompt: '生成动态百科卡片。',
      templateSummary: 'Dynamic Encyclopedia Summary Card',
    })

    assert.match(prompt, /Required tab interaction repair/)
    assert.match(prompt, /role="tab"/)
    assert.match(prompt, /role="tabpanel"/)
    assert.match(prompt, /switches aria-selected and hidden/)
    assert.match(prompt, /Small inline JavaScript is allowed/)
    assert.match(prompt, /Do not introduce external scripts/)
  })

  it('adds geometry and topic-semantic repair instructions instead of allowing copy-only edits', () => {
    const prompt = buildAutomationRepairPrompt({
      issues: [
        'Rendered fixed-card layout is invalid: 2 interactive controls are clipped or outside the card frame.',
        'Rendered fixed-card interaction is unusable: 3 controls are visually covered at their center hit point.',
      ],
      specFindings: [{
        id: 'encyclopedia.marketing_pattern_risk',
        source: 'template_rule',
        severity: 'warning',
        message: 'The topic card contains landing-page marketing or conversion patterns.',
        repairHint: 'Remove proof blocks and use the assigned primary interaction.',
      }],
      originalPrompt: '生成 BLACKPINK 主题动态交互卡。',
      templateSummary: '明星组合成员体系',
    })

    assert.match(prompt, /Required fixed-card geometry repair/)
    assert.match(prompt, /center point of every visible button\/tab is not covered/)
    assert.match(prompt, /Do not repair geometry findings by changing only copy, aria attributes, or event listeners/)
    assert.match(prompt, /Required topic-card semantic repair/)
    assert.match(prompt, /Remove proof rows, proof pills, testimonials, CTA rhythms/)
  })

  it('adds a dedicated extreme-small repair plan for 300x360 failures', () => {
    const prompt = buildAutomationRepairPrompt({
      issues: [
        'Extreme-small viewport is not adapted to a 300x360 fixed-card frame.',
        'Extreme-small viewport hides every page-switching tab.',
        'Extreme-small viewport initial view is overloaded with 1040 visible text characters; move secondary details behind a local interaction.',
      ],
      originalPrompt: '生成一张词条主题动态交互卡。',
      templateSummary: '关系探索卡',
    })

    assert.match(prompt, /Required 300x360 extreme-small repair/)
    assert.match(prompt, /exactly 300x360 CSS px, including border and padding/)
    assert.match(prompt, /topic title, one concise essential summary or fact/)
    assert.match(prompt, /necessary page-switching tab or primary reveal action/)
    assert.match(prompt, /Move secondary facts into a local tab, page switcher, accordion, detail panel, or modal/)
    assert.match(prompt, /do not leave decorative or fake tabs/)
    assert.match(prompt, /display:none !important/)
    assert.match(prompt, /Inactive panels must be display:none/)
    assert.match(prompt, /at most three primary tabs or choices and at most two additional visible topic controls/)
    assert.match(prompt, /exactly one primary navigation group/)
    assert.match(prompt, /accordion toggles or tabs for categories, never both/)
    assert.match(prompt, /Do not solve the small viewport by scrolling/)
  })

  it('adds compact control-budget repair instructions when the first view is too dense', () => {
    const prompt = buildAutomationRepairPrompt({
      issues: [
        'Extreme-small viewport exposes 6 visible primary tabs; keep at most four.',
        'Extreme-small viewport for relation_map exposes 8 visible controls in total; keep at most 6.',
        'Extreme-small viewport exposes 5 additional topic controls; keep at most three.',
        'Extreme-small viewport for relation_map renders 5 equal-level visible items; keep at most 3 in the initial state and page or reveal the rest.',
      ],
      originalPrompt: '生成一张词条主题动态交互卡。',
      templateSummary: '对比辨析卡',
    })

    assert.match(prompt, /compact state exposes too many tabs or topic controls/)
    assert.match(prompt, /Replace longer chip\/node\/member rows with previous\/next controls/)
    assert.match(prompt, /hide or aggregate the excess/)
  })

  it('adds a relation-specific compact repair when tabs and nodes compete at 300x360', () => {
    const prompt = buildAutomationRepairPrompt({
      issues: [
        'Extreme-small viewport for relation_map exposes 6 visible controls in total; keep at most 5.',
        'Extreme-small viewport for relation_map exposes 3 additional topic controls; keep at most 2 after the primary tabs.',
      ],
      specFindings: [{
        id: 'encyclopedia.overflow_scroll_blocked',
        source: 'static_rule',
        severity: 'warning',
        message: 'Internal scroll is not allowed in dynamic encyclopedia cards.',
        repairHint: 'Replace overflow content through a bounded local state.',
      }],
      originalPrompt: '生成苏轼与欧阳修关系主题动态交互卡。',
      templateSummary: '历史人物关系图谱',
    })

    assert.match(prompt, /Required relation\/member compact repair/)
    assert.match(prompt, /exactly one visible selector group with 2-3 directly selectable relation or member buttons/)
    assert.match(prompt, /Hide the relationship-category tab row/)
    assert.match(prompt, /Remove reset, 查看更多, modal triggers, source rows, legends, counts/)
    assert.match(prompt, /at most two short Chinese sentences/)
    assert.match(prompt, /Additional nodes must replace the same slots/)
    assert.match(prompt, /including modal bodies/)
  })

  it('repairs duplicate dynamic-card roots instead of hiding the extra shell', () => {
    const prompt = buildAutomationRepairPrompt({
      issues: ['HTML declares 2 dynamic card roots; keep exactly one [data-dudesign-template] root.'],
      originalPrompt: '生成主题动态交互卡。',
    })

    assert.match(prompt, /Required single-root repair/)
    assert.match(prompt, /exactly one \[data-dudesign-template\] dynamic card root/)
    assert.match(prompt, /do not hide a duplicate root with opacity or off-screen positioning/)
  })

  it('adds democase composition repair instructions for an overloaded desktop first view', () => {
    const prompt = buildAutomationRepairPrompt({
      issues: [
        'Desktop democase-derived first view exposes 16 visible controls; keep at most 12 and move secondary choices behind the primary interaction.',
        'Desktop democase-derived first view exposes 4 separate control groups; keep one primary selector and at most one local disclosure group.',
      ],
      originalPrompt: '生成一张三顾茅庐主题动态交互卡。',
      templateSummary: '文化词语关系探索卡',
    })

    assert.match(prompt, /Required democase composition repair/)
    assert.match(prompt, /one dominant visual or interaction stage/)
    assert.match(prompt, /one primary selector group and one optional local disclosure group/)
    assert.match(prompt, /Remove equal-weight fact tiles, KPI\/stat rows/)
    assert.match(prompt, /do not merely shrink cards or text/)
  })

  it('adds Chinese-first and neutral-copy instructions for language quality findings', () => {
    const prompt = buildAutomationRepairPrompt({
      issues: [
        'Non-language-category entries must present body content primarily in Chinese. 当前正文汉字占比 58%。',
        'Detected 4 multi-word English phrases — likely overuse of foreign language outside proper nouns.',
        'Dynamic encyclopedia copy should avoid promotional or unverifiable superlative language.',
      ],
      specFindings: [
        {
          id: 'encyclopedia.chinese_only_required',
          source: 'static_rule',
          severity: 'warning',
          message: 'Body content must be primarily Chinese.',
          repairHint: 'Rewrite non-proper-noun copy into Simplified Chinese.',
        },
        {
          id: 'encyclopedia.excessive_english_phrases',
          source: 'static_rule',
          severity: 'warning',
          message: 'Too many English phrases.',
          repairHint: 'Rewrite UI copy in Chinese.',
        },
        {
          id: 'encyclopedia.neutral_tone_risk',
          source: 'static_rule',
          severity: 'warning',
          message: 'Promotional language detected.',
          repairHint: 'Rewrite as attributable facts.',
        },
      ],
      originalPrompt: '生成 BLACKPINK 主题动态交互卡。',
      templateSummary: '明星组合成员体系',
    })

    assert.match(prompt, /Required Chinese-first copy repair/)
    assert.match(prompt, /body prose Chinese share at least 60 percent/)
    assert.match(prompt, /Required neutral editorial copy repair/)
    assert.match(prompt, /Remove superlatives, promotional adjectives/)
  })

  it('adds the assigned child-template repair direction', () => {
    const prompt = buildAutomationRepairPrompt({
      issues: ['The assigned child template is missing its primary interaction.'],
      specFindings: [{
        id: 'encyclopedia.member_template_mismatch',
        source: 'template_rule',
        severity: 'warning',
        message: 'The member-map child template needs a visible member selection surface.',
        repairHint: 'Add member selectors and a detail panel.',
      }],
      originalPrompt: '生成 BLACKPINK 主题动态交互卡。',
      templateSummary: '动态百科·明星组合成员体系',
    })

    assert.match(prompt, /Required member-map template repair/)
    assert.match(prompt, /at least two selectable members/)
    assert.match(prompt, /Do not let a generic timeline/)
  })

  it('maps stop reasons to clear user-facing messages', () => {
    assert.match(automationLoopUserMessage('runtime_unavailable'), /temporarily unavailable/i)
    assert.match(automationLoopUserMessage('max_duration_reached'), /took too long/i)
    assert.match(automationLoopUserMessage('repeated_failure'), /same quality issue/i)
  })
})
