/**
 * LeadService.phoneCapture.test.ts
 *
 * Regression coverage for phone-collected lead capture: a Lead is created
 * the moment a phone number is captured mid-conversation, independent of
 * whether booking ever completes (ai/orchestrator.ts step 3b). Dedup is
 * mandatory — a repeat trigger for the same conversation, or a later
 * widgetBook() call, must never create a second Lead.
 *
 * Mocks LeadModel directly (no live Mongo connection here) so the dedup
 * logic is verified against the real query filters LeadService sends.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { LeadModel } from '../../models/Lead.model';
import { LeadService } from '../LeadService';
import { ActivityService } from '../../crm/activities/ActivityService';
import { AutomationService } from '../../crm/automation/AutomationService';
import { WorkflowEngine } from '../../automation/engine/WorkflowEngine';

const ORG_A = 'org-aaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'org-bbbbbbbbbbbbbbbbbbbbbbbb';
const CONV_ID = 'conv-11111111-1111-1111-1111-111111111111';

describe('LeadService — phone-collected capture (dedup regression)', () => {
  let store: any[];
  let findOneMock: ReturnType<typeof mock.method>;
  let createMock: ReturnType<typeof mock.method>;
  let activityLogMock: ReturnType<typeof mock.method>;
  let automationFireMock: ReturnType<typeof mock.method>;
  let workflowTriggerMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    store = [];
    findOneMock = mock.method(LeadModel, 'findOne', (filter: any) => {
      const doc = store.find(d => d.organizationId === filter.organizationId && d.conversationId === filter.conversationId);
      return Promise.resolve(doc ? { ...doc, toJSON: () => doc } : null);
    });
    createMock = mock.method(LeadModel, 'create', async (data: any) => {
      const doc = { _id: `lead-${store.length + 1}`, id: `lead-${store.length + 1}`, ...data };
      store.push(doc);
      return { ...doc, toJSON: () => doc };
    });
    // LeadService.create() fires these as real side effects (activity log,
    // legacy automation rules, workflow engine) — none of them are under
    // test here, and without a live Mongo connection they hang on a 10s
    // buffering timeout each. Stub them to no-ops, same as this suite stubs
    // LeadModel itself.
    activityLogMock      = mock.method(ActivityService, 'log', () => Promise.resolve());
    automationFireMock    = mock.method(AutomationService, 'fire', () => {});
    workflowTriggerMock   = mock.method(WorkflowEngine, 'trigger', () => {});
  });

  afterEach(() => {
    findOneMock.mock.restore();
    createMock.mock.restore();
    activityLogMock.mock.restore();
    automationFireMock.mock.restore();
    workflowTriggerMock.mock.restore();
  });

  it('creates a real Lead on first capture', async () => {
    const lead = await LeadService.captureFromPhoneCollected(ORG_A, CONV_ID, {
      name: 'Siri', phone: '5552019988',
    });
    assert.equal(createMock.mock.calls.length, 1);
    assert.equal(lead.phone, '5552019988');
    assert.equal((lead as any).conversationId, CONV_ID);
    assert.equal((lead as any).source, 'widget');
    assert.equal((lead as any).status, 'New');
  });

  it('a second capture for the SAME conversation is a no-op — exactly one Lead', async () => {
    const first  = await LeadService.captureFromPhoneCollected(ORG_A, CONV_ID, { name: 'Siri', phone: '5552019988' });
    const second = await LeadService.captureFromPhoneCollected(ORG_A, CONV_ID, { name: 'Siri', phone: '5552019988' });
    assert.equal(createMock.mock.calls.length, 1, 'must not create a second Lead for the same conversation');
    assert.equal(first.id, second.id);
  });

  it('findByConversationId is scoped by organizationId — a different org never matches', async () => {
    await LeadService.captureFromPhoneCollected(ORG_A, CONV_ID, { name: 'Siri', phone: '5552019988' });
    const foundInOwnOrg   = await LeadService.findByConversationId(ORG_A, CONV_ID);
    const foundInOtherOrg = await LeadService.findByConversationId(ORG_B, CONV_ID);
    assert.ok(foundInOwnOrg, 'lead should be found in its own org');
    assert.equal(foundInOtherOrg, null, 'the same conversationId must not leak across organizations');
  });

  it('falls back to a safe placeholder name when phone is collected before a name', async () => {
    // Mirrors the real trigger condition in ai/orchestrator.ts: emergency_triage's
    // own completionCriteria is phoneCollected alone, so name may not exist yet.
    const lead = await LeadService.captureFromPhoneCollected(ORG_A, CONV_ID, { name: 'Unknown Caller', phone: '5552019988' });
    assert.equal(lead.name, 'Unknown Caller');
  });
});
