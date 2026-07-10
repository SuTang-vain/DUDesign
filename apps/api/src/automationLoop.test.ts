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
      '- Remove .scroll-container and overflow:auto/scroll from the card body.',
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

  it('maps stop reasons to clear user-facing messages', () => {
    assert.match(automationLoopUserMessage('runtime_unavailable'), /temporarily unavailable/i)
    assert.match(automationLoopUserMessage('max_duration_reached'), /took too long/i)
    assert.match(automationLoopUserMessage('repeated_failure'), /same quality issue/i)
  })
})
