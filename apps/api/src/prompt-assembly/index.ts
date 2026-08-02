/**
 * prompt-assembly/index.ts — Public API of Layer 5.
 */
export { PromptAssembler }           from './PromptAssembler';
export type { PromptAssemblerInput, RendererPrompt, PromptSection } from './types';
export { SECTION_ORDER }             from './types';
export { serializeMemory }           from './MemorySerializer';
export { serializeConversation }     from './ConversationSerializer';
export { serializeKnowledge }        from './KnowledgeSerializer';
export { serializeRecommendations }  from './RecommendationSerializer';
export { serializeGuardrails }       from './GuardrailSerializer';
export { serializeBlueprint }        from './RendererPrompt';
export { composeInstructions }       from './InstructionComposer';
export { wrapSection, joinSections } from './PromptSections';
export {
  deduplicateHistory, deduplicateRecommendations,
  normalizeWhitespace, estimateTokens, estimateTokensFromParts,
  shouldCompress, compress,
} from './ContextCompressor';
