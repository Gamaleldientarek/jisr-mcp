/**
 * Upstream stub for the e2e WRITE round trip (T032).
 *
 * Loaded into the server process via NODE_OPTIONS=--import BEFORE the entry
 * module, replacing global fetch so no request leaves the process. Writes are
 * NEVER exercised against live Jisr during development (quickstart W2); the
 * approved-host validation on JISR_BASE_URL stays untouched.
 *
 * The stub also reports its call counts: the python driver asks for them via
 * the magic URL used below, so it can prove prepare POSTed nothing.
 */

const counts = { posts: 0 };

// The re-read intentionally differs from any submission: SC-004 on the wire.
const RE_READ_PUNCH = {
  id: 987654,
  punch_time: '2026-08-31 09:00:03',
  employee_code: 1001,
  terminal_sn: 'SRV-NORMALIZED',
  clocking_id: 555,
};

const EMPLOYEES = {
  success: true,
  message: null,
  data: {
    employees: [
      {
        employee_id: '00000000-0000-4000-8000-000000000001',
        code: 1001,
        full_name_en: 'Fictional Employee One',
        full_name_ar: 'موظف افتراضي واحد',
        status: 'active',
        is_active: true,
      },
    ],
    pagination: { current_page: 1, next_page: null, previous_page: null, total_pages: 1 },
  },
};

function jsonResponse(body) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = init?.method ?? 'GET';

  if (url.includes('/__stub_counts')) return jsonResponse(counts);
  if (url.includes('/auth')) {
    return jsonResponse({ success: true, message: null, data: 'stub-token-not-a-credential' });
  }
  if (url.includes('/attendance_logs') && method === 'POST') {
    counts.posts += 1;
    return jsonResponse({ success: true, message: null, data: null });
  }
  if (url.includes('/attendance_logs')) {
    return jsonResponse({
      success: true,
      message: null,
      data: {
        punches: [RE_READ_PUNCH],
        pagination: { current_page: 1, next_page: null, previous_page: null, total_pages: 1 },
      },
    });
  }
  if (url.includes('/employees')) return jsonResponse(EMPLOYEES);
  return jsonResponse({ success: true, message: null, data: {} });
};
