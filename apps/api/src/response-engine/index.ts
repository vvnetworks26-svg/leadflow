/**
 * response-engine/index.ts — Public API of Layer 4.
 * Import everything from here; never from sub-modules directly.
 */

// Primary entry point
export { ResponseEngine }          from './ResponseEngine';

// Core types
export type {
  Tone, Emotion, ResponseLength, CTAType, ResponseStyle,
  ResponseBlueprint, ResponseEngineInput,
} from './types';

// Sub-engine functions (for testing / advanced use)
export { selectTone }              from './ResponseTone';
export { selectEmotion }           from './ResponseEmotion';
export { selectLength }            from './ResponseLength';
export { selectCTA }               from './CTAEngine';
export { buildPersonalization }    from './Personalization';
export { selectStyle, buildGuardrails, buildExamples } from './ResponsePlanner';
export { buildResponseBlueprint }  from './ResponseBlueprint';
export {
  humanize, humanizeFieldQuestion,
  personalizeGreeting, buildMustMention, buildMustAvoid,
} from './Humanizer';
