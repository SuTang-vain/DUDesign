import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApplicationService, type HttpError } from './service.js'
import { createId } from './id.js'

describe('workspace membership guards', () => {
  it('allows viewer reads, blocks viewer writes, and allows editor writes', async () => {
    const service = new ApplicationService({ consumeQueue: false })
    const owner = service.store.devUser
    const workspace = service.store.devWorkspace
    const viewer = (await service.store.createUserWithWorkspace({
      email: `viewer-${createId('test')}@example.com`,
      name: 'Viewer',
    })).user

    await service.store.upsertWorkspaceMember({
      workspaceId: workspace.id,
      userId: viewer.id,
      role: 'viewer',
    })

    const session = await service.createSession(ctx(owner.id), {
      workspaceId: workspace.id,
      mode: 'new_html',
      title: 'Membership read/write',
    })
    const job = await service.createDesignJob(ctx(owner.id), {
      sessionId: session.session.id,
      prompt: 'Create a membership guard smoke page.',
      sourceMode: 'new_html',
      variationCount: 1,
      templateRequirements: {},
    })

    const readable = await service.getDesignJob(ctx(viewer.id), job.job.id)
    assert.equal(readable.job.id, job.job.id)

    await assert.rejects(
      () => service.createDesignJob(ctx(viewer.id), {
        sessionId: session.session.id,
        prompt: 'Viewer should not be able to write.',
        sourceMode: 'new_html',
        variationCount: 1,
        templateRequirements: {},
      }),
      isForbidden,
    )

    await service.store.upsertWorkspaceMember({
      workspaceId: workspace.id,
      userId: viewer.id,
      role: 'editor',
    })
    const editorJob = await service.createDesignJob(ctx(viewer.id), {
      sessionId: session.session.id,
      prompt: 'Editor can create a job.',
      sourceMode: 'new_html',
      variationCount: 1,
      templateRequirements: {},
    })
    const storedEditorJob = await service.store.getJobById(editorJob.job.id)
    assert.equal(storedEditorJob?.sessionId, session.session.id)
  })

  it('blocks non-members and removed members from private resources', async () => {
    const service = new ApplicationService({ consumeQueue: false })
    const owner = service.store.devUser
    const workspace = service.store.devWorkspace
    const removed = (await service.store.createUserWithWorkspace({
      email: `removed-${createId('test')}@example.com`,
      name: 'Removed',
    })).user
    const outsider = await service.store.createUserWithWorkspace({
      email: `outsider-${createId('test')}@example.com`,
      name: 'Outsider',
    })

    const session = await service.createSession(ctx(owner.id), {
      workspaceId: workspace.id,
      mode: 'new_html',
      title: 'Private membership session',
    })

    await assert.rejects(
      () => service.resumeSession(ctx(outsider.user.id), session.session.id),
      isForbidden,
    )

    await service.store.upsertWorkspaceMember({
      workspaceId: workspace.id,
      userId: removed.id,
      role: 'editor',
      status: 'removed',
    })
    await assert.rejects(
      () => service.resumeSession(ctx(removed.id), session.session.id),
      isForbidden,
    )
  })
})

function ctx(userId: string) {
  return {
    requestId: createId('req'),
    userId,
    adminRole: null,
  }
}

function isForbidden(error: unknown): boolean {
  return (error as HttpError).status === 403
}
