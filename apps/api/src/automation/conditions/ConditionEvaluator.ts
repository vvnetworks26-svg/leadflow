/**
 * ConditionEvaluator.ts
 *
 * Evaluates condition groups against a data context.
 * Supports: AND/OR logic, nested groups, all standard operators.
 * Pure functions — no I/O, no side effects.
 */

import type { Condition, ConditionGroup, ConditionOperator } from '../types';

// ─── Get nested value by dot-path ─────────────────────────────────────────────

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((cur: unknown, key) => {
    if (cur === null || cur === undefined) return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

// ─── Single condition evaluation ─────────────────────────────────────────────

function evaluateOne(cond: Condition, ctx: Record<string, unknown>): boolean {
  const actual  = getPath(ctx, cond.field);
  const expected = cond.value;

  switch (cond.operator as ConditionOperator) {
    case 'equals':
      return String(actual).toLowerCase() === String(expected).toLowerCase();
    case 'not_equals':
      return String(actual).toLowerCase() !== String(expected).toLowerCase();
    case 'contains':
      return String(actual ?? '').toLowerCase().includes(String(expected).toLowerCase());
    case 'not_contains':
      return !String(actual ?? '').toLowerCase().includes(String(expected).toLowerCase());
    case 'starts_with':
      return String(actual ?? '').toLowerCase().startsWith(String(expected).toLowerCase());
    case 'ends_with':
      return String(actual ?? '').toLowerCase().endsWith(String(expected).toLowerCase());
    case 'greater_than':
      return Number(actual) > Number(expected);
    case 'less_than':
      return Number(actual) < Number(expected);
    case 'between': {
      const n   = Number(actual);
      const lo  = Number(expected);
      const hi  = Number(cond.value2 ?? expected);
      return n >= lo && n <= hi;
    }
    case 'regex':
      try {
        return new RegExp(String(expected), 'i').test(String(actual ?? ''));
      } catch { return false; }
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'is_empty':
      return actual === undefined || actual === null || String(actual).trim() === '';
    default:
      return false;
  }
}

// ─── Group evaluation (recursive) ────────────────────────────────────────────

export function evaluateConditionGroup(
  group: ConditionGroup,
  ctx:   Record<string, unknown>,
): boolean {
  const condResults = group.conditions.map(c => evaluateOne(c, ctx));
  const groupResults = (group.groups ?? []).map(g => evaluateConditionGroup(g, ctx));
  const all = [...condResults, ...groupResults];

  if (all.length === 0) return true;  // empty group = pass

  return group.logic === 'AND'
    ? all.every(Boolean)
    : all.some(Boolean);
}

/**
 * Quick helper — evaluate an optional group (null/undefined = always pass).
 */
export function passesConditions(
  group: ConditionGroup | undefined | null,
  ctx:   Record<string, unknown>,
): boolean {
  if (!group) return true;
  return evaluateConditionGroup(group, ctx);
}
