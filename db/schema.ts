import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  specialty: text("specialty").notNull().default("General workforce"),
  status: text("status").notNull().default("Active"),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  location: text("location").notNull().default(""),
  startDate: text("start_date").notNull().default(""),
  endDate: text("end_date").notNull().default(""),
  status: text("status").notNull().default("On track"),
  progress: integer("progress").notNull().default(0),
});

export const labours = sqliteTable("labours", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  employeeCode: text("employee_code").notNull().default(""),
  trade: text("trade").notNull(),
  phone: text("phone").notNull().default(""),
  companyId: text("company_id").notNull().references(() => companies.id),
  projectId: text("project_id").references(() => projects.id),
  status: text("status").notNull().default("Available"),
}, (table) => [
  index("idx_labours_company_id").on(table.companyId),
  index("idx_labours_project_id").on(table.projectId),
]);

export const equipment = sqliteTable("equipment", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  assetCode: text("asset_code").notNull().default(""),
  category: text("category").notNull(),
  dailyRate: integer("daily_rate").notNull().default(0),
  companyId: text("company_id").notNull().references(() => companies.id),
  projectId: text("project_id").references(() => projects.id),
  status: text("status").notNull().default("Available"),
}, (table) => [
  index("idx_equipment_company_id").on(table.companyId),
  index("idx_equipment_project_id").on(table.projectId),
]);
