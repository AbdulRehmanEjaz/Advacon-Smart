import type { D1Database } from "@cloudflare/workers-types";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
    specialty TEXT NOT NULL DEFAULT 'General workforce', status TEXT NOT NULL DEFAULT 'Active'
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
    location TEXT NOT NULL DEFAULT '', start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'On track',
    progress INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS labours (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, employee_code TEXT NOT NULL DEFAULT '',
    trade TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
    company_id TEXT NOT NULL REFERENCES companies(id), project_id TEXT REFERENCES projects(id),
    status TEXT NOT NULL DEFAULT 'Available'
  )`,
  `CREATE TABLE IF NOT EXISTS equipment (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, asset_code TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL, daily_rate INTEGER NOT NULL DEFAULT 0,
    company_id TEXT NOT NULL REFERENCES companies(id), project_id TEXT REFERENCES projects(id),
    status TEXT NOT NULL DEFAULT 'Available'
  )`,
  "CREATE INDEX IF NOT EXISTS idx_labours_company_id ON labours(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_labours_project_id ON labours(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_equipment_company_id ON equipment(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_equipment_project_id ON equipment(project_id)",
];

const seedStatements = [
  ["INSERT INTO companies (id,name,contact,phone,email,specialty,status) VALUES (?,?,?,?,?,?,?)", "co-arabian", "Arabian Manpower Co.", "Fahad Al-Mutairi", "+966 55 310 4471", "dispatch@arabianmanpower.sa", "Civil workforce", "Active"],
  ["INSERT INTO companies (id,name,contact,phone,email,specialty,status) VALUES (?,?,?,?,?,?,?)", "co-gulf", "Gulf Technical Resources", "Omar Nasser", "+966 56 820 1124", "ops@gulftechnical.sa", "Skilled technicians", "Active"],
  ["INSERT INTO companies (id,name,contact,phone,email,specialty,status) VALUES (?,?,?,?,?,?,?)", "co-fleet", "Desert Fleet Rentals", "Sami Hassan", "+966 54 778 9020", "rentals@desertfleet.sa", "Heavy equipment", "Active"],
  ["INSERT INTO companies (id,name,contact,phone,email,specialty,status) VALUES (?,?,?,?,?,?,?)", "co-rapid", "Rapid Lift Solutions", "Khalid Rahman", "+966 53 449 3318", "service@rapidlift.sa", "Lifting equipment", "Active"],
  ["INSERT INTO projects (id,name,code,location,start_date,end_date,status,progress) VALUES (?,?,?,?,?,?,?,?)", "pr-ksp", "King Salman Park", "KSP-024", "Riyadh", "2026-01-15", "2027-02-28", "On track", 74],
  ["INSERT INTO projects (id,name,code,location,start_date,end_date,status,progress) VALUES (?,?,?,?,?,?,?,?)", "pr-rme", "Riyadh Metro Extension", "RME-118", "Riyadh North", "2026-03-01", "2027-08-15", "On track", 58],
  ["INSERT INTO projects (id,name,code,location,start_date,end_date,status,progress) VALUES (?,?,?,?,?,?,?,?)", "pr-dg3", "Diriyah Gate – Zone 3", "DG3-042", "Diriyah", "2026-04-20", "2027-06-30", "At risk", 41],
  ["INSERT INTO projects (id,name,code,location,start_date,end_date,status,progress) VALUES (?,?,?,?,?,?,?,?)", "pr-lhn", "Logistics Hub North", "LHN-016", "Sudair", "2025-11-10", "2026-11-30", "On track", 86],
  ["INSERT INTO labours (id,name,employee_code,trade,phone,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)", "lb-001", "Ahmed Raza", "AM-1042", "Electrician", "+966 55 123 0901", "co-gulf", "pr-rme", "On site"],
  ["INSERT INTO labours (id,name,employee_code,trade,phone,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)", "lb-002", "Bilal Hussain", "AM-1078", "Carpenter", "+966 55 123 0902", "co-arabian", "pr-ksp", "On site"],
  ["INSERT INTO labours (id,name,employee_code,trade,phone,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)", "lb-003", "Javed Iqbal", "AM-1104", "Mason", "+966 55 123 0903", "co-arabian", "pr-dg3", "On site"],
  ["INSERT INTO labours (id,name,employee_code,trade,phone,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)", "lb-004", "Imran Khan", "GT-2205", "HVAC Technician", "+966 55 123 0904", "co-gulf", "pr-ksp", "On site"],
  ["INSERT INTO labours (id,name,employee_code,trade,phone,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)", "lb-005", "Nadeem Ali", "AM-1162", "Steel Fixer", "+966 55 123 0905", "co-arabian", "pr-lhn", "On site"],
  ["INSERT INTO labours (id,name,employee_code,trade,phone,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)", "lb-006", "Tariq Mehmood", "GT-2271", "Welder", "+966 55 123 0906", "co-gulf", "pr-rme", "On site"],
  ["INSERT INTO labours (id,name,employee_code,trade,phone,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)", "lb-007", "Rashid Noor", "AM-1210", "General Labour", "+966 55 123 0907", "co-arabian", null, "Available"],
  ["INSERT INTO labours (id,name,employee_code,trade,phone,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)", "lb-008", "Salman Akhtar", "GT-2299", "Plumber", "+966 55 123 0908", "co-gulf", null, "Available"],
  ["INSERT INTO equipment (id,name,asset_code,category,daily_rate,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)", "eq-001", "CAT 320 Excavator", "DF-EX-204", "Excavator", 1850, "co-fleet", "pr-ksp", "Deployed"],
  ["INSERT INTO equipment (id,name,asset_code,category,daily_rate,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)", "eq-002", "Liebherr LTM Crane", "RL-CR-118", "Mobile crane", 4200, "co-rapid", "pr-rme", "Deployed"],
  ["INSERT INTO equipment (id,name,asset_code,category,daily_rate,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)", "eq-003", "JCB 3CX Backhoe", "DF-BH-087", "Backhoe loader", 1250, "co-fleet", "pr-dg3", "Deployed"],
  ["INSERT INTO equipment (id,name,asset_code,category,daily_rate,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)", "eq-004", "Genie S-85 Boom Lift", "RL-BL-044", "Boom lift", 960, "co-rapid", "pr-lhn", "Deployed"],
  ["INSERT INTO equipment (id,name,asset_code,category,daily_rate,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)", "eq-005", "Volvo L120 Loader", "DF-LD-031", "Wheel loader", 1550, "co-fleet", null, "Available"],
  ["INSERT INTO equipment (id,name,asset_code,category,daily_rate,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)", "eq-006", "Manitou MT 1840", "RL-TH-072", "Telehandler", 1100, "co-rapid", null, "Service"],
] as const;

export async function ensureWorkforceDatabase(db: D1Database) {
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  const result = await db.prepare("SELECT COUNT(*) AS count FROM companies").first<{ count: number }>();
  if (Number(result?.count ?? 0) > 0) return;
  await db.batch(seedStatements.map(([sql, ...values]) => db.prepare(sql).bind(...values)));
  await db.prepare("PRAGMA optimize").run();
}
