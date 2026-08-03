/**
 * memory-engine/MemoryScorer.ts
 * Builds MemoryItem objects from raw field data. Pure function.
 */
import { randomUUID } from 'crypto';
import type { MemoryItem } from './MemoryTypes';
import { classifyField }          from './MemoryClassifier';
import { scoreImportance, toImportanceLevel } from './MemoryImportance';
import { assignRetention }        from './MemoryRetention';

export function buildMemoryItem(params: {
  key:        string;
  value:      unknown;
  confidence: number;
  source:     MemoryItem['source'];
  tags?:      string[];
}): MemoryItem {
  const { key, value, confidence, source, tags = [] } = params;
  const domain         = classifyField(key);
  const importanceScore = scoreImportance(key, confidence);
  const importance     = toImportanceLevel(importanceScore);
  const retention      = assignRetention(key, importance);
  const needsRevalidation = confidence < 50;

  return Object.freeze({
    id:               randomUUID(),
    domain,
    key,
    value,
    confidence,
    importance,
    importanceScore,
    retention,
    source,
    needsRevalidation,
    tags:             Object.freeze([...tags]),
    createdAt:        new Date().toISOString(),
  });
}
