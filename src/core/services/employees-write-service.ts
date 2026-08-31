/**
 * Employee write service (feature 002, US2, spec FR-014, FR-015).
 *
 * Prepare resolves every lookup id LIVE, enforces the two-part name rule and
 * enum exactness, and pre-reads for duplicates by code and exact name. A
 * duplicate match becomes a warning the commit must explicitly acknowledge --
 * never a silent second record.
 */

import { z } from 'zod';
import { authorizeTool } from '../authorization/policies.js';
import { buildEnvelope, type ResultEnvelope } from '../envelope.js';
import { JisrMcpError } from '../errors.js';
import { toUpstreamParams } from '../jisr/pagination.js';
import { employeesListSchema } from '../jisr/schemas/employees.js';
import { lookupListSchema, type LookupName } from '../jisr/schemas/lookups.js';
import { employeeCreateResponseSchema, type EmployeeSubmission } from '../jisr/schemas/writes.js';
import { LOOKUPS } from './lookups-service.js';
import type { ToolContext, ToolResult } from '../tools/registry.js';
import { consumeReference, hashTarget, issueReference } from '../writes/confirmation.js';
import { assertNotDuplicate } from '../writes/duplicate-guard.js';
import { submitGuarded } from '../writes/outcome.js';
import { previewSummary } from '../writes/preview.js';

const OPERATION = 'createEmployee';
const RE_READ_TOOL = 'jisr_employees_list';
const SCAN_MAX_PAGES = 5;

const twoPartName = (label: string) =>
  z
    .string()
    .trim()
    .refine((value) => value.split(/\s+/).length >= 2, {
      message: `${label} must contain at least a first and a last name.`,
    });

/**
 * The prepare input, shared verbatim with the tool's inputShape so the
 * boundary and the service enforce the SAME rules (enum exactness included).
 */
export const employeeCreateInputShape = {
  code: z.union([z.string(), z.number()]).describe('The new employee code. Must be unused.'),
  fullNameEn: twoPartName('fullNameEn').describe('Full English name, at least two parts.'),
  fullNameAr: twoPartName('fullNameAr').describe('Full Arabic name, at least two parts.'),
  departmentId: z
    .union([z.string(), z.number()])
    .optional()
    .describe('From jisr_departments_list.'),
  employmentTypeId: z
    .union([z.string(), z.number()])
    .optional()
    .describe('From jisr_employment_types_list.'),
  locationId: z.union([z.string(), z.number()]).optional().describe('From jisr_locations_list.'),
  nationalityId: z
    .union([z.string(), z.number()])
    .optional()
    .describe('From jisr_nationalities_list.'),
  joiningDate: z.string().optional().describe('YYYY-MM-DD.'),
  email: z.string().optional(),
  gender: z.enum(['Male', 'Female']).optional().describe("Jisr's exact enum."),
  maritalStatus: z.enum(['Single', 'Married', 'Divorced', 'Widowed']).optional(),
  documentNumber: z.string().optional(),
  contractType: z.enum(['Fixed term', 'Indefinite']).optional(),
  contractPeriod: z.enum(['1 year', '2 years', 'Custom']).optional(),
  endDate: z.string().optional().describe('YYYY-MM-DD, for fixed-term contracts.'),
} satisfies Record<string, z.ZodType>;

const employeeCreateInputSchema = z.object(employeeCreateInputShape);
export type EmployeeCreateInput = z.infer<typeof employeeCreateInputSchema>;

export interface EmployeeCommitInput {
  readonly confirmationReference: string;
  readonly acknowledgeDuplicates?: boolean;
}

/** Which lookup list each id field must resolve against, live. */
const LOOKUP_FIELDS: readonly {
  field: keyof EmployeeCreateInput;
  lookup: LookupName;
}[] = [
  { field: 'departmentId', lookup: 'departments' },
  { field: 'employmentTypeId', lookup: 'employment_types' },
  { field: 'locationId', lookup: 'locations' },
  { field: 'nationalityId', lookup: 'nationalities' },
];

async function resolveLookupId(
  lookup: LookupName,
  id: string | number,
  context: ToolContext,
): Promise<string> {
  const wanted = String(id);
  for (let page = 1; page <= SCAN_MAX_PAGES; page += 1) {
    const response = await context.client.request(lookupListSchema(lookup), {
      operationId: LOOKUPS[lookup].operationId,
      query: toUpstreamParams(page, 100),
    });
    const items = (response.data as Record<string, unknown>)[lookup] as {
      id?: string | number | null;
      name_en?: string | null;
    }[];
    const match = items.find((item) => String(item.id ?? '') === wanted);
    if (match !== undefined) return match.name_en ?? wanted;
    if (items.length < 100) break;
  }
  throw new JisrMcpError(
    'RECORD_NOT_FOUND',
    `No ${lookup.replace('_', ' ')} entry has the id ${wanted}.`,
    `Resolve the id with ${LOOKUPS[lookup].tool} first. Nothing was written.`,
  );
}

interface DuplicateHit {
  readonly kind: 'code' | 'name';
  readonly value: string;
}

async function findDuplicates(
  input: EmployeeCreateInput,
  context: ToolContext,
): Promise<DuplicateHit[]> {
  // One bounded scan; a tenant larger than the scan window is a documented
  // limitation (research W5), not a silent pass.
  const hits: DuplicateHit[] = [];
  const wantedCode = String(input.code);
  for (let page = 1; page <= SCAN_MAX_PAGES; page += 1) {
    const response = await context.client.request(employeesListSchema, {
      operationId: 'listEmployees',
      query: toUpstreamParams(page, 100),
    });
    for (const row of response.data.employees) {
      if (String(row.code ?? '') === wantedCode) {
        hits.push({ kind: 'code', value: wantedCode });
      } else if (
        (row.full_name_en !== null &&
          row.full_name_en !== undefined &&
          row.full_name_en.trim() === input.fullNameEn.trim()) ||
        (row.full_name_ar !== null &&
          row.full_name_ar !== undefined &&
          row.full_name_ar.trim() === input.fullNameAr.trim())
      ) {
        hits.push({ kind: 'name', value: row.full_name_en ?? row.full_name_ar ?? '' });
      }
    }
    if (response.data.employees.length < 100) break;
  }
  return hits;
}

function toSubmission(input: EmployeeCreateInput): EmployeeSubmission {
  return {
    code: input.code,
    full_name_en: input.fullNameEn,
    full_name_ar: input.fullNameAr,
    ...(input.departmentId === undefined ? {} : { department_id: input.departmentId }),
    ...(input.employmentTypeId === undefined ? {} : { employment_type_id: input.employmentTypeId }),
    ...(input.locationId === undefined ? {} : { location_id: input.locationId }),
    ...(input.nationalityId === undefined ? {} : { nationality_id: input.nationalityId }),
    ...(input.joiningDate === undefined ? {} : { joining_date: input.joiningDate }),
    ...(input.email === undefined ? {} : { email: input.email }),
    ...(input.gender === undefined ? {} : { gender: input.gender }),
    ...(input.maritalStatus === undefined ? {} : { marital_status: input.maritalStatus }),
    ...(input.documentNumber === undefined ? {} : { document_number: input.documentNumber }),
    ...(input.contractType === undefined ? {} : { contract_type: input.contractType }),
    ...(input.contractPeriod === undefined ? {} : { contract_period: input.contractPeriod }),
    ...(input.endDate === undefined ? {} : { end_date: input.endDate }),
  };
}

export async function prepareEmployeeCreate(
  rawInput: EmployeeCreateInput,
  context: ToolContext,
): Promise<ToolResult> {
  authorizeTool('jisr_employee_create_prepare', context);

  // The tool boundary applies the same schema; a direct caller gets the same
  // rules, not weaker ones.
  const input = employeeCreateInputSchema.parse(rawInput);

  const resolvedNames: Record<string, string> = {};
  for (const { field, lookup } of LOOKUP_FIELDS) {
    const id = input[field];
    if (id !== undefined) {
      resolvedNames[lookup] = await resolveLookupId(lookup, id, context);
    }
  }

  const duplicates = await findDuplicates(input, context);
  const warnings = duplicates.map((hit) =>
    hit.kind === 'code'
      ? `An employee with code ${hit.value} already exists. Committing requires acknowledgeDuplicates: true.`
      : `An employee named "${hit.value}" already exists. Committing requires acknowledgeDuplicates: true.`,
  );

  const submission = toSubmission(input);
  const { reference, expiresAt } = issueReference(
    {
      organizationId: context.principal.organizationId,
      principalRef: context.principal.reference,
      operationId: OPERATION,
      targetHash: hashTarget(submission),
    },
    { submission, hasDuplicateWarning: duplicates.length > 0 },
  );

  const action = `Create employee ${String(input.code)} (${input.fullNameEn})`;
  return {
    structuredContent: {
      preview: {
        action,
        submission,
        resolvedLookups: resolvedNames,
        duplicateWarning: duplicates.length > 0,
        warnings,
      },
      confirmationReference: reference,
      expiresAt,
    },
    summary: previewSummary(action, expiresAt, warnings),
    writeAudit: {
      phase: 'prepare',
      referencePrefix: reference.slice(0, 8),
      targetIds: [String(input.code)],
    },
  };
}

interface StashedEmployee {
  readonly submission: EmployeeSubmission;
  readonly hasDuplicateWarning: boolean;
}

export async function commitEmployeeCreate(
  input: EmployeeCommitInput,
  context: ToolContext,
): Promise<ToolResult> {
  authorizeTool('jisr_employee_create_commit', context);

  const stashed = consumeReference(input.confirmationReference, {
    organizationId: context.principal.organizationId,
    principalRef: context.principal.reference,
    operationId: OPERATION,
    targetHash: referenceTargetHash(input.confirmationReference),
  }) as StashedEmployee | undefined;
  if (stashed === undefined) {
    throw new JisrMcpError(
      'WRITE_PREPARATION_EXPIRED',
      'The prepared payload for this reference is no longer held.',
      'The server restarted or the preparation expired. Prepare again.',
    );
  }

  if (stashed.hasDuplicateWarning && input.acknowledgeDuplicates !== true) {
    throw new JisrMcpError(
      'DUPLICATE_WRITE_SUSPECTED',
      'The preview warned of an existing employee with the same code or name.',
      'If this is genuinely a different person, commit again with acknowledgeDuplicates: true. Nothing was written.',
    );
  }

  assertNotDuplicate(context.principal.organizationId, OPERATION, stashed.submission, {
    acknowledged: input.acknowledgeDuplicates === true,
  });

  const response = await submitGuarded(
    () =>
      context.client.request(employeeCreateResponseSchema, {
        operationId: OPERATION,
        body: stashed.submission,
      }),
    RE_READ_TOOL,
  );

  const createdId = response.data.employee?.id ?? response.data.employee?.employee_id ?? null;

  // Mandatory re-read: the documented create response may carry `id: null`
  // (research W1), so what Jisr now holds is read back rather than assumed.
  const reRead = await reReadEmployee(stashed.submission.code, context);
  const uuidFromReRead = reRead.records[0]?.id ?? null;

  return {
    structuredContent: {
      ...reRead.envelope,
      created: {
        idFromCreateResponse: createdId,
        idFromReRead: uuidFromReRead,
        idSource:
          createdId !== null ? 'create_response' : uuidFromReRead !== null ? 're_read' : 'unknown',
      },
    },
    summary:
      reRead.records.length > 0
        ? `Employee ${String(stashed.submission.code)} is created. ${
            createdId === null && uuidFromReRead !== null
              ? 'The create response carried no id; the UUID comes from the re-read.'
              : 'The record was re-read from Jisr.'
          }`
        : `The write was accepted, but the re-read did not find employee ${String(stashed.submission.code)} yet. Verify with ${RE_READ_TOOL} before assuming failure -- do not resubmit blindly.`,
    writeAudit: {
      phase: 'commit',
      referencePrefix: input.confirmationReference.slice(0, 8),
      targetIds: [String(stashed.submission.code)],
    },
  };
}

function referenceTargetHash(reference: string): string {
  const body = reference.slice(0, reference.lastIndexOf('.'));
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      targetHash?: string;
    };
    return parsed.targetHash ?? '';
  } catch {
    return '';
  }
}

interface ReReadEmployeeRecord {
  readonly id: string | null;
  readonly code: string | number | null;
  readonly fullNameEn: string | null;
  readonly fullNameAr: string | null;
  readonly status: string | null;
  readonly joiningDate: string | null;
}

async function reReadEmployee(
  code: string | number,
  context: ToolContext,
): Promise<{ envelope: ResultEnvelope<ReReadEmployeeRecord>; records: ReReadEmployeeRecord[] }> {
  const wanted = String(code);
  const records: ReReadEmployeeRecord[] = [];
  let receivedAt = new Date().toISOString();

  for (let page = 1; page <= SCAN_MAX_PAGES; page += 1) {
    const response = await context.client.request(employeesListSchema, {
      operationId: 'listEmployees',
      query: toUpstreamParams(page, 100),
    });
    receivedAt = response.receivedAt;
    for (const row of response.data.employees) {
      if (String(row.code ?? '') === wanted) {
        records.push({
          id: row.id ?? row.employee_id ?? null,
          code: row.code ?? null,
          fullNameEn: row.full_name_en ?? null,
          fullNameAr: row.full_name_ar ?? null,
          status: row.status ?? null,
          joiningDate: row.joining_date ?? null,
        });
      }
    }
    if (records.length > 0 || response.data.employees.length < 100) break;
  }

  return {
    records,
    envelope: buildEnvelope({
      operation: 'jisr_employee_create_commit',
      organizationId: context.principal.organizationId,
      dataAsOf: receivedAt,
      records,
      pageSize: 100,
      nextCursor: null,
      warnings:
        records.length === 0
          ? [
              {
                code: 'PARTIAL_RESULT',
                message:
                  'The write was accepted but the employee is not yet visible in the re-read.',
              },
            ]
          : [],
      isPartial: records.length === 0,
    }),
  };
}
