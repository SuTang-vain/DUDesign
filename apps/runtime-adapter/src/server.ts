import { NexusClient } from './nexusClient.js'
import { createRuntimeAdapterServer } from './app.js'
import { FileRuntimeAdapterStateStore } from './stateStore.js'

const host = process.env.HOST ?? '0.0.0.0'
const port = Number(process.env.PORT ?? 4100)
const nexusBaseUrl = process.env.BABELO_NEXUS_BASE_URL ?? process.env.NEXUS_BASE_URL

if (!nexusBaseUrl) {
  throw new Error('BABELO_NEXUS_BASE_URL is required for DUDesign runtime adapter.')
}

const server = createRuntimeAdapterServer({
  nexus: new NexusClient({
    baseUrl: nexusBaseUrl,
    apiKey: process.env.BABELO_NEXUS_API_KEY ?? process.env.NEXUS_API_KEY,
    authHeaderName: process.env.BABELO_NEXUS_AUTH_HEADER ?? process.env.NEXUS_AUTH_HEADER,
  }),
  workspaceBase: process.env.RUNTIME_ADAPTER_WORKSPACE_BASE,
  executeRetryAttempts: parseNonNegativeInteger(process.env.RUNTIME_ADAPTER_EXECUTE_RETRY_ATTEMPTS),
  executeRetryBaseDelayMs: parseNonNegativeInteger(process.env.RUNTIME_ADAPTER_EXECUTE_RETRY_BASE_DELAY_MS),
  workspacePollIntervalMs: parseNonNegativeInteger(process.env.RUNTIME_ADAPTER_WORKSPACE_POLL_INTERVAL_MS),
  ...(process.env.RUNTIME_ADAPTER_STATE_FILE && {
    stateStore: new FileRuntimeAdapterStateStore(process.env.RUNTIME_ADAPTER_STATE_FILE),
  }),
})

server.listen(port, host, () => {
  console.log(`DUDesign BabeL-O runtime adapter listening on http://${host}:${port}`)
})

function parseNonNegativeInteger(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}
