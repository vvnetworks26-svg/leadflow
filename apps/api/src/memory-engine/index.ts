/**
 * memory-engine/index.ts — Public API of Layer 6.
 */
export { MemoryEngine }           from './MemoryEngine';
export { buildMemoryProfile }     from './MemoryProfile';
export { buildMemoryItem }        from './MemoryScorer';
export { classifyField, classifyAllFields } from './MemoryClassifier';
export { scoreImportance, toImportanceLevel } from './MemoryImportance';
export { assignRetention }        from './MemoryRetention';
export { resolveConflict }        from './MemoryConflictResolver';
export { isExpired, filterActive, expiresAt } from './MemoryTimeline';
export { compressMemory }         from './MemoryCompressor';
export { summarizeMemory }        from './MemorySummarizer';
export { retrieveForContext, findLowConfidence } from './MemoryRetriever';
export type {
  MemoryDomain, ImportanceLevel, RetentionPolicy, ConflictStrategy,
  MemoryItem, MemoryConflict, ConflictResolution,
  MemoryProfile, RetrievalContext, RetrievalQuery,
} from './MemoryTypes';
