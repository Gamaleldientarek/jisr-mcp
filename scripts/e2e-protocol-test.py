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
env = dict(os.environ, JISR_MCP_ADAPTER=adapter)

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
check(adapter+': annotations read-only', all(t.get('annotations',{}).get('readOnlyHint') is True for t in tools))

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

proc.terminate()
failed = [r for r in results if not r[1]]
print()
print(('ALL ' + str(len(results)) + ' PROTOCOL CHECKS PASSED') if not failed else (str(len(failed)) + ' FAILED'))
sys.exit(1 if failed else 0)
