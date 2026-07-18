/**
 * business-identity/index.ts
 *
 * Public API of the Business Identity Engine.
 * Import everything you need from here — never from sub-modules directly.
 */

// Core types
export type {
  BusinessIdentity,
  CompanyProfile,
  ContactInfo,
  ServiceArea,
  ServiceCatalogItem,
  BusinessHours,
  DaySchedule,
  HolidayEntry,
  BrandPersonality,
  ReceptionistIdentity,
  ConversationRules,
  CustomRule,
  BookingRules,
  EmergencyPolicy,
  EmergencyTrigger,
  EscalationPolicy,
  AiPermissions,
  IntegrationConfig,
  BusinessGoal,
  Industry,
  AiTone,
  AiPermission,
  AiRestriction,
  EscalationTrigger,
  ConversationRuleKey,
} from './types';

// Zod schemas (for external validation use)
export {
  BusinessIdentityInputSchema,
  CompanyProfileSchema,
  ServiceCatalogItemSchema,
  BusinessHoursSchema,
  BookingRulesSchema,
} from './schemas';
export type { BusinessIdentityInput } from './schemas';

// Factory
export { buildBusinessIdentity, parseBusinessIdentity } from './BusinessIdentityFactory';

// Application service (primary entry point)
export { BusinessIdentityService, setRepository } from './BusinessIdentityService';

// Module helpers
export { servesLocation, isOutsideServiceArea, getTravelFee }  from './modules/service-area.module';
export { listBookableServices, matchServiceFromIntent, getServiceByName, listEmergencyServices } from './modules/services-catalog.module';
export { isOpen, nextOpeningTime, hasEmergencyAfterHours }     from './modules/business-hours.module';
export { detectEmergencyPriority, isEmergency }                from './modules/emergency-policy.module';
export { shouldEscalateOnMessage, shouldEscalateOnScore }      from './modules/escalation-policy.module';
export { isPermitted, isDenied, getDenialReason }              from './modules/permissions.module';
export { toPromptDirectives as brandToPromptDirectives }       from './modules/brand-personality.module';
export { toPromptDirectives as rulesToPromptDirectives }       from './modules/conversation-rules.module';
export { renderGreeting, renderIntroduction, renderSignOff }   from './modules/receptionist-identity.module';

// Cache (for invalidation hooks)
export { businessIdentityCache }           from './cache/BusinessIdentityCache';
export type { IBusinessIdentityCache }     from './cache/BusinessIdentityCache';

// Repository interface (for custom implementations)
export type { IBusinessIdentityRepository } from './repository/BusinessIdentityRepository';
export { MongoBusinessIdentityRepository }  from './repository/MongoBusinessIdentityRepository';
