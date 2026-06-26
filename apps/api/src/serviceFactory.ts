import { LocalArtifactStore } from '@dudesign/artifact-store'
import { join } from 'node:path'
import { ApplicationService } from './service.js'
import { PostgresRepository } from './postgresRepository.js'

export async function createApplicationServiceFromEnv(): Promise<ApplicationService> {
  const artifacts = new LocalArtifactStore({
    rootDir: process.env.DUDESIGN_ARTIFACT_ROOT ?? join(process.cwd(), '.dudesign', 'artifacts'),
  })
  if (process.env.DUDESIGN_REPOSITORY === 'postgres') {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required when DUDESIGN_REPOSITORY=postgres.')
    }
    const store = await PostgresRepository.connect({
      connectionString: process.env.DATABASE_URL,
    })
    return new ApplicationService({ store, artifacts })
  }
  return new ApplicationService({ artifacts })
}
