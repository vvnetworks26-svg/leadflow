/**
 * ReflectionEngine.ts
 *
 * Evaluates agent responses for quality, groundedness, and completeness.
 * Detects hallucinations, missing info, and low confidence.
 * Returns improvement suggestions.
 */

import { sendToGemini, isGeminiConfigured } from '../../ai/gemini';

export interface ReflectionResult {
  passed:           boolean;
  confidence:       number;      // 0-100
  isGrounded:       boolean;     // response supported by knowledge/context
  hallucination:    boolean;     // invented facts detected
  missingInfo:      string[];    // what the agent should have collected
  suggestions:      string[];    // improvement hints
  shouldRetry:      boolean;
}

export const ReflectionEngine = {

  async evaluate(
    userMessage:    string,
    agentResponse:  string,
    context:        string,     // knowledge + memory used
    toolResults:    string,
  ): Promise<ReflectionResult> {
    const fallback: ReflectionResult = {
      passed: true, confidence: 75, isGrounded: true,
      hallucination: false, missingInfo: [], suggestions: [], shouldRetry: false,
    };

    if (!isGeminiConfigured()) return ReflectionEngine._ruleBasedEval(agentResponse, context);

    const prompt = `Evaluate this AI agent response for quality and accuracy.

User message: ${userMessage}
Agent response: ${agentResponse}
Context provided: ${context.slice(0, 500)}
Tool results: ${toolResults.slice(0, 300)}

Return JSON: {
  passed: boolean,
  confidence: number (0-100),
  isGrounded: boolean (is response supported by context/tools?),
  hallucination: boolean (did agent invent facts not in context?),
  missingInfo: string[] (what key info is missing),
  suggestions: string[] (max 2 improvement hints),
  shouldRetry: boolean (should agent try again?)
}`;

    try {
      const r = await sendToGemini({ systemPrompt: 'You are a quality evaluator. Return only JSON.', knowledgeBlock: '', history: [], userMessage: prompt, maxTokens: 400 });
      if (r.success) {
        const parsed = JSON.parse(r.text.replace(/```json\n?|\n?```/g, '').trim());
        return { ...fallback, ...parsed };
      }
    } catch { /* fall through */ }

    return ReflectionEngine._ruleBasedEval(agentResponse, context);
  },

  _ruleBasedEval(response: string, context: string): ReflectionResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let confidence = 80;

    if (response.length < 20)                      { issues.push('Response too short'); confidence -= 20; }
    if (/I don't know|I cannot|I'm not sure/i.test(response)) { confidence -= 15; suggestions.push('Try searching the knowledge base.'); }
    if (response.includes('{{'))                   { issues.push('Unresolved template variable'); confidence -= 10; }

    const isGrounded = context.length > 0 && response.length > 30;

    return {
      passed:      confidence >= 50,
      confidence:  Math.max(0, confidence),
      isGrounded,
      hallucination: false,
      missingInfo:   issues,
      suggestions,
      shouldRetry:   confidence < 40,
    };
  },
};
