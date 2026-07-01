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
  enablePixelGate: false,
  qualityGate: 'static',
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
    assert.match(prompt, /Return a complete static HTML artifact/)
    assert.doesNotMatch(prompt, /npm install|sudo|rm -rf/i)
  })

  it('maps stop reasons to clear user-facing messages', () => {
    assert.match(automationLoopUserMessage('runtime_unavailable'), /temporarily unavailable/i)
    assert.match(automationLoopUserMessage('max_duration_reached'), /took too long/i)
    assert.match(automationLoopUserMessage('repeated_failure'), /same quality issue/i)
  })
})
