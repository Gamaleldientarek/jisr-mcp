/**
 * Payroll deletion target re-validation (T026, spec FR-018, quickstart W6).
 *
 * Between prepare and commit the world can move. The commit re-reads its
 * target and refuses if it changed or vanished -- a stale preview must never
 * authorize a deletion.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AppConfig } from '../../src/config/environment.js';
import { createFeatureFlags } from '../../src/config/feature-flags.js';
import { UNPROBED } from '../../src/core/authorization/capabilities.js';
import { createPrincipal } from '../../src/core/authorization/principal.js';
import { TokenCache } from '../../src/core/jisr/authentication.js';
import { JisrClient } from '../../src/core/jisr/client.js';
import {
  commitPayrollDelete,
  preparePayrollDelete,
} from '../../src/core/services/payroll-delete-service.js';
import { payrollDeletePrepareTool } from '../../src/core/tools/finance/payroll-delete.js';
import { inputSchemaOf, type ToolContext } from '../../src/core/tools/registry.js';
import { resetConsumedReferences } from '../../src/core/writes/confirmation.js';
import { resetDuplicateGuard } from '../../src/core/writes/duplicate-guard.js';
import { AUTH_SUCCESS } from '../fixtures/jisr/index.js';
import { refusalFrom } from '../helpers.js';

const ORG = 'org-pay-del-001';

const TRANSACTION = {
  id: 501,
  amount: 750,
  category: 'allowance',
  pay_type: 'addition',
  effective_date: '2026-08-01',
};

function transactionsBody(transactions: object[]): object {
  return {
    success: true,
    data: {
      employees: [
        {
          id: 1,
          code: 1001,
          full_name_en: 'Fictional Employee One',
          transactions,
        },
      ],
      pagination: { current_page: 1, next_page: null, previous_page: null, total_pages: 1 },
    },
  };
}

/**
 * A mutable world: the transactions the list returns can be swapped between
 * calls, and DELETE calls are recorded.
 */
function harness(): {
  context: ToolContext;
  world: { transactions: object[] };
  deletes: string[];
} {
  const world = { transactions: [TRANSACTION] as object[] };
  const deletes: string[] = [];
  const fetchStub = ((input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (method === 'DELETE') {
      deletes.push(url);
      // The simulated world honors the deletion, so the commit's own re-read
      // can observe the absence.
      world.transactions = [];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, message: null, data: null }),
      } as Response);
    }
    const body = url.includes('/auth') ? AUTH_SUCCESS : transactionsBody(world.transactions);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);
  }) as unknown as typeof fetch;

  const config: AppConfig = {
    organizationId: ORG,
    baseUrl: 'https://apis.jisr.net/api',
    hostType: 'aws',
    slug: 'acme',
    credentials: { apiKey: 'k', apiSecret: 's' },
    financeCredentials: undefined,
    roleProfile: 'finance',
    featureFlags: createFeatureFlags({
      financeSurfaceEnabled: true,
      writePayrollDelete: true,
    }),
    subjectEmployeeId: undefined,
    logLevel: 'error',
  };
  return {
    world,
    deletes,
    context: {
      principal: createPrincipal({ organizationId: ORG, profile: 'finance' }),
      flags: config.featureFlags,
      observed: UNPROBED,
      client: new JisrClient(config, new TokenCache(), fetchStub),
      connection: { hostType: 'aws' },
    },
  };
}

beforeEach(() => {
  resetConsumedReferences();
  resetDuplicateGuard();
});

async function prepared(context: ToolContext): Promise<string> {
  const result = await preparePayrollDelete(
    { transactionId: 501, reason: 'Duplicate allowance entry' },
    context,
  );
  return (result.structuredContent as { confirmationReference: string }).confirmationReference;
}

describe('target re-validation at commit', () => {
  it('deletes an unchanged target and confirms its absence by re-read', async () => {
    const { context, deletes } = harness();
    const reference = await prepared(context);

    const committed = await commitPayrollDelete({ confirmationReference: reference }, context);
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toContain('/payroll_transactions/501');
    const content = committed.structuredContent as {
      deletion: { transactionId: number; confirmedGone: boolean };
    };
    expect(content.deletion.transactionId).toBe(501);
    expect(content.deletion.confirmedGone).toBe(true);
    expect(committed.summary).toContain('re-read confirms it is gone');
  });

  it('refuses WRITE_TARGET_CHANGED when the target moved after prepare', async () => {
    const { context, world, deletes } = harness();
    const reference = await prepared(context);
    world.transactions = [{ ...TRANSACTION, amount: 9999 }];

    const error = await refusalFrom(() =>
      commitPayrollDelete({ confirmationReference: reference }, context),
    );
    expect(error.code).toBe('WRITE_TARGET_CHANGED');
    expect(deletes).toEqual([]);
  });

  it('refuses RECORD_NOT_FOUND when the target vanished after prepare', async () => {
    const { context, world, deletes } = harness();
    const reference = await prepared(context);
    world.transactions = [];

    const error = await refusalFrom(() =>
      commitPayrollDelete({ confirmationReference: reference }, context),
    );
    expect(error.code).toBe('RECORD_NOT_FOUND');
    expect(deletes).toEqual([]);
  });

  it('requires a reason at prepare', async () => {
    const { context } = harness();
    const error = await refusalFrom(() =>
      preparePayrollDelete({ transactionId: 501, reason: '  ' }, context),
    );
    expect(error.code).toBe('REASON_REQUIRED');
  });

  it('refuses an unknown transaction at prepare', async () => {
    const { context } = harness();
    const error = await refusalFrom(() =>
      preparePayrollDelete({ transactionId: 999999, reason: 'x' }, context),
    );
    expect(error.code).toBe('RECORD_NOT_FOUND');
  });

  it('refuses any multi-target form at the schema', () => {
    const schema = inputSchemaOf(payrollDeletePrepareTool);
    expect(schema.safeParse({ transactionId: [501, 502], reason: 'batch' }).success).toBe(false);
    for (const field of Object.values(payrollDeletePrepareTool.inputShape)) {
      expect(field instanceof z.ZodArray).toBe(false);
    }
  });
});
