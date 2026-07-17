import { constants } from 'node:fs'
import { access, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createDesignEvent, type DesignEvent } from '@dudesign/contracts'
import {
  runtimeExplorationContextForVariation,
  runtimeExplorationPromptBlock,
} from './runtimeExplorationContext.js'
import type {
  CancelRuntimeJobInput,
  CancelRuntimeJobResult,
  CreateRuntimeSessionInput,
  RefineVariationInput,
  ResumeRuntimeSessionInput,
  RuntimeContract,
  RuntimeGateway,
  RuntimeHealth,
  RuntimeModels,
  RuntimeResumeResult,
  RuntimeSessionRef,
  SpawnVariationAgentsInput,
} from './types.js'

const CLI_RUNTIME_CONTRACT_VERSION = '2026-06-26.dudesign-runtime.v1'
const TEXT_ARTIFACT_EXTENSIONS = new Set(['.html', '.css', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.txt', '.md', '.svg'])

export type CliAgentRuntimeGatewayOptions = {
  executable: string
  args?: string[]
  workspaceBaseDir: string
  env?: Record<string, string>
  timeoutMs?: number
  maxOutputBytes?: number
  maxArtifactBytes?: number
  maxArtifactFiles?: number
  variationConcurrency?: number
  killGraceMs?: number
}

export class CliAgentRuntimeGateway implements RuntimeGateway {
  private readonly executable: string
  private readonly args: string[]
  private readonly workspaceBaseDir: string
  private readonly env: Record<string, string>
  private readonly timeoutMs: number
  private readonly maxOutputBytes: number
  private readonly maxArtifactBytes: number
  private readonly maxArtifactFiles: number
  private readonly variationConcurrency: number
  private readonly killGraceMs: number
  private readonly activeProcesses = new Map<string, ChildProcessWithoutNullStreams>()
  private readonly queuedRefineCancellations = new Set<string>()

  constructor(options: CliAgentRuntimeGatewayOptions) {
    if (!isAbsolute(options.executable)) {
      throw new Error('CLI Agent executable must be an absolute path.')
    }
    if (!isAbsolute(options.workspaceBaseDir)) {
      throw new Error('CLI Agent workspace base must be an absolute path.')
    }
    if ((options.args ?? []).some(argument => argument.includes('\0'))) {
      throw new Error('CLI Agent arguments cannot contain null bytes.')
    }
    this.executable = options.executable
    this.args = [...(options.args ?? [])]
    this.workspaceBaseDir = resolve(options.workspaceBaseDir)
    this.env = { ...(options.env ?? {}) }
    this.timeoutMs = positiveInteger(options.timeoutMs, 10 * 60 * 1000)
    this.maxOutputBytes = positiveInteger(options.maxOutputBytes, 1024 * 1024)
    this.maxArtifactBytes = positiveInteger(options.maxArtifactBytes, 5 * 1024 * 1024)
    this.maxArtifactFiles = positiveInteger(options.maxArtifactFiles, 128)
    this.variationConcurrency = positiveInteger(options.variationConcurrency, 1)
    this.killGraceMs = positiveInteger(options.killGraceMs, 2000)
  }

  async getRuntimeHealth(): Promise<RuntimeHealth> {
    try {
      await access(this.executable, constants.X_OK)
      await mkdir(this.workspaceBaseDir, { recursive: true })
      return {
        status: 'compatible',
        runtime: 'cli-agent',
        runtimeVersion: null,
        contractVersion: CLI_RUNTIME_CONTRACT_VERSION,
        checkedAt: new Date().toISOString(),
        message: 'CLI Agent executable and workspace base are available.',
      }
    } catch (error) {
      return {
        status: 'unavailable',
        runtime: 'cli-agent',
        runtimeVersion: null,
        contractVersion: CLI_RUNTIME_CONTRACT_VERSION,
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'CLI Agent runtime is unavailable.',
      }
    }
  }

  async getRuntimeContract(): Promise<RuntimeContract> {
    const health = await this.getRuntimeHealth()
    return {
      runtime: 'cli-agent',
      runtimeVersion: null,
      contractVersion: CLI_RUNTIME_CONTRACT_VERSION,
      status: health.status,
      requiredEndpoints: [],
      optionalEndpoints: [],
      requiredEvents: ['assistant_delta', 'file_delta', 'result', 'error'],
      eventMappings: {
        assistant_delta: 'design.variation_streaming',
        file_delta: 'design.variation_code_delta',
        result: 'design.variation_completed',
        error: 'design.variation_failed',
      },
    }
  }

  async listRuntimeModels(): Promise<RuntimeModels> {
    return {
      type: 'runtime_models',
      version: 'cli-agent',
      defaultModel: 'cli-agent/configured',
      activeProfile: 'cli-agent',
      syncedAt: new Date().toISOString(),
      providers: [{
        id: 'cli-agent',
        displayName: 'Configured CLI Agent',
        adapter: 'workspace-cli',
        authMode: 'host-profile',
        defaultModel: 'cli-agent/configured',
        configured: true,
        authConfigured: true,
        authSource: 'profile',
        active: true,
        models: [{
          id: 'cli-agent/configured',
          name: 'Configured CLI Agent',
          contextWindow: 0,
          defaultMaxTokens: 0,
          capabilities: {
            toolCalling: true,
            jsonOutput: false,
            streaming: true,
          },
        }],
      }],
    }
  }

  async createSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionRef> {
    return { runtimeSessionId: `cli_session_${safeSegment(input.sessionId)}` }
  }

  async resumeSession(input: ResumeRuntimeSessionInput): Promise<RuntimeResumeResult> {
    return input.runtimeSessionId
      ? { status: 'resumed', runtimeSessionId: input.runtimeSessionId }
      : {
          status: 'rebuilt',
          runtimeSessionId: `cli_session_${safeSegment(input.sessionId)}_rebuilt`,
          message: 'CLI Agent session was rebuilt from DUDesign snapshots.',
        }
  }

  async *spawnVariationAgents(input: SpawnVariationAgentsInput): AsyncIterable<DesignEvent> {
    const health = await this.getRuntimeHealth()
    if (health.status !== 'compatible') throw new Error(health.message ?? 'CLI Agent runtime is unavailable.')
    yield createDesignEvent({
      type: 'design.job_started',
      sessionId: input.sessionId,
      jobId: input.jobId,
      payload: { variationCount: input.variationCount },
    })

    const streams = Array.from({ length: input.variationCount }, (_, offset) => {
      const variationIndex = offset + 1
      return this.runVariation(input, variationIndex)
    })
    let completedVariationCount = 0
    let failedVariationCount = 0
    for await (const event of mergeAsyncIterables(streams, this.variationConcurrency)) {
      if (event.type === 'design.variation_completed') completedVariationCount += 1
      if (event.type === 'design.variation_failed') failedVariationCount += 1
      yield event
    }
    yield createDesignEvent({
      type: 'design.job_completed',
      sessionId: input.sessionId,
      jobId: input.jobId,
      payload: { completedVariationCount, failedVariationCount },
    })
  }

  async *refineVariation(input: RefineVariationInput): AsyncIterable<DesignEvent> {
    if (input.requestId && this.queuedRefineCancellations.delete(input.requestId)) return
    const variationIndex = input.variationIndex ?? 1
    const workspace = this.variationWorkspace(input.workspaceRoot, input.jobId ?? 'refine', variationIndex)
    await mkdir(workspace, { recursive: true })
    await writeFile(resolve(workspace, 'index.html'), input.baseArtifactHtml, 'utf8')
    yield* this.executeAgent({
      processKey: `${input.jobId ?? input.sessionId}:${input.variationId}:${input.requestId ?? 'refine'}`,
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId: input.variationId,
      variationIndex,
      workspace,
      prompt: cliRefinePrompt(input),
    })
  }

  async cancelRuntimeJob(input: CancelRuntimeJobInput): Promise<CancelRuntimeJobResult> {
    let cancelledVariationCount = 0
    for (const [key, child] of this.activeProcesses) {
      if (!key.startsWith(`${input.jobId}:`)) continue
      if (input.requestId && !key.endsWith(`:${input.requestId}`)) continue
      if (terminateProcess(child, this.killGraceMs)) cancelledVariationCount += 1
    }
    if (input.requestId && cancelledVariationCount === 0) {
      this.queuedRefineCancellations.add(input.requestId)
      return {
        cancelled: true,
        cancelledVariationCount: 0,
        failedVariationCount: 0,
        message: `Queued cancellation for CLI refine request ${input.requestId}.`,
      }
    }
    return {
      cancelled: cancelledVariationCount > 0,
      cancelledVariationCount,
      failedVariationCount: 0,
      message: cancelledVariationCount > 0
        ? `Cancelled ${cancelledVariationCount} CLI Agent process(es).`
        : 'No active CLI Agent processes matched the job.',
    }
  }

  private async *runVariation(
    input: SpawnVariationAgentsInput,
    variationIndex: number,
  ): AsyncIterable<DesignEvent> {
    const variationId = `runtime_variation_${variationIndex}`
    yield createDesignEvent({
      type: 'design.variation_queued',
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId,
      payload: {
        index: variationIndex,
        runtimeChildSessionId: `cli_child_${safeSegment(input.jobId)}_${variationIndex}`,
        runtimeAgentJobId: `cli_process_${safeSegment(input.jobId)}_${variationIndex}`,
      },
    })
    let workspace: string
    try {
      workspace = this.variationWorkspace(input.workspaceRoot, input.jobId, variationIndex)
      await mkdir(workspace, { recursive: true })
    } catch (error) {
      yield createDesignEvent({
        type: 'design.variation_failed',
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId,
        payload: {
          errorCode: 'CLI_AGENT_WORKSPACE_REJECTED',
          message: error instanceof Error ? error.message : 'CLI Agent workspace was rejected.',
          recoverable: false,
        },
      })
      return
    }
    yield* this.executeAgent({
      processKey: `${input.jobId}:${variationId}`,
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId,
      variationIndex,
      workspace,
      prompt: cliVariationPrompt(input, variationIndex),
    })
  }

  private async *executeAgent(input: {
    processKey: string
    sessionId: string
    jobId?: string
    variationId: string
    variationIndex: number
    workspace: string
    prompt: string
  }): AsyncIterable<DesignEvent> {
    const args = this.args.map(argument => expandArgument(argument, input))
    const child = spawn(this.executable, args, {
      cwd: input.workspace,
      env: this.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.activeProcesses.set(input.processKey, child)
    child.stdin.end(`${input.prompt}\n`)

    let outputBytes = 0
    let stderr = ''
    let timedOut = false
    let killedForOutput = false
    const timer = setTimeout(() => {
      timedOut = true
      terminateProcess(child, this.killGraceMs)
    }, this.timeoutMs)
    child.stderr.on('data', chunk => {
      stderr = appendBounded(stderr, String(chunk), this.maxOutputBytes)
    })
    const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExit, rejectExit) => {
      child.once('error', rejectExit)
      child.once('close', (code, signal) => resolveExit({ code, signal }))
    })

    try {
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
      for await (const line of lines) {
        outputBytes += Buffer.byteLength(line) + 1
        if (outputBytes > this.maxOutputBytes) {
          killedForOutput = true
          terminateProcess(child, this.killGraceMs)
          break
        }
        if (!line.trim()) continue
        yield createDesignEvent({
          type: 'design.variation_streaming',
          sessionId: input.sessionId,
          jobId: input.jobId,
          variationId: input.variationId,
          payload: { channel: 'assistant', delta: line },
        })
      }
      const result = await exit
      if (timedOut) throw new Error(`CLI Agent timed out after ${this.timeoutMs}ms.`)
      if (killedForOutput) throw new Error(`CLI Agent output exceeded ${this.maxOutputBytes} bytes.`)
      if (result.code !== 0) {
        throw new Error(`CLI Agent exited with code ${String(result.code)}${stderr ? `: ${stderr}` : '.'}`)
      }
      const files = await readWorkspaceArtifacts(input.workspace, this.maxArtifactFiles, this.maxArtifactBytes)
      const html = files.find(file => file.path === 'index.html')?.content
      if (!html) throw new Error('CLI Agent completed without writing index.html.')
      for (const [sequence, file] of files.entries()) {
        yield createDesignEvent({
          type: 'design.variation_code_delta',
          sessionId: input.sessionId,
          jobId: input.jobId,
          variationId: input.variationId,
          payload: {
            path: file.path,
            language: languageForPath(file.path),
            delta: file.content,
            sequence: sequence + 1,
            isFinal: true,
          },
        })
      }
      yield createDesignEvent({
        type: 'design.variation_completed',
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId: input.variationId,
        payload: {
          entryPath: 'index.html',
          changedPaths: files.map(file => file.path),
          html,
          files,
        },
      })
    } catch (error) {
      yield createDesignEvent({
        type: 'design.variation_failed',
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId: input.variationId,
        payload: {
          errorCode: timedOut ? 'CLI_AGENT_TIMEOUT' : 'CLI_AGENT_FAILED',
          message: error instanceof Error ? error.message : 'CLI Agent execution failed.',
          recoverable: true,
        },
      })
    } finally {
      clearTimeout(timer)
      this.activeProcesses.delete(input.processKey)
    }
  }

  private variationWorkspace(workspaceRoot: string, jobId: string, variationIndex: number): string {
    const baseWorkspace = secureWorkspacePath(this.workspaceBaseDir, workspaceRoot)
    return resolve(baseWorkspace, 'runtime-jobs', safeSegment(jobId), `variation_${String(variationIndex).padStart(2, '0')}`)
  }
}

function cliVariationPrompt(input: SpawnVariationAgentsInput, variationIndex: number): string {
  const explorationContext = runtimeExplorationContextForVariation(input.explorationContexts, variationIndex)
  return [
    'You are a DUDesign CLI Agent working in an isolated variation workspace.',
    'Create a complete frontend page and write the final entry file to ./index.html.',
    'You may create local CSS, JavaScript, JSON, Markdown, text, or SVG files under the current workspace only.',
    'Do not access parent directories, absolute output paths, remote deployment targets, or unrelated user workspaces.',
    `Variation ${variationIndex} of ${input.variationCount}.`,
    '',
    `User request:\n${input.prompt}`,
    '',
    runtimeExplorationPromptBlock(explorationContext),
    '',
    input.templateRequirements
      ? `DUDesign template context:\n${JSON.stringify(input.templateRequirements, null, 2)}`
      : '',
  ].filter(Boolean).join('\n')
}

function cliRefinePrompt(input: RefineVariationInput): string {
  return [
    'You are refining an existing DUDesign page in an isolated variation workspace.',
    'The existing page is available at ./index.html. Preserve the fixed product direction and write the final page back to ./index.html.',
    'Do not access parent directories, absolute output paths, remote deployment targets, or unrelated user workspaces.',
    '',
    `Refine request:\n${input.prompt}`,
    input.annotationPromptSuffix ? `Annotation feedback:\n${input.annotationPromptSuffix}` : '',
    '',
    runtimeExplorationPromptBlock(input.explorationContext),
  ].filter(Boolean).join('\n')
}

function secureWorkspacePath(baseDir: string, workspaceRoot: string): string {
  const candidate = isAbsolute(workspaceRoot) ? resolve(workspaceRoot) : resolve(baseDir, workspaceRoot)
  const relativePath = relative(baseDir, candidate)
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error('CLI Agent workspace escapes the configured workspace base.')
  }
  return candidate
}

async function readWorkspaceArtifacts(
  root: string,
  maxFiles: number,
  maxBytes: number,
): Promise<Array<{ path: string; content: string; contentType: string }>> {
  const files: Array<{ path: string; content: string; contentType: string }> = []
  let totalBytes = 0
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith('.')) continue
      const absolute = resolve(directory, entry.name)
      const relativePath = relative(root, absolute).split(sep).join('/')
      const stats = await lstat(absolute)
      if (stats.isSymbolicLink()) continue
      if (stats.isDirectory()) {
        await visit(absolute)
        continue
      }
      if (!stats.isFile() || !isTextArtifact(relativePath)) continue
      if (files.length >= maxFiles) throw new Error(`CLI Agent artifact count exceeds ${maxFiles}.`)
      totalBytes += stats.size
      if (totalBytes > maxBytes) throw new Error(`CLI Agent artifact size exceeds ${maxBytes} bytes.`)
      files.push({
        path: relativePath,
        content: await readFile(absolute, 'utf8'),
        contentType: contentTypeForPath(relativePath),
      })
    }
  }
  await visit(root)
  return files
}

function isTextArtifact(path: string): boolean {
  const dot = path.lastIndexOf('.')
  return dot >= 0 && TEXT_ARTIFACT_EXTENSIONS.has(path.slice(dot).toLowerCase())
}

function contentTypeForPath(path: string): string {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8'
  if (path.endsWith('.css')) return 'text/css; charset=utf-8'
  if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.cjs')) return 'text/javascript; charset=utf-8'
  if (path.endsWith('.json')) return 'application/json; charset=utf-8'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  return 'text/plain; charset=utf-8'
}

function languageForPath(path: string): 'html' | 'css' | 'javascript' | 'typescript' | 'json' | 'text' {
  if (path.endsWith('.html')) return 'html'
  if (path.endsWith('.css')) return 'css'
  if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.cjs')) return 'javascript'
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript'
  if (path.endsWith('.json')) return 'json'
  return 'text'
}

function expandArgument(argument: string, input: {
  workspace: string
  jobId?: string
  variationId: string
  variationIndex: number
}): string {
  return argument
    .replaceAll('{workspace}', input.workspace)
    .replaceAll('{jobId}', input.jobId ?? '')
    .replaceAll('{variationId}', input.variationId)
    .replaceAll('{variationIndex}', String(input.variationIndex))
}

function safeSegment(value: string): string {
  const result = value.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  return result || 'unknown'
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback
}

function appendBounded(current: string, next: string, maxBytes: number): string {
  const combined = current + next
  if (Buffer.byteLength(combined) <= maxBytes) return combined
  return combined.slice(-maxBytes)
}

function terminateProcess(child: ChildProcessWithoutNullStreams, killGraceMs: number): boolean {
  if (child.exitCode !== null || child.signalCode !== null) return false
  const signalled = child.kill('SIGTERM')
  if (!signalled) return false
  const forceKill = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }, killGraceMs)
  forceKill.unref()
  child.once('close', () => clearTimeout(forceKill))
  return true
}

async function* mergeAsyncIterables<T>(iterables: Array<AsyncIterable<T>>, concurrency: number): AsyncIterable<T> {
  const iterators = iterables.map(iterable => iterable[Symbol.asyncIterator]())
  const pending = new Map<number, Promise<{ index: number; result: IteratorResult<T> }>>()
  const readNext = (index: number) => iterators[index]!.next().then(result => ({ index, result }))
  const maxActive = Math.max(1, Math.min(iterators.length, concurrency))
  let nextIndex = 0
  while (nextIndex < iterators.length && pending.size < maxActive) {
    const index = nextIndex++
    pending.set(index, readNext(index))
  }
  while (pending.size > 0) {
    const { index, result } = await Promise.race(pending.values())
    pending.delete(index)
    if (!result.done) {
      yield result.value
      pending.set(index, readNext(index))
      continue
    }
    if (nextIndex < iterators.length) {
      const queued = nextIndex++
      pending.set(queued, readNext(queued))
    }
  }
}
