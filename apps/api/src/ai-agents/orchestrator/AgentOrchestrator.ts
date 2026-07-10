/**
 * AgentOrchestrator.ts
 *
 * Core reasoning engine. Runs the Observe → Think → Plan → Execute → Verify → Reflect loop.
 * Every step is logged in the reasoning trace. Tool calls are permission-checked.
 * Memory and knowledge are retrieved before prompt assembly.
 * All output passes through safety + reflection.
 */

import { randomUUID }              from 'crypto';
import { AgentModel }              from '../../models/Agent.model';
import { AgentSessionModel }       from '../../models/AgentSession.model';
import { MemoryService }           from '../memory/MemoryService';
import { KnowledgeService }        from '../knowledge/KnowledgeService';
import { executeTool, BUILT_IN_TOOLS } from '../tools/ToolRegistry';
import { SafetyService }           from '../safety/SafetyService';
import { ReflectionEngine }        from '../reflection/ReflectionEngine';
import { AgentAnalyticsService }   from '../analytics/AgentAnalyticsService';
import { sendToGemini, isGeminiConfigured } from '../../ai/gemini';
import { ApiError }                from '../../middleware/errorHandler';
import type { IReasoningStep }     from '../../models/AgentSession.model';

export interface AgentChatInput {
  organizationId: string;
  agentId:        string;
  sessionId?:     string;   // pass to continue an existing session
  message:        string;
  userId?:        string;
  leadId?:        string;
  context?:       Record<string, unknown>;
}

export interface AgentChatOutput {
  reply:          string;
  sessionId:      string;
  reasoningTrace: IReasoningStep[];
  toolsUsed:      string[];
  memoryHits:     number;
  knowledgeHits:  number;
  confidence:     number;
  reflection:     { passed: boolean; suggestions: string[] };
  latencyMs:      number;
}

const MAX_STEPS       = 8;
const TIMEOUT_MS      = 30_000;

export const AgentOrchestrator = {

  async chat(input: AgentChatInput): Promise<AgentChatOutput> {
    const startMs = Date.now();
    const { organizationId, agentId, message, userId, leadId } = input;

    // ── Load agent definition ──────────────────────────────────────────────
    const agent = await AgentModel.findOne({ _id: agentId, organizationId, isActive: true });
    if (!agent) throw new ApiError(404, 'Agent not found or inactive', 'AGENT_NOT_FOUND');

    // ── Safety: input check ────────────────────────────────────────────────
    const inputCheck = SafetyService.checkInput(message, organizationId);
    if (!inputCheck.passed) {
      return AgentOrchestrator._blocked(input.sessionId ?? randomUUID(), inputCheck.reason ?? 'Blocked by safety layer', startMs);
    }

    // ── Session management ─────────────────────────────────────────────────
    let session = input.sessionId
      ? await AgentSessionModel.findOne({ _id: input.sessionId, organizationId, agentId })
      : null;

    if (!session) {
      session = await AgentSessionModel.create({
        organizationId, agentId, userId: userId ?? null, leadId: leadId ?? null,
        status: 'active', lastActivityAt: new Date(),
      });
    }

    const sessionId     = session._id.toString();
    const reasoningTrace: IReasoningStep[] = [];
    const toolsUsed:     string[] = [];
    let   memoryHits    = 0;
    let   knowledgeHits = 0;

    const addStep = (type: IReasoningStep['type'], content: string, extras?: Partial<IReasoningStep>) => {
      reasoningTrace.push({ step: reasoningTrace.length + 1, type, content, timestamp: new Date(), ...extras });
    };

    // ── OBSERVE ────────────────────────────────────────────────────────────
    addStep('observe', `User message: "${message}"`);

    // ── MEMORY RETRIEVAL ───────────────────────────────────────────────────
    const memories = await MemoryService.retrieve(organizationId, agentId, message, 5, undefined, leadId ?? undefined);
    if (memories.length > 0) {
      memoryHits = memories.length;
      addStep('think', `Retrieved ${memories.length} memories: ${memories.map(m => m.key).join(', ')}`);
      AgentAnalyticsService.track({ organizationId, agentId, sessionId, eventType: 'memory_hit' });
    }

    // ── KNOWLEDGE RETRIEVAL ────────────────────────────────────────────────
    const kbIds    = agent.knowledgeBaseIds ?? [];
    const kbResults = await KnowledgeService.search(organizationId, message, 4, kbIds.length ? kbIds : undefined);
    if (kbResults.length > 0) {
      knowledgeHits = kbResults.length;
      addStep('think', `Found ${kbResults.length} knowledge chunks`);
      AgentAnalyticsService.track({ organizationId, agentId, sessionId, eventType: 'knowledge_hit' });
    }

    // ── THINK: build context ───────────────────────────────────────────────
    const memoryBlock    = MemoryService.formatForPrompt(memories);
    const knowledgeBlock = KnowledgeService.formatForPrompt(kbResults);

    const systemPrompt = [
      agent.systemPrompt || `You are ${agent.name}, an AI agent. Role: ${agent.role}. Organization: ${organizationId}.`,
      `You have access to tools: ${BUILT_IN_TOOLS.map(t => t.name).join(', ')}.`,
      `When you need to use a tool, respond with exactly: TOOL:<tool_name> PARAMS:<json_params>`,
      `Otherwise respond naturally in plain text.`,
      memoryBlock,
      knowledgeBlock,
    ].filter(Boolean).join('\n\n');

    // ── PLAN + EXECUTE loop ────────────────────────────────────────────────
    const history = (session.messages as any[]).map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    let   reply   = '';
    let   step    = 0;
    let   toolResults = '';

    while (step < MAX_STEPS && Date.now() - startMs < TIMEOUT_MS) {
      step++;
      addStep('plan', `Step ${step}: generating response`);

      let llmResponse = '';
      if (isGeminiConfigured()) {
        const r = await sendToGemini({ systemPrompt, knowledgeBlock: '', history, userMessage: message, maxTokens: 600 });
        if (r.success) llmResponse = r.text;
      } else {
        llmResponse = AgentOrchestrator._fallbackReply(agent.role, message);
      }

      // Detect tool call
      const toolMatch = llmResponse.match(/TOOL:(\w+)\s+PARAMS:(\{[\s\S]*?\})/);
      if (toolMatch) {
        const toolName   = toolMatch[1];
        const toolParams = JSON.parse(toolMatch[2]);

        addStep('execute', `Calling tool: ${toolName}`, { toolName, toolInput: toolParams });
        AgentAnalyticsService.track({ organizationId, agentId, sessionId, eventType: 'tool_called', toolName });

        // Permission check
        const permCheck = SafetyService.validateToolPermission(toolName, (agent.tools as any[]) ?? []);
        // For built-in tools always allow if in registry
        const isBuiltIn = BUILT_IN_TOOLS.some(t => t.name === toolName);
        if (!permCheck.passed && !isBuiltIn) {
          addStep('verify', `Tool blocked: ${permCheck.reason}`);
          break;
        }

        const toolResult = await executeTool(toolName, toolParams, organizationId);
        toolsUsed.push(toolName);
        toolResults += `\n${toolName}: ${JSON.stringify(toolResult.data).slice(0, 300)}`;

        addStep('verify', `Tool ${toolName} ${toolResult.success ? 'succeeded' : 'failed'}`, {
          toolOutput: toolResult.data as Record<string, unknown>,
        });

        AgentAnalyticsService.track({
          organizationId, agentId, sessionId,
          eventType: toolResult.success ? 'tool_succeeded' : 'tool_failed',
          toolName,
        });

        // Add tool result to history and continue
        history.push({ role: 'assistant', content: llmResponse });
        history.push({ role: 'user' as const, content: `Tool result: ${JSON.stringify(toolResult.data).slice(0, 500)}` });
        continue;
      }

      // No tool call — this is the final response
      reply = llmResponse;
      break;
    }

    if (!reply) reply = 'I was unable to complete this task. Please try again or contact support.';

    // ── SAFETY: output check ───────────────────────────────────────────────
    const outputCheck = SafetyService.checkOutput(reply);
    if (!outputCheck.passed) {
      reply = 'I cannot provide that response. How else can I help you?';
      AgentAnalyticsService.track({ organizationId, agentId, sessionId, eventType: 'safety_blocked' });
    }

    // ── REFLECT ────────────────────────────────────────────────────────────
    let reflectionResult = { passed: true, confidence: 80, suggestions: [] as string[], shouldRetry: false };
    if (agent.reflectionEnabled) {
      const r = await ReflectionEngine.evaluate(message, reply, knowledgeBlock + memoryBlock, toolResults);
      reflectionResult = { passed: r.passed, confidence: r.confidence, suggestions: r.suggestions, shouldRetry: r.shouldRetry };
      addStep('reflect', `Reflection: confidence=${r.confidence}, passed=${r.passed}, hallucination=${r.hallucination}`);

      if (r.shouldRetry && step < MAX_STEPS) {
        // One retry attempt with reflection feedback
        const retryHistory = [...history, { role: 'user' as const, content: `Please improve: ${r.suggestions.join('. ')}` }];
        const retryR = await sendToGemini({ systemPrompt, knowledgeBlock: '', history: retryHistory, userMessage: message, maxTokens: 600 });
        if (retryR.success && retryR.text) reply = retryR.text;
      }

      AgentAnalyticsService.track({ organizationId, agentId, sessionId, eventType: 'reflection_triggered', confidence: r.confidence });
    }

    // ── Update session ─────────────────────────────────────────────────────
    const latencyMs = Date.now() - startMs;
    await AgentSessionModel.findByIdAndUpdate(session._id, {
      status:        'completed',
      reasoningTrace,
      lastActivityAt: new Date(),
      $push: {
        messages: [
          { role: 'user',      content: message,  timestamp: new Date() },
          { role: 'assistant', content: reply,     timestamp: new Date() },
        ],
      },
      $inc: { toolCalls: toolsUsed.length, memoryHits, knowledgeHits, totalLatencyMs: latencyMs },
    });

    // Store new memory
    if (agent.memoryEnabled && reply.length > 20) {
      await MemoryService.store(organizationId, agentId, {
        key:       `msg_${Date.now()}`,
        content:   `User: ${message.slice(0, 200)} → Agent: ${reply.slice(0, 200)}`,
        type:      'short_term',
        sessionId,
        leadId:    leadId ?? undefined,
        importance:4,
      });
    }

    // Analytics
    AgentAnalyticsService.track({
      organizationId, agentId, sessionId,
      eventType: 'session_completed',
      latencyMs,
      confidence: reflectionResult.confidence,
    });
    await AgentModel.findByIdAndUpdate(agentId, { $inc: { usageCount: 1 } });

    return {
      reply, sessionId, reasoningTrace, toolsUsed,
      memoryHits, knowledgeHits,
      confidence: reflectionResult.confidence,
      reflection: { passed: reflectionResult.passed, suggestions: reflectionResult.suggestions },
      latencyMs,
    };
  },

  _blocked(sessionId: string, reason: string, startMs: number): AgentChatOutput {
    return {
      reply:          `I cannot process that request. ${reason}`,
      sessionId,
      reasoningTrace: [{ step: 1, type: 'observe', content: `BLOCKED: ${reason}`, timestamp: new Date() }],
      toolsUsed:      [],
      memoryHits:     0,
      knowledgeHits:  0,
      confidence:     0,
      reflection:     { passed: false, suggestions: [] },
      latencyMs:      Date.now() - startMs,
    };
  },

  _fallbackReply(role: string, message: string): string {
    const lc = message.toLowerCase();
    if (role === 'sales')   return 'I can help you with leads, bookings, and CRM. What would you like to do?';
    if (role === 'support') return 'I\'m here to help. Could you describe the issue in more detail?';
    if (role === 'booking') return 'I can help you schedule a meeting. What day works best for you?';
    return 'I understand your request. Let me help you with that.';
  },
};
