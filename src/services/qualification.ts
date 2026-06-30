/**
 * qualification.ts
 *
 * Pure lead qualification logic.
 * Reads service area ZIPs from businessSettings — no hardcoded lists.
 */

import { ConversationData, LeadStatus, LeadPriority } from '../types';
import { businessSettings } from './business/businessSettings';

export interface QualificationResult {
  status: LeadStatus;
  priority: LeadPriority;
  reason: string;
}

/**
 * Determine whether a lead is QUALIFIED, UNQUALIFIED, or NEW.
 *
 * Rules:
 *   QUALIFIED   = provided phone + in active service area
 *   UNQUALIFIED = outside service area OR no phone
 */
export function qualifyLead(data: ConversationData): QualificationResult {
  const settings = businessSettings.get();
  const serviceAreaZips = new Set(settings.serviceAreaZips);
  const serviceAreaEnabled = settings.serviceAreaEnabled;

  const hasPhone = Boolean(data.phone && data.phone.replace(/\D/g, '').length >= 10);
  const inServiceArea = !serviceAreaEnabled ||
    Boolean(data.zipCode && serviceAreaZips.has(data.zipCode.trim()));
  const isEmergency = Boolean(data.emergency);

  if (!hasPhone) {
    return {
      status: 'Unqualified',
      priority: 'Low',
      reason: 'No valid phone number provided — unable to contact customer.'
    };
  }

  if (!inServiceArea) {
    return {
      status: 'Unqualified',
      priority: 'Low',
      reason: `ZIP code ${data.zipCode} is outside our current service area.`
    };
  }

  const priority: LeadPriority = isEmergency ? 'High' : 'Medium';
  const emergencyNote = isEmergency ? ' Emergency priority — dispatch immediately.' : '';

  return {
    status: 'Qualified',
    priority,
    reason: `Customer provided phone number and is within the service area.${emergencyNote}`
  };
}

/** Estimate deal value from the configured services catalogue, with fallback heuristics. */
export function estimateDealValue(service: string, emergency: boolean): number {
  const settings = businessSettings.get();
  const s = service.toLowerCase();

  // Try to match against configured services by name
  const match = settings.services.find(
    svc => svc.active && s.includes(svc.name.toLowerCase().split(' ')[0])
  );
  if (match) {
    // Derive rough value from duration as a proxy
    if (match.estimatedDuration >= 240) return 8500;
    if (match.emergencyAvailable && emergency) return 450;
    if (match.estimatedDuration <= 60) return 180;
    return 350;
  }

  // Fallback keyword heuristics
  if (s.includes('replace') || s.includes('install') || s.includes('new system')) return 8500;
  if (s.includes('heat pump')) return 5200;
  if (emergency || s.includes('repair') || s.includes('leak') || s.includes('no cool') || s.includes('no heat')) return 450;
  if (s.includes('maintenance') || s.includes('tune') || s.includes('cleaning')) return 180;
  return 300;
}
