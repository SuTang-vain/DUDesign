import { NexusClient } from './nexusClient.js'
import { createRuntimeAdapterServer } from './app.js'
import { createRuntimeLaneRegistryFromConfigs, parseRuntimeLaneConfigsJson } from './runtimeLane.js'
import { FileRuntimeAdapterStateStore } from './stateStore.js'

const host = process.env.HOST ?? '0.0.0.0'
const port = Number(process.env.PORT ?? 4100)
const nexusBaseUrl = process.env.BABELO_NEXUS_BASE_URL ?? process.env.NEXUS_BASE_URL
const laneConfigs = parseRuntimeLaneConfigsJson(process.env.DUDESIGN_RUNTIME_LANES_JSON)

if (!nexusBaseUrl && !laneConfigs) {
  throw new Error('BABELO_NEXUS_BASE_URL is required for DUDesign runtime adapter.')
}

const laneRegistry = laneConfigs
  ? createRuntimeLaneRegistryFromConfigs(laneConfigs, config => createNexusClient(config.baseUrl))
  : undefined

const server = createRuntimeAdapterServer({
  nexus: laneRegistry?.primary().nexus ?? createNexusClient(nexusBaseUrl!),
  ...(laneRegistry && { runtimeLaneRegistry: laneRegistry }),
  workspaceBase: process.env.RUNTIME_ADAPTER_WORKSPACE_BASE,
  executeRetryAttempts: parseNonNegativeInteger(process.env.RUNTIME_ADAPTER_EXECUTE_RETRY_ATTEMPTS),
  executeRetryBaseDelayMs: parseNonNegativeInteger(process.env.RUNTIME_ADAPTER_EXECUTE_RETRY_BASE_DELAY_MS),
  laneRetryAttempts: parseNonNegativeInteger(process.env.RUNTIME_ADAPTER_LANE_RETRY_ATTEMPTS),
  laneAcquireTimeoutMs: parsePositiveInteger(process.env.RUNTIME_ADAPTER_LANE_ACQUIRE_TIMEOUT_MS),
  laneAcquirePollMs: parsePositiveInteger(process.env.RUNTIME_ADAPTER_LANE_ACQUIRE_POLL_MS),
  executeTimeoutMs: parsePositiveInteger(process.env.RUNTIME_ADAPTER_EXECUTE_TIMEOUT_MS),
  guidanceExecuteTimeoutMs: parsePositiveInteger(process.env.RUNTIME_ADAPTER_GUIDANCE_EXECUTE_TIMEOUT_MS),
  guidanceTimeoutRetryAttempts: parseNonNegativeInteger(process.env.RUNTIME_ADAPTER_GUIDANCE_TIMEOUT_RETRY_ATTEMPTS),
  watchdogTimeoutMs: parsePositiveInteger(process.env.RUNTIME_ADAPTER_WATCHDOG_TIMEOUT_MS),
  workspacePollIntervalMs: parseNonNegativeInteger(process.env.RUNTIME_ADAPTER_WORKSPACE_POLL_INTERVAL_MS),
  ...(process.env.RUNTIME_ADAPTER_STATE_FILE && {
    stateStore: new FileRuntimeAdapterStateStore(process.env.RUNTIME_ADAPTER_STATE_FILE),
  }),
})

server.listen(port, host, () => {
  console.log(`DUDesign BabeL-O runtime adapter listening on http://${host}:${port}`)
})

function createNexusClient(baseUrl: string): NexusClient {
  return new NexusClient({
    baseUrl,
    apiKey: process.env.BABELO_NEXUS_API_KEY ?? process.env.NEXUS_API_KEY,
    authHeaderName: process.env.BABELO_NEXUS_AUTH_HEADER ?? process.env.NEXUS_AUTH_HEADER,
  })
}

function parseNonNegativeInteger(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}
