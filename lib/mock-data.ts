import { ScanReport } from "./types"

export const MOCK_SCAN_REPORT: ScanReport = {
  scanId: "scan-123",
  repoUrl: "https://github.com/vibe-coder/my-app",
  repoName: "my-app",
  scannedAt: new Date().toISOString(),
  durationMs: 45000,
  securityScore: 65,
  filesScanned: 142,
  vulnerabilities: [
    {
      id: "vuln-1",
      filePath: "src/db/connection.ts",
      lineNumber: 14,
      severity: "CRITICAL",
      category: "HARDCODED_SECRET",
      title: "Hardcoded Database Credentials",
      description: "Database connection string containing a password is hardcoded in the source file.",
      codeSnippet: 'const dbUrl = "postgresql://admin:supersecret123@localhost:5432/mydb"',
      fixSuggestion: "Use environment variables for database credentials.",
      detectedBy: "both"
    },
    {
      id: "vuln-2",
      filePath: "src/api/auth/route.ts",
      lineNumber: 45,
      severity: "HIGH",
      category: "SQL_INJECTION",
      title: "Unsafe SQL Query",
      description: "User input is directly concatenated into a SQL query string.",
      codeSnippet: 'const query = `SELECT * FROM users WHERE email = \'${req.body.email}\'`',
      fixSuggestion: "Use parameterized queries or an ORM.",
      detectedBy: "watsonx"
    }
  ],
  summary: {
    critical: 1,
    high: 1,
    medium: 0,
    low: 0
  },
  contextRisk: {
    isPublicFacing: true,
    hasAuth: true,
    hasPayments: false,
    dataClassification: "SENSITIVE"
  }
}
