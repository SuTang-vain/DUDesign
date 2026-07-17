import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RequestContext } from '../auth.js'
import { starGroupRequirementModuleGraph } from '../fixtures/starGroupRequirementModuleGraph.js'
import { InMemoryStore } from '../store.js'
import { ExplorationPlanningApplicationService } from './explorationPlanningApplicationService.js'

describe('ExplorationPlanningApplicationService', () => {
  it('previews a stable authorized plan without persisting a job', async () => {
    const store = new InMemoryStore()
    const session = await store.createSession({
      userId: store.devUser.id,
      workspaceId: store.devWorkspace.id,
      mode: 'new_html',
    })
    const service = createService(store)
    const input = {
      sessionId: session.id,
      requirementModuleGraphId: starGroupRequirementModuleGraph.id,
      variationCount: 3,
      exploration: { level: 40 },
      dataContext: { units: [{ id: 'unit-a' }] },
    }

    const first = await service.previewPlan(ownerContext(store), input)
    const second = await service.previewPlan(ownerContext(store), input)

    assert.deepEqual(first, second)
    assert.equal(first.explorationPlan.variations[0]?.variationIndex, 1)
    assert.equal(first.explorationPlan.variations[2]?.variationIndex, 3)
    assert.equal((await store.getSessionSnapshot(session.id))?.jobs.length, 0)
  })

  it('blocks viewers and users outside the workspace', async () => {
    const store = new InMemoryStore()
    const session = await store.createSession({
      userId: store.devUser.id,
      workspaceId: store.devWorkspace.id,
      mode: 'new_html',
    })
    const service = createService(store)
    const input = {
      sessionId: session.id,
      requirementModuleGraphId: starGroupRequirementModuleGraph.id,
      variationCount: 3,
      exploration: { level: 40 },
    }
    await store.upsertWorkspaceMember({
      workspaceId: store.devWorkspace.id,
      userId: 'usr_viewer',
      role: 'viewer',
      status: 'active',
    })

    await assert.rejects(
      () => service.previewPlan({ ...ownerContext(store), userId: 'usr_viewer' }, input),
      error => hasErrorCode(error, 403, 'WORKSPACE_FORBIDDEN'),
    )
    await assert.rejects(
      () => service.previewPlan({ ...ownerContext(store), userId: 'usr_outside' }, input),
      error => hasErrorCode(error, 403, 'WORKSPACE_FORBIDDEN'),
    )
  })

  it('does not accept module graphs outside the authorized resolver', async () => {
    const store = new InMemoryStore()
    const session = await store.createSession({
      userId: store.devUser.id,
      workspaceId: store.devWorkspace.id,
      mode: 'new_html',
    })
    const service = createService(store)

    await assert.rejects(
      () => service.previewPlan(ownerContext(store), {
        sessionId: session.id,
        requirementModuleGraphId: 'private-graph-from-another-user',
        variationCount: 3,
        exploration: { level: 40 },
      }),
      error => hasErrorCode(error, 404, 'REQUIREMENT_MODULE_GRAPH_NOT_FOUND'),
    )
  })

  it('normalizes invalid planner input into a user-facing 400 error', async () => {
    const store = new InMemoryStore()
    const session = await store.createSession({
      userId: store.devUser.id,
      workspaceId: store.devWorkspace.id,
      mode: 'new_html',
    })
    const service = createService(store)

    await assert.rejects(
      () => service.previewPlan(ownerContext(store), {
        sessionId: session.id,
        requirementModuleGraphId: starGroupRequirementModuleGraph.id,
        variationCount: 3,
        exploration: { level: 101 },
      }),
      error => hasErrorCode(error, 400, 'INVALID_EXPLORATION_PLAN_INPUT'),
    )
  })
})

function createService(store: InMemoryStore) {
  return new ExplorationPlanningApplicationService(store, ({ requirementModuleGraphId }) => (
    requirementModuleGraphId === starGroupRequirementModuleGraph.id
      ? starGroupRequirementModuleGraph
      : null
  ))
}

function ownerContext(store: InMemoryStore): RequestContext {
  return {
    requestId: 'req_exploration_test',
    userId: store.devUser.id,
    adminRole: null,
    authMode: 'dev',
    authSessionTokenHash: null,
  }
}

function hasErrorCode(error: unknown, status: number, code: string): boolean {
  const value = error as { status?: number; code?: string }
  return value.status === status && value.code === code
}
