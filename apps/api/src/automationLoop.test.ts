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



  it('adds geometry and topic-semantic repair instructions instead of allowing copy-only edits', () => {
    const prompt = buildAutomationRepairPrompt({
      issues: [
        'Rendered fixed-card layout is invalid: 2 interactive controls are clipped or outside the card frame.',
        'Rendered fixed-card interaction is unusable: 3 controls are visually covered at their center hit point.',
      ],
      originalPrompt: '生成 BLACKPINK 主题动态交互卡。',
      templateSummary: '明星组合成员体系',
    })

    assert.match(prompt, /Required fixed-card geometry repair/)
    assert.match(prompt, /center point of every visible button\/tab is not covered/)
    assert.match(prompt, /Do not repair geometry findings by changing only copy, aria attributes, or event listeners/)  })

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
      originalPrompt: '生成苏轼与欧阳修关系主题动态交互卡。',
      templateSummary: '历史人物关系图谱',
    })

    assert.match(prompt, /Required relation\/member compact repair/)
    assert.match(prompt, /exactly one visible selector group with 2-3 directly selectable relation or member buttons/)
    assert.match(prompt, /Hide the relationship-category tab row/)
    assert.match(prompt, /Remove reset, 查看更多, modal triggers, source rows, legends, counts/)
    assert.match(prompt, /at most two short Chinese sentences/)
    assert.match(prompt, /Additional nodes must replace the same slots/)
  })





  it('maps stop reasons to clear user-facing messages', () => {
    assert.match(automationLoopUserMessage('runtime_unavailable'), /temporarily unavailable/i)
    assert.match(automationLoopUserMessage('max_duration_reached'), /took too long/i)
    assert.match(automationLoopUserMessage('repeated_failure'), /same quality issue/i)
  })
})
