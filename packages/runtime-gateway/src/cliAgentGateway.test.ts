import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import type { DesignEvent } from '@dudesign/contracts'
import type { RuntimeExplorationContextV1 } from './runtimeExplorationContext.js'
import { CliAgentRuntimeGateway } from './cliAgentGateway.js'

describe('CliAgentRuntimeGateway', () => {
  it('runs a real CLI process in each isolated variation workspace', async () => {
    const fixture = await createFixture('success')
    try {
      const gateway = gatewayForFixture(fixture)
      const events = await collect(gateway.spawnVariationAgents({
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'session_1',
        jobId: 'job_1',
        prompt: 'Build two controlled pages.',
        sourceMode: 'new_html',
        variationCount: 2,
        workspaceRoot: 'workspace_1',
        memoryNamespace: 'memory:user:user_1',
        explorationContexts: [context(1, 'identity'), context(2, 'timeline')],
      }))

      const completed = events.filter(event => event.type === 'design.variation_completed')
      assert.equal(completed.length, 2)
      const completedByVariation = new Map(completed.map(event => [event.variationId, event]))
      assert.match(String(completedByVariation.get('runtime_variation_1')?.payload.html), /identity/)
      assert.match(String(completedByVariation.get('runtime_variation_2')?.payload.html), /timeline/)
      const workspaceOne = join(fixture.workspaceBase, 'workspace_1', 'runtime-jobs', 'job_1', 'variation_01')
      const prompt = await readFile(join(workspaceOne, 'received-prompt.txt'), 'utf8')
      assert.match(prompt, /Variation focus: Group identity \(identity\)/)
      assert.match(prompt, /Keep fact creativity at zero/)
      assert.equal(await readFile(join(workspaceOne, 'received-arg.txt'), 'utf8'), 'job_1:1')
    } finally {
      await fixture.close()
    }
  })

  it('refines from the existing HTML while keeping the same exploration focus', async () => {
    const fixture = await createFixture('success')
    try {
      const gateway = gatewayForFixture(fixture)
      const events = await collect(gateway.refineVariation({
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'session_1',
        jobId: 'job_1',
        variationId: 'variation_2',
        variationIndex: 2,
        runtimeChildSessionId: null,
        baseArtifactId: 'artifact_2',
        baseArtifactHtml: '<!doctype html><h1>Existing timeline</h1>',
        prompt: 'Improve scanability.',
        workspaceRoot: 'workspace_1',
        explorationContext: context(2, 'timeline'),
      }))

      const completed = events.find(event => event.type === 'design.variation_completed')
      assert.ok(completed)
      assert.match(String(completed.payload.html), /Existing timeline/)
      assert.match(String(completed.payload.html), /timeline/)
      const workspace = join(fixture.workspaceBase, 'workspace_1', 'runtime-jobs', 'job_1', 'variation_02')
      const prompt = await readFile(join(workspace, 'received-prompt.txt'), 'utf8')
      assert.match(prompt, /Improve scanability/)
      assert.match(prompt, /Variation focus: Member timeline \(timeline\)/)
    } finally {
      await fixture.close()
    }
  })

  it('fails safely when a CLI process times out', async () => {
    const fixture = await createFixture('sleep')
    try {
      const gateway = gatewayForFixture(fixture, { timeoutMs: 30 })
      const events = await collect(gateway.spawnVariationAgents(baseSpawnInput('job_timeout')))
      const failed = events.find(event => event.type === 'design.variation_failed')

      assert.ok(failed)
      assert.equal(failed.payload.errorCode, 'CLI_AGENT_TIMEOUT')
      assert.match(failed.payload.message, /timed out/)
    } finally {
      await fixture.close()
    }
  })

  it('cancels active CLI processes by job id', async () => {
    const fixture = await createFixture('sleep')
    try {
      const gateway = gatewayForFixture(fixture, { timeoutMs: 5000 })
      const iterator = gateway.spawnVariationAgents(baseSpawnInput('job_cancel'))[Symbol.asyncIterator]()
      await iterator.next()
      await iterator.next()
      const pending = iterator.next()
      await waitFor(() => Number(Reflect.get(gateway, 'activeProcesses').size) === 1)

      const cancelled = await gateway.cancelRuntimeJob({ jobId: 'job_cancel' })
      const result = await pending

      assert.equal(cancelled.cancelled, true)
      assert.equal(cancelled.cancelledVariationCount, 1)
      assert.equal(result.value?.type, 'design.variation_failed')
      await collectRemaining(iterator)
    } finally {
      await fixture.close()
    }
  })

  it('rejects workspaces that escape the configured base', async () => {
    const fixture = await createFixture('success')
    try {
      const gateway = gatewayForFixture(fixture)
      const events = await collect(gateway.spawnVariationAgents({
        ...baseSpawnInput('job_escape'),
        workspaceRoot: '/tmp/outside-dudesign-cli-base',
      }))
      const failed = events.find(event => event.type === 'design.variation_failed')

      assert.ok(failed)
      assert.match(failed.payload.message, /escapes the configured workspace base/)
    } finally {
      await fixture.close()
    }
  })
})

function gatewayForFixture(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  overrides: Partial<ConstructorParameters<typeof CliAgentRuntimeGateway>[0]> = {},
) {
  return new CliAgentRuntimeGateway({
    executable: process.execPath,
    args: [fixture.scriptPath, fixture.mode, '{jobId}:{variationIndex}'],
    workspaceBaseDir: fixture.workspaceBase,
    timeoutMs: 2000,
    variationConcurrency: 2,
    ...overrides,
  })
}

function baseSpawnInput(jobId: string) {
  return {
    userId: 'user_1',
    workspaceId: 'workspace_1',
    sessionId: 'session_1',
    jobId,
    prompt: 'Build one page.',
    sourceMode: 'new_html' as const,
    variationCount: 1,
    workspaceRoot: 'workspace_1',
    memoryNamespace: 'memory:user:user_1',
    explorationContexts: [context(1, 'identity')],
  }
}

async function createFixture(mode: 'success' | 'sleep') {
  const root = await mkdtemp(join(tmpdir(), 'dudesign-cli-agent-test-'))
  const workspaceBase = join(root, 'workspaces')
  const scriptPath = join(root, 'agent-fixture.mjs')
  await writeFile(scriptPath, `
import { readFile, writeFile } from 'node:fs/promises'
const mode = process.argv[2]
const receivedArg = process.argv[3] ?? ''
let prompt = ''
for await (const chunk of process.stdin) prompt += chunk
await writeFile('received-prompt.txt', prompt, 'utf8')
await writeFile('received-arg.txt', receivedArg, 'utf8')
if (mode === 'sleep') {
  console.log('agent-started')
  await new Promise(resolve => setTimeout(resolve, 10000))
} else {
  let existing = ''
  try { existing = await readFile('index.html', 'utf8') } catch {}
  const focus = prompt.includes('(timeline)') ? 'timeline' : 'identity'
  const html = '<!doctype html><html><body><h1>' + focus + '</h1><section>' + existing.replaceAll('<', '&lt;') + '</section></body></html>'
  await writeFile('index.html', html, 'utf8')
  console.log('generated:' + focus)
}
`, 'utf8')
  return {
    mode,
    root,
    workspaceBase,
    scriptPath,
    close: () => rm(root, { recursive: true, force: true }),
  }
}

function context(variationIndex: number, focusId: string): RuntimeExplorationContextV1 {
  const title = focusId === 'timeline' ? 'Member timeline' : 'Group identity'
  const module = {
    id: focusId,
    title,
    description: `Implement the ${title.toLowerCase()} direction.`,
    requiredDataFields: [],
    interactionCandidates: [],
  }
  return {
    schemaVersion: '2026-07-13.dudesign-runtime-exploration-context.v1',
    source: {
      plannerVersion: 'planner.v1',
      capabilitySnapshotId: 'snapshot_1',
      moduleGraphId: 'graph_1',
      moduleGraphVersion: 'graph.v1',
      variationIndex,
    },
    focus: module,
    requiredModules: [module],
    sampledModules: [],
    excludedModuleIds: [],
    interactionDirectionIds: [],
    designDivergence: {
      moduleBreadth: 0.5,
      moduleNovelty: 0.5,
      layout: 0.5,
      visual: 0.5,
      interaction: 0.5,
      copyTone: 0.25,
    },
    invariants: [{ id: 'facts', category: 'fact', description: 'Do not invent facts.' }],
    globalRules: [],
    safety: { factCreativity: 0, mayExpandToolPolicy: false, mayReassignModules: false },
  }
}

async function collect(iterable: AsyncIterable<DesignEvent>): Promise<DesignEvent[]> {
  const events: DesignEvent[] = []
  for await (const event of iterable) events.push(event)
  return events
}

async function collectRemaining(iterator: AsyncIterator<DesignEvent>): Promise<void> {
  while (!(await iterator.next()).done) {
    // Drain terminal job events so generator cleanup runs before the test exits.
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 1000) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for CLI Agent process state.')
}
