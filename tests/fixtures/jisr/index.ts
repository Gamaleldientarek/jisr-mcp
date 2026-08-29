/**
 * Test fixtures (spec FR-042).
 *
 * Shapes are taken from the approved snapshot; VALUES are invented. No real
 * employee, payroll, or credential data may exist anywhere in this repository,
 * and "it's only a fixture" is exactly how such data gets committed.
 *
 * Names use obviously-fictional people. Identifiers are structurally valid but
 * meaningless. Salary figures are round numbers no payroll would produce.
 */

export const AUTH_SUCCESS = {
  success: true,
  message: null,
  data: 'test-access-token-not-a-real-credential',
};

/** As returned when the connected key HOLDS finance permission (research R2). */
export const EMPLOYEES_WITH_FINANCE = {
  success: true,
  message: null,
  data: {
    employees: [
      {
        employee_id: '00000000-0000-4000-8000-000000000001',
        code: 1001,
        full_name_en: 'Fictional Employee One',
        full_name_ar: 'موظف افتراضي واحد',
        email: 'one@example.invalid',
        status: 'active',
        is_active: true,
        joining_date: '2020-01-01',
        department: { id: 1, name_en: 'Engineering', name_ar: 'الهندسة' },
        line_manager: { id: 9001, name: 'Fictional Manager' },
        passport_number: 'X0000001',
        document_number: 'D0000001',
        date_of_birth: '1990-01-01',
        basic_salary: 10000,
        first_salary_pay_date: '2020-02-01',
        last_salary_pay_date: null,
      },
    ],
    pagination: {
      current_page: 1,
      next_page: 2,
      previous_page: null,
      total_pages: 3,
      per_page: 1,
      total_entries: 3,
    },
  },
};

/** As returned when the key does NOT hold finance permission. */
export const EMPLOYEES_WITHOUT_FINANCE = {
  success: true,
  message: null,
  data: {
    employees: [
      {
        employee_id: '00000000-0000-4000-8000-000000000002',
        code: 1002,
        full_name_en: 'Fictional Employee Two',
        full_name_ar: 'موظف افتراضي اثنان',
        status: 'active',
        is_active: true,
      },
    ],
    pagination: {
      current_page: 1,
      next_page: null,
      previous_page: null,
      total_pages: 1,
      per_page: 50,
      total_entries: 1,
    },
  },
};

export const ATTENDANCE_SUMMARY = {
  success: true,
  message: null,
  data: {
    records: [
      {
        code: 1001,
        name: 'Fictional Employee One',
        total_working_hours: '160:00',
        total_working_hours_inside_the_shifts: '158:30',
        late_arrival: '00:45',
        excuse_late_arrival: '00:15',
        early_departure: '00:00',
        excuse_early_departure: '00:00',
        extra_working_time: '02:00',
        approved_overtime: '01:00',
        absence: 0,
        no_records: 0,
        leave_days: 2,
        off_days: 8,
        full_day_excuses: 0,
        late_arrival_days: 3,
        early_departure_days: 0,
        // Spelled exactly as Jisr spells it (data-model §4).
        businiess_trip_days: 1,
      },
    ],
    pagination: {
      current_page: 1,
      next_page: null,
      previous_page: null,
      total_pages: 1,
      per_page: 100,
      total_entries: 1,
    },
  },
};

export const DEPARTMENTS = {
  success: true,
  message: null,
  data: {
    departments: [
      { id: 1, name_en: 'Engineering', name_ar: 'الهندسة' },
      { id: 2, name_en: 'Finance', name_ar: 'المالية' },
    ],
    pagination: {
      current_page: 1,
      next_page: null,
      previous_page: null,
      total_pages: 1,
      per_page: 100,
      total_entries: 2,
    },
  },
};

/** Carries invented authentication material, to prove it is stripped. */
export const WEBHOOKS = {
  success: true,
  message: null,
  data: {
    subscriptions: [
      {
        id: 1,
        name: 'Fictional downstream sync',
        description: 'Test subscription',
        endpoint: 'https://downstream.example.invalid/hook',
        http_method: 'POST',
        request_format: 'json',
        status: 'active',
        auth_type: 'Bearer',
        auth_position: 'header',
        auth_data: 'Bearer invented-token-value-for-tests',
        custom_header: { 'X-Api-Key': 'invented-api-key-for-tests' },
        actions: [{ id: 1, name_en: 'employee.created', name_ar: 'إنشاء موظف', status: 'active' }],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
    ],
    pagination: {
      current_page: 1,
      next_page: null,
      previous_page: null,
      total_pages: 1,
      per_page: 100,
      total_entries: 1,
    },
  },
};

/** A minimal fetch stand-in that replays queued responses. */
export function stubFetch(responses: readonly { status?: number; body?: unknown }[]): {
  fetch: typeof fetch;
  calls: { url: string; headers: Record<string, string> }[];
} {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  let index = 0;

  const impl = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });

    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    const status = next?.status ?? 200;

    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(next?.body ?? {}),
    } as Response);
  };

  return { fetch: impl, calls };
}
