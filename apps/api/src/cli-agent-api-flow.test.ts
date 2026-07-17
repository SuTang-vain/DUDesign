import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { LocalArtifactStore } from '@dudesign/artifact-store'
import { CliAgentRuntimeGateway } from '@dudesign/runtime-gateway'
import { InMemoryDesignJobQueue } from './designJobQueue.js'
import { starGroupRequirementModuleGraph } from './fixtures/starGroupRequirementModuleGraph.js'
import { closePooledChromiumBrowser } from './playwrightBrowserPool.js'
import { ApplicationService } from './service.js'
import { InMemoryStore } from './store.js'

describe('CLI Agent Application Service flow', () => {
  it('generates artifact-backed variations with the fixed exploration context', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dudesign-cli-api-flow-'))
    try {
      const scriptPath = join(root, 'agent.mjs')
      await writeFile(scriptPath, `
import { writeFile } from 'node:fs/promises'
let prompt = ''
for await (const chunk of process.stdin) prompt += chunk
const focus = /Variation focus: ([^\\n]+)/.exec(prompt)?.[1] ?? 'unknown'
await writeFile('index.html', '<!doctype html><html><body><main><h1>' + focus + '</h1><p>CLI Agent Application Service integration artifact.</p></main></body></html>', 'utf8')
console.log('generated:' + focus)
`, 'utf8')
      const store = new InMemoryStore()
      const service = new ApplicationService({
        store,
        artifacts: new LocalArtifactStore({ rootDir: join(root, 'artifacts') }),
        runtime: new CliAgentRuntimeGateway({
          executable: process.execPath,
          args: [scriptPath],
          workspaceBaseDir: join(root, 'runtime-workspaces'),
          timeoutMs: 2000,
          variationConcurrency: 2,
        }),
        queue: new InMemoryDesignJobQueue(),
        consumeQueue: false,
      })
      const ctx = {
        requestId: 'req_cli_agent_api_flow',
        userId: store.devUser.id,
        adminRole: null,
        authMode: 'dev' as const,
        authSessionTokenHash: null,
      }
      const session = await service.createSession(ctx, {
        workspaceId: store.devWorkspace.id,
        title: 'CLI Agent API flow',
        mode: 'new_html',
      })
      const created = await service.createDesignJob(ctx, {
        sessionId: session.session.id,
        prompt: 'Generate two star group encyclopedia directions.',
        sourceMode: 'new_html',
        productMode: 'dynamic_encyclopedia_card',
        variationCount: 2,
        requirementModuleGraphId: starGroupRequirementModuleGraph.id,
        exploration: { level: 65 },
        explorationDataContext: {
          units: [{ id: 'unit-a' }],
          members: { current: [{ id: 'member-a' }], former: [{ id: 'member-b' }] },
          membershipEvents: [{ year: 2024 }],
          works: { group: [{ id: 'work-a' }] },
        },
        templateRequirements: {
          businessContext: {
            reviewMode: 'off',
          },
        },
      })
      const job = await store.getJobById(created.job.id)
      assert.ok(job)
      await service.processQueuedDesignJob({
        jobId: created.job.id,
        sessionId: session.session.id,
        variationIds: created.variations.map(variation => variation.id),
        sourceArtifactId: null,
        runtimeSessionId: session.session.runtimeSessionId,
        modelServiceId: String(job.templateRequirements.modelServiceId),
        idempotencyKey: `test:cli-agent:${created.job.id}`,
        userId: store.devUser.id,
        workspaceId: store.devWorkspace.id,
        createdAt: new Date().toISOString(),
      })

      const snapshot = await service.getDesignJob(ctx, created.job.id)
      assert.equal(snapshot.job.status, 'completed')
      assert.ok(snapshot.variations.every(variation => variation.status === 'completed'))
      assert.ok(snapshot.variations.every(variation => variation.currentArtifactId))
      assert.ok(snapshot.variations.every(variation => variation.explorationPlan?.focusId))
      assert.equal(new Set(snapshot.variations.map(variation => variation.explorationPlan?.focusId)).size, 2)
      assert.equal(snapshot.artifacts.filter(artifact => artifact.kind === 'html').length, 2)

      for (const variation of snapshot.variations) {
        const preview = await service.getVariationPreview(ctx, variation.id)
        assert.match(preview, /CLI Agent Application Service integration artifact/)
        assert.match(preview, new RegExp(escapeRegExp(variation.explorationPlan!.focusId)))
      }
    } finally {
      await closePooledChromiumBrowser()
      await rm(root, { recursive: true, force: true })
    }
  })
})

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
