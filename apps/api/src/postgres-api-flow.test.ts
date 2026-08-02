import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import type {
  CreateDesignJobResponse,
  CreateSessionResponse,
  DesignJobSnapshotResponse,
} from '@dudesign/contracts'
import { ApplicationService } from './service.js'
import { PostgresRepository } from './postgresRepository.js'
import { runApiFlowSmoke, startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'
import { runMultiUserAccessSmoke } from './multiUserAccessSmoke.js'

const POSTGRES_TEST_URL = process.env.DUDESIGN_POSTGRES_TEST_URL

describe('DUDesign API flow with PostgresRepository', { skip: !POSTGRES_TEST_URL }, () => {
  const schema = `dudesign_api_flow_${Date.now().toString(36)}`
  const noHydrateSchema = `dudesign_api_flow_no_hydrate_${Date.now().toString(36)}`
  let repository: PostgresRepository
  let noHydrateRepository: PostgresRepository
  let harness: ApiFlowHarness
  let noHydrateHarness: ApiFlowHarness

  before(async () => {
    repository = await PostgresRepository.connect({
      connectionString: POSTGRES_TEST_URL!,
      schema,
    })
    noHydrateRepository = await PostgresRepository.connect({
      connectionString: POSTGRES_TEST_URL!,
      schema: noHydrateSchema,
      hydrateOnStart: false,
    })
    harness = await startApiFlowHarness(new ApplicationService({ store: repository }))
    noHydrateHarness = await startApiFlowHarness(new ApplicationService({ store: noHydrateRepository }))
  })

  after(async () => {
    await harness?.close()
    await noHydrateHarness?.close()
    await repository?.close()
    await noHydrateRepository?.close()
    const pool = new Pool({ connectionString: POSTGRES_TEST_URL! })
    try {
      await pool.query(`drop schema if exists ${schema} cascade`)
      await pool.query(`drop schema if exists ${noHydrateSchema} cascade`)
    } finally {
      await pool.end()
    }
  })

  it('runs the shared API smoke flow against PostgreSQL-backed repository', async () => {
    await runApiFlowSmoke(harness)
  })

  it('runs the shared API smoke flow without startup hydrate', async () => {
    await runApiFlowSmoke(noHydrateHarness)
  })

  it('runs the multi-user isolation smoke without startup hydrate', async () => {
    const previousAuthMode = process.env.DUDESIGN_AUTH_MODE
    process.env.DUDESIGN_AUTH_MODE = 'session'
    try {
      await runMultiUserAccessSmoke(noHydrateHarness)
    } finally {
      if (previousAuthMode === undefined) delete process.env.DUDESIGN_AUTH_MODE
      else process.env.DUDESIGN_AUTH_MODE = previousAuthMode
    }
  })

  it('restores job snapshots with and without startup hydrate', async () => {
    const recoverySchema = `dudesign_snapshot_recovery_${Date.now().toString(36)}`
    let activeHarness: ApiFlowHarness | null = null
    let activeRepository: PostgresRepository | null = null
    try {
      activeRepository = await PostgresRepository.connect({
        connectionString: POSTGRES_TEST_URL!,
        schema: recoverySchema,
      })
      activeHarness = await startApiFlowHarness(new ApplicationService({
        store: activeRepository,
        consumeQueue: false,
      }))

      const bootstrap = await getJsonAt<{ workspace: { id: string } }>(activeHarness, '/api/dev/bootstrap')
      const session = await postJsonAt<CreateSessionResponse>(activeHarness, '/api/sessions', {
        workspaceId: bootstrap.workspace.id,
        title: 'PostgreSQL snapshot recovery',
        mode: 'new_html',
      })
      const created = await postJsonAt<CreateDesignJobResponse>(activeHarness, '/api/design-jobs', {
        sessionId: session.session.id,
        prompt: 'Create a trustworthy fintech landing page for a payments product.',
        sourceMode: 'new_html',
        productMode: 'web_app',
        variationCount: 3,
        capabilityRequirements: {
          template: {
            domainTemplateId: 'tpl_fintech_trust',
            aestheticProfileId: 'aes_trustworthy_saas',
            colorPaletteId: 'pal_blue_white_trust',
          },
          automation: {
            loopProfileId: 'loop_standard',
            maxRepairAttempts: 1,
          },
          plugins: {
            skillIds: ['sk_static_export_safe'],
            mcpToolIds: ['mcp_accessibility_validate'],
          },
        },
        templateRequirements: {
          styles: ['minimal', 'editorial'],
          deviceTargets: ['desktop', 'mobile'],
        },
      })
      const baseline = await getJsonAt<DesignJobSnapshotResponse>(activeHarness, `/api/design-jobs/${created.job.id}`)
      assert.equal(baseline.job.productMode, 'web_app')
      assert.ok(baseline.job.capabilitySnapshot)
      assert.equal(baseline.variations.length, 3)

      await activeHarness.close()
      activeHarness = null
      await activeRepository.close()
      activeRepository = null

      const assertRecoveredSnapshot = async (hydrateOnStart: boolean): Promise<void> => {
        activeRepository = await PostgresRepository.connect({
          connectionString: POSTGRES_TEST_URL!,
          schema: recoverySchema,
          hydrateOnStart,
        })
        activeHarness = await startApiFlowHarness(new ApplicationService({
          store: activeRepository,
          consumeQueue: false,
        }))
        const recovered = await getJsonAt<DesignJobSnapshotResponse>(activeHarness, `/api/design-jobs/${created.job.id}`)
        assert.deepEqual(recovered.job.capabilitySnapshot, baseline.job.capabilitySnapshot)
        assert.deepEqual(
          recovered.variations.map(variation => variation.explorationPlan),
          baseline.variations.map(variation => variation.explorationPlan),
        )
        await activeHarness.close()
        activeHarness = null
        await activeRepository.close()
        activeRepository = null
      }

      await assertRecoveredSnapshot(true)
      await assertRecoveredSnapshot(false)
    } finally {
      await activeHarness?.close()
      await activeRepository?.close()
      const pool = new Pool({ connectionString: POSTGRES_TEST_URL! })
      try {
        await pool.query(`drop schema if exists ${recoverySchema} cascade`)
      } finally {
        await pool.end()
      }
    }
  })
})

async function getJsonAt<T>(harness: ApiFlowHarness, path: string): Promise<T> {
  const response = await fetch(`${harness.baseUrl}${path}`)
  assert.equal(response.ok, true, `${path} returned ${response.status}`)
  return response.json() as Promise<T>
}

async function postJsonAt<T>(harness: ApiFlowHarness, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${harness.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    assert.fail(`${path} returned ${response.status}: ${await response.text()}`)
  }
  return response.json() as Promise<T>
}
