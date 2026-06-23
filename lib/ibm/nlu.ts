import NaturalLanguageUnderstandingV1 from 'ibm-watson/natural-language-understanding/v1'
import { IamAuthenticator } from 'ibm-watson/auth'

export interface ContextRisk {
  isPublicFacing: boolean
  hasAuth: boolean
  hasPayments: boolean
  dataClassification: 'PUBLIC' | 'INTERNAL' | 'SENSITIVE' | 'CRITICAL'
}

let nluClient: NaturalLanguageUnderstandingV1 | null = null

function getNluClient(): NaturalLanguageUnderstandingV1 {
  if (!nluClient) {
    nluClient = new NaturalLanguageUnderstandingV1({
      version: '2022-04-07',
      authenticator: new IamAuthenticator({ apikey: process.env.WATSON_NLU_API_KEY! }),
      serviceUrl: process.env.WATSON_NLU_URL!,
    })
  }
  return nluClient
}

export async function analyzeReadme(readmeText: string): Promise<ContextRisk> {
  if (!readmeText.trim()) {
    return { isPublicFacing: false, hasAuth: false, hasPayments: false, dataClassification: 'INTERNAL' }
  }

  const client = getNluClient()
  const res = await client.analyze({
    text: readmeText,
    features: {
      keywords: { limit: 20 },
      entities: { limit: 20 },
      sentiment: {},
    },
  })

  const keywords: string[] = (res.result.keywords ?? []).map((k) => k.text?.toLowerCase() ?? '')
  const entities: string[] = (res.result.entities ?? []).map((e) => e.text?.toLowerCase() ?? '')
  const allTerms = [...keywords, ...entities]

  const hasAuth = allTerms.some((t) =>
    ['auth', 'login', 'oauth', 'jwt', 'session', 'password', 'sign in', 'signup'].some((kw) => t.includes(kw)),
  )
  const hasPayments = allTerms.some((t) =>
    ['payment', 'stripe', 'billing', 'checkout', 'invoice', 'subscription', 'credit card'].some((kw) =>
      t.includes(kw),
    ),
  )
  const isPublicFacing = allTerms.some((t) =>
    ['public', 'saas', 'users', 'customers', 'marketplace', 'platform', 'api'].some((kw) => t.includes(kw)),
  )
  const isHealthcare = allTerms.some((t) =>
    ['health', 'hipaa', 'medical', 'patient', 'clinical', 'ehr'].some((kw) => t.includes(kw)),
  )
  const isFinancial = hasPayments || allTerms.some((t) => ['financial', 'pci', 'banking', 'fintech'].some((kw) => t.includes(kw)))

  let dataClassification: ContextRisk['dataClassification'] = 'PUBLIC'
  if (isHealthcare) dataClassification = 'CRITICAL'
  else if (isFinancial) dataClassification = 'SENSITIVE'
  else if (hasAuth) dataClassification = 'INTERNAL'

  return { isPublicFacing, hasAuth, hasPayments, dataClassification }
}
