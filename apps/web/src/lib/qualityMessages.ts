export function formatQualityIssue(issue: string | null | undefined): string {
  if (!issue) return 'Generated artifact needs attention.'
  if (/Pixel quality gate could not run/i.test(issue)) {
    if (/Executable doesn't exist|ms-playwright|playwright install|browser is not installed/i.test(issue)) {
      return 'Rendered screenshot check is not enabled in this environment. The design was generated, but visual blank-screen detection could not run.'
    }
    return issue.split('\n')[0] ?? issue
  }
  return issue
}

export function isInfrastructureQualityWarning(issue: string | null | undefined): boolean {
  return Boolean(issue && /Pixel quality gate could not run/i.test(issue))
}
