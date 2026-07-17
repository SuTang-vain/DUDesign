import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RuntimeExplorationContextV1 } from './runtimeExplorationContext.js'
import { BabelORuntimeClient } from './babelOClient.js'

describe('Babel-O exploration context contract', () => {
  it('sends the selected variation context as structured data and prompt guidance', async () => {
    const calls: Array<Record<string, unknown>> = []
    const client = clientCapturingBodies(calls)
    const contexts = [context(1, 'identity'), context(2, 'timeline')]

    await client.spawnVariationAgent({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      jobId: 'job_1',
      prompt: 'Build a star group encyclopedia.',
      sourceMode: 'new_html',
      variationCount: 2,
      variationIndex: 2,
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
      explorationContexts: contexts,
    })

    const body = calls[0]!
    assert.deepEqual(body.explorationContext, contexts[1])
    assert.deepEqual((body.templateRequirements as Record<string, unknown>).explorationContext, contexts[1])
    const prompt = String(body.prompt)
    assert.match(prompt, /Variation focus: Member timeline \(timeline\)/)
    assert.match(prompt, /Keep fact creativity at zero/)
    assert.match(prompt, /Do not expand tool permissions/)
    assert.match(prompt, /Do not reassign, remove, or add requirement modules/)
    assert.doesNotMatch(prompt, /identity authoring evidence|temperature/i)
  })

  it('keeps the same context during refine', async () => {
    const calls: Array<Record<string, unknown>> = []
    const client = clientCapturingBodies(calls)
    const explorationContext = context(2, 'timeline')

    await client.createRefineAgent({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      jobId: 'job_1',
      variationId: 'variation_2',
      variationIndex: 2,
      runtimeChildSessionId: 'runtime_child_2',
      baseArtifactId: 'artifact_2',
      baseArtifactHtml: '<!doctype html><h1>Existing</h1>',
      prompt: 'Make the timeline easier to scan.',
      workspaceRoot: 'workspaces/workspace_1',
      explorationContext,
    })

    const body = calls[0]!
    assert.deepEqual(body.explorationContext, explorationContext)
    assert.match(String(body.prompt), /Make the timeline easier to scan/)
    assert.match(String(body.prompt), /Variation focus: Member timeline \(timeline\)/)
  })
})

function clientCapturingBodies(calls: Array<Record<string, unknown>>) {
  return new BabelORuntimeClient({
    baseUrl: 'https://runtime.example.test',
    fetch: async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return new Response(JSON.stringify({
        streamId: 'stream_1',
        agentJobId: 'agent_1',
        runtimeChildSessionId: 'runtime_child_1',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })
}

function context(variationIndex: number, focusId: string): RuntimeExplorationContextV1 {
  const title = focusId === 'timeline' ? 'Member timeline' : 'Group identity'
  const module = {
    id: focusId,
    title,
    description: focusId === 'timeline' ? 'Explain verified member changes.' : 'Explain the group identity.',
    requiredDataFields: focusId === 'timeline' ? ['membershipEvents'] : ['group.name'],
    interactionCandidates: focusId === 'timeline' ? ['vertical-timeline'] : ['identity-card'],
  }
  return {
    schemaVersion: '2026-07-13.dudesign-runtime-exploration-context.v1',
    source: {
      plannerVersion: 'planner.v1',
      capabilitySnapshotId: 'capability_snapshot_1',
      moduleGraphId: 'graph_1',
      moduleGraphVersion: 'graph.v1',
      variationIndex,
    },
    focus: module,
    requiredModules: focusId === 'identity' ? [module] : [],
    sampledModules: focusId === 'timeline' ? [module] : [],
    excludedModuleIds: [],
    interactionDirectionIds: module.interactionCandidates,
    designDivergence: {
      moduleBreadth: 0.6,
      moduleNovelty: 0.5,
      layout: 0.6,
      visual: 0.65,
      interaction: 0.5,
      copyTone: 0.25,
    },
    invariants: [{ id: 'no_fabrication', category: 'fact', description: 'Do not invent facts.' }],
    globalRules: [],
    safety: {
      factCreativity: 0,
      mayExpandToolPolicy: false,
      mayReassignModules: false,
    },
  }
}
