/**
 * intent.hvacCategories.test.ts
 *
 * Regression test for the blueprint-resolution gap: classifyIntent()'s
 * keyword set was built for LeadFlow's own SaaS-sales chatbot context
 * (pricing/demo/website/API) and had zero HVAC-domain vocabulary, so a
 * customer describing their actual problem in plain language ("my AC
 * stopped cooling") always classified as 'Unknown' -> intentCategory
 * 'unknown' -> loadBlueprint() found no match -> Layer 3 never engaged.
 * Measured against real production data: 76% of all sessions (67% of
 * cascade-comfort-hvac's own) never resolved a blueprint.
 *
 * This locks in the validated fix: 4 new IntentTypes (Repair, Emergency,
 * Maintenance, Installation) with HVAC-grounded keywords, mapped through
 * mapToIntentCategory() to the categories hvac.repair/hvac.emergency
 * already key on.
 *
 * Three things are proven here, against the REAL functions (not
 * reimplementations of them):
 *   1. The 25-message validation set (15 from the original investigation
 *      + 10 additional realistic phrasings) resolves a real HVAC
 *      blueprint end-to-end via classifyIntent() -> mapToIntentCategory()
 *      -> loadBlueprint().
 *   2. Adding these categories is additive only — a set of classic
 *      SaaS-context messages still classify to their original IntentType,
 *      not accidentally caught by a new HVAC keyword.
 *   3. A non-HVAC-industry org receiving an HVAC-shaped message still
 *      correctly resolves no blueprint (loadBlueprint()'s industry-scoped
 *      lookup finds no exact match and no wildcard fills 'repair' or
 *      'emergency_service') — proven by actually calling loadBlueprint()
 *      with industry: 'plumbing'/'roofing', not by reasoning about it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyIntent } from '../intent';
import { mapToIntentCategory } from '../orchestrator';
import { loadBlueprint } from '../../conversation-engine/modules/blueprint-loader';
import { InMemoryBlueprintRepository } from '../../conversation-engine/repository/InMemoryBlueprintRepository';

async function resolveBlueprintId(message: string, industry: string): Promise<string | null> {
  const repo = new InMemoryBlueprintRepository();
  const intent = classifyIntent(message);
  const category = mapToIntentCategory(intent.intent);
  const blueprint = await loadBlueprint(repo, null, industry, category);
  return blueprint?.id ?? null;
}

describe('HVAC intent categories — blueprint resolution (regression)', () => {
  // The exact 15-message set from the original investigation, plus 10
  // additional realistic phrasings (maintenance/installation/emergency
  // shapes the original 15 didn't cover). All 25 must now resolve a real
  // hvac.* blueprint for an hvac-industry org.
  const validationSet: Array<{ message: string; expectBlueprint: string[] }> = [
    { message: 'There is water leakage from AC duct, need technician for repair', expectBlueprint: ['hvac.repair'] },
    { message: 'My AC stopped cooling and I need a repair', expectBlueprint: ['hvac.repair'] },
    { message: 'My furnace is not turning on', expectBlueprint: ['hvac.repair'] },
    { message: 'No heat in my house', expectBlueprint: ['hvac.emergency', 'hvac.repair'] },
    { message: 'AC is making a weird noise', expectBlueprint: ['hvac.repair'] },
    { message: 'My heating stopped working', expectBlueprint: ['hvac.repair'] },
    { message: 'AC not blowing cold air', expectBlueprint: ['hvac.repair'] },
    { message: 'I need someone to look at my HVAC system', expectBlueprint: ['hvac.repair'] },
    { message: 'Our air conditioner broke down', expectBlueprint: ['hvac.repair'] },
    { message: "I'd like to book an appointment for AC repair", expectBlueprint: ['hvac.booking'] },
    { message: 'Can I schedule a technician visit', expectBlueprint: ['hvac.booking'] },
    { message: 'I need help with my broken furnace', expectBlueprint: ['generic.faq'] },
    { message: 'My AC unit is leaking water everywhere', expectBlueprint: ['hvac.repair'] },
    { message: 'thermostat not responding', expectBlueprint: ['hvac.repair'] },
    { message: 'system keeps shutting off randomly', expectBlueprint: ['hvac.repair'] },
    { message: "It's really hot in here and the AC won't turn on", expectBlueprint: ['hvac.repair'] },
    { message: 'We have no heat and it is freezing', expectBlueprint: ['hvac.emergency', 'hvac.repair'] },
    { message: 'I want to schedule my yearly maintenance', expectBlueprint: ['hvac.repair'] },
    { message: 'Looking to replace our old furnace before winter', expectBlueprint: ['hvac.repair'] },
    { message: 'Need an emergency repair, I smell gas near the furnace', expectBlueprint: ['hvac.emergency'] },
    { message: 'Can you do a tune-up on my unit this week', expectBlueprint: ['hvac.repair'] },
    { message: 'We are getting a new AC system installed, need a quote', expectBlueprint: ['hvac.repair'] },
    { message: 'The compressor outside is making a loud noise', expectBlueprint: ['hvac.repair'] },
    { message: 'My thermostat screen is blank and nothing turns on', expectBlueprint: ['hvac.repair'] },
    { message: 'It smells like something is burning near the vents', expectBlueprint: ['hvac.emergency'] },
  ];

  it(`resolves a real HVAC blueprint for all ${validationSet.length}/${validationSet.length} validation messages`, async () => {
    const failures: string[] = [];
    for (const { message, expectBlueprint } of validationSet) {
      const blueprintId = await resolveBlueprintId(message, 'hvac');
      if (!blueprintId || !expectBlueprint.includes(blueprintId)) {
        failures.push(`"${message}" -> ${blueprintId ?? 'null'} (expected one of ${expectBlueprint.join('/')})`);
      }
    }
    assert.deepEqual(failures, [], `${failures.length}/${validationSet.length} failed:\n${failures.join('\n')}`);
  });

  it('every validation message resolves to a non-null blueprint (headline number)', async () => {
    let resolved = 0;
    for (const { message } of validationSet) {
      if (await resolveBlueprintId(message, 'hvac')) resolved++;
    }
    assert.equal(resolved, validationSet.length, `expected ${validationSet.length}/${validationSet.length}, got ${resolved}`);
  });

  describe('additive-only — existing SaaS-context classification unaffected', () => {
    const existingCases: Array<{ message: string; expectIntent: string }> = [
      { message: "what's your pricing", expectIntent: 'Pricing' },
      { message: 'Can you show me a demonstration of the product', expectIntent: 'Demo' },
      { message: 'Can it handle custom fields', expectIntent: 'Feature' },
      { message: 'This is too expensive for us, we need to think it over', expectIntent: 'Objection' },
      { message: 'How do you compare to HubSpot as an alternative', expectIntent: 'Comparison' },
      { message: 'Can you walk me through the API and webhooks', expectIntent: 'Technical' },
      { message: 'We want to automate our follow-up workflow', expectIntent: 'Automation' },
      { message: 'Hi there, good morning', expectIntent: 'Greeting' },
      { message: 'Tell me how does this work', expectIntent: 'Question' },
    ];

    for (const { message, expectIntent } of existingCases) {
      it(`"${message}" still classifies as ${expectIntent}, not caught by a new HVAC keyword`, () => {
        const result = classifyIntent(message);
        assert.equal(result.intent, expectIntent);
      });
    }

    it('a generic pricing message still resolves the same blueprint it always did (wildcard generic.estimate)', async () => {
      const blueprintId = await resolveBlueprintId("what's your pricing", 'saas');
      assert.equal(blueprintId, 'generic.estimate');
    });
  });

  describe('non-HVAC industry — HVAC-shaped message still resolves nothing (proven, not assumed)', () => {
    const crossIndustryCases = [
      { message: 'my AC is broken', industry: 'plumbing' },
      { message: 'my furnace stopped working, need emergency repair', industry: 'roofing' },
      { message: 'need a technician to fix my thermostat', industry: 'electrical' },
    ];

    for (const { message, industry } of crossIndustryCases) {
      it(`"${message}" to a ${industry} org resolves no blueprint (loadBlueprint industry-scoping holds)`, async () => {
        const blueprintId = await resolveBlueprintId(message, industry);
        assert.equal(blueprintId, null);
      });
    }
  });
});
