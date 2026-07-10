/**
 * ABTestService.ts
 *
 * A/B test management. Variants receive traffic based on split %.
 * Winner detection uses a simplified z-test on conversion rates.
 * Automatic promotion applies the winner config to the live widget.
 */

import { WidgetABTestModel, IWidgetABTest, IABVariant } from '../../models/WidgetABTest.model';
import { WidgetConfigService } from '../branding/WidgetConfigService';
import { ApiError }            from '../../middleware/errorHandler';

/** Simple z-test for two proportions. Returns true if variant B is statistically better. */
function isSignificant(
  aImpressions: number, aConversions: number,
  bImpressions: number, bConversions: number,
  confidence   = 95,
): boolean {
  if (aImpressions < 30 || bImpressions < 30) return false;
  const pa = aConversions / aImpressions;
  const pb = bConversions / bImpressions;
  const p  = (aConversions + bConversions) / (aImpressions + bImpressions);
  const se = Math.sqrt(p * (1 - p) * (1 / aImpressions + 1 / bImpressions));
  if (se === 0) return false;
  const z  = Math.abs(pb - pa) / se;
  const threshold = confidence >= 99 ? 2.576 : confidence >= 95 ? 1.96 : 1.645;
  return z >= threshold && pb > pa;
}

export const ABTestService = {

  async list(organizationId: string): Promise<IWidgetABTest[]> {
    const docs = await WidgetABTestModel.find({ organizationId }).sort({ createdAt: -1 });
    return docs.map(d => d.toJSON() as unknown as IWidgetABTest);
  },

  async getById(organizationId: string, id: string): Promise<IWidgetABTest> {
    const doc = await WidgetABTestModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'A/B test not found', 'ABTEST_NOT_FOUND');
    return doc.toJSON() as unknown as IWidgetABTest;
  },

  async create(organizationId: string, data: {
    name:     string;
    variants: Array<{ name: string; trafficPercent: number; configOverride: Record<string, unknown> }>;
    goal:     IWidgetABTest['goal'];
  }): Promise<IWidgetABTest> {
    const total = data.variants.reduce((s, v) => s + v.trafficPercent, 0);
    if (total !== 100) throw new ApiError(422, 'Variant traffic percentages must sum to 100', 'INVALID_TRAFFIC_SPLIT');

    const { randomUUID } = await import('crypto');
    const variants: IABVariant[] = data.variants.map(v => ({
      id:             randomUUID(),
      name:           v.name,
      trafficPercent: v.trafficPercent,
      configOverride: v.configOverride,
      impressions: 0, opens: 0, leads: 0, bookings: 0,
    }));

    const doc = await WidgetABTestModel.create({ organizationId, name: data.name, variants, goal: data.goal });
    return doc.toJSON() as unknown as IWidgetABTest;
  },

  async start(organizationId: string, id: string): Promise<IWidgetABTest> {
    const doc = await WidgetABTestModel.findOneAndUpdate(
      { _id: id, organizationId, status: 'draft' },
      { status: 'running', startedAt: new Date() },
      { new: true }
    );
    if (!doc) throw new ApiError(404, 'Test not found or already started', 'ABTEST_NOT_FOUND');
    return doc.toJSON() as unknown as IWidgetABTest;
  },

  async pause(organizationId: string, id: string): Promise<IWidgetABTest> {
    const doc = await WidgetABTestModel.findOneAndUpdate(
      { _id: id, organizationId },
      { status: 'paused' },
      { new: true }
    );
    if (!doc) throw new ApiError(404, 'Test not found', 'ABTEST_NOT_FOUND');
    return doc.toJSON() as unknown as IWidgetABTest;
  },

  /** Record an event for a variant (called from widget analytics endpoint). */
  async recordVariantEvent(
    testId:    string,
    variantId: string,
    eventType: 'impression' | 'open' | 'lead' | 'booking',
  ): Promise<void> {
    const field = eventType === 'impression' ? 'variants.$.impressions'
                : eventType === 'open'       ? 'variants.$.opens'
                : eventType === 'lead'       ? 'variants.$.leads'
                : 'variants.$.bookings';
    await WidgetABTestModel.findOneAndUpdate(
      { _id: testId, 'variants.id': variantId },
      { $inc: { [field]: 1 } }
    );
  },

  /** Check if a winner can be declared and promote it. */
  async checkAndPromoteWinner(organizationId: string, id: string, userId: string): Promise<IWidgetABTest> {
    const test = await WidgetABTestModel.findOne({ _id: id, organizationId });
    if (!test || test.status !== 'running') throw new ApiError(400, 'Test is not running', 'INVALID_STATUS');

    const goal    = test.goal;
    const metric  = (v: IABVariant) =>
      goal === 'leads' ? v.leads : goal === 'bookings' ? v.bookings : v.opens;

    const sorted = [...(test.variants as IABVariant[])]
      .sort((a, b) => metric(b) / Math.max(b.impressions, 1) - metric(a) / Math.max(a.impressions, 1));

    const winner  = sorted[0];
    const runner  = sorted[1];

    if (!winner || !runner) return test.toJSON() as unknown as IWidgetABTest;

    const significant = isSignificant(
      runner.impressions, metric(runner),
      winner.impressions, metric(winner),
      test.confidenceLevel,
    );

    if (!significant) return test.toJSON() as unknown as IWidgetABTest;

    // Apply winner config override to live widget
    await WidgetConfigService.update(organizationId, winner.configOverride as any);
    await WidgetConfigService.publish(organizationId, userId, `A/B test winner: ${winner.name}`);

    const updated = await WidgetABTestModel.findByIdAndUpdate(
      id,
      { status: 'completed', winnerVariantId: winner.id, endedAt: new Date() },
      { new: true }
    );
    return updated!.toJSON() as unknown as IWidgetABTest;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    await WidgetABTestModel.findOneAndDelete({ _id: id, organizationId });
  },

  /** Select which variant to show based on traffic split (deterministic by sessionId). */
  selectVariant(test: IWidgetABTest, sessionId: string): IABVariant | null {
    if (test.status !== 'running' || !test.variants.length) return null;
    // Deterministic: hash session ID to 0-100 bucket
    let hash = 0;
    for (let i = 0; i < sessionId.length; i++) {
      hash = (hash * 31 + sessionId.charCodeAt(i)) & 0xffffffff;
    }
    const bucket  = Math.abs(hash) % 100;
    let cumulative = 0;
    for (const variant of test.variants as IABVariant[]) {
      cumulative += variant.trafficPercent;
      if (bucket < cumulative) return variant;
    }
    return test.variants[0] as IABVariant;
  },
};
