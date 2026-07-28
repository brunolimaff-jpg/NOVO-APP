import json, subprocess, sys

def run_prod_query(sql):
    cmd = ["npx", "supabase", "db", "query", "--linked", sql]
    res = subprocess.run(cmd, capture_output=True, text=True, cwd="/tmp/novoapp-canonical-migrations")
    if res.returncode != 0:
        print(f"Prod query failed: {res.stderr}", file=sys.stderr)
        sys.exit(1)
    data = json.loads(res.stdout)
    return data.get("rows", [])

def run_local_query(sql):
    clean_sql = sql.strip().rstrip(';')
    cmd = ["/opt/homebrew/opt/postgresql@17/bin/psql", "-p", "5437", "-d", "test_baseline_parity", "-t", "-A", "-c", f"SELECT json_agg(t) FROM ({clean_sql}) t;"]
    res = subprocess.run(cmd, capture_output=True, text=True, cwd="/tmp/novoapp-canonical-migrations")
    if res.returncode != 0:
        print(f"Local query failed: {res.stderr}", file=sys.stderr)
        sys.exit(1)
    out = res.stdout.strip()
    if not out or out == "":
        return []
    return json.loads(out)

def normalize_roles(roles):
    if isinstance(roles, list):
        return sorted(roles)
    if isinstance(roles, str):
        cleaned = roles.strip("{}")
        if not cleaned:
            return []
        return sorted([r.strip(' "') for r in cleaned.split(",")])
    return []

def norm_fn(fn_list):
    res = []
    for f in fn_list:
        lines = [line.rstrip() for line in f["def"].splitlines()]
        res.append({"proname": f["proname"], "def": "\n".join(lines)})
    return res

diffs = {}

# 1. Extensions (app extensions: pg_trgm, pgcrypto, uuid-ossp)
q_ext = "SELECT extname, extversion FROM pg_extension e JOIN pg_namespace n ON e.extnamespace = n.oid WHERE e.extname IN ('pg_trgm', 'pgcrypto', 'uuid-ossp') ORDER BY extname"
prod_ext = run_prod_query(q_ext)
local_ext = run_local_query(q_ext)
diffs['EXTENSION'] = len([x for x in prod_ext if x not in local_ext] + [x for x in local_ext if x not in prod_ext])

# 2. Sequences
q_seq = "SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public' ORDER BY sequence_name"
prod_seq = run_prod_query(q_seq)
local_seq = run_local_query(q_seq)
diffs['SEQUENCE'] = len([x for x in prod_seq if x not in local_seq] + [x for x in local_seq if x not in prod_seq])

# 3. Tables
q_tab = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
prod_tab = run_prod_query(q_tab)
local_tab = run_local_query(q_tab)
diffs['TABLE'] = len([x for x in prod_tab if x not in local_tab] + [x for x in local_tab if x not in prod_tab])

# 4. Columns
q_col = "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, column_name"
prod_col = run_prod_query(q_col)
local_col = run_local_query(q_col)
diffs['COLUMN'] = len([x for x in prod_col if x not in local_col] + [x for x in local_col if x not in prod_col])

# Defaults
diffs['DEFAULT'] = len([x for x in prod_col if (x['table_name'], x['column_name'], x['column_default']) not in [(y['table_name'], y['column_name'], y['column_default']) for y in local_col]])

# 5. Constraints Definition Parity (exact definition: schema, table, constraint_name, contype, constraint_def, is_validated, is_deferrable, is_deferred)
q_con = """
SELECT 
  n.nspname AS schema_name,
  c.relname AS table_name,
  con.conname AS constraint_name,
  con.contype,
  pg_get_constraintdef(con.oid) AS constraint_def,
  con.convalidated AS is_validated,
  con.condeferrable AS is_deferrable,
  con.condeferred AS is_deferred
FROM pg_constraint con
JOIN pg_class c ON con.conrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY c.relname, con.conname
"""
prod_con = run_prod_query(q_con)
local_con = run_local_query(q_con)

prod_constraint_count = len(prod_con)
local_constraint_count = len(local_con)
diffs['CONSTRAINT_DEFINITION'] = len([x for x in prod_con if x not in local_con] + [x for x in local_con if x not in prod_con])

# 9. Indexes
q_idx = "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname"
prod_idx = run_prod_query(q_idx)
local_idx = run_local_query(q_idx)
diffs['INDEX'] = len([x for x in prod_idx if x not in local_idx] + [x for x in local_idx if x not in prod_idx])

# 10. RLS
q_rls = "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
prod_rls = run_prod_query(q_rls)
local_rls = run_local_query(q_rls)
diffs['RLS'] = len([x for x in prod_rls if x not in local_rls] + [x for x in local_rls if x not in prod_rls])

# 11. Policies (normalized roles)
q_pol = "SELECT tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname"
prod_pol_raw = run_prod_query(q_pol)
local_pol_raw = run_local_query(q_pol)

prod_pol_norm = [{"tablename": p["tablename"], "policyname": p["policyname"], "roles": normalize_roles(p["roles"]), "cmd": p["cmd"], "qual": p["qual"], "with_check": p["with_check"]} for p in prod_pol_raw]
local_pol_norm = [{"tablename": p["tablename"], "policyname": p["policyname"], "roles": normalize_roles(p["roles"]), "cmd": p["cmd"], "qual": p["qual"], "with_check": p["with_check"]} for p in local_pol_raw]

diffs['POLICY'] = len([x for x in prod_pol_norm if x not in local_pol_norm] + [x for x in local_pol_norm if x not in prod_pol_norm])

# 12. Application Functions (excluding extension-owned internal C functions)
q_fn = "SELECT p.proname, pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e' WHERE n.nspname = 'public' AND d.objid IS NULL ORDER BY p.proname"
prod_fn = norm_fn(run_prod_query(q_fn))
local_fn = norm_fn(run_local_query(q_fn))
diffs['FUNCTION'] = len([x for x in prod_fn if x not in local_fn] + [x for x in local_fn if x not in prod_fn])

# 13. Views
q_vw = "SELECT viewname, definition FROM pg_views WHERE schemaname = 'public' ORDER BY viewname"
prod_vw = run_prod_query(q_vw)
local_vw = run_local_query(q_vw)
diffs['VIEW'] = len([x for x in prod_vw if x not in local_vw] + [x for x in local_vw if x not in prod_vw])

# 14. Triggers
q_tr = "SELECT t.tgname, c.relname, pg_get_triggerdef(t.oid) AS trigdef FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid JOIN pg_namespace n ON c.relnamespace = n.oid WHERE NOT t.tgisinternal AND n.nspname IN ('public', 'auth') ORDER BY t.tgname"
prod_tr = run_prod_query(q_tr)
local_tr = run_local_query(q_tr)
diffs['TRIGGER'] = len([x for x in prod_tr if x not in local_tr] + [x for x in local_tr if x not in prod_tr])

# 15. Table Grants
q_tg = "SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'service_role') ORDER BY table_name, grantee, privilege_type"
prod_tg = run_prod_query(q_tg)
local_tg = run_local_query(q_tg)
diffs['TABLE_GRANT'] = len([x for x in prod_tg if x not in local_tg] + [x for x in local_tg if x not in prod_tg])

# 16. Column Grants
q_cg = "SELECT table_name, column_name, grantee, privilege_type FROM information_schema.column_privileges WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'service_role') ORDER BY table_name, column_name, grantee, privilege_type"
prod_cg = run_prod_query(q_cg)
local_cg = run_local_query(q_cg)
diffs['COLUMN_GRANT'] = len([x for x in prod_cg if x not in local_cg] + [x for x in local_cg if x not in prod_cg])

# 17. Function Grants (excluding extension functions)
q_fg = "SELECT p.proname AS routine_name, r.grantee, r.privilege_type FROM information_schema.routine_privileges r JOIN pg_proc p ON r.routine_name = p.proname JOIN pg_namespace n ON p.pronamespace = n.oid LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e' WHERE r.routine_schema = 'public' AND r.grantee IN ('anon', 'authenticated', 'service_role') AND d.objid IS NULL ORDER BY p.proname, r.grantee, r.privilege_type"
prod_fg = run_prod_query(q_fg)
local_fg = run_local_query(q_fg)
diffs['FUNCTION_GRANT'] = len([x for x in prod_fg if x not in local_fg] + [x for x in local_fg if x not in prod_fg])

print(f"PRODUCTION_CONSTRAINT_COUNT: {prod_constraint_count}")
print(f"LOCAL_CONSTRAINT_COUNT: {local_constraint_count}")
print(f"CONSTRAINT_DEFINITION_DIFF: {diffs['CONSTRAINT_DEFINITION']}")

total_diff = 0
for k in ['EXTENSION', 'SEQUENCE', 'TABLE', 'COLUMN', 'DEFAULT', 'CONSTRAINT_DEFINITION', 'INDEX', 'RLS', 'POLICY', 'FUNCTION', 'VIEW', 'TRIGGER', 'TABLE_GRANT', 'COLUMN_GRANT', 'FUNCTION_GRANT']:
    v = diffs.get(k, 0)
    if k != 'CONSTRAINT_DEFINITION':
        print(f"{k}_DIFF: {v}")
    total_diff += v

if total_diff == 0:
    print("\nPRODUCTION_BASELINE_CATALOG_DIFF: ZERO")
else:
    print(f"\nPRODUCTION_BASELINE_CATALOG_DIFF: {total_diff}")
