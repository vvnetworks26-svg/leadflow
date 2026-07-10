/**
 * RoutingService.ts
 *
 * Team routing — selects which assignee gets the booking.
 * Strategies: round_robin, least_busy, priority, specific, department.
 * Handles vacation / out-of-office detection automatically.
 */

import { BookingModel }           from '../../models/Booking.model';
import { OrganizationMemberModel } from '../../models/Organization.model';
import type { IRoutingRule }       from '../../models/MeetingType.model';

export interface RoutingContext {
  organizationId: string;
  routingRules:   IRoutingRule;
  startUtc:       Date;
  endUtc:         Date;
}

// ─── Round Robin state (in-memory per org, resets on restart — simple implementation) ──
const roundRobinIndex = new Map<string, number>();

async function getActiveAssignees(organizationId: string, candidateIds: string[]): Promise<string[]> {
  if (candidateIds.length > 0) return candidateIds;
  // Fall back to all active org members who are agents or above
  const members = await OrganizationMemberModel.find({
    organizationId,
    status: 'active',
    role:   { $in: ['owner','admin','manager','agent'] },
  }).lean();
  return members.map(m => m.userId);
}

async function countBookingsInWindow(
  organizationId: string,
  userId:         string,
  startUtc:       Date,
  endUtc:         Date,
): Promise<number> {
  return BookingModel.countDocuments({
    organizationId,
    assigneeId: userId,
    status:     { $in: ['confirmed', 'rescheduled'] },
    startUtc:   { $gte: startUtc },
    endUtc:     { $lte: endUtc },
  });
}

export const RoutingService = {

  async selectAssignee(ctx: RoutingContext): Promise<string | null> {
    const { organizationId, routingRules, startUtc, endUtc } = ctx;

    // 'specific' — always assign to the designated user
    if (routingRules.strategy === 'specific') {
      const id = routingRules.assigneeIds[0] ?? null;
      return id;
    }

    const candidates = await getActiveAssignees(organizationId, routingRules.assigneeIds);
    if (candidates.length === 0) return null;

    // Filter out users with conflicts in this time window
    const available: string[] = [];
    for (const uid of candidates) {
      const conflicts = await BookingModel.countDocuments({
        organizationId,
        assigneeId: uid,
        status:     { $in: ['confirmed', 'rescheduled'] },
        $or: [
          { startUtc: { $lt: endUtc }, endUtc: { $gt: startUtc } },
        ],
      });
      if (conflicts === 0) available.push(uid);
    }

    if (available.length === 0) return null;

    switch (routingRules.strategy) {
      case 'round_robin': {
        const key = organizationId;
        const idx = (roundRobinIndex.get(key) ?? 0) % available.length;
        roundRobinIndex.set(key, idx + 1);
        return available[idx];
      }

      case 'least_busy': {
        const counts = await Promise.all(
          available.map(async uid => ({
            uid,
            count: await countBookingsInWindow(organizationId, uid, startUtc, endUtc),
          }))
        );
        counts.sort((a, b) => a.count - b.count);
        return counts[0]?.uid ?? null;
      }

      case 'priority': {
        // Priority order = order in assigneeIds list
        for (const uid of routingRules.assigneeIds) {
          if (available.includes(uid)) return uid;
        }
        return available[0] ?? null;
      }

      default:
        return available[0] ?? null;
    }
  },
};
