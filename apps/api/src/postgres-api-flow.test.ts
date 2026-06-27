import { after, before, describe, it } from 'node:test'
import { Pool } from 'pg'
import { ApplicationService } from './service.js'
import { PostgresRepository } from './postgresRepository.js'
import { runApiFlowSmoke, startApiFlowHarness, type ApiFlowHarness } from './mock-flow.test.js'

const POSTGRES_TEST_URL = process.env.DUDESIGN_POSTGRES_TEST_URL

describe('DUDesign API flow with PostgresRepository', { skip: !POSTGRES_TEST_URL }, () => {
  const schema = `dudesign_api_flow_${Date.now().toString(36)}`
  let repository: PostgresRepository
  let harness: ApiFlowHarness

  before(async () => {
    repository = await PostgresRepository.connect({
      connectionString: POSTGRES_TEST_URL!,
      schema,
    })
    harness = await startApiFlowHarness(new ApplicationService({ store: repository }))
  })

  after(async () => {
    await harness?.close()
    await repository?.close()
    const pool = new Pool({ connectionString: POSTGRES_TEST_URL! })
    try {
      await pool.query(`drop schema if exists ${schema} cascade`)
    } finally {
      await pool.end()
    }
  })

  it('runs the shared API smoke flow against PostgreSQL-backed repository', async () => {
    await runApiFlowSmoke(harness)
  })
})
