import { after, before, describe, it } from 'node:test'
import { Pool } from 'pg'
import { ApplicationService } from './service.js'
import { PostgresRepository } from './postgresRepository.js'
import { runApiFlowSmoke, startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'

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
})
