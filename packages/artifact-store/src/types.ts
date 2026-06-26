export type ArtifactStorePutInput = {
  workspaceId: string
  artifactId: string
  relativePath: string
  contentType: string
  body: Uint8Array | string
  metadata?: Record<string, string>
}

export type ArtifactStorePutResult = {
  storageKey: string
  sizeBytes: number
  contentHash: string
}

export type ArtifactStoreGetResult = {
  storageKey: string
  contentType: string
  sizeBytes: number
  body: Uint8Array
  metadata: Record<string, string>
}

export type ArtifactStore = {
  put(input: ArtifactStorePutInput): Promise<ArtifactStorePutResult>
  get(storageKey: string): Promise<ArtifactStoreGetResult>
  getSignedReadUrl(storageKey: string, options?: { expiresInSeconds?: number }): Promise<string>
  delete(storageKey: string): Promise<void>
}

