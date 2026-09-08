/**
 * ThemeService.tenantIsolation.test.ts
 *
 * Regression test for a confirmed cross-tenant IDOR: duplicate() (and, found
 * during the same fix, getById() — with a live caller via
 * WidgetConfigService.applyTheme() / POST /widget-platform/config/apply-theme)
 * read a WidgetTheme by _id alone (WidgetThemeModel.findById), with no
 * organizationId check. Any authenticated org could supply another org's
 * private custom theme id and clone or apply its colors/typography.
 *
 * Fix: both now query findOne({_id, $or: [{isSystem: true}, {organizationId}]})
 * — allowing every org to use system themes and their own, but not another
 * org's private ones.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { WidgetThemeModel } from '../../../models/WidgetTheme.model';
import { ThemeService } from '../ThemeService';
import { ApiError } from '../../../middleware/errorHandler';

const ORG_A     = 'org-aaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B     = 'org-bbbbbbbbbbbbbbbbbbbbbbbb';
const THEME_B_ID = 'theme-bbbbbbbbbbbbbbbbbbbbbb';
const SYSTEM_THEME_ID = 'theme-system-light';

interface FixtureTheme {
  _id: string; organizationId: string | null; isSystem: boolean; name: string;
  colors: Record<string, string>; typography: Record<string, string>;
  borderRadius: number; buttonStyle: string; shadowStyle: string; animation: string;
}

const orgBTheme: FixtureTheme = {
  _id: THEME_B_ID, organizationId: ORG_B, isSystem: false, name: 'Org B Private Theme',
  colors: { accentColor: '#111' }, typography: { fontFamily: 'Custom' },
  borderRadius: 8, buttonStyle: 'pill', shadowStyle: 'sm', animation: 'fade',
};

const systemTheme: FixtureTheme = {
  _id: SYSTEM_THEME_ID, organizationId: null, isSystem: true, name: 'Light',
  colors: { accentColor: '#6366f1' }, typography: { fontFamily: 'Inter' },
  borderRadius: 12, buttonStyle: 'rounded', shadowStyle: 'lg', animation: 'scale',
};

const docs: FixtureTheme[] = [orgBTheme, systemTheme];

function matchesOrClause(doc: typeof orgBTheme, clause: any): boolean {
  if ('isSystem' in clause) return doc.isSystem === clause.isSystem;
  if ('organizationId' in clause) return doc.organizationId === clause.organizationId;
  return false;
}

function findMatch(filter: any) {
  return docs.find(d => d._id === filter._id && (filter.$or as any[]).some(c => matchesOrClause(d, c))) ?? null;
}

describe('ThemeService — tenant isolation (IDOR regression)', () => {
  let findOneMock: ReturnType<typeof mock.method>;
  let createMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    findOneMock = mock.method(WidgetThemeModel, 'findOne', (filter: any) => {
      const doc = findMatch(filter);
      return Promise.resolve(doc ? { ...doc, toJSON: () => doc } : null);
    });
    createMock = mock.method(WidgetThemeModel, 'create', async (data: any) => ({
      ...data,
      toJSON: () => data,
    }));
  });

  afterEach(() => {
    findOneMock.mock.restore();
    createMock.mock.restore();
  });

  it('duplicate(): org A cannot duplicate org B\'s private theme — 404, no copy created', async () => {
    await assert.rejects(
      () => ThemeService.duplicate(THEME_B_ID, ORG_A, 'Stolen Theme'),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).statusCode, 404);
        return true;
      },
    );
    assert.equal(createMock.mock.calls.length, 0, 'must never create a copy when the source lookup is denied');
  });

  it('getById() (via applyTheme\'s call shape): org A cannot read org B\'s private theme — 404', async () => {
    await assert.rejects(
      () => ThemeService.getById(ORG_A, THEME_B_ID),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).statusCode, 404);
        return true;
      },
    );
  });

  it('duplicate(): org A CAN duplicate a system theme (sanity — every org may use system themes)', async () => {
    await ThemeService.duplicate(SYSTEM_THEME_ID, ORG_A, 'My Light Copy');
    assert.equal(createMock.mock.calls.length, 1);
    const createArgs = createMock.mock.calls[0].arguments[0] as any;
    assert.equal(createArgs.organizationId, ORG_A);
  });

  it('duplicate(): org B CAN duplicate its own theme (sanity — fix does not break legitimate access)', async () => {
    await ThemeService.duplicate(THEME_B_ID, ORG_B, 'My Copy');
    assert.equal(createMock.mock.calls.length, 1);
  });

  it('getById(): org B CAN read its own theme (sanity)', async () => {
    const theme = await ThemeService.getById(ORG_B, THEME_B_ID);
    assert.equal(theme.name, 'Org B Private Theme');
  });
});
