'use client'

import { useMemo, useState } from 'react'

export type CodeFile = {
  path: string
  language: 'html' | 'css' | 'javascript' | 'typescript' | 'json' | 'text'
  content: string
  isFinal?: boolean
  retainedChars?: number
  truncatedChars?: number
}

export function CodeFileViewer(props: {
  files: CodeFile[]
  activePath: string
  testId?: string
  emptyLabel?: string
  statusLabel?: string
  onSelectPath: (path: string) => void
}): React.JSX.Element {
  const { files, activePath, testId = 'code-file-viewer', emptyLabel = 'No code files available', statusLabel, onSelectPath } = props
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [copyFailedPath, setCopyFailedPath] = useState<string | null>(null)
  const orderedFiles = sortCodeFiles(files)
  const activeFile = activeCodeFile(orderedFiles, activePath)
  const summary = useMemo(() => activeFile ? fileSummary(activeFile) : null, [activeFile])
  if (!activeFile) return <div className="preview-placeholder">{emptyLabel}</div>
  const copied = copiedPath === activeFile.path
  const copyFailed = copyFailedPath === activeFile.path
  return (
    <div className="code-file-viewer" data-testid={testId}>
      <div className="code-stream-pane">
        <div className="code-stream-header">
          <span>{activeFile.path}</span>
          <span>{statusLabel ?? activeFile.language}</span>
          <span>{summary}</span>
          <button
            type="button"
            className="code-copy-button"
            data-testid="copy-code-button"
            onClick={() => void copyText(activeFile.content)
              .then(() => {
                setCopyFailedPath(null)
                setCopiedPath(activeFile.path)
                window.setTimeout(() => setCopiedPath(current => current === activeFile.path ? null : current), 1400)
              })
              .catch(() => {
                setCopiedPath(null)
                setCopyFailedPath(activeFile.path)
                window.setTimeout(() => setCopyFailedPath(current => current === activeFile.path ? null : current), 1800)
              })}
          >
            {copied ? 'Copied' : copyFailed ? 'Copy failed' : 'Copy'}
          </button>
        </div>
        <div className="code-file-list" aria-label="Code files">
          {orderedFiles.map(file => (
            <button
              key={file.path}
              type="button"
              className={file.path === activeFile.path ? 'active' : ''}
              onClick={() => onSelectPath(file.path)}
            >
              {file.path}
            </button>
          ))}
        </div>
        <pre aria-label={`${activeFile.path} source`}>
          <code>{activeFile.content}</code>
          {activeFile.isFinal === false ? <span className="code-cursor" aria-hidden="true" /> : null}
        </pre>
        {(activeFile.truncatedChars ?? 0) > 0 ? (
          <div className="code-tail-notice" data-testid="code-tail-notice">
            Showing latest {formatBytes(activeFile.retainedChars ?? activeFile.content.length)} of stream.
            Earlier {formatBytes(activeFile.truncatedChars ?? 0)} are compacted to keep preview responsive.
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function CodeFileTrace(props: { files: CodeFile[]; activePath: string; testId?: string }): React.JSX.Element | null {
  const activeFile = activeCodeFile(sortCodeFiles(props.files), props.activePath)
  if (!activeFile) return null
  return (
    <div className="code-stream-trace" data-testid={props.testId ?? 'code-file-trace'}>
      <span>{activeFile.path}</span>
      <code>{tailLine(activeFile.content)}</code>
    </div>
  )
}

export function sortCodeFiles(files: CodeFile[]): CodeFile[] {
  return [...files].sort((a, b) => fileSortKey(a.path).localeCompare(fileSortKey(b.path)))
}

function activeCodeFile(files: CodeFile[], activePath: string): CodeFile | null {
  return files.find(file => file.path === activePath) ?? files[0] ?? null
}

function fileSortKey(path: string): string {
  return path === 'index.html' ? `0:${path}` : `1:${path}`
}

function tailLine(value: string): string {
  const normalized = value.trim().split('\n').filter(Boolean)
  return normalized.slice(-2).join(' ')
}

function fileSummary(file: CodeFile): string {
  const bytes = new TextEncoder().encode(file.content).byteLength
  const lines = file.content.length === 0 ? 0 : file.content.split('\n').length
  const tail = (file.truncatedChars ?? 0) > 0 ? ' · tail buffer' : ''
  return `${lines} lines · ${formatBytes(bytes)}${tail}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.append(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}
