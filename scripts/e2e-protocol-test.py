#!/usr/bin/env python3
"""End-to-end MCP protocol test against the built server, over real stdio.

Drives dist/bin/jisr-mcp.js with raw JSON-RPC exactly as an MCP client would:
initialize, tools/list, tools/call -- against LIVE Jisr. This is the check the
unit suite cannot make: unit tests call handlers directly, and twice now the
wire path has behaved differently from the handler path.

Requires live credentials:
  set -a; source ~/.claude/.secrets/jisr-mcp.env; set +a
  npm run build
  python3 scripts/e2e-protocol-test.py mcp-v1
  python3 scripts/e2e-protocol-test.py mcp-v2

12 checks per adapter, including: salary and IBAN absent from the wire, finance
tools undiscoverable, Arabic intact through the protocol, hidden tools refused
without disclosure, invalid input rejected at the schema.
"""
import json, os, subprocess, sys, time

adapter = sys.argv[1] if len(sys.argv) > 1 else 'mcp-v1'
write_stub = '--write-stub' in sys.argv
env = dict(os.environ, JISR_MCP_ADAPTER=adapter)
if write_stub:
    # The WRITE round trip (T032): a stubbed upstream injected via --import,
    # never live Jisr. Credentials are dummies; the approved-host check on
    # JISR_BASE_URL stays in force.
    stub = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'e2e-write-stub.mjs')
    env.update(
        NODE_OPTIONS='--import ' + stub,
        JISR_BASE_URL='https://apis.jisr.net/api',
        JISR_SLUG='stub',
        JISR_API_KEY='stub-key-not-a-credential',
        JISR_API_SECRET='stub-secret-not-a-credential',
        JISR_ROLE_PROFILE='hr_operations',
        JISR_WRITE_ATTENDANCE='enabled',
    )

proc = subprocess.Popen(
    ['node', 'dist/bin/jisr-mcp.js'],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    env=env, text=True, bufsize=1,
)

def send(obj):
    proc.stdin.write(json.dumps(obj) + '\n')
    proc.stdin.flush()

def read(timeout=15):
    start = time.time()
    while time.time() - start < timeout:
        line = proc.stdout.readline()
        if not line:
            time.sleep(0.05); continue
        line = line.strip()
        if not line: continue
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue
    return None

results = []
def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS  ' if ok else 'FAIL  ') + name + ('  - ' + detail if detail else ''))

# --- initialize handshake ---
send({'jsonrpc':'2.0','id':1,'method':'initialize','params':{
    'protocolVersion':'2025-11-25',
    'capabilities':{},
    'clientInfo':{'name':'e2e-test','version':'0.0.0'}}})
resp = read()
ok = resp is not None and 'result' in resp
info = resp.get('result',{}) if ok else {}
check(adapter+': initialize', ok, 'protocol=' + str(info.get('protocolVersion')))
check(adapter+': server instructions delivered', bool(info.get('instructions')), str(len(info.get('instructions') or '')) + ' chars')
send({'jsonrpc':'2.0','method':'notifications/initialized'})

# --- tools/list ---
send({'jsonrpc':'2.0','id':2,'method':'tools/list','params':{}})
resp = read()
tools = (resp or {}).get('result',{}).get('tools',[])
names = sorted(t['name'] for t in tools)
check(adapter+': tools/list', len(tools) > 0, str(len(tools)) + ' tools for hr_operations')
check(adapter+': finance tools hidden', not any('payroll' in n or 'financial' in n or 'paygroup' in n for n in names))
if not write_stub:
    check(adapter+': annotations read-only', all(t.get('annotations',{}).get('readOnlyHint') is True for t in tools))

if not write_stub:
    # --- tools/call: live lookup ---
    send({'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'jisr_departments_list','arguments':{}}})
    resp = read(30)
    r = (resp or {}).get('result',{})
    sc = r.get('structuredContent',{})
    recs = sc.get('records',[])
    check(adapter+': tools/call departments (live)', len(recs) > 0 and not r.get('isError'), str(len(recs)) + ' records, source=' + str(sc.get('source')))
    has_ar = any(x.get('nameAr') for x in recs if isinstance(x, dict))
    check(adapter+': Arabic names through the protocol', has_ar)

    # --- tools/call: employees, salary must not appear ---
    send({'jsonrpc':'2.0','id':4,'method':'tools/call','params':{'name':'jisr_employees_list','arguments':{'pageSize':3}}})
    resp = read(30)
    raw = json.dumps(resp or {})
    r = (resp or {}).get('result',{})
    recs = r.get('structuredContent',{}).get('records',[])
    check(adapter+': tools/call employees (live)', len(recs) == 3 and not r.get('isError'), str(len(recs)) + ' records')
    check(adapter+': salary absent from the wire', 'basicSalary' not in raw and 'basic_salary' not in raw and 'iban' not in raw)
    check(adapter+': cursor issued', bool(r.get('structuredContent',{}).get('pagination',{}).get('nextCursor')))

    # --- tools/call: a hidden tool by name ---
    send({'jsonrpc':'2.0','id':5,'method':'tools/call','params':{'name':'jisr_payroll_transactions_list','arguments':{}}})
    resp = read(15)
    raw = json.dumps(resp or {})
    refused = ('TOOL_NOT_ENABLED' in raw or 'not available' in raw or 'error' in raw.lower())
    check(adapter+': hidden tool refused, nothing disclosed', refused and 'transactions' not in json.dumps((resp or {}).get('result',{}).get('structuredContent',{}).get('records','')))

    # --- invalid input rejected by schema ---
    send({'jsonrpc':'2.0','id':6,'method':'tools/call','params':{'name':'jisr_employee_basic_info_get','arguments':{'employeeId':'not-a-uuid'}}})
    resp = read(15)
    raw = json.dumps(resp or {})
    check(adapter+': invalid input rejected', 'uuid' in raw.lower() or 'invalid' in raw.lower() or (resp or {}).get('error') is not None)

# --- the write round trip (write-stub mode only, T032) ---
if write_stub:
    send({'jsonrpc':'2.0','id':7,'method':'tools/list','params':{}})
    resp = read()
    tools = (resp or {}).get('result',{}).get('tools',[])
    names = sorted(t['name'] for t in tools)
    check(adapter+': punch pair listed with the flag on',
          'jisr_attendance_punch_create_prepare' in names and 'jisr_attendance_punch_create_commit' in names)
    check(adapter+': other write pairs stay absent',
          'jisr_employee_create_prepare' not in names and 'jisr_payroll_transaction_delete_prepare' not in names)
    commit_tool = next((t for t in tools if t['name'] == 'jisr_attendance_punch_create_commit'), {})
    check(adapter+': commit annotated non-read-only on the wire',
          commit_tool.get('annotations',{}).get('readOnlyHint') is False)

    punch_time = time.strftime('%Y-%m-%dT%H:%M:%S+03:00')
    send({'jsonrpc':'2.0','id':8,'method':'tools/call','params':{
        'name':'jisr_attendance_punch_create_prepare',
        'arguments':{'employeeCode':1001,'punchTime':punch_time,'reason':'e2e write round trip'}}})
    resp = read(30)
    sc = (resp or {}).get('result',{}).get('structuredContent',{})
    reference = sc.get('confirmationReference','')
    check(adapter+': prepare returns a preview and reference',
          bool(reference) and 'PREVIEW ONLY' in json.dumps((resp or {}).get('result',{}).get('content','')))

    send({'jsonrpc':'2.0','id':9,'method':'tools/call','params':{
        'name':'jisr_attendance_punch_create_commit',
        'arguments':{'confirmationReference':'forged-reference'}}})
    resp = read(15)
    raw = json.dumps(resp or {})
    check(adapter+': forged reference refused on the wire', 'WRITE_CONFIRMATION_REQUIRED' in raw)

    send({'jsonrpc':'2.0','id':10,'method':'tools/call','params':{
        'name':'jisr_attendance_punch_create_commit',
        'arguments':{'confirmationReference':reference}}})
    resp = read(30)
    r = (resp or {}).get('result',{})
    recs = r.get('structuredContent',{}).get('records',[])
    check(adapter+': commit reports the re-read state, not an echo',
          len(recs) == 1 and recs[0].get('terminalSerial') == 'SRV-NORMALIZED' and recs[0].get('id') == 987654,
          json.dumps(recs)[:120])

    send({'jsonrpc':'2.0','id':11,'method':'tools/call','params':{
        'name':'jisr_attendance_punch_create_commit',
        'arguments':{'confirmationReference':reference}}})
    resp = read(15)
    raw = json.dumps(resp or {})
    check(adapter+': reused reference refused (single-use)', 'already been used' in raw or 'WRITE_CONFIRMATION_REQUIRED' in raw)

proc.terminate()
failed = [r for r in results if not r[1]]
print()
print(('ALL ' + str(len(results)) + ' PROTOCOL CHECKS PASSED') if not failed else (str(len(failed)) + ' FAILED'))
sys.exit(1 if failed else 0)
