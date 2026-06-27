import { createDesignEvent, type DesignEvent } from '@dudesign/contracts'
import { BabelONexusEventAdapter } from './babelOAdapter.js'
import {
  BabelORuntimeClient,
  type BabelORuntimeClientConfig,
  RuntimeGatewayError,
} from './babelOClient.js'
import type {
  CancelRuntimeJobInput,
  CancelRuntimeJobResult,
  CreateRuntimeSessionInput,
  RefineVariationInput,
  ResumeRuntimeSessionInput,
  RuntimeContract,
  RuntimeGateway,
  RuntimeHealth,
  RuntimeResumeResult,
  RuntimeSessionRef,
  SpawnVariationAgentsInput,
} from './types.js'

export type BabelORuntimeGatewayOptions = {
  client?: BabelORuntimeClient
  clientConfig?: BabelORuntimeClientConfig
  adapter?: BabelONexusEventAdapter
}

export class BabelORuntimeGateway implements RuntimeGateway {
  private readonly client: BabelORuntimeClient
  private readonly adapter: BabelONexusEventAdapter

  constructor(options: BabelORuntimeGatewayOptions = {}) {
    if (!options.client && !options.clientConfig) {
      throw new RuntimeGatewayError('RUNTIME_UNAVAILABLE', 'BabeL-O runtime gateway requires a client or clientConfig.')
    }
    this.client = options.client ?? new BabelORuntimeClient(options.clientConfig!)
    this.adapter = options.adapter ?? new BabelONexusEventAdapter()
  }

  getRuntimeHealth(): Promise<RuntimeHealth> {
    return this.client.getRuntimeHealth()
  }

  getRuntimeContract(): Promise<RuntimeContract> {
    return this.client.getRuntimeContract()
  }

  async createSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionRef> {
    await this.requireCompatibleRuntime()
    return this.client.createSession(input)
  }

  async resumeSession(input: ResumeRuntimeSessionInput): Promise<RuntimeResumeResult> {
    const contract = await this.client.getRuntimeContract()
    if (contract.status !== 'compatible' && contract.status !== 'degraded') {
      return {
        status: 'unavailable',
        runtimeSessionId: null,
        message: `BabeL-O runtime is not resumable: ${contract.status}.`,
      }
    }
    return this.client.resumeSession(input)
  }

  async *spawnVariationAgents(input: SpawnVariationAgentsInput): AsyncIterable<DesignEvent> {
    await this.requireCompatibleRuntime()
    yield createDesignEvent({
      type: 'design.job_started',
      sessionId: input.sessionId,
      jobId: input.jobId,
      payload: { variationCount: input.variationCount },
    })
    const streams: Array<AsyncIterable<DesignEvent>> = []
    for (let index = 1; index <= input.variationCount; index += 1) {
      const variationId = `runtime_variation_${index}`
      yield createDesignEvent({
        type: 'design.variation_queued',
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId,
        payload: { index },
      })
      streams.push(this.streamVariation(input, index, variationId))
    }

    let completedVariationCount = 0
    let failedVariationCount = 0
    for await (const event of mergeAsyncIterables(streams)) {
      if (event.type === 'design.variation_completed') completedVariationCount += 1
      if (event.type === 'design.variation_failed') failedVariationCount += 1
      yield event
    }
    yield createDesignEvent({
      type: 'design.job_completed',
      sessionId: input.sessionId,
      jobId: input.jobId,
      payload: {
        completedVariationCount,
        failedVariationCount,
      },
    })
  }

  async *refineVariation(input: RefineVariationInput): AsyncIterable<DesignEvent> {
    await this.requireCompatibleRuntime()
    const agent = await this.client.createRefineAgent(input)
    for await (const rawEvent of this.client.streamRuntimeEvents({
      streamId: agent.streamId,
      runtimeSessionId: agent.runtimeChildSessionId ?? input.runtimeChildSessionId ?? undefined,
      agentJobId: agent.agentJobId,
    })) {
      yield this.adapter.toDesignEvent({ type: String(rawEvent.type ?? 'unknown'), ...rawEvent }, {
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId: input.variationId,
      })
    }
  }

  async cancelRuntimeJob(input: CancelRuntimeJobInput): Promise<CancelRuntimeJobResult> {
    return {
      cancelled: false,
      message: `BabeL-O cancel is not implemented yet for job ${input.jobId}.`,
    }
  }

  mapRuntimeEvent(
    event: Parameters<BabelONexusEventAdapter['toDesignEvent']>[0],
    context: Parameters<BabelONexusEventAdapter['toDesignEvent']>[1],
  ): DesignEvent {
    return this.adapter.toDesignEvent(event, context)
  }

  private async requireCompatibleRuntime(): Promise<void> {
    const contract = await this.client.getRuntimeContract()
    if (contract.status === 'compatible' || contract.status === 'degraded') return
    if (contract.status === 'contract_mismatch') {
      throw new RuntimeGatewayError('RUNTIME_CONTRACT_MISMATCH', 'BabeL-O runtime contract does not match DUDesign expectations.')
    }
    throw new RuntimeGatewayError('RUNTIME_UNAVAILABLE', 'BabeL-O runtime is unavailable.')
  }

  private async *streamVariation(
    input: SpawnVariationAgentsInput,
    variationIndex: number,
    variationId: string,
  ): AsyncIterable<DesignEvent> {
    let terminal = false
    try {
      const agent = await this.client.spawnVariationAgent({ ...input, variationIndex })
      for await (const rawEvent of this.client.streamRuntimeEvents({
        streamId: agent.streamId,
        runtimeSessionId: agent.runtimeChildSessionId,
        agentJobId: agent.agentJobId,
      })) {
        const event = this.adapter.toDesignEvent({ type: String(rawEvent.type ?? 'unknown'), ...rawEvent }, {
          sessionId: input.sessionId,
          jobId: input.jobId,
          variationId,
        })
        if (event.type === 'design.variation_completed' || event.type === 'design.variation_failed') terminal = true
        yield event
      }
      if (!terminal) {
        yield createDesignEvent({
          type: 'design.variation_failed',
          sessionId: input.sessionId,
          jobId: input.jobId,
          variationId,
          payload: {
            errorCode: 'RUNTIME_STREAM_ENDED_WITHOUT_RESULT',
            message: 'BabeL-O runtime stream ended before producing a terminal result.',
            recoverable: true,
          },
        })
      }
    } catch (error) {
      yield createDesignEvent({
        type: 'design.variation_failed',
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId,
        payload: {
          errorCode: error instanceof RuntimeGatewayError ? error.code : 'RUNTIME_VARIATION_FAILED',
          message: error instanceof Error ? error.message : 'BabeL-O variation failed.',
          recoverable: true,
        },
      })
    }
  }
}

async function* mergeAsyncIterables<T>(iterables: Array<AsyncIterable<T>>): AsyncIterable<T> {
  const iterators = iterables.map(iterable => iterable[Symbol.asyncIterator]())
  const pending = new Map<number, Promise<{ index: number; result: IteratorResult<T> }>>()
  const readNext = (index: number) => iterators[index]!.next().then(result => ({ index, result }))

  for (const index of iterators.keys()) {
    pending.set(index, readNext(index))
  }

  while (pending.size > 0) {
    const { index, result } = await Promise.race(pending.values())
    pending.delete(index)
    if (result.done) continue
    yield result.value
    pending.set(index, readNext(index))
  }
}
