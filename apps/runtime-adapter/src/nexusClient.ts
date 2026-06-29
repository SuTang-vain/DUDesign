export type NexusClientConfig = {
  baseUrl: string
  apiKey?: string
  authHeaderName?: string
  fetch?: typeof fetch
}

export class NexusClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
  ) {
    super(message)
    this.name = 'NexusClientError'
  }
}

export type NexusSessionResponse = {
  type?: string
  sessionId?: string
  clientSessionId?: string
}

export type NexusResumeResponse = {
  type?: string
  sessionId?: string
  session?: unknown
}

export type NexusAgentJob = {
  jobId: string
  parentSessionId: string
  childSessionId: string
  status: 'queued' | 'running' | 'waiting_permission' | 'completed' | 'failed' | 'cancelled'
  prompt: string
}

export type NexusAgentSpawnResponse = {
  type?: string
  job?: NexusAgentJob
}

export type NexusAgentResponse = {
  type?: string
  job?: NexusAgentJob
}

export type NexusAgentTranscriptResponse = {
  type?: string
  events?: Array<Record<string, unknown>>
}

export type NexusExecuteResponse = {
  type?: string
  sessionId?: string
  success?: boolean
  events?: Array<Record<string, unknown>>
}

export class NexusClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly config: NexusClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = config.fetch ?? fetch
  }

  health(): Promise<Record<string, unknown>> {
    return this.requestJson('/health')
  }

  version(): Promise<Record<string, unknown>> {
    return this.requestJson('/v1/runtime/version')
  }

  async createSession(input: {
    sessionId: string
    workspaceRoot: string
    userId: string
    workspaceId: string
    memoryNamespace: string
  }): Promise<NexusSessionResponse> {
    return this.requestJson('/v1/sessions', {
      method: 'POST',
      body: {
        cwd: input.workspaceRoot,
        clientSessionId: input.sessionId,
        metadata: {
          userId: input.userId,
          workspaceId: input.workspaceId,
          memoryNamespace: input.memoryNamespace,
          source: 'dudesign-runtime-adapter',
        },
      },
    })
  }

  async resumeSession(runtimeSessionId: string): Promise<NexusResumeResponse> {
    return this.requestJson(`/v1/sessions/${encodeURIComponent(runtimeSessionId)}/resume`, {
      method: 'POST',
      body: {
        recentEventLimit: 100,
        includeTasks: true,
        includeChildSessions: true,
      },
    })
  }

  async spawnAgent(input: {
    parentSessionId: string
    prompt: string
    metadata: Record<string, unknown>
    modelId?: string
    modelProvider?: string
  }): Promise<NexusAgentSpawnResponse> {
    return this.requestJson('/v1/agents', {
      method: 'POST',
      body: {
        parentSessionId: input.parentSessionId,
        prompt: input.prompt,
        agentType: 'implement',
        contextForkMode: 'working-set',
        isolation: 'none',
        allowedTools: ['Read', 'ListDir', 'Glob', 'Grep', 'Write', 'Edit'],
        ...(input.modelId && { modelId: input.modelId }),
        ...(input.modelProvider && { modelProvider: input.modelProvider }),
        metadata: input.metadata,
      },
    })
  }

  async waitForAgent(agentJobId: string, timeoutMs = 600000): Promise<NexusAgentResponse> {
    return this.requestJson(`/v1/agents/${encodeURIComponent(agentJobId)}/wait`, {
      method: 'POST',
      body: { timeoutMs },
    })
  }

  async cancelAgent(agentJobId: string, reason?: string): Promise<NexusAgentResponse> {
    return this.requestJson(`/v1/agents/${encodeURIComponent(agentJobId)}/cancel`, {
      method: 'POST',
      body: { reason },
    })
  }

  async getAgentTranscript(agentJobId: string): Promise<NexusAgentTranscriptResponse> {
    return this.requestJson(`/v1/agents/${encodeURIComponent(agentJobId)}/transcript?limit=500&order=asc`)
  }

  async execute(input: {
    sessionId: string
    prompt: string
    cwd: string
    modelId?: string
    timeoutMs?: number
  }): Promise<NexusExecuteResponse> {
    return this.requestJson('/v1/execute', {
      method: 'POST',
      body: {
        sessionId: input.sessionId,
        prompt: input.prompt,
        cwd: input.cwd,
        timeoutMs: input.timeoutMs ?? 300000,
        watchdogTimeoutMs: input.timeoutMs ?? 300000,
        allowedTools: ['*'],
        skipPermissionCheck: true,
        ...(runtimeModelId(input.modelId) && { model: runtimeModelId(input.modelId) }),
      },
    })
  }

  private async requestJson<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST'
      body?: Record<string, unknown>
    } = {},
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: this.headers(options.body !== undefined),
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    })
    if (!response.ok) {
      throw new NexusClientError(`BabeL-O Nexus returned HTTP ${response.status} for ${path}.`, response.status, path)
    }
    const payload = await response.json()
    if (!payload || typeof payload !== 'object') {
      throw new Error(`BabeL-O Nexus returned invalid JSON for ${path}.`)
    }
    return payload as T
  }

  private headers(hasBody = false): HeadersInit {
    const headers: Record<string, string> = {
      accept: 'application/json',
    }
    if (hasBody) headers['content-type'] = 'application/json'
    if (this.config.apiKey) {
      const authHeaderName = optionalString(this.config.authHeaderName)
      headers[authHeaderName ?? 'authorization'] = authHeaderName
        ? this.config.apiKey
        : `Bearer ${this.config.apiKey}`
    }
    return headers
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function runtimeModelId(modelId: string | undefined): string | undefined {
  const normalized = optionalString(modelId)
  if (!normalized || normalized === 'babel-o-default') return undefined
  return normalized
}
