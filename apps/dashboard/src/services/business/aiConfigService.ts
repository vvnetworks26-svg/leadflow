/**
 * aiConfigService.ts
 *
 * Manages the AI Receptionist configuration.
 * The chat engine (services/api/chat.ts) reads businessSettings.aiConfig
 * live on every step, so any save() call here is immediately reflected in
 * the next conversation — no restart required.
 *
 * Replace the load/save calls with API requests when a real backend arrives.
 */

import { AIReceptionistConfig, FaqItem } from '../../types';
import { businessSettings, DEFAULT_BUSINESS_SETTINGS } from './businessSettings';

function makeId(): string {
  return `faq_${Math.random().toString(36).substr(2, 9)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const aiConfigService = {
  /** Load the current AI receptionist configuration. */
  load(): AIReceptionistConfig {
    return businessSettings.get().aiConfig;
  },

  /** Persist the full AI config object. */
  save(config: AIReceptionistConfig): AIReceptionistConfig {
    businessSettings.updateAIConfig(config);
    return config;
  },

  /** Partially update the AI config and persist immediately. */
  update(patch: Partial<AIReceptionistConfig>): AIReceptionistConfig {
    const current = aiConfigService.load();
    const updated: AIReceptionistConfig = { ...current, ...patch };
    return aiConfigService.save(updated);
  },

  // ── FAQ helpers ─────────────────────────────────────────────────────────────

  /** Add a new FAQ entry. Returns the updated full config. */
  addFaq(question: string, answer: string): AIReceptionistConfig {
    const current = aiConfigService.load();
    const entry: FaqItem = { id: makeId(), question: question.trim(), answer: answer.trim() };
    return aiConfigService.save({ ...current, faq: [...current.faq, entry] });
  },

  /** Update a single FAQ entry by id. Returns the updated full config. */
  updateFaq(id: string, patch: Partial<Omit<FaqItem, 'id'>>): AIReceptionistConfig {
    const current = aiConfigService.load();
    const faq = current.faq.map(f => f.id === id ? { ...f, ...patch } : f);
    return aiConfigService.save({ ...current, faq });
  },

  /** Remove a FAQ entry by id. Returns the updated full config. */
  removeFaq(id: string): AIReceptionistConfig {
    const current = aiConfigService.load();
    return aiConfigService.save({ ...current, faq: current.faq.filter(f => f.id !== id) });
  },

  /** Factory defaults — useful for a reset action. */
  defaults(): AIReceptionistConfig {
    return DEFAULT_BUSINESS_SETTINGS.aiConfig;
  }
};
