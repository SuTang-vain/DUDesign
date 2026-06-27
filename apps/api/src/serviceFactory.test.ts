import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { BabelORuntimeGateway, MockRuntimeGateway } from '@dudesign/runtime-gateway'

import { createRuntimeGatewayFromEnv } from './serviceFactory.js'

const envKeys = [
  'DUDESIGN_RUNTIME_MODE',
  'DUDESIGN_BABELO_BASE_URL',
  'DUDESIGN_BABELO_API_KEY',
  'DUDESIGN_BABELO_AUTH_HEADER',
  'DUDESIGN_BABELO_TIMEOUT_MS',
  'DUDESIGN_BABELO_STREAM_IDLE_TIMEOUT_MS',
  'DUDESIGN_BABELO_STREAM_RECONNECT_ATTEMPTS',
  'DUDESIGN_BABELO_CONTRACT_VERSION',
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
    process.env.DUDESIGN_RUNTIME_MODE = 'babel-o'

    assert.throws(() => createRuntimeGatewayFromEnv(), /DUDESIGN_BABELO_BASE_URL/)
  })

  it('creates a BabeL-O runtime gateway from env configuration', () => {
    process.env.DUDESIGN_RUNTIME_MODE = 'babel-o'
    process.env.DUDESIGN_BABELO_BASE_URL = 'https://runtime.example.test'
    process.env.DUDESIGN_BABELO_API_KEY = 'test-key'
    process.env.DUDESIGN_BABELO_AUTH_HEADER = 'x-runtime-key'
    process.env.DUDESIGN_BABELO_TIMEOUT_MS = '1234'
    process.env.DUDESIGN_BABELO_STREAM_IDLE_TIMEOUT_MS = '5678'
    process.env.DUDESIGN_BABELO_STREAM_RECONNECT_ATTEMPTS = '2'

    const runtime = createRuntimeGatewayFromEnv()

    assert.ok(runtime instanceof BabelORuntimeGateway)
  })
})
