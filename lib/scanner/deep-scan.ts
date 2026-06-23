import { deepScanFile } from '../ibm/watsonx'
import type { FastPassResult, Vulnerability } from '../types'
import { v4 as uuidv4 } from 'uuid'

export async function runDeepScan(
  files: Array<{ path: string; content: string }>,
  fastPassResults: FastPassResult[],
): Promise<Vulnerability[]> {
  const highPriority = fastPassResults.filter((r) => r.riskLevel === 'HIGH' || r.riskLevel === 'MEDIUM')
  const targetPaths = new Set(highPriority.map((r) => r.filePath))
  const targets = files.filter((f) => targetPaths.has(f.path))

  const results = await Promise.allSettled(
    targets.map(async (file) => {
      const findings = await deepScanFile(file.path, file.content)
      return findings.map((f): Vulnerability => ({
        id: uuidv4(),
        filePath: file.path,
        lineNumber: f.lineNumber,
        severity: f.severity,
        category: f.category,
        title: f.title,
        description: f.description,
        codeSnippet: f.codeSnippet,
        fixSuggestion: f.fixSuggestion,
        cveReference: f.cveReference ?? undefined,
        detectedBy: 'watsonx',
      }))
    }),
  )

  return results
    .filter((r): r is PromiseFulfilledResult<Vulnerability[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value)
}
