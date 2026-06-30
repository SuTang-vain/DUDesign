import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { BabelORuntimeGateway, MockRuntimeGateway } from '@dudesign/runtime-gateway'

import {
  applicationProcessRoleFromEnv,
  createRuntimeGatewayFromEnv,
  shouldConsumeQueue,
} from './serviceFactory.js'

const envKeys = [
  'DUDESIGN_RUNTIME_PROVIDER',
  'DUDESIGN_RUNTIME_MODE',
  'BABELO_BASE_URL',
  'BABELO_API_KEY',
  'BABELO_AUTH_HEADER',
  'BABELO_TIMEOUT_MS',
  'BABELO_STREAM_IDLE_TIMEOUT_MS',
  'BABELO_STREAM_RECONNECT_ATTEMPTS',
  'BABELO_CONTRACT_VERSION',
  'DUDESIGN_RUNTIME_VARIATION_CONCURRENCY',
  'DUDESIGN_BABELO_BASE_URL',
  'DUDESIGN_BABELO_API_KEY',
  'DUDESIGN_BABELO_AUTH_HEADER',
  'DUDESIGN_BABELO_TIMEOUT_MS',
  'DUDESIGN_BABELO_STREAM_IDLE_TIMEOUT_MS',
  'DUDESIGN_BABELO_STREAM_RECONNECT_ATTEMPTS',
  'DUDESIGN_BABELO_CONTRACT_VERSION',
  'DUDESIGN_PROCESS_ROLE',
  'DUDESIGN_SERVICE_ROLE',
  'DUDESIGN_QUEUE',
  'DUDESIGN_QUEUE_PROVIDER',
] as const

describe('createRuntimeGatewayFromEnv', () => {
  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key]
    }
  })

  it('uses the mock runtime gateway by default', () => {
    const runtime = createRuntimeGatewayFromEnv()

    assert.ok(runtime instanceof MockRuntimeGateway)
  })

  it('requires a BabeL-O base URL when babel-o mode is enabled', () => {
    process.env.DUDESIGN_RUNTIME_PROVIDER = 'babel-o'

    assert.throws(() => createRuntimeGatewayFromEnv(), /BABELO_BASE_URL/)
  })

  it('creates a BabeL-O runtime gateway from env configuration', () => {
    process.env.DUDESIGN_RUNTIME_PROVIDER = 'babel-o'
    process.env.BABELO_BASE_URL = 'https://runtime.example.test'
    process.env.BABELO_API_KEY = 'test-key'
    process.env.BABELO_AUTH_HEADER = 'x-runtime-key'
    process.env.BABELO_TIMEOUT_MS = '1234'
    process.env.BABELO_STREAM_IDLE_TIMEOUT_MS = '5678'
    process.env.BABELO_STREAM_RECONNECT_ATTEMPTS = '2'

    const runtime = createRuntimeGatewayFromEnv()

    assert.ok(runtime instanceof BabelORuntimeGateway)
  })

  it('passes runtime variation concurrency into the BabeL-O gateway', () => {
    process.env.DUDESIGN_RUNTIME_PROVIDER = 'babel-o'
    process.env.BABELO_BASE_URL = 'https://runtime.example.test'
    process.env.DUDESIGN_RUNTIME_VARIATION_CONCURRENCY = '1'
    const runtime = createRuntimeGatewayFromEnv() as BabelORuntimeGateway

    assert.equal(Reflect.get(runtime, 'variationConcurrency'), 1)
  })

  it('keeps legacy DUDESIGN_BABELO env names working', () => {
    process.env.DUDESIGN_RUNTIME_MODE = 'babel-o'
    process.env.DUDESIGN_BABELO_BASE_URL = 'https://runtime.example.test'

    const runtime = createRuntimeGatewayFromEnv()

    assert.ok(runtime instanceof BabelORuntimeGateway)
  })
})

describe('application service process roles', () => {
  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key]
    }
  })

  it('defaults to the API role', () => {
    assert.equal(applicationProcessRoleFromEnv(), 'api')
  })

  it('supports worker and inline roles from env', () => {
    process.env.DUDESIGN_PROCESS_ROLE = 'worker'
    assert.equal(applicationProcessRoleFromEnv(), 'worker')
    process.env.DUDESIGN_PROCESS_ROLE = 'inline'
    assert.equal(applicationProcessRoleFromEnv(), 'inline')
  })

  it('keeps API role consuming the default in-memory queue', () => {
    delete process.env.DUDESIGN_QUEUE

    assert.equal(shouldConsumeQueue('api'), true)
  })

  it('keeps API role as producer-only for Redis queues', () => {
    process.env.DUDESIGN_QUEUE = 'redis'

    assert.equal(shouldConsumeQueue('api'), false)
  })

  it('always consumes queues in worker and inline roles', () => {
    process.env.DUDESIGN_QUEUE = 'redis'

    assert.equal(shouldConsumeQueue('worker'), true)
    assert.equal(shouldConsumeQueue('inline'), true)
  })
})
