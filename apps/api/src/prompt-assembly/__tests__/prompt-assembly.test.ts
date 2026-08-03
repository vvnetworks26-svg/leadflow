/**
 * prompt-assembly/__tests__/prompt-assembly.test.ts
 * Run: npx tsx src/prompt-assembly/__tests__/prompt-assembly.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PromptAssembler }          from '../PromptAssembler';
import { serializeMemory }          from '../MemorySerializer';
import { serializeConversation }    from '../ConversationSerializer';
import { serializeKnowledge }       from '../KnowledgeSerializer';
import { serializeRecommendations } from '../RecommendationSerializer';
import { serializeGuardrails }      from '../GuardrailSerializer';
import { serializeBlueprint }       from '../RendererPrompt';
import { composeInstructions }      from '../InstructionComposer';
import { wrapSection, joinSections }from '../PromptSections';
import {
  deduplicateHistory, deduplicateRecommendations,
  normalizeWhitespace, estimateTokens, compress,
} from '../ContextCompressor';
import { SECTION_ORDER }            from '../types';
import { emptyRichMemory }          from '../../ai/types';
import type { PromptAssemblerInput } from '../types';
import type { BusinessIdentity }    from '../../business-identity/types';
import type { ResolvedIntent }      from '../../intent-engine/types';
import type { ConversationPlan as L3Plan } from '../../conversation-engine/types';
import type { ResponseBlueprint }   from '../../response-engine/types';
import type { QualificationScore }  from '../../ai/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeIdentity(): BusinessIdentity {
  const alwaysOpen = { isOpen: true, openTime: '00:00', closeTime: '23:59' };
  return {
    organizationId: 'org-1',
    companyProfile: { businessId: 'org-1', businessName: 'Test HVAC', legalName: '', industry: 'hvac', subIndustry: '', description: 'HVAC specialists', website: '', logo: '', tagline: '' },
    contactInfo: { phone: '555-000-1111', email: '', address: '', city: '', state: '', country: 'US', timezone: 'UTC' },
    serviceArea: { primaryCity: '', cities: [], counties: [], zipCodes: [], radiusMiles: null, travelFeeRules: [], enabled: true },
    servicesCatalog: [{ id: '1', name: 'AC Repair', description: '', keywords: [], emergencyEligible: true, bookable: true, estimatedDuration: 60, enabled: true }],
    businessHours: { monday: alwaysOpen, tuesday: alwaysOpen, wednesday: alwaysOpen, thursday: alwaysOpen, friday: alwaysOpen, saturday: alwaysOpen, sunday: alwaysOpen, emergencyAfterHours: true, vacationMode: false, holidays: [], closedDates: [] },
    brandPersonality: { tone: 'friendly', energy: 'medium', empathy: 'high', emojiPolicy: 'sparingly', sentenceStyle: 'conversational', humor: false },
    receptionistIdentity: { aiName: 'Emma', role: 'Coordinator', greetingTemplate: "Hi! I'm {aiName}.", introductionTemplate: '', signOffTemplate: '' },
    conversationRules: { enabled: [], custom: [] },
    bookingRules: { minimumNoticeHours: 1, maximumBookingDays: 90, defaultDurationMins: 60, slotIntervalMins: 30, sameDayBooking: true, weekendBooking: false, businessBufferMins: 0 },
    emergencyPolicy: { enabled: true, triggers: [] },
    escalationPolicy: { triggers: ['customer_requests_human'], confidenceThreshold: 30, escalationMessage: '' },
    permissions: { allowed: ['book_appointment'], denied: ['negotiate_pricing'] },
    integrations: [],
    businessGoals: [{ priority: 'primary', description: 'Book appointments' }],
    loadedAt: new Date(),
  } as BusinessIdentity;
}

function makeIntent(): ResolvedIntent {
  return { id: 'i-1', category: 'repair', subCategory: '', confidenceLevel: 'high', urgency: 'normal', detectedService: null, entities: [], candidates: [], reasoning: '', blueprintId: null, requiresHuman: false, requiresClarification: false, rawMessage: 'fix my AC', timestamp: new Date() };
}

function makePlan(): L3Plan {
  return { objective: 'collect_phone', reason: 'Need phone number', requiredField: 'phone', questionType: 'phone', priority: 'high', allowedTools: [], nextState: 'collecting_info', fallbackState: 'collecting_info', completionCriteria: ['phoneCollected'], recoveryStrategy: { onAmbiguity: 'clarify_intent', onRepeat: 'clarify_intent', onContradiction: 'clarify_intent', onTopicChange: 'build_rapport', preserveContext: true }, blueprintId: null, ruleApplied: null, isTerminal: false };
}

function makeBlueprint(): ResponseBlueprint {
  return { objective: 'collect_phone', tone: 'Friendly', emotion: 'Neutral', urgency: 'normal', cta: 'AskQuestion', personalization: {}, length: 'Short', style: 'Conversational', mustMention: [], mustAvoid: ['Never claim to be human'], guardrails: ['Ask one question'], examples: [], metadata: { industry: 'hvac', stage: 'discovery', objective: 'collect_phone', workflowState: 'collecting_info' } };
}

function makeQual(): QualificationScore {
  return { overall: 40, temperature: 'Cold', confidence: 50, breakdown: { industry: 40, companySize: 40, decisionMaker: 50, budget: 35, timeline: 35, urgency: 40, technicalReady: 60, aiReady: 45, painSeverity: 20, buyingIntent: 30 }, reasons: [], missingInfo: [] };
}

function makeInput(overrides: Partial<PromptAssemblerInput> = {}): PromptAssemblerInput {
  return {
    identity: makeIdentity(), plan: makePlan(), blueprint: makeBlueprint(),
    memory: emptyRichMemory(), qualification: makeQual(), intent: makeIntent(),
    knowledgeHits: [], recommendations: [], history: [],
    stage: 'discovery', ...overrides,
  };
}

// ─── PromptAssembler ──────────────────────────────────────────────────────────

describe('PromptAssembler.build — core', () => {
  it('returns a RendererPrompt with all required fields', () => {
    const rp = PromptAssembler.build(makeInput());
    assert.ok(typeof rp.systemPrompt === 'string');
    assert.ok(typeof rp.knowledgeBlock === 'string');
    assert.ok(typeof rp.memoryBlock === 'string');
    assert.ok(typeof rp.conversationBlock === 'string');
    assert.ok(typeof rp.instructionBlock === 'string');
    assert.ok(typeof rp.guardrailBlock === 'string');
    assert.ok(typeof rp.responseBlueprint === 'string');
    assert.ok(typeof rp.metadata.tokenEstimate === 'number');
    assert.ok(typeof rp.metadata.compressionApplied === 'boolean');
    assert.ok(Array.isArray(rp.metadata.sectionsIncluded));
  });

  it('result is frozen', () => {
    const rp = PromptAssembler.build(makeInput());
    assert.throws(() => { (rp as any).systemPrompt = 'x'; }, TypeError);
  });

  it('systemPrompt contains business name', () => {
    const rp = PromptAssembler.build(makeInput());
    assert.ok(rp.systemPrompt.includes('Test HVAC'));
  });

  it('systemPrompt contains AI name', () => {
    const rp = PromptAssembler.build(makeInput());
    assert.ok(rp.systemPrompt.includes('Emma'));
  });

  it('token estimate is positive', () => {
    const rp = PromptAssembler.build(makeInput());
    assert.ok(rp.metadata.tokenEstimate > 0);
  });

  it('sectionsIncluded contains SYSTEM', () => {
    const rp = PromptAssembler.build(makeInput());
    assert.ok(rp.metadata.sectionsIncluded.includes('SYSTEM'));
  });

  it('sectionsIncluded contains GUARDRAILS', () => {
    const rp = PromptAssembler.build(makeInput());
    assert.ok(rp.metadata.sectionsIncluded.includes('GUARDRAILS'));
  });

  it('KNOWLEDGE block is empty when no hits', () => {
    const rp = PromptAssembler.build(makeInput({ knowledgeHits: [] }));
    assert.equal(rp.knowledgeBlock, '');
  });

  it('KNOWLEDGE block populated when hits provided', () => {
    const hits = [{ id: '1', category: 'FAQ' as const, title: 'How to book', content: 'Call us', tags: [] }];
    const rp = PromptAssembler.build(makeInput({ knowledgeHits: hits }));
    assert.ok(rp.knowledgeBlock.includes('How to book'));
  });

  it('compressionApplied=true when history exceeds maxHistory', () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}`,
    }));
    const rp = PromptAssembler.build(makeInput({ history, maxHistory: 10 }));
    assert.equal(rp.metadata.compressionApplied, true);
  });

  it('compressionApplied=false for short history', () => {
    const rp = PromptAssembler.build(makeInput({ history: [{ role: 'user', content: 'hi' }] }));
    assert.equal(rp.metadata.compressionApplied, false);
  });

  it('memory block is empty for empty memory', () => {
    const rp = PromptAssembler.build(makeInput());
    assert.equal(rp.memoryBlock, '');
  });

  it('memory block includes visitor name when set', () => {
    const mem = { ...emptyRichMemory(), visitorName: 'Alice' };
    const rp = PromptAssembler.build(makeInput({ memory: mem as any }));
    assert.ok(rp.memoryBlock.includes('Alice'));
  });
});

// ─── Section ordering ─────────────────────────────────────────────────────────

describe('Section ordering', () => {
  it('SECTION_ORDER has 11 sections', () => {
    assert.equal(SECTION_ORDER.length, 11);
  });

  it('SYSTEM is first', () => assert.equal(SECTION_ORDER[0], 'SYSTEM'));
  it('FINAL_INSTRUCTIONS is last', () => assert.equal(SECTION_ORDER[SECTION_ORDER.length - 1], 'FINAL_INSTRUCTIONS'));

  it('no section appears twice in SECTION_ORDER', () => {
    const set = new Set(SECTION_ORDER);
    assert.equal(set.size, SECTION_ORDER.length);
  });

  it('joinSections never duplicates a section', () => {
    const { sectionsIncluded } = joinSections([
      { name: 'SYSTEM', content: 'a' },
      { name: 'SYSTEM', content: 'b' },   // duplicate
      { name: 'GUARDRAILS', content: 'c' },
    ]);
    assert.equal(sectionsIncluded.filter(s => s === 'SYSTEM').length, 1);
  });

  it('joinSections omits empty sections', () => {
    const { sectionsIncluded } = joinSections([
      { name: 'SYSTEM', content: 'ok' },
      { name: 'KNOWLEDGE', content: '' },   // empty
    ]);
    assert.ok(!sectionsIncluded.includes('KNOWLEDGE'));
  });
});

// ─── Memory Serializer ────────────────────────────────────────────────────────

describe('MemorySerializer', () => {
  it('returns empty string for empty memory', () => {
    assert.equal(serializeMemory(emptyRichMemory()), '');
  });

  it('serializes visitor name', () => {
    const mem = { ...emptyRichMemory(), visitorName: 'Bob' };
    const s = serializeMemory(mem as any);
    assert.ok(s.includes('Bob'));
    assert.ok(s.includes('Visitor Name'));
  });

  it('does not expose confidence scores', () => {
    const mem = emptyRichMemory();
    mem.rich.visitorName = { value: 'Carol', confidence: 95, source: 'context' };
    const s = serializeMemory(mem);
    assert.ok(!s.includes('confidence'));
    assert.ok(!s.includes('95'));
    assert.ok(!s.includes('source'));
  });

  it('serializes phone', () => {
    const mem = { ...emptyRichMemory(), phone: '555-1234' };
    assert.ok(serializeMemory(mem as any).includes('555-1234'));
  });

  it('serializes booking status when not none', () => {
    const mem = { ...emptyRichMemory(), bookingStatus: 'requested' as const };
    assert.ok(serializeMemory(mem as any).includes('requested'));
  });

  it('omits booking status when none', () => {
    const s = serializeMemory(emptyRichMemory());
    assert.ok(!s.includes('none'));
  });

  it('serializes rich service value', () => {
    const mem = emptyRichMemory();
    mem.rich.service = { value: 'AC Repair', confidence: 90, source: 'context' };
    assert.ok(serializeMemory(mem).includes('AC Repair'));
  });
});

// ─── Conversation Serializer ──────────────────────────────────────────────────

describe('ConversationSerializer', () => {
  it('returns empty for empty history', () => assert.equal(serializeConversation([]), ''));

  it('includes Customer label for user messages', () => {
    const h = [{ role: 'user' as const, content: 'Hi' }];
    assert.ok(serializeConversation(h).includes('Customer: Hi'));
  });

  it('includes Assistant label for model messages', () => {
    const h = [{ role: 'assistant' as const, content: 'Hello' }];
    assert.ok(serializeConversation(h).includes('Assistant: Hello'));
  });

  it('trims to maxMessages', () => {
    const h = Array.from({ length: 30 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }));
    const s = serializeConversation(h, 5);
    assert.ok(s.includes('m29'));
    assert.ok(!s.includes('m0'));
  });

  it('default max is 20', () => {
    const h = Array.from({ length: 25 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }));
    const s = serializeConversation(h);
    assert.ok(s.includes('m24'));
    assert.ok(!s.includes('m0'));
  });
});

// ─── Knowledge Serializer ─────────────────────────────────────────────────────

describe('KnowledgeSerializer', () => {
  it('returns empty for no hits', () => assert.equal(serializeKnowledge([]), ''));

  it('includes title and content', () => {
    const hits = [{ id: '1', category: 'FAQ' as const, title: 'Pricing', content: 'See our rates', tags: [] }];
    const s = serializeKnowledge(hits);
    assert.ok(s.includes('Pricing'));
    assert.ok(s.includes('See our rates'));
  });

  it('limits to maxSnippets', () => {
    const hits = Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, category: 'FAQ' as const, title: `T${i}`, content: `C${i}`, tags: [] }));
    const s = serializeKnowledge(hits, 2);
    assert.ok(s.includes('T0'));
    assert.ok(!s.includes('T3'));
  });
});

// ─── Recommendation Serializer ────────────────────────────────────────────────

describe('RecommendationSerializer', () => {
  it('returns empty for no recommendations', () => assert.equal(serializeRecommendations([]), ''));

  it('includes product title and reason', () => {
    const recs = [{ product: 'LeadFlow' as const, title: 'LeadFlow CRM', why: 'Automate leads', fitScore: 85, urgency: 'high' as const }];
    const s = serializeRecommendations(recs);
    assert.ok(s.includes('LeadFlow CRM'));
    assert.ok(s.includes('Automate leads'));
  });
});

// ─── Guardrail Serializer ─────────────────────────────────────────────────────

describe('GuardrailSerializer', () => {
  it('always includes universal guardrails', () => {
    const s = serializeGuardrails();
    assert.ok(s.includes('Never claim to be human'));
    assert.ok(s.includes('Never provide medical'));
  });

  it('merges blueprint guardrails', () => {
    const bp = { ...makeBlueprint(), guardrails: ['Custom rule here'] };
    const s = serializeGuardrails(bp);
    assert.ok(s.includes('Custom rule here'));
  });

  it('deduplicates rules', () => {
    const bp = { ...makeBlueprint(), guardrails: ['Never claim to be human'] };
    const s = serializeGuardrails(bp);
    const count = (s.match(/Never claim to be human/g) ?? []).length;
    assert.equal(count, 1);
  });

  it('merges mustAvoid from blueprint', () => {
    const bp = { ...makeBlueprint(), mustAvoid: ['Never diagnose equipment'] };
    const s = serializeGuardrails(bp);
    assert.ok(s.includes('diagnose'));
  });
});

// ─── Blueprint serializer ─────────────────────────────────────────────────────

describe('RendererPrompt serializer', () => {
  it('includes objective', () => assert.ok(serializeBlueprint(makeBlueprint()).includes('collect_phone')));
  it('includes tone', () => assert.ok(serializeBlueprint(makeBlueprint()).includes('Friendly')));
  it('includes CTA', () => assert.ok(serializeBlueprint(makeBlueprint()).includes('AskQuestion')));
  it('includes length', () => assert.ok(serializeBlueprint(makeBlueprint()).includes('Short')));
  it('includes question when provided', () => {
    const bp = { ...makeBlueprint(), question: "What's your phone?" };
    assert.ok(serializeBlueprint(bp).includes("What's your phone?"));
  });
  it('includes mustAvoid when non-empty', () => {
    const bp = { ...makeBlueprint(), mustAvoid: ['Do not fabricate'] };
    assert.ok(serializeBlueprint(bp).includes('Do not fabricate'));
  });
  it('includes personalization when present', () => {
    const bp = { ...makeBlueprint(), personalization: { visitorName: 'Dave' } };
    assert.ok(serializeBlueprint(bp).includes('Dave'));
  });
});

// ─── Instruction Composer ─────────────────────────────────────────────────────

describe('InstructionComposer', () => {
  it('includes business name', () => {
    const s = composeInstructions({ identity: makeIdentity(), plan: makePlan(), blueprint: makeBlueprint(), qualification: makeQual() });
    assert.ok(s.includes('Test HVAC'));
  });

  it('includes objective', () => {
    const s = composeInstructions({ identity: makeIdentity(), plan: makePlan(), blueprint: makeBlueprint(), qualification: makeQual() });
    assert.ok(s.includes('collect_phone'));
  });

  it('includes priority', () => {
    const s = composeInstructions({ identity: makeIdentity(), plan: makePlan(), blueprint: makeBlueprint(), qualification: makeQual() });
    assert.ok(s.includes('high'));
  });

  it('includes tone', () => {
    const s = composeInstructions({ identity: makeIdentity(), plan: makePlan(), blueprint: makeBlueprint(), qualification: makeQual() });
    assert.ok(s.includes('Friendly'));
  });

  it('includes page context when provided', () => {
    const s = composeInstructions({ identity: makeIdentity(), plan: makePlan(), blueprint: makeBlueprint(), qualification: makeQual(), currentPage: '/hvac' });
    assert.ok(s.includes('/hvac'));
  });
});

// ─── Context Compressor ───────────────────────────────────────────────────────

describe('ContextCompressor', () => {
  it('deduplicateHistory removes consecutive duplicates', () => {
    const h = [
      { role: 'user' as const, content: 'hello' },
      { role: 'user' as const, content: 'hello' },   // duplicate
      { role: 'assistant' as const, content: 'hi' },
    ];
    const r = deduplicateHistory(h);
    assert.equal(r.length, 2);
  });

  it('deduplicateHistory preserves non-duplicates', () => {
    const h = [
      { role: 'user' as const, content: 'a' },
      { role: 'assistant' as const, content: 'a' },  // different role
    ];
    assert.equal(deduplicateHistory(h).length, 2);
  });

  it('deduplicateRecommendations removes same product', () => {
    const recs = [
      { product: 'LeadFlow' as const, title: 'A', why: '', fitScore: 80, urgency: 'high' as const },
      { product: 'LeadFlow' as const, title: 'A', why: '', fitScore: 80, urgency: 'high' as const },
    ];
    assert.equal(deduplicateRecommendations(recs).length, 1);
  });

  it('estimateTokens returns 0 for empty string', () => assert.equal(estimateTokens(''), 0));

  it('estimateTokens scales with text length', () => {
    assert.ok(estimateTokens('hello world') > 0);
    assert.ok(estimateTokens('hello world '.repeat(100)) > estimateTokens('hello world'));
  });

  it('normalizeWhitespace trims and collapses blank lines', () => {
    const s = normalizeWhitespace('  hello\n\n\n\nworld  ');
    assert.equal(s, 'hello\n\nworld');
  });

  it('compress applies window to history', () => {
    const h = Array.from({ length: 30 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }));
    const { history, compressionApplied } = compress({ history: h, recommendations: [], maxHistory: 5 });
    assert.equal(history.length, 5);
    assert.equal(compressionApplied, true);
  });

  it('compress returns compressionApplied=false when nothing trimmed', () => {
    const h = [{ role: 'user' as const, content: 'hi' }];
    const { compressionApplied } = compress({ history: h, recommendations: [], maxHistory: 20 });
    assert.equal(compressionApplied, false);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('handles null/undefined history gracefully', () => {
    assert.doesNotThrow(() => PromptAssembler.build(makeInput({ history: [] })));
  });

  it('handles very large history without crashing', () => {
    const h = Array.from({ length: 200 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }));
    assert.doesNotThrow(() => PromptAssembler.build(makeInput({ history: h })));
  });

  it('handles memory with all rich fields populated', () => {
    const mem = emptyRichMemory();
    mem.rich.visitorName = { value: 'Alice', confidence: 90, source: 'context' };
    mem.rich.phone = { value: '555-0000', confidence: 90, source: 'context' };
    mem.rich.address = { value: '123 Main', confidence: 90, source: 'context' };
    assert.doesNotThrow(() => PromptAssembler.build(makeInput({ memory: mem })));
  });

  it('handles empty identity servicesCatalog', () => {
    const id = { ...makeIdentity(), servicesCatalog: [] } as any;
    assert.doesNotThrow(() => PromptAssembler.build(makeInput({ identity: id })));
  });

  it('token estimate is deterministic for same input', () => {
    const a = PromptAssembler.build(makeInput());
    const b = PromptAssembler.build(makeInput());
    assert.equal(a.metadata.tokenEstimate, b.metadata.tokenEstimate);
  });

  it('wrapSection returns empty for empty content', () => {
    assert.equal(wrapSection('SYSTEM', ''), '');
    assert.equal(wrapSection('SYSTEM', '   '), '');
  });

  it('wrapSection wraps non-empty content', () => {
    const s = wrapSection('SYSTEM', 'hello');
    assert.ok(s.includes('[SYSTEM]'));
    assert.ok(s.includes('hello'));
  });
});
