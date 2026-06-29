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
        code_delta: 'design.variation_code_delta',
        file_delta: 'design.variation_code_delta',
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
      const files = mockGeneratedFiles(index, input.prompt)
      for (const file of files) {
        yield createDesignEvent({
          type: 'design.variation_code_delta',
          sessionId: input.sessionId,
          jobId: input.jobId,
          variationId,
          payload: {
            path: file.path,
            language: file.language,
            delta: file.content,
            sequence: 1,
            isFinal: true,
          },
        })
        await delay(35)
      }
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

function mockGeneratedFiles(
  index: number,
  prompt: string,
): Array<{ path: string; language: 'html' | 'css' | 'javascript' | 'json'; content: string }> {
  const accent = ['#4f46e5', '#dc2626', '#0891b2', '#c2410c', '#111827', '#65a30d'][index - 1] ?? '#4f46e5'
  const title = prompt.length > 52 ? `${prompt.slice(0, 52)}...` : prompt
  return [
    {
      path: 'index.html',
      language: 'html',
      content: [
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '  <meta charset="utf-8" />',
        `  <title>Variation ${String(index).padStart(2, '0')}</title>`,
        '  <link rel="stylesheet" href="./styles.css" />',
        '</head>',
        '<body>',
        '  <main class="hero">',
        `    <h1>${escapeHtml(title)}</h1>`,
        `    <p>Generated direction ${index} for DUDesign.</p>`,
        '  </main>',
        '  <script src="./script.js"></script>',
        '</body>',
        '</html>',
        '',
      ].join('\n'),
    },
    {
      path: 'styles.css',
      language: 'css',
      content: [
        `:root { --accent: ${accent}; }`,
        'body { margin: 0; font-family: Inter, sans-serif; background: #fffefa; }',
        '.hero { min-height: 100vh; display: grid; place-items: center; padding: 48px; }',
        '.hero h1 { max-width: 760px; color: var(--accent); }',
        '',
      ].join('\n'),
    },
    {
      path: 'script.js',
      language: 'javascript',
      content: `document.documentElement.dataset.variation = "${index}";\n`,
    },
    {
      path: 'assets.json',
      language: 'json',
      content: JSON.stringify({ entry: 'index.html', styles: ['styles.css'], scripts: ['script.js'] }, null, 2),
    },
  ]
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
