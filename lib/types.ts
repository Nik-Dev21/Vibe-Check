export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
export type VulnCategory =
  | 'HARDCODED_SECRET'
  | 'SQL_INJECTION'
  | 'XSS'
  | 'BROKEN_AUTH'
  | 'INSECURE_DEPENDENCY'
  | 'SENSITIVE_DATA_EXPOSURE'
  | 'SECURITY_MISCONFIGURATION'
  | 'IDOR'
  | 'SSRF'
  | 'PATH_TRAVERSAL'

export interface RepoFile {
  path: string
  content: string
  size: number
  language: string
}

export interface FastPassResult {
  filePath: string
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAN'
  detectedTypes: VulnCategory[]
  confidence: number
}

export interface Vulnerability {
  id: string
  filePath: string
  lineNumber?: number
  severity: Severity
  category: VulnCategory
  title: string
  description: string
  codeSnippet?: string
  fixSuggestion: string
  cveReference?: string
  detectedBy: 'featherless' | 'watsonx' | 'both'
}

export interface AutoFix {
  vulnerabilityId: string
  filePath: string
  original: string
  fixed: string
  explanation: string
  prUrl?: string
  status: 'pending' | 'generated' | 'pushed'
}

export interface ScanReport {
  scanId: string
  repoUrl: string
  repoName: string
  scannedAt: string
  durationMs: number
  securityScore: number          // 0–100, higher = more secure
  filesScanned: number
  vulnerabilities: Vulnerability[]
  summary: {
    critical: number
    high: number
    medium: number
    low: number
  }
  contextRisk: {
    isPublicFacing: boolean
    hasAuth: boolean
    hasPayments: boolean
    dataClassification: 'PUBLIC' | 'INTERNAL' | 'SENSITIVE' | 'CRITICAL'
  }
  reportUrl?: string
}

export interface ScanStatus {
  scanId: string
  status: 'scanning' | 'complete' | 'error'
  phase: 'fetching' | 'classifying' | 'deep-scan' | 'context' | 'building' | 'storing'
  progress: number               // 0–100
  error?: string
}

// API request/response types
export interface ScanRequest { repoUrl: string }
export interface ScanResponse { scanId: string; status: 'queued' }
export interface FixRequest { vulnerabilityId: string; filePath: string; codeSnippet: string }
export interface FixResponse { original: string; fixed: string; explanation: string }
export interface FixPushRequest { repoUrl: string; filePath: string; fixedCode: string; vulnerabilityId: string }
export interface FixPushResponse { prUrl: string }
