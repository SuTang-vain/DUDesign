import { LocalArtifactStore } from '@dudesign/artifact-store'
import { BabelORuntimeGateway, MockRuntimeGateway, type RuntimeGateway } from '@dudesign/runtime-gateway'
import { join } from 'node:path'
import { ApplicationService } from './service.js'
import { PostgresRepository } from './postgresRepository.js'
import { InMemoryDesignJobQueue, type DesignJobQueue } from './designJobQueue.js'
import { createRedisDesignJobQueueFromEnv } from './redisDesignJobQueue.js'

export type ApplicationProcessRole = 'api' | 'worker' | 'inline'

export async function createApplicationServiceFromEnv(options: {
  role?: ApplicationProcessRole
} = {}): Promise<ApplicationService> {
  const role = options.role ?? applicationProcessRoleFromEnv()
  const artifacts = new LocalArtifactStore({
    rootDir: process.env.DUDESIGN_ARTIFACT_ROOT ?? join(process.cwd(), '.dudesign', 'artifacts'),
  })
  const runtime = createRuntimeGatewayFromEnv()
  const queue = createDesignJobQueueFromEnv()
  const consumeQueue = shouldConsumeQueue(role)
  if (process.env.DUDESIGN_REPOSITORY === 'postgres') {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required when DUDESIGN_REPOSITORY=postgres.')
    }
    const store = await PostgresRepository.connect({
      connectionString: process.env.DATABASE_URL,
      hydrateOnStart: process.env.DUDESIGN_REPOSITORY_HYDRATE !== 'false',
    })
    return new ApplicationService({ store, artifacts, runtime, queue, consumeQueue })
  }
  return new ApplicationService({ artifacts, runtime, queue, consumeQueue })
}

export function applicationProcessRoleFromEnv(env: NodeJS.ProcessEnv = process.env): ApplicationProcessRole {
  const role = env.DUDESIGN_PROCESS_ROLE ?? env.DUDESIGN_SERVICE_ROLE
  if (role === 'worker') return 'worker'
  if (role === 'inline') return 'inline'
  return 'api'
}

export function shouldConsumeQueue(role: ApplicationProcessRole, env: NodeJS.ProcessEnv = process.env): boolean {
  if (role === 'worker' || role === 'inline') return true
  const queueProvider = env.DUDESIGN_QUEUE ?? env.DUDESIGN_QUEUE_PROVIDER
  return queueProvider !== 'redis' && queueProvider !== 'bullmq'
}

export function createDesignJobQueueFromEnv(): DesignJobQueue {
  const queueProvider = process.env.DUDESIGN_QUEUE ?? process.env.DUDESIGN_QUEUE_PROVIDER
  if (queueProvider === 'redis' || queueProvider === 'bullmq') {
    return createRedisDesignJobQueueFromEnv()
  }
  return new InMemoryDesignJobQueue()
}

export function createRuntimeGatewayFromEnv(): RuntimeGateway {
  const runtimeProvider = process.env.DUDESIGN_RUNTIME_PROVIDER ?? process.env.DUDESIGN_RUNTIME_MODE
  if (runtimeProvider !== 'babel-o') {
    return new MockRuntimeGateway()
  }
  const baseUrl = process.env.BABELO_BASE_URL ?? process.env.DUDESIGN_BABELO_BASE_URL
  if (!baseUrl) {
    throw new Error('BABELO_BASE_URL or DUDESIGN_BABELO_BASE_URL is required when DUDESIGN_RUNTIME_PROVIDER=babel-o.')
  }
  return new BabelORuntimeGateway({
    variationConcurrency: optionalPositiveInteger(process.env.DUDESIGN_RUNTIME_VARIATION_CONCURRENCY),
    clientConfig: {
      baseUrl,
      apiKey: process.env.BABELO_API_KEY ?? process.env.DUDESIGN_BABELO_API_KEY,
      authHeaderName: process.env.BABELO_AUTH_HEADER ?? process.env.DUDESIGN_BABELO_AUTH_HEADER,
      timeoutMs: optionalPositiveInteger(process.env.BABELO_TIMEOUT_MS ?? process.env.DUDESIGN_BABELO_TIMEOUT_MS),
      streamIdleTimeoutMs: optionalPositiveInteger(process.env.BABELO_STREAM_IDLE_TIMEOUT_MS ?? process.env.DUDESIGN_BABELO_STREAM_IDLE_TIMEOUT_MS),
      streamReconnectAttempts: optionalNonNegativeInteger(process.env.BABELO_STREAM_RECONNECT_ATTEMPTS ?? process.env.DUDESIGN_BABELO_STREAM_RECONNECT_ATTEMPTS),
      expectedContractVersion: process.env.BABELO_CONTRACT_VERSION ?? process.env.DUDESIGN_BABELO_CONTRACT_VERSION,
    },
  })
}

function optionalPositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function optionalNonNegativeInteger(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}
