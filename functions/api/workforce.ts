import { ensureWorkforceDatabase } from "../../db/workforce";
import type { D1Database } from "@cloudflare/workers-types";

interface Env { DB: D1Database }
interface PagesContext { request: Request; env: Env }
type Entity = "project" | "company" | "labour" | "equipment";

const tableFor: Record<Entity, string> = { project: "projects", company: "companies", labour: "labours", equipment: "equipment" };

function value(payload: Record<string, unknown>, key: string) {
  return String(payload[key] ?? "").trim();
}

function nullable(payload: Record<string, unknown>, key: string) {
  return value(payload, key) || null;
}

async function loadAll(db: D1Database) {
  const [projects, companies, labours, equipment] = await Promise.all([
    db.prepare("SELECT id,name,code,location,start_date AS startDate,end_date AS endDate,status,progress FROM projects ORDER BY name").all(),
    db.prepare("SELECT id,name,contact,phone,email,specialty,status FROM companies ORDER BY name").all(),
    db.prepare("SELECT id,name,employee_code AS employeeCode,trade,phone,company_id AS companyId,project_id AS projectId,status FROM labours ORDER BY name").all(),
    db.prepare("SELECT id,name,asset_code AS assetCode,category,daily_rate AS dailyRate,company_id AS companyId,project_id AS projectId,status FROM equipment ORDER BY name").all(),
  ]);
  return { projects: projects.results, companies: companies.results, labours: labours.results, equipment: equipment.results };
}

export async function onRequestGet({ env }: PagesContext) {
  try {
    if (!env.DB) return Response.json({ error: "D1 binding DB is not configured" }, { status: 503 });
    await ensureWorkforceDatabase(env.DB);
    return Response.json(await loadAll(env.DB));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load workforce data" }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }: PagesContext) {
  try {
    if (!env.DB) return Response.json({ error: "D1 binding DB is not configured" }, { status: 503 });
    const payload = await request.json() as Record<string, unknown>;
    const entity = value(payload, "entity") as Entity;
    if (!(entity in tableFor)) return Response.json({ error: "Invalid record type" }, { status: 400 });
    await ensureWorkforceDatabase(env.DB);
    const id = crypto.randomUUID();

    if (entity === "project") {
      const name = value(payload, "name");
      const code = value(payload, "code").toUpperCase();
      if (!name || !code) return Response.json({ error: "Project name and code are required" }, { status: 400 });
      await env.DB.prepare("INSERT INTO projects (id,name,code,location,start_date,end_date,status,progress) VALUES (?,?,?,?,?,?,?,?)")
        .bind(id, name, code, value(payload, "location"), value(payload, "startDate"), value(payload, "endDate"), value(payload, "status") || "On track", Math.max(0, Math.min(100, Number(payload.progress) || 0))).run();
    }
    if (entity === "company") {
      const name = value(payload, "name");
      if (!name) return Response.json({ error: "Company name is required" }, { status: 400 });
      await env.DB.prepare("INSERT INTO companies (id,name,contact,phone,email,specialty,status) VALUES (?,?,?,?,?,?,?)")
        .bind(id, name, value(payload, "contact"), value(payload, "phone"), value(payload, "email"), value(payload, "specialty") || "General workforce", "Active").run();
    }
    if (entity === "labour") {
      const name = value(payload, "name");
      const trade = value(payload, "trade");
      const companyId = value(payload, "companyId");
      const projectId = nullable(payload, "projectId");
      if (!name || !trade || !companyId) return Response.json({ error: "Name, trade and rental company are required" }, { status: 400 });
      await env.DB.prepare("INSERT INTO labours (id,name,employee_code,trade,phone,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)")
        .bind(id, name, value(payload, "employeeCode"), trade, value(payload, "phone"), companyId, projectId, projectId ? "On site" : "Available").run();
    }
    if (entity === "equipment") {
      const name = value(payload, "name");
      const category = value(payload, "category");
      const companyId = value(payload, "companyId");
      const projectId = nullable(payload, "projectId");
      if (!name || !category || !companyId) return Response.json({ error: "Name, category and rental company are required" }, { status: 400 });
      await env.DB.prepare("INSERT INTO equipment (id,name,asset_code,category,daily_rate,company_id,project_id,status) VALUES (?,?,?,?,?,?,?,?)")
        .bind(id, name, value(payload, "assetCode"), category, Math.max(0, Number(payload.dailyRate) || 0), companyId, projectId, projectId ? "Deployed" : "Available").run();
    }

    const data = await loadAll(env.DB);
    const key = entity === "project" ? "projects" : entity === "company" ? "companies" : entity === "labour" ? "labours" : "equipment";
    const item = (data[key] as Array<{ id: string }>).find((row) => row.id === id);
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save record";
    return Response.json({ error: message.includes("UNIQUE") ? "That project code is already in use" : message }, { status: 500 });
  }
}

export async function onRequestPatch({ request, env }: PagesContext) {
  try {
    if (!env.DB) return Response.json({ error: "D1 binding DB is not configured" }, { status: 503 });
    const payload = await request.json() as Record<string, unknown>;
    const entity = value(payload, "entity") as Entity;
    const id = value(payload, "id");
    const projectId = nullable(payload, "projectId");
    if (!id || (entity !== "labour" && entity !== "equipment")) return Response.json({ error: "Invalid assignment request" }, { status: 400 });
    await ensureWorkforceDatabase(env.DB);
    const table = entity === "labour" ? "labours" : "equipment";
    const status = projectId ? (entity === "labour" ? "On site" : "Deployed") : "Available";
    await env.DB.prepare(`UPDATE ${table} SET project_id = ?, status = ? WHERE id = ?`).bind(projectId, status, id).run();
    return Response.json({ id, projectId, status });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update assignment" }, { status: 500 });
  }
}
