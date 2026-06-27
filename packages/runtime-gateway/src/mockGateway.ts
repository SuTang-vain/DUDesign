import { createDesignEvent, type DesignEvent } from '@dudesign/contracts'
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

const CONTRACT_VERSION = '2026-06-26.dudesign-runtime.v1'

export class MockRuntimeGateway implements RuntimeGateway {
  private artifactSequence = 1

  async getRuntimeHealth(): Promise<RuntimeHealth> {
    return {
      status: 'compatible',
      runtime: 'babel-o',
      runtimeVersion: 'mock',
      contractVersion: CONTRACT_VERSION,
      checkedAt: new Date().toISOString(),
      message: 'Mock runtime gateway is healthy.',
    }
  }

  async getRuntimeContract(): Promise<RuntimeContract> {
    return {
      runtime: 'babel-o',
      runtimeVersion: 'mock',
      contractVersion: CONTRACT_VERSION,
      status: 'compatible',
      requiredEndpoints: [
        'POST /v1/sessions',
        'POST /v1/sessions/:sessionId/resume',
        'GET /v1/stream',
        'POST /v1/agents',
      ],
      requiredEvents: [
        'session_started',
        'assistant_delta',
        'workspace_dirty',
        'workspace_dirty_detected',
        'result',
        'error',
      ],
      eventMappings: {
        session_started: 'design.session_started',
        assistant_delta: 'design.variation_streaming',
        workspace_dirty: 'design.variation_artifact_updated',
        workspace_dirty_detected: 'design.variation_artifact_updated',
        result: 'design.variation_completed',
        error: 'design.variation_failed',
      },
    }
  }

  async createSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionRef> {
    return {
      runtimeSessionId: `mock_runtime_session_${input.sessionId}`,
    }
  }

  async resumeSession(input: ResumeRuntimeSessionInput): Promise<RuntimeResumeResult> {
    if (input.runtimeSessionId) {
      return {
        status: 'resumed',
        runtimeSessionId: input.runtimeSessionId,
      }
    }
    return {
      status: 'rebuilt',
      runtimeSessionId: `mock_runtime_session_${input.sessionId}_rebuilt`,
      message: 'Mock runtime rebuilt the session from DUDesign snapshots.',
    }
  }

  async *spawnVariationAgents(input: SpawnVariationAgentsInput): AsyncIterable<DesignEvent> {
    yield createDesignEvent({
      type: 'design.job_started',
      sessionId: input.sessionId,
      jobId: input.jobId,
      payload: { variationCount: input.variationCount },
    })

    for (let index = 1; index <= input.variationCount; index += 1) {
      const variationId = `mock_variation_${index}`
      yield createDesignEvent({
        type: 'design.variation_queued',
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId,
        payload: { index },
      })
      yield createDesignEvent({
        type: 'design.variation_streaming',
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId,
        payload: {
          channel: 'assistant',
          delta: `Creating variation ${index} for: ${input.prompt}`,
        },
      })
      yield createDesignEvent({
        type: 'design.variation_preview_ready',
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId,
        payload: {
          artifactId: `mock_artifact_${input.jobId}_${index}`,
          previewUrl: `/api/variations/${variationId}/preview`,
        },
      })
      yield createDesignEvent({
        type: 'design.variation_completed',
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId,
        payload: {
          artifactId: `mock_artifact_${input.jobId}_${index}`,
          inputTokens: 1000 + index,
          outputTokens: 4000 + index,
          costCents: 5 + index,
          durationMs: 1000 * index,
        },
      })
    }

    yield createDesignEvent({
      type: 'design.job_completed',
      sessionId: input.sessionId,
      jobId: input.jobId,
      payload: {
        completedVariationCount: input.variationCount,
        failedVariationCount: 0,
      },
    })
  }

  async *refineVariation(input: RefineVariationInput): AsyncIterable<DesignEvent> {
    const artifactId = `mock_refined_artifact_${input.jobId}_${input.variationId}_${this.artifactSequence}`
    this.artifactSequence += 1

    yield createDesignEvent({
      type: 'design.variation_streaming',
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId: input.variationId,
      payload: {
        channel: 'assistant',
        delta: `Refining variation from artifact ${input.baseArtifactId}: ${input.prompt}`,
      },
    })
    yield createDesignEvent({
      type: 'design.variation_completed',
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId: input.variationId,
      payload: {
        artifactId,
        inputTokens: 500,
        outputTokens: 2000,
        costCents: 3,
        durationMs: 1200,
      },
    })
  }

	  async cancelRuntimeJob(input: CancelRuntimeJobInput): Promise<CancelRuntimeJobResult> {
	    return {
	      cancelled: true,
	      message: `Mock runtime job ${input.jobId} cancelled${input.reason ? `: ${input.reason}` : '.'}`,
	      cancelledVariationCount: input.variations?.length ?? 0,
	      failedVariationCount: 0,
	    }
	  }
}
