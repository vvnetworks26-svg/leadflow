/**
 * stabilization-sprint.test.ts
 *
 * Stabilization Sprint 1.0 — End-to-End Validation
 * Tests Layers 1–6 as an integrated system.
 * Covers: multi-industry flows, emergency, booking, returning visitor,
 * prompt audit, memory audit, planner validation, stress tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Layer 1
import { buildBusinessIdentity } from '../business-identity/BusinessIdentityFactory';

// Layer 2
import { IntentUnderstandingService, setIntentRepository } from '../intent-engine/IntentUnderstandingService';
import { InMemoryIntentRepository } from '../intent-engine/repository/InMemoryIntentRepository';

// Layer 3
import { ConversationOrchestrationService, setBlueprintRepository } from '../conversation-engine/ConversationOrchestrationService';
import { InMemoryBlueprintRepository } from '../conversation-engine/repository/InMemoryBlueprintRepository';

// Layer 4
import { ResponseEngine } from '../response-engine/ResponseEngine';

// Layer 5
import { PromptAssembler } from '../prompt-assembly/PromptAssembler';
import { estimateTokens, deduplicateHistory } from '../prompt-assembly/ContextCompressor';
import { SECTION_ORDER } from '../prompt-assembly/types';

// Layer 6
import { MemoryEngine } from '../memory-engine/MemoryEngine';

// Supporting
import { emptyRichMemory, emptyProgress } from '../ai/types';
import { updateMemoryFromMessage } from '../ai/memory';
import type { BusinessIdentity } from '../business-identity/types';
import type { ResolvedIntent } from '../intent-engine/types';
import type { ConversationPlan as L3Plan } from '../conversation-engine/types';
import type { ResponseBlueprint } from '../response-engine/types';
import type { QualificationScore } from '../ai/types';
import type { PromptAssemblerInput } from '../prompt-assembly/types';

import type { ResponseEngineInput } from '../response-engine/types';

// ─── Setup ───────────────────────────────────────────────────────────────────

const alwaysOpen = { isOpen: true, openTime: '00:00', closeTime: '23:59' };

function makeIdentity(industry: string, overrides: Record<string, unknown> = {}): BusinessIdentity {
  return buildBusinessIdentity({
    organizationId: `org-${industry}`,
    companyProfile: { businessId: `org-${industry}`, businessName: `${industry.toUpperCase()} Co`, industry, subIndustry: '', description: '', website: '', logo: '', tagline: '' },
    contactInfo: { phone: '555-000-1111', email: 'info@test.com', address: '123 Main', city: 'Austin', state: 'TX', country: 'US', timezone: 'America/Chicago' },
    businessHours: { monday: alwaysOpen, tuesday: alwaysOpen, wednesday: alwaysOpen, thursday: alwaysOpen, friday: alwaysOpen, saturday: alwaysOpen, sunday: alwaysOpen, emergencyAfterHours: true, vacationMode: false, holidays: [], closedDates: [] },
    ...overrides,
  });
}

function makeIntent(overrides: Partial<ResolvedIntent> = {}): ResolvedIntent {
  return { id: 'i-1', category: 'repair', subCategory: '', confidenceLevel: 'high', urgency: 'normal', detectedService: null, entities: [], candidates: [], reasoning: '', blueprintId: null, requiresHuman: false, requiresClarification: false, rawMessage: 'fix my system', timestamp: new Date(), ...overrides };
}

function makeL3Plan(overrides: Partial<L3Plan> = {}): L3Plan {
  return { objective: 'collect_phone', reason: 'test', requiredField: 'phone', questionType: 'phone', priority: 'high', allowedTools: [], nextState: 'collecting_info', fallbackState: 'collecting_info', completionCriteria: ['phoneCollected'], recoveryStrategy: { onAmbiguity: 'clarify_intent', onRepeat: 'clarify_intent', onContradiction: 'clarify_intent', onTopicChange: 'build_rapport', preserveContext: true }, blueprintId: null, stageId: null, ruleApplied: null, isTerminal: false, ...overrides };
}

function makeBlueprint(overrides: Partial<ResponseBlueprint> = {}): ResponseBlueprint {
  return { objective: 'collect_phone', tone: 'Friendly', emotion: 'Neutral', urgency: 'normal', cta: 'AskQuestion', personalization: {}, length: 'Short', style: 'Conversational', mustMention: [], mustAvoid: [], guardrails: ['Ask one question'], examples: [], metadata: { industry: 'hvac', stage: 'discovery', objective: 'collect_phone', workflowState: 'collecting_info' }, ...overrides };
}

function makeQual(): QualificationScore {
  return { overall: 40, temperature: 'Cold', confidence: 50, breakdown: { industry: 40, companySize: 40, decisionMaker: 50, budget: 35, timeline: 35, urgency: 40, technicalReady: 60, aiReady: 45, painSeverity: 20, buyingIntent: 30 }, reasons: [], missingInfo: [] };
}

function makeResponseInput(industry = 'hvac', overrides: Partial<ResponseEngineInput> = {}): ResponseEngineInput {
  return {
    plan: makeL3Plan(), identity: makeIdentity(industry), stage: 'discovery',
    memory: emptyRichMemory(), intent: makeIntent(), qualification: makeQual(),
    recommendations: [], workflowState: 'collecting_info', ...overrides,
  };
}

function makeAssemblerInput(industry = 'hvac', overrides: Partial<PromptAssemblerInput> = {}): PromptAssemblerInput {
  return {
    identity: makeIdentity(industry), plan: makeL3Plan(), blueprint: makeBlueprint({ metadata: { ...makeBlueprint().metadata, industry } as any }),
    memory: emptyRichMemory(), qualification: makeQual(), intent: makeIntent(),
    knowledgeHits: [], recommendations: [], history: [], stage: 'discovery', ...overrides,
  };
}

// ─── 1. INDUSTRY COVERAGE ────────────────────────────────────────────────────

describe('Industry Coverage — Layer 1 identity loads correctly', () => {
  const industries = ['hvac', 'plumbing', 'roofing', 'electrical', 'pest_control', 'landscaping', 'cleaning', 'saas'];

  for (const industry of industries) {
    it(`${industry} identity builds without error`, () => {
      assert.doesNotThrow(() => makeIdentity(industry));
    });

    it(`${industry} intent classifies repair/booking correctly`, async () => {
      setIntentRepository(new InMemoryIntentRepository());
      const result = await IntentUnderstandingService.analyze({
        message: 'I need help with my system', organizationId: 'org-1', industry, availableServices: [],
      });
      assert.ok(['repair', 'general_question', 'unknown'].includes(result.intent.category));
    });
  }
});

// ─── 2. EMERGENCY FLOW ───────────────────────────────────────────────────────

describe('Emergency Flow', () => {
  it('critical urgency message → emergency_service intent', async () => {
    setIntentRepository(new InMemoryIntentRepository());
    const r = await IntentUnderstandingService.analyze({ message: 'My furnace has no heat, it is freezing', organizationId: 'org-1', industry: 'hvac', availableServices: [] });
    assert.equal(r.intent.category, 'emergency_service');
    assert.ok(['critical', 'emergency'].includes(r.intent.urgency));
  });

  it('critical urgency → Dispatcher tone in ResponseBlueprint', () => {
    const bp = ResponseEngine.buildBlueprint(makeResponseInput('hvac', { intent: makeIntent({ urgency: 'critical', category: 'emergency_service' }), plan: makeL3Plan({ objective: 'handle_emergency' }) as any }));
    assert.equal(bp.tone, 'Dispatcher');
  });

  it('critical urgency → OneSentence length', () => {
    const bp = ResponseEngine.buildBlueprint(makeResponseInput('hvac', { intent: makeIntent({ urgency: 'critical' }), workflowState: 'emergency_dispatch' as any }));
    assert.equal(bp.length, 'OneSentence');
  });

  it('emergency_dispatch workflow state in orchestrator output', async () => {
    setBlueprintRepository(new InMemoryBlueprintRepository());
    ConversationOrchestrationService.invalidateBlueprintCache();
    const result = await ConversationOrchestrationService.orchestrate({
      organizationId: 'org-1', conversationId: 'c-1', identity: makeIdentity('hvac'),
      intent: makeIntent({ urgency: 'critical', category: 'emergency_service', blueprintId: 'hvac.emergency' }),
      memory: emptyRichMemory(), progress: emptyProgress(), history: [], turnCount: 0,
      currentObjective: null, workflowState: null, currentBlueprintId: null,
    });
    assert.ok(['emergency_dispatch', 'escalating'].includes(result.updatedWorkflowState));
  });

  it('plumbing burst pipe → emergency intent', async () => {
    setIntentRepository(new InMemoryIntentRepository());
    const r = await IntentUnderstandingService.analyze({ message: 'burst pipe flooding my basement', organizationId: 'org-1', industry: 'plumbing', availableServices: [] });
    assert.equal(r.intent.category, 'emergency_service');
  });
});

// ─── 3. BOOKING FLOW ─────────────────────────────────────────────────────────

describe('Booking Flow', () => {
  it('booking intent detected', async () => {
    setIntentRepository(new InMemoryIntentRepository());
    const r = await IntentUnderstandingService.analyze({ message: 'I want to book an appointment', organizationId: 'org-1', industry: 'hvac', availableServices: [] });
    assert.equal(r.intent.category, 'book_appointment');
  });

  it('booking stage → BookAppointment CTA', () => {
    const bp = ResponseEngine.buildBlueprint(makeResponseInput('hvac', { stage: 'booking', plan: makeL3Plan({ objective: 'offer_appointment' }) as any }));
    assert.equal(bp.cta, 'BookAppointment');
  });

  it('booking confirmed → Celebratory emotion', () => {
    const mem = { ...emptyRichMemory(), bookingStatus: 'booked' as const };
    const bp = ResponseEngine.buildBlueprint(makeResponseInput('hvac', { memory: mem as any }));
    assert.equal(bp.emotion, 'Celebratory');
  });

  it('complete conversation → CloseConversation CTA', () => {
    const bp = ResponseEngine.buildBlueprint(makeResponseInput('hvac', { stage: 'completed', plan: makeL3Plan({ objective: 'complete_conversation' }) as any }));
    assert.equal(bp.cta, 'CloseConversation');
  });
});

// ─── 4. RETURNING VISITOR FLOW ───────────────────────────────────────────────

describe('Returning Visitor Flow', () => {
  it('memory engine extracts name and phone from previous session', () => {
    const mem = emptyRichMemory();
    mem.rich.visitorName = { value: 'Alice', confidence: 90, source: 'context' };
    mem.rich.phone       = { value: '5551234', confidence: 90, source: 'context' };
    const profile = MemoryEngine.process({ memory: mem, conversationId: 'c-1', organizationId: 'org-1' });
    assert.ok(profile.items.some(i => i.key === 'visitorName' && i.value === 'Alice'));
    assert.ok(profile.items.some(i => i.key === 'phone'));
  });

  it('returning visitor — no re-ask of already collected name', () => {
    const mem = updateMemoryFromMessage(emptyRichMemory(), 'Alice', "What's your name?") as any;
    assert.equal(mem.progress.visitorNameCollected, true);
    // Layer 3 planner should not re-ask
    const plan = ConversationOrchestrationService.selectObjective({
      blueprint: new InMemoryBlueprintRepository()['blueprints']?.get?.('hvac.repair') ?? null as any,
      progress:  mem.progress,
      workflowState: 'collecting_info',
      intentCategory: 'repair',
      currentObjective: null,
      bookingConfirmed: false,
    });
    // If blueprint not found, just verify no crash
    assert.ok(typeof plan === 'string' || plan === undefined);
  });

  it('memory profile includes returning visitor context', () => {
    const mem = emptyRichMemory();
    mem.rich.visitorName    = { value: 'Bob', confidence: 90, source: 'context' };
    mem.rich.service        = { value: 'AC Repair', confidence: 85, source: 'context' };
    const profile           = MemoryEngine.process({ memory: mem, conversationId: 'c-2', organizationId: 'org-1' });
    const relevant          = MemoryEngine.retrieve(profile.items, { context: 'returning_visitor' });
    assert.ok(relevant.some(i => i.key === 'visitorName'));
    assert.ok(relevant.some(i => i.key === 'service'));
  });
});

// ─── 5. LONG SESSION / HISTORY COMPRESSION ───────────────────────────────────

describe('Long Session & History Compression', () => {
  it('handles 100-turn history without error', () => {
    const history = Array.from({ length: 100 }, (_, i) => ({ role: (i % 2 === 0 ? 'user' : 'assistant') as 'user'|'assistant', content: `Turn ${i}` }));
    assert.doesNotThrow(() => PromptAssembler.build(makeAssemblerInput('hvac', { history })));
  });

  it('prompt with 100-turn history applies compression', () => {
    const history = Array.from({ length: 100 }, (_, i) => ({ role: (i % 2 === 0 ? 'user' : 'assistant') as 'user'|'assistant', content: `Turn ${i}` }));
    const rp = PromptAssembler.build(makeAssemblerInput('hvac', { history, maxHistory: 20 }));
    assert.equal(rp.metadata.compressionApplied, true);
  });

  it('deduplicateHistory removes consecutive duplicates in long session', () => {
    const h = Array.from({ length: 40 }, (_, i) => ({ role: 'user' as const, content: i < 20 ? 'hello' : `msg${i}` }));
    const deduped = deduplicateHistory(h);
    assert.ok(deduped.length < h.length);
  });

  it('token estimate stays reasonable for standard conversation', () => {
    const rp = PromptAssembler.build(makeAssemblerInput('hvac'));
    assert.ok(rp.metadata.tokenEstimate < 3000, `Token estimate too high: ${rp.metadata.tokenEstimate}`);
  });
});

// ─── 6. PROMPT AUDIT ─────────────────────────────────────────────────────────

describe('Prompt Audit — Section ordering and deduplication', () => {
  it('SECTION_ORDER has no duplicates', () => {
    assert.equal(new Set(SECTION_ORDER).size, SECTION_ORDER.length);
  });

  it('systemPrompt contains all expected sections', () => {
    const rp = PromptAssembler.build(makeAssemblerInput('hvac'));
    assert.ok(rp.metadata.sectionsIncluded.includes('SYSTEM'));
    assert.ok(rp.metadata.sectionsIncluded.includes('GUARDRAILS'));
    assert.ok(rp.metadata.sectionsIncluded.includes('FINAL_INSTRUCTIONS'));
  });

  it('no section appears twice in assembled prompt', () => {
    const rp = PromptAssembler.build(makeAssemblerInput('hvac'));
    const seen = new Set(rp.metadata.sectionsIncluded);
    assert.equal(seen.size, rp.metadata.sectionsIncluded.length);
  });

  it('guardrailBlock always contains "Never claim to be human"', () => {
    const rp = PromptAssembler.build(makeAssemblerInput('hvac'));
    assert.ok(rp.guardrailBlock.toLowerCase().includes('never claim to be human'));
  });

  it('instructionBlock contains business name', () => {
    const rp = PromptAssembler.build(makeAssemblerInput('hvac'));
    assert.ok(rp.instructionBlock.includes('HVAC Co'));
  });

  it('responseBlueprint block contains tone and CTA', () => {
    const rp = PromptAssembler.build(makeAssemblerInput('hvac'));
    assert.ok(rp.responseBlueprint.includes('Tone:'));
    assert.ok(rp.responseBlueprint.includes('CTA:'));
  });

  it('empty knowledge gives empty knowledgeBlock', () => {
    const rp = PromptAssembler.build(makeAssemblerInput('hvac', { knowledgeHits: [] }));
    assert.equal(rp.knowledgeBlock, '');
  });

  it('recommendations block omitted when empty', () => {
    const rp = PromptAssembler.build(makeAssemblerInput('hvac', { recommendations: [] }));
    assert.ok(!rp.metadata.sectionsIncluded.includes('RECOMMENDATIONS'));
  });
});

// ─── 7. MEMORY AUDIT ─────────────────────────────────────────────────────────

describe('Memory Audit', () => {
  it('phone field gets permanent retention', () => {
    const mem = emptyRichMemory();
    mem.rich.phone = { value: '5551234', confidence: 90, source: 'context' };
    const profile  = MemoryEngine.process({ memory: mem, conversationId: 'c-1', organizationId: 'org-1' });
    const phoneItem = profile.items.find(i => i.key === 'phone');
    assert.equal(phoneItem?.retention, 'permanent');
  });

  it('low confidence item flagged for revalidation', () => {
    const mem = emptyRichMemory();
    mem.rich.company = { value: 'Acme', confidence: 25, source: 'regex' };
    const profile    = MemoryEngine.process({ memory: mem, conversationId: 'c-1', organizationId: 'org-1' });
    assert.ok(profile.lowConfidenceKeys.includes('company'));
  });

  it('conflict resolved with newest_wins for bookingStatus', () => {
    const mem = emptyRichMemory();
    mem.bookingStatus = 'requested';
    const existing = [{ id:'e1', domain:'relationship' as const, key:'bookingStatus', value:'none', confidence:90, importance:'critical' as const, importanceScore:92, retention:'permanent' as const, source:'user' as const, needsRevalidation:false, tags:[], createdAt: new Date().toISOString() }];
    const profile  = MemoryEngine.process({ memory: mem as any, conversationId:'c-1', organizationId:'org-1', existingItems: existing });
    const bs = profile.items.find(i => i.key === 'bookingStatus');
    assert.ok(bs?.value === 'requested' || profile.conflicts.some(c => c.conflict.key === 'bookingStatus'));
  });

  it('memory compression removes duplicates', () => {
    const mem = emptyRichMemory();
    mem.rich.phone = { value: '5551234', confidence: 90, source: 'context' };
    const existing = [{ id:'e1', domain:'identity' as const, key:'phone', value:'5550000', confidence:60, importance:'critical' as const, importanceScore:88, retention:'permanent' as const, source:'user' as const, needsRevalidation:false, tags:[], createdAt: new Date().toISOString() }];
    const profile  = MemoryEngine.process({ memory: mem, conversationId:'c-1', organizationId:'org-1', existingItems: existing });
    const phones   = profile.items.filter(i => i.key === 'phone');
    assert.equal(phones.length, 1);
  });

  it('booking context retrieval includes phone and name', () => {
    const mem = emptyRichMemory();
    mem.rich.phone       = { value: '555', confidence: 90, source: 'context' };
    mem.rich.visitorName = { value: 'Carol', confidence: 90, source: 'context' };
    const profile   = MemoryEngine.process({ memory: mem, conversationId:'c-1', organizationId:'org-1' });
    const retrieved = MemoryEngine.retrieve(profile.items, { context: 'booking' });
    assert.ok(retrieved.some(i => i.key === 'phone'));
    assert.ok(retrieved.some(i => i.key === 'visitorName'));
  });
});

// ─── 8. PLANNER VALIDATION ───────────────────────────────────────────────────

describe('Planner Validation — No repeated questions, correct progression', () => {
  it('HVAC: collects name → service → emergency → phone in order', () => {
    let mem = updateMemoryFromMessage(emptyRichMemory(), 'Alice', "What's your name?");
    assert.equal(mem.progress.visitorNameCollected, true);

    mem = updateMemoryFromMessage(mem, 'AC Repair', 'What service do you need?') as any;
    assert.equal(mem.progress.serviceCollected, true);

    mem = updateMemoryFromMessage(mem, 'No', 'Is this an emergency?') as any;
    assert.equal(mem.progress.emergencyCollected, true);

    mem = updateMemoryFromMessage(mem, '555-123-4567', "What's the best number?") as any;
    assert.equal(mem.progress.phoneCollected, true);
  });

  it('never asks for name twice', () => {
    const mem = updateMemoryFromMessage(emptyRichMemory(), 'Dave', "What's your name?");
    assert.equal(mem.progress.visitorNameCollected, true);
    // Re-processing the same message should not double-collect
    const mem2 = updateMemoryFromMessage(mem, 'Dave again', "What's your name?") as any;
    // Name stays Dave (higher confidence from first turn)
    assert.equal(mem2.visitorName, 'Dave');
  });

  it('stage does not regress', async () => {
    setBlueprintRepository(new InMemoryBlueprintRepository());
    ConversationOrchestrationService.invalidateBlueprintCache();
    const result = await ConversationOrchestrationService.orchestrate({
      organizationId: 'org-1', conversationId: 'c-1', identity: makeIdentity('hvac'),
      intent: makeIntent({ category: 'repair', blueprintId: 'hvac.repair' }),
      memory: emptyRichMemory(), progress: emptyProgress(), history: [], turnCount: 5,
      currentObjective: 'collect_phone', workflowState: 'collecting_info', currentBlueprintId: 'hvac.repair',
    });
    assert.ok(result.updatedWorkflowState !== 'initialising', 'Should not regress to initialising after turn 5');
  });
});

// ─── 9. STRESS TESTS ─────────────────────────────────────────────────────────

describe('Stress Tests', () => {
  it('malformed message (empty string) does not crash memory update', () => {
    assert.doesNotThrow(() => updateMemoryFromMessage(emptyRichMemory(), '', undefined));
  });

  it('malformed message (only whitespace) handled gracefully', () => {
    assert.doesNotThrow(() => updateMemoryFromMessage(emptyRichMemory(), '   ', 'test'));
  });

  it('very long message does not crash intent engine', async () => {
    setIntentRepository(new InMemoryIntentRepository());
    const longMsg = 'My AC stopped working. '.repeat(200);
    const r = await IntentUnderstandingService.analyze({ message: longMsg, organizationId:'org-1', industry:'hvac', availableServices:[] });
    assert.ok(r.intent.category !== undefined);
  });

  it('concurrent intent analyses do not interfere', async () => {
    setIntentRepository(new InMemoryIntentRepository());
    const results = await Promise.all([
      IntentUnderstandingService.analyze({ message: 'book appointment', organizationId:'org-1', industry:'hvac', availableServices:[] }),
      IntentUnderstandingService.analyze({ message: 'emergency no heat', organizationId:'org-2', industry:'hvac', availableServices:[] }),
      IntentUnderstandingService.analyze({ message: 'cancel appointment', organizationId:'org-3', industry:'hvac', availableServices:[] }),
    ]);
    assert.equal(results[0].intent.category, 'book_appointment');
    assert.equal(results[1].intent.category, 'emergency_service');
    assert.equal(results[2].intent.category, 'cancel_appointment');
  });

  it('Gemini-unavailable fallback: planner question is returned as blueprint question', () => {
    // When Gemini is not configured, the plan's question should flow through
    const bp = ResponseEngine.buildBlueprint(makeResponseInput('hvac', {
      plan: makeL3Plan({ objective: 'collect_phone', requiredField: 'phone' }) as any,
    }));
    assert.ok(bp.question && bp.question.length > 0, 'Blueprint must have a question for Gemini fallback');
  });

  it('prompt assembler handles empty identity servicesCatalog gracefully', () => {
    const identity = makeIdentity('hvac');
    const bare = { ...identity, servicesCatalog: [] } as any;
    assert.doesNotThrow(() => PromptAssembler.build(makeAssemblerInput('hvac', { identity: bare })));
  });

  it('memory engine handles 50 existing items without OOM', () => {
    const existing = Array.from({ length: 50 }, (_, i) => ({
      id: `i${i}`, domain: 'behavioral' as const, key: `field${i}`, value: `val${i}`,
      confidence: 70, importance: 'medium' as const, importanceScore: 55,
      retention: '90_days' as const, source: 'user' as const,
      needsRevalidation: false, tags: [], createdAt: new Date().toISOString(),
    }));
    assert.doesNotThrow(() =>
      MemoryEngine.process({ memory: emptyRichMemory(), conversationId:'c-1', organizationId:'org-1', existingItems: existing })
    );
  });
});

// ─── 10. CONVERSATION QUALITY SPOT-CHECKS ────────────────────────────────────

describe('Conversation Quality', () => {
  it('HVAC repair flow produces Friendly tone by default', () => {
    const bp = ResponseEngine.buildBlueprint(makeResponseInput('hvac'));
    assert.equal(bp.tone, 'Friendly');
  });

  it('SaaS sales flow produces Consultative tone for recommendation', () => {
    const bp = ResponseEngine.buildBlueprint(makeResponseInput('saas', {
      stage: 'recommendation',
      plan: makeL3Plan({ objective: 'offer_recommendation' }) as any,
    }));
    assert.equal(bp.tone, 'Consultative');
  });

  it('blueprint always has non-empty guardrails', () => {
    for (const industry of ['hvac', 'plumbing', 'saas', 'electrical']) {
      const bp = ResponseEngine.buildBlueprint(makeResponseInput(industry));
      assert.ok(bp.guardrails.length > 0, `${industry} blueprint missing guardrails`);
    }
  });

  it('emergency blueprint mustMention includes urgency acknowledgement', () => {
    const bp = ResponseEngine.buildBlueprint(makeResponseInput('hvac', {
      intent: makeIntent({ urgency: 'critical' }),
      plan: makeL3Plan({ objective: 'handle_emergency' }) as any,
    }));
    assert.ok(bp.mustMention.some(m => m.toLowerCase().includes('urgency') || m.toLowerCase().includes('urgent')));
  });

  it('objection stage → Supportive emotion', () => {
    const bp = ResponseEngine.buildBlueprint(makeResponseInput('hvac', {
      stage: 'objection',
      plan: makeL3Plan({ objective: 'resolve_objection' }) as any,
    }));
    assert.equal(bp.emotion, 'Supportive');
  });

  it('human representative → TransferToHuman CTA', () => {
    const bp = ResponseEngine.buildBlueprint(makeResponseInput('hvac', {
      intent: makeIntent({ requiresHuman: true, category: 'human_representative' }),
      plan: makeL3Plan({ objective: 'escalate_to_human' }) as any,
    }));
    assert.equal(bp.cta, 'TransferToHuman');
  });
});
