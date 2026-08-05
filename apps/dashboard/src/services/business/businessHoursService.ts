/**
 * businessHoursService.ts
 *
 * Focused service for the Business Hours configuration.
 * Delegates persistence to businessSettings — single localStorage key,
 * single source of truth.
 *
 * The calendarService reads businessSettings.get().businessHours directly,
 * so any save() call here is immediately reflected in slot generation.
 *
 * Replace the load/save calls with API requests when a real backend arrives.
 */

import { BusinessHours, DaySchedule } from '../../types';
import { businessSettings, DEFAULT_BUSINESS_SETTINGS } from './businessSettings';

// Day keys in the order they appear in the UI
export type DayKey =
  | 'monday' | 'tuesday' | 'wednesday' | 'thursday'
  | 'friday' | 'saturday' | 'sunday';

export const DAY_KEYS: DayKey[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
];

export const DAY_LABELS: Record<DayKey, string> = {
  monday:    'Monday',
  tuesday:   'Tuesday',
  wednesday: 'Wednesday',
  thursday:  'Thursday',
  friday:    'Friday',
  saturday:  'Saturday',
  sunday:    'Sunday'
};

// ─── Time slot options every 30 minutes ──────────────────────────────────────

/** All selectable times as "HH:MM" strings, 00:00 → 23:30 */
export const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

/** Format "HH:MM" → "h:MM AM/PM" for display */
export function formatTimeLabel(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${period}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const businessHoursService = {
  /**
   * Load the current business hours configuration.
   */
  load(): BusinessHours {
    return businessSettings.get().businessHours;
  },

  /**
   * Persist the full BusinessHours object.
   * The calendarService will pick up the new hours on the next
   * call to getAvailableSlots() — no restart required.
   */
  save(hours: BusinessHours): BusinessHours {
    businessSettings.updateHours(hours);
    return hours;
  },

  /**
   * Update a single day's schedule and persist immediately.
   */
  updateDay(day: DayKey, schedule: Partial<DaySchedule>): BusinessHours {
    const current = businessHoursService.load();
    const updated: BusinessHours = {
      ...current,
      [day]: { ...current[day], ...schedule }
    };
    return businessHoursService.save(updated);
  },

  /**
   * Toggle vacation mode. When on, calendarService returns no slots.
   */
  setVacationMode(enabled: boolean): BusinessHours {
    const current = businessHoursService.load();
    return businessHoursService.save({ ...current, vacationMode: enabled });
  },

  /**
   * Toggle after-hours emergency availability.
   */
  setEmergencyAfterHours(enabled: boolean): BusinessHours {
    const current = businessHoursService.load();
    return businessHoursService.save({ ...current, emergencyAfterHours: enabled });
  },

  /**
   * Apply the same open/close times to every weekday (Mon–Fri).
   */
  applyWeekdayPreset(openTime: string, closeTime: string): BusinessHours {
    const current = businessHoursService.load();
    const updated: BusinessHours = { ...current };
    const weekdays: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    weekdays.forEach(d => {
      updated[d] = { ...updated[d], isOpen: true, openTime, closeTime };
    });
    return businessHoursService.save(updated);
  },

  /** The factory-default hours, useful for a "Reset to defaults" action. */
  defaults(): BusinessHours {
    return DEFAULT_BUSINESS_SETTINGS.businessHours;
  }
};
