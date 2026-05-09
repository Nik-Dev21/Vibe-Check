/**
 * lib/ibm/nlu.ts
 * Watson Natural Language Understanding client.
 * Reads: WATSON_NLU_API_KEY, WATSON_NLU_URL
 * Analyzes README text to detect app context signals.
 */

import NaturalLanguageUnderstandingV1 from 'ibm-watson/natural-language-understanding/v1'
import { IamAuthenticator } from 'ibm-watson/auth'

export interface NLUAnalysis {
  keywords: string[]
  entities: string[]
  sentiment: 'positive' | 'negative' | 'neutral'
}

let nluClient: NaturalLanguageUnderstandingV1 | null = null

function getNLUClient(): NaturalLanguageUnderstandingV1 {
  if (nluClient) return nluClient

  const apiKey = process.env.WATSON_NLU_API_KEY
  const serviceUrl = process.env.WATSON_NLU_URL

  if (!apiKey) throw new Error('[NLU] WATSON_NLU_API_KEY is not set')
  if (!serviceUrl) throw new Error('[NLU] WATSON_NLU_URL is not set')

  nluClient = new NaturalLanguageUnderstandingV1({
    version: '2022-04-07',
    authenticator: new IamAuthenticator({ apikey: apiKey }),
    serviceUrl,
  })

  return nluClient
}

/**
 * Analyze a block of text (typically a README) for security-relevant context.
 * Returns extracted keywords, named entities, and overall sentiment.
 */
export async function analyzeText(text: string): Promise<NLUAnalysis> {
  if (!text || text.trim().length < 50) {
    // Not enough content to analyze meaningfully
    return { keywords: [], entities: [], sentiment: 'neutral' }
  }

  const client = getNLUClient()

  const response = await client.analyze({
    text,
    features: {
      keywords: { limit: 30 },
      entities: { limit: 20 },
      sentiment: {},
    },
  })

  const result = response.result

  const keywords = (result.keywords ?? [])
    .map((k) => k.text ?? '')
    .filter(Boolean)
    .map((k) => k.toLowerCase())

  const entities = (result.entities ?? [])
    .map((e) => e.text ?? '')
    .filter(Boolean)
    .map((e) => e.toLowerCase())

  const label = result.sentiment?.document?.label
  const sentiment: NLUAnalysis['sentiment'] =
    label === 'positive' ? 'positive'
    : label === 'negative' ? 'negative'
    : 'neutral'

  return { keywords, entities, sentiment }
}
