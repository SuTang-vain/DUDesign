import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { BabelORuntimeGateway, CliAgentRuntimeGateway, MockRuntimeGateway } from '@dudesign/runtime-gateway'
import { ArkSeedreamImageMcpExecutor, HttpMcpExecutor, MockMcpExecutor } from './mcpExecutor.js'

import {
  applicationProcessRoleFromEnv,
  createMcpExecutorFromEnv,
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
  'DUDESIGN_CLI_AGENT_EXECUTABLE',
  'DUDESIGN_CLI_AGENT_ARGS_JSON',
  'DUDESIGN_CLI_AGENT_ENV_JSON',
  'DUDESIGN_CLI_AGENT_WORKSPACE_BASE',
  'DUDESIGN_CLI_AGENT_TIMEOUT_MS',
  'DUDESIGN_CLI_AGENT_MAX_OUTPUT_BYTES',
  'DUDESIGN_CLI_AGENT_MAX_ARTIFACT_BYTES',
  'DUDESIGN_CLI_AGENT_MAX_ARTIFACT_FILES',
  'DUDESIGN_CLI_AGENT_KILL_GRACE_MS',
  'DUDESIGN_BABELO_BASE_URL',
  'DUDESIGN_BABELO_API_KEY',
  'DUDESIGN_BABELO_AUTH_HEADER',
  'DUDESIGN_BABELO_TIMEOUT_MS',
  'DUDESIGN_BABELO_STREAM_IDLE_TIMEOUT_MS',
  'DUDESIGN_BABELO_STREAM_RECONNECT_ATTEMPTS',
  'DUDESIGN_BABELO_CONTRACT_VERSION',
  'DUDESIGN_GUIDANCE_ANALYSIS_PROVIDER',
  'DUDESIGN_GUIDANCE_ANALYSIS_ENDPOINT',
  'DUDESIGN_GUIDANCE_ANALYSIS_TIMEOUT_MS',
  'DUDESIGN_GUIDANCE_BABELO_BASE_URL',
  'DUDESIGN_GUIDANCE_BABELO_API_KEY',
  'DUDESIGN_GUIDANCE_BABELO_AUTH_HEADER',
  'DUDESIGN_PROCESS_ROLE',
  'DUDESIGN_SERVICE_ROLE',
  'DUDESIGN_QUEUE',
  'DUDESIGN_QUEUE_PROVIDER',
  'DUDESIGN_MCP_EXECUTOR',
  'DUDESIGN_MCP_PROVIDER',
  'DUDESIGN_MCP_BASE_URL',
  'DUDESIGN_MCP_ENDPOINT_PATH',
  'DUDESIGN_MCP_API_KEY',
  'DUDESIGN_MCP_AUTH_HEADER',
  'DUDESIGN_MCP_TIMEOUT_MS',
  'DUDESIGN_IMAGE_GENERATION_PROVIDER',
  'DUDESIGN_IMAGE_PROVIDER',
  'ARK_API_KEY',
  'DUDESIGN_ARK_API_KEY',
  'ARK_IMAGE_GENERATION_URL',
  'DUDESIGN_ARK_IMAGE_GENERATION_URL',
  'ARK_IMAGE_MODEL',
  'DUDESIGN_ARK_IMAGE_MODEL',
  'ARK_IMAGE_TIMEOUT_MS',
  'DUDESIGN_ARK_IMAGE_TIMEOUT_MS',
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

  it('uses the mock runtime gateway when explicitly configured', () => {
    process.env.DUDESIGN_RUNTIME_PROVIDER = 'mock'

    const runtime = createRuntimeGatewayFromEnv()

    assert.ok(runtime instanceof MockRuntimeGateway)
  })

  it('fails fast for an unknown runtime provider', () => {
    process.env.DUDESIGN_RUNTIME_PROVIDER = 'babel-typo'

    assert.throws(
      () => createRuntimeGatewayFromEnv(),
      /Unsupported DUDESIGN_RUNTIME_PROVIDER: babel-typo/,
    )
  })

  it('requires a BabeL-O base URL when babel-o mode is enabled', () => {
    process.env.DUDESIGN_RUNTIME_PROVIDER = 'babel-o'

    assert.throws(() => createRuntimeGatewayFromEnv(), /BABELO_BASE_URL/)
  })

  it('requires an absolute executable when CLI Agent mode is enabled', () => {
    process.env.DUDESIGN_RUNTIME_PROVIDER = 'cli-agent'

    assert.throws(() => createRuntimeGatewayFromEnv(), /DUDESIGN_CLI_AGENT_EXECUTABLE/)
    process.env.DUDESIGN_CLI_AGENT_EXECUTABLE = 'relative-agent'
    assert.throws(() => createRuntimeGatewayFromEnv(), /absolute path/)
  })

  it('creates a CLI Agent runtime gateway from controlled JSON configuration', () => {
    process.env.DUDESIGN_RUNTIME_PROVIDER = 'cli-agent'
    process.env.DUDESIGN_CLI_AGENT_EXECUTABLE = '/usr/bin/env'
    process.env.DUDESIGN_CLI_AGENT_ARGS_JSON = '["node","agent.mjs","--workspace","{workspace}"]'
    process.env.DUDESIGN_CLI_AGENT_ENV_JSON = '{"HOME":"/tmp/cli-agent-home"}'
    process.env.DUDESIGN_CLI_AGENT_WORKSPACE_BASE = '/tmp/dudesign-cli-workspaces'
    process.env.DUDESIGN_CLI_AGENT_TIMEOUT_MS = '4321'
    process.env.DUDESIGN_CLI_AGENT_MAX_OUTPUT_BYTES = '9876'
    process.env.DUDESIGN_CLI_AGENT_KILL_GRACE_MS = '321'
    process.env.DUDESIGN_RUNTIME_VARIATION_CONCURRENCY = '2'

    const runtime = createRuntimeGatewayFromEnv()

    assert.ok(runtime instanceof CliAgentRuntimeGateway)
    assert.equal(Reflect.get(runtime, 'executable'), '/usr/bin/env')
    assert.deepEqual(Reflect.get(runtime, 'args'), ['node', 'agent.mjs', '--workspace', '{workspace}'])
    assert.deepEqual(Reflect.get(runtime, 'env'), { HOME: '/tmp/cli-agent-home' })
    assert.equal(Reflect.get(runtime, 'timeoutMs'), 4321)
    assert.equal(Reflect.get(runtime, 'maxOutputBytes'), 9876)
    assert.equal(Reflect.get(runtime, 'variationConcurrency'), 2)
    assert.equal(Reflect.get(runtime, 'killGraceMs'), 321)
  })

  it('rejects malformed CLI Agent JSON configuration', () => {
    process.env.DUDESIGN_RUNTIME_PROVIDER = 'cli-agent'
    process.env.DUDESIGN_CLI_AGENT_EXECUTABLE = '/usr/bin/env'
    process.env.DUDESIGN_CLI_AGENT_ARGS_JSON = '{"not":"an-array"}'

    assert.throws(() => createRuntimeGatewayFromEnv(), /JSON array of strings/)
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

describe('createMcpExecutorFromEnv', () => {
  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key]
    }
  })

  it('uses the mock MCP executor by default', () => {
    const executor = createMcpExecutorFromEnv()

    assert.ok(executor instanceof MockMcpExecutor)
  })

  it('requires an HTTP base URL when the HTTP MCP executor is enabled', () => {
    process.env.DUDESIGN_MCP_EXECUTOR = 'http'

    assert.throws(() => createMcpExecutorFromEnv(), /DUDESIGN_MCP_BASE_URL/)
  })

  it('creates an HTTP MCP executor from env configuration', () => {
    process.env.DUDESIGN_MCP_EXECUTOR = 'http'
    process.env.DUDESIGN_MCP_BASE_URL = 'https://mcp.example.test'
    process.env.DUDESIGN_MCP_ENDPOINT_PATH = '/invoke'
    process.env.DUDESIGN_MCP_API_KEY = 'mcp-key'
    process.env.DUDESIGN_MCP_AUTH_HEADER = 'x-mcp-key'
    process.env.DUDESIGN_MCP_TIMEOUT_MS = '1234'

    const executor = createMcpExecutorFromEnv()

    assert.ok(executor instanceof HttpMcpExecutor)
    assert.equal(Reflect.get(executor, 'baseUrl'), 'https://mcp.example.test')
    assert.equal(Reflect.get(executor, 'endpointPath'), '/invoke')
    assert.equal(Reflect.get(executor, 'timeoutMs'), 1234)
  })

  it('requires an Ark API key when image generation provider is enabled', () => {
    process.env.DUDESIGN_IMAGE_GENERATION_PROVIDER = 'ark_seedream'

    assert.throws(() => createMcpExecutorFromEnv(), /ARK_API_KEY/)
  })

  it('wraps the base MCP executor with Ark Seedream image generation when configured', () => {
    process.env.DUDESIGN_MCP_EXECUTOR = 'http'
    process.env.DUDESIGN_MCP_BASE_URL = 'https://mcp.example.test'
    process.env.DUDESIGN_IMAGE_GENERATION_PROVIDER = 'ark_seedream'
    process.env.ARK_API_KEY = 'ark-key'
    process.env.ARK_IMAGE_GENERATION_URL = 'https://ark.example.test/images'
    process.env.ARK_IMAGE_MODEL = 'doubao-seedream-test'
    process.env.ARK_IMAGE_TIMEOUT_MS = '4321'

    const executor = createMcpExecutorFromEnv()

    assert.ok(executor instanceof ArkSeedreamImageMcpExecutor)
    assert.equal(Reflect.get(executor, 'baseUrl'), 'https://ark.example.test/images')
    assert.equal(Reflect.get(executor, 'model'), 'doubao-seedream-test')
    assert.equal(Reflect.get(executor, 'timeoutMs'), 4321)
    assert.ok(Reflect.get(executor, 'fallback') instanceof HttpMcpExecutor)
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
