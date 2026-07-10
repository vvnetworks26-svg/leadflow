/**
 * AiCommunicationService.ts
 *
 * AI features for the communications platform:
 * - Summarize conversation threads
 * - Generate reply suggestions
 * - Classify sentiment and urgency
 * - Extract entities (name, company, phone, email)
 * - Recommend next action
 * - Conversation scoring
 */

import { sendToGemini, isGeminiConfigured } from '../../ai/gemini';
import { ConversationThreadModel }          from '../../models/ConversationThread.model';
import { CommunicationMessageModel }        from '../../models/CommunicationMessage.model';

export interface AiAnalysis {
  summary:          string;
  sentiment:        'positive' | 'neutral' | 'negative';
  sentimentScore:   number;    // -1 to 1
  urgency:          'high' | 'medium' | 'low';
  urgencyScore:     number;    // 0-100
  extractedEntities:{ names: string[]; companies: string[]; phones: string[]; emails: string[] };
  suggestedReply:   string;
  recommendedAction:string;
  conversationScore:number;    // 0-100
}

async function callAi(prompt: string): Promise<string> {
  if (!isGeminiConfigured()) return '';
  const r = await sendToGemini({ systemPrompt: 'You are a communications analyst. Return only JSON.', knowledgeBlock: '', history: [], userMessage: prompt, maxTokens: 600 });
  return r.success ? r.text : '';
}

export const AiCommunicationService = {

  async analyzeThread(organizationId: string, threadId: string): Promise<AiAnalysis> {
    const messages = await CommunicationMessageModel.find({ organizationId, threadId, deletedAt: null })
      .sort({ createdAt: 1 }).limit(20).lean();

    const transcript = messages.map((m: any) =>
      `[${m.direction.toUpperCase()} - ${m.channel}]: ${m.body}`
    ).join('\n');

    const fallback: AiAnalysis = {
      summary: 'Conversation in progress.',
      sentiment: 'neutral', sentimentScore: 0,
      urgency: 'medium', urgencyScore: 50,
      extractedEntities: { names: [], companies: [], phones: [], emails: [] },
      suggestedReply: 'Thank you for reaching out. How can I help you today?',
      recommendedAction: 'Review the conversation and respond.',
      conversationScore: 50,
    };

    if (!transcript || !isGeminiConfigured()) return fallback;

    const prompt = `Analyze this customer conversation and return a JSON object with:
summary, sentiment (positive|neutral|negative), sentimentScore (-1 to 1),
urgency (high|medium|low), urgencyScore (0-100),
extractedEntities: {names:[], companies:[], phones:[], emails:[]},
suggestedReply (1-2 sentences), recommendedAction (specific next step), conversationScore (0-100).

Conversation:
${transcript.slice(0, 3000)}

Return only valid JSON.`;

    const raw = await callAi(prompt);
    try {
      const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
      // Store analysis on thread
      await ConversationThreadModel.findByIdAndUpdate(threadId, {
        aiSummary:      parsed.summary,
        sentimentScore: parsed.sentimentScore,
        urgencyScore:   parsed.urgencyScore,
      });
      return { ...fallback, ...parsed };
    } catch {
      return fallback;
    }
  },

  async suggestReply(organizationId: string, threadId: string): Promise<string> {
    const messages = await CommunicationMessageModel.find({ organizationId, threadId, deletedAt: null })
      .sort({ createdAt: -1 }).limit(5).lean();

    const lastFew = messages.reverse().map((m: any) => `[${m.direction}]: ${m.body}`).join('\n');
    if (!lastFew || !isGeminiConfigured()) return '';

    const prompt = `Based on this conversation, write a professional 2-3 sentence reply:
${lastFew}

Return only the reply text, no JSON.`;

    const raw = await callAi(prompt);
    return raw.trim();
  },

  async generateFollowUp(context: { leadName: string; lastTopic: string; daysSince: number }): Promise<string> {
    if (!isGeminiConfigured()) {
      return `Hi ${context.leadName}, I wanted to follow up regarding ${context.lastTopic}. Please let me know if you have any questions.`;
    }
    const prompt = `Write a short, friendly follow-up message for ${context.leadName} about "${context.lastTopic}" (${context.daysSince} days since last contact). 2-3 sentences max.`;
    const raw = await callAi(prompt);
    return raw.trim() || `Hi ${context.leadName}, following up on our previous conversation about ${context.lastTopic}.`;
  },
};
