/**
 * businessProfileService.ts
 *
 * Focused service for loading, saving, and updating the Business Profile.
 * Delegates persistence to businessSettings so there is a single localStorage
 * key for all business configuration — no data duplication.
 *
 * Replace the load/save calls here with API requests when a real backend arrives.
 * Nothing outside this file needs to change.
 */

import { BusinessProfile, BusinessSettings } from '../../types';
import { businessSettings, DEFAULT_BUSINESS_SETTINGS } from './businessSettings';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract the profile slice from a full BusinessSettings object. */
function toProfile(s: BusinessSettings): BusinessProfile {
  return {
    companyName: s.companyName,
    logoUrl:     s.logoUrl,
    ownerName:   s.ownerName,
    email:       s.email,
    phone:       s.phone,
    website:     s.website,
    address:     s.address,
    city:        s.city,
    state:       s.state,
    zipCode:     s.zipCode,
    timezone:    s.timezone,
    description: s.description,
    industry:    s.industry
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const businessProfileService = {
  /**
   * Load the current business profile.
   * Returns default values on first run.
   */
  load(): BusinessProfile {
    return toProfile(businessSettings.get());
  },

  /**
   * Persist the full profile, merging it back into the master settings object.
   */
  save(profile: BusinessProfile): BusinessProfile {
    businessSettings.update(profile);
    return profile;
  },

  /**
   * Partially update the profile and persist.
   * Only the supplied fields are changed; everything else is preserved.
   */
  update(patch: Partial<BusinessProfile>): BusinessProfile {
    const current = toProfile(businessSettings.get());
    const updated: BusinessProfile = { ...current, ...patch };
    businessSettings.update(updated);
    return updated;
  },

  /** The default profile values, useful for resetting a form. */
  defaults(): BusinessProfile {
    return toProfile(DEFAULT_BUSINESS_SETTINGS);
  }
};
