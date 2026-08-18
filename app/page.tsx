"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type View = "overview" | "projects" | "labours" | "equipment" | "companies";
type Entity = "project" | "labour" | "equipment" | "company";
type Project = { id: string; name: string; code: string; location: string; startDate: string; endDate: string; status: string; progress: number };
type Company = { id: string; name: string; contact: string; phone: string; email: string; specialty: string; status: string };
type Labour = { id: string; name: string; employeeCode: string; trade: string; phone: string; companyId: string; projectId: string | null; status: string };
type Equipment = { id: string; name: string; assetCode: string; category: string; dailyRate: number; companyId: string; projectId: string | null; status: string };
type WorkforceData = { projects: Project[]; companies: Company[]; labours: Labour[]; equipment: Equipment[] };

const previewData: WorkforceData = {
  companies: [
    { id: "co-arabian", name: "Arabian Manpower Co.", contact: "Fahad Al-Mutairi", phone: "+966 55 310 4471", email: "dispatch@arabianmanpower.sa", specialty: "Civil workforce", status: "Active" },
    { id: "co-gulf", name: "Gulf Technical Resources", contact: "Omar Nasser", phone: "+966 56 820 1124", email: "ops@gulftechnical.sa", specialty: "Skilled technicians", status: "Active" },
    { id: "co-fleet", name: "Desert Fleet Rentals", contact: "Sami Hassan", phone: "+966 54 778 9020", email: "rentals@desertfleet.sa", specialty: "Heavy equipment", status: "Active" },
    { id: "co-rapid", name: "Rapid Lift Solutions", contact: "Khalid Rahman", phone: "+966 53 449 3318", email: "service@rapidlift.sa", specialty: "Lifting equipment", status: "Active" },
  ],
  projects: [
    { id: "pr-ksp", name: "King Salman Park", code: "KSP-024", location: "Riyadh", startDate: "2026-01-15", endDate: "2027-02-28", status: "On track", progress: 74 },
    { id: "pr-rme", name: "Riyadh Metro Extension", code: "RME-118", location: "Riyadh North", startDate: "2026-03-01", endDate: "2027-08-15", status: "On track", progress: 58 },
    { id: "pr-dg3", name: "Diriyah Gate – Zone 3", code: "DG3-042", location: "Diriyah", startDate: "2026-04-20", endDate: "2027-06-30", status: "At risk", progress: 41 },
    { id: "pr-lhn", name: "Logistics Hub North", code: "LHN-016", location: "Sudair", startDate: "2025-11-10", endDate: "2026-11-30", status: "On track", progress: 86 },
  ],
  labours: [
    { id: "lb-001", name: "Ahmed Raza", employeeCode: "AM-1042", trade: "Electrician", phone: "+966 55 123 0901", companyId: "co-gulf", projectId: "pr-rme", status: "On site" },
    { id: "lb-002", name: "Bilal Hussain", employeeCode: "AM-1078", trade: "Carpenter", phone: "+966 55 123 0902", companyId: "co-arabian", projectId: "pr-ksp", status: "On site" },
    { id: "lb-003", name: "Javed Iqbal", employeeCode: "AM-1104", trade: "Mason", phone: "+966 55 123 0903", companyId: "co-arabian", projectId: "pr-dg3", status: "On site" },
    { id: "lb-004", name: "Imran Khan", employeeCode: "GT-2205", trade: "HVAC Technician", phone: "+966 55 123 0904", companyId: "co-gulf", projectId: "pr-ksp", status: "On site" },
    { id: "lb-005", name: "Nadeem Ali", employeeCode: "AM-1162", trade: "Steel Fixer", phone: "+966 55 123 0905", companyId: "co-arabian", projectId: "pr-lhn", status: "On site" },
    { id: "lb-006", name: "Tariq Mehmood", employeeCode: "GT-2271", trade: "Welder", phone: "+966 55 123 0906", companyId: "co-gulf", projectId: "pr-rme", status: "On site" },
    { id: "lb-007", name: "Rashid Noor", employeeCode: "AM-1210", trade: "General Labour", phone: "+966 55 123 0907", companyId: "co-arabian", projectId: null, status: "Available" },
    { id: "lb-008", name: "Salman Akhtar", employeeCode: "GT-2299", trade: "Plumber", phone: "+966 55 123 0908", companyId: "co-gulf", projectId: null, status: "Available" },
  ],
  equipment: [
    { id: "eq-001", name: "CAT 320 Excavator", assetCode: "DF-EX-204", category: "Excavator", dailyRate: 1850, companyId: "co-fleet", projectId: "pr-ksp", status: "Deployed" },
    { id: "eq-002", name: "Liebherr LTM Crane", assetCode: "RL-CR-118", category: "Mobile crane", dailyRate: 4200, companyId: "co-rapid", projectId: "pr-rme", status: "Deployed" },
    { id: "eq-003", name: "JCB 3CX Backhoe", assetCode: "DF-BH-087", category: "Backhoe loader", dailyRate: 1250, companyId: "co-fleet", projectId: "pr-dg3", status: "Deployed" },
    { id: "eq-004", name: "Genie S-85 Boom Lift", assetCode: "RL-BL-044", category: "Boom lift", dailyRate: 960, companyId: "co-rapid", projectId: "pr-lhn", status: "Deployed" },
    { id: "eq-005", name: "Volvo L120 Loader", assetCode: "DF-LD-031", category: "Wheel loader", dailyRate: 1550, companyId: "co-fleet", projectId: null, status: "Available" },
    { id: "eq-006", name: "Manitou MT 1840", assetCode: "RL-TH-072", category: "Telehandler", dailyRate: 1100, companyId: "co-rapid", projectId: null, status: "Service" },
  ],
};

const navigation: Array<{ id: View; label: string; short: string }> = [
  { id: "overview", label: "Overview", short: "OV" },
  { id: "projects", label: "Projects", short: "PR" },
  { id: "labours", label: "Labour", short: "LB" },
  { id: "equipment", label: "Equipment", short: "EQ" },
  { id: "companies", label: "Rental companies", short: "RC" },
];

const entityToKey = { project: "projects", company: "companies", labour: "labours", equipment: "equipment" } as const;
const entityLabels = { project: "project", company: "rental company", labour: "labour", equipment: "equipment" };

function initials(value: string) {
  return value.split(" ").filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function companyName(data: WorkforceData, id: string) {
  return data.companies.find((company) => company.id === id)?.name ?? "—";
}

function projectName(data: WorkforceData, id: string | null) {
  return data.projects.find((project) => project.id === id)?.name ?? "Unassigned";
}

function Status({ value }: { value: string }) {
  const className = value === "At risk" || value === "Service" ? "warning" : value === "Available" ? "available" : "active";
  return <span className={`status-pill ${className}`}><i />{value}</span>;
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<WorkforceData>(previewData);
  const [modal, setModal] = useState<Entity | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [syncing, setSyncing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workforce", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to sync");
        return response.json();
      })
      .then((records: WorkforceData) => setData(records))
      .catch(() => undefined)
      .finally(() => setSyncing(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const counts = useMemo(() => ({
    activeProjects: data.projects.filter((project) => project.status !== "Complete").length,
    labourOnSite: data.labours.filter((labour) => labour.projectId).length,
    availableLabour: data.labours.filter((labour) => !labour.projectId).length,
    deployedEquipment: data.equipment.filter((item) => item.projectId).length,
    availableEquipment: data.equipment.filter((item) => item.status === "Available").length,
  }), [data]);

  function openModal(entity: Entity) {
    setModal(entity);
    setAddMenu(false);
  }

  function navigate(nextView: View) {
    setQuery("");
    setFilter("All");
    setView(nextView);
  }

  async function submitRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/workforce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, entity: modal }),
      });
      const result = await response.json() as { item?: Project | Company | Labour | Equipment; error?: string };
      if (!response.ok || !result.item) throw new Error(result.error || "Unable to save record");
      const key = entityToKey[modal];
      setData((current) => ({ ...current, [key]: [...current[key], result.item] } as WorkforceData));
      setModal(null);
      setToast(`${entityLabels[modal][0].toUpperCase()}${entityLabels[modal].slice(1)} added`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to save record");
    } finally {
      setSaving(false);
    }
  }

  async function assign(entity: "labour" | "equipment", id: string, projectId: string) {
    const key = entityToKey[entity];
    const previous = data[key];
    const status = projectId ? (entity === "labour" ? "On site" : "Deployed") : "Available";
    setData((current) => ({
      ...current,
      [key]: current[key].map((record) => record.id === id ? { ...record, projectId: projectId || null, status } : record),
    }));
    try {
      const response = await fetch("/api/workforce", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, id, projectId }),
      });
      if (!response.ok) throw new Error();
      setToast(projectId ? `Assigned to ${projectName(data, projectId)}` : "Assignment cleared");
    } catch {
      setData((current) => ({ ...current, [key]: previous }));
      setToast("Could not update assignment");
    }
  }

  const viewMeta = {
    overview: ["Good morning, Abdul", "Here’s what’s happening across your workforce today."],
    projects: ["Projects", "Track delivery progress and allocated resources across every site."],
    labours: ["Labour directory", "Manage rental-company workers and assign them to projects."],
    equipment: ["Equipment fleet", "See every rental asset, its supplier and current deployment."],
    companies: ["Rental companies", "Keep your workforce and equipment partners in one place."],
  }[view];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("overview")} aria-label="Go to overview"><span>WF</span><strong>Workforce</strong></button>
        <div className="sidebar-tabs"><strong>Favorites</strong><span>Recently</span></div>
        <p className="side-section-label">Workspace</p>
        <nav aria-label="Primary navigation">
          {navigation.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
              <span>{item.short}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="side-help">
          <span>?</span>
          <div><strong>Need help?</strong><small>Workforce guide</small></div>
        </div>
        <div className="sidebar-footer">
          <div className="avatar">AR</div>
          <div><strong>Abdul Rehman</strong><span>Administrator</span></div>
          <button aria-label="Account menu">•••</button>
        </div>
      </aside>

      <section className="content">
        <div className="workspace-bar">
          <div className="breadcrumbs"><span className="panel-symbol">▣</span><span>☆</span><small>Workforce</small><b>/</b><strong>{view === "overview" ? "Dashboard" : viewMeta[0]}</strong></div>
          <label className="global-search"><span>⌕</span><input placeholder="Search" aria-label="Search workspace"/><kbd>/</kbd></label>
          <div className="utility-icons"><button aria-label="Toggle theme">☼</button><button aria-label="Refresh">↻</button><button aria-label="Notifications">♧</button></div>
        </div>
        <header className="topbar">
          <div>
            <p className="eyebrow">Tuesday, 18 August 2026</p>
            <h1>{viewMeta[0]}</h1>
            <p>{viewMeta[1]}</p>
          </div>
          <div className="header-actions">
            <span className={`sync-state ${syncing ? "loading" : ""}`}><i />{syncing ? "Syncing" : "Up to date"}</span>
            <div className="add-wrap">
              <button className="primary-button" onClick={() => setAddMenu((current) => !current)} aria-expanded={addMenu}><span>＋</span> Add new <b>⌄</b></button>
              {addMenu && <div className="add-menu" role="menu">
                {(["project", "labour", "equipment", "company"] as Entity[]).map((entity) => (
                  <button key={entity} role="menuitem" onClick={() => openModal(entity)}><span>{entity === "company" ? "RC" : entity.slice(0, 2).toUpperCase()}</span>Add {entityLabels[entity]}</button>
                ))}
              </div>}
            </div>
          </div>
        </header>

        {view === "overview" && <Overview data={data} counts={counts} onNavigate={navigate} />}
        {view === "projects" && <ProjectsView data={data} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onAdd={() => openModal("project")} />}
        {view === "labours" && <LabourView data={data} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onAdd={() => openModal("labour")} onAssign={assign} />}
        {view === "equipment" && <EquipmentView data={data} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onAdd={() => openModal("equipment")} onAssign={assign} />}
        {view === "companies" && <CompaniesView data={data} query={query} setQuery={setQuery} onAdd={() => openModal("company")} />}
      </section>

      <UtilityRail data={data}/>

      {modal && <AddModal entity={modal} data={data} saving={saving} onClose={() => setModal(null)} onSubmit={submitRecord} />}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}

function Overview({ data, counts, onNavigate }: { data: WorkforceData; counts: Record<string, number>; onNavigate: (view: View) => void }) {
  const cards = [
    { label: "Active projects", value: counts.activeProjects, detail: `${data.projects.filter((project) => project.progress >= 75).length} nearing completion`, tone: "green", icon: "PR" },
    { label: "Labour on site", value: counts.labourOnSite, detail: `${counts.availableLabour} available to assign`, tone: "blue", icon: "LB" },
    { label: "Equipment deployed", value: counts.deployedEquipment, detail: `${counts.availableEquipment} units available`, tone: "amber", icon: "EQ" },
    { label: "Rental companies", value: data.companies.length, detail: "All contracts active", tone: "violet", icon: "RC" },
  ];
  const onTrack = data.projects.filter((project) => project.status === "On track").length;
  const atRisk = data.projects.filter((project) => project.status === "At risk").length;
  const complete = data.projects.filter((project) => project.status === "Complete").length;
  const totalProjects = Math.max(1, data.projects.length);
  const allocationBars = data.projects.flatMap((project) => [
    { label: project.code.split("-")[0], value: data.labours.filter((labour) => labour.projectId === project.id).length + 2, tone: "blue" },
    { label: "EQ", value: data.equipment.filter((item) => item.projectId === project.id).length + 1, tone: "mint" },
  ]);
  const maxAllocation = Math.max(1, ...allocationBars.map((bar) => bar.value));

  return <>
    <section className="stats-grid" aria-label="Workforce summary">
      {cards.map((card) => <article className={`stat-card ${card.tone}`} key={card.label}>
        <div className="stat-head"><span className="stat-icon">{card.icon}</span><span className="trend">↗</span></div>
        <p>{card.label}</p><strong>{card.value}</strong><small>{card.detail}</small>
      </article>)}
    </section>

    <section className="overview-split">
      <article className="section-block status-card"><div className="section-heading"><div><h2>Project status</h2><p>Portfolio health</p></div></div><div className="status-chart-wrap">
        <div className="project-donut" style={{ background: `conic-gradient(#171919 0 ${(onTrack / totalProjects) * 100}%, #91bcff 0 ${((onTrack + atRisk) / totalProjects) * 100}%, #8ee5bf 0)` }}><span /></div>
        <div className="project-legend"><div><i className="dark"/><span>On track</span><strong>{Math.round((onTrack / totalProjects) * 100)}%</strong></div><div><i className="blue"/><span>At risk</span><strong>{Math.round((atRisk / totalProjects) * 100)}%</strong></div><div><i className="mint"/><span>Complete</span><strong>{Math.round((complete / totalProjects) * 100)}%</strong></div></div>
      </div></article>
      <section className="section-block project-overview">
        <div className="section-heading"><div><h2>Active projects</h2><p>Live workforce allocation</p></div><button className="text-button" onClick={() => onNavigate("projects")}>View all <span>→</span></button></div>
        <div className="table-wrap"><table><thead><tr><th>Project</th><th>Assigned</th><th>Equipment</th><th>Status</th></tr></thead><tbody>
          {data.projects.slice(0, 5).map((project) => {
            const team = data.labours.filter((labour) => labour.projectId === project.id).length;
            const equipment = data.equipment.filter((item) => item.projectId === project.id).length;
            return <tr key={project.id}><td><div className="record-cell"><span className="record-mark">{initials(project.name)}</span><div><strong>{project.name}</strong><small>{project.code}</small></div></div></td><td><div className="member-stack"><span>{team}</span><small>people</small></div></td><td>{equipment} units</td><td><Status value={project.status} /></td></tr>;
          })}
        </tbody></table></div>
      </section>
    </section>

    <section className="section-block allocation-card"><div className="section-heading"><div><h2>Resource allocation overview</h2><p>People and equipment spread across active projects</p></div><button className="mini-link" onClick={() => onNavigate("labours")}>Open directory →</button></div><div className="bar-chart">
      <div className="axis"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0</span></div>
      <div className="bars">{allocationBars.map((bar, index) => <div className="bar-column" key={`${bar.label}-${index}`}><i className={bar.tone} style={{ height: `${Math.max(22, (bar.value / maxAllocation) * 100)}%` }}/><span>{bar.label}</span></div>)}</div>
    </div></section>
  </>;
}

function UtilityRail({ data }: { data: WorkforceData }) {
  const notices = [
    { icon: "✓", title: "Labour assignment updated", time: "Just now" },
    { icon: "+", title: "New equipment registered", time: "35 minutes ago" },
    { icon: "↻", title: "Project progress reviewed", time: "2 hours ago" },
    { icon: "!", title: "Service date approaching", time: "Today, 10:20 AM" },
  ];
  return <aside className="utility-rail"><section><h2>Notifications</h2><div className="rail-list">{notices.map((item) => <div className="rail-item" key={item.title}><span>{item.icon}</span><div><strong>{item.title}</strong><small>{item.time}</small></div></div>)}</div></section><section><h2>Activities</h2><div className="rail-list">{data.projects.slice(0, 4).map((project, index) => <div className="rail-item activity" key={project.id}><span className={`activity-avatar tone-${index}`}>{initials(project.name)}</span><div><strong>{project.name}</strong><small>{project.progress}% complete</small></div></div>)}</div></section><section><h2>Rental contacts</h2><div className="rail-list contacts">{data.companies.slice(0, 5).map((company, index) => <div className="rail-item" key={company.id}><span className={`contact-avatar tone-${index}`}>{initials(company.name)}</span><div><strong>{company.contact}</strong><small>{company.name}</small></div></div>)}</div></section></aside>;
}

function Toolbar({ query, setQuery, filter, setFilter, filters, placeholder }: { query: string; setQuery: (value: string) => void; filter?: string; setFilter?: (value: string) => void; filters?: string[]; placeholder: string }) {
  return <div className="toolbar"><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>{filters && setFilter && <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter by status">{filters.map((item) => <option key={item}>{item}</option>)}</select>}</div>;
}

function ViewActions({ label, onAdd }: { label: string; onAdd: () => void }) {
  return <div className="view-actions"><span>Showing the latest records from your workspace</span><button className="primary-button" onClick={onAdd}>＋ Add {label}</button></div>;
}

function ProjectsView({ data, query, setQuery, filter, setFilter, onAdd }: { data: WorkforceData; query: string; setQuery: (value: string) => void; filter: string; setFilter: (value: string) => void; onAdd: () => void }) {
  const projects = data.projects.filter((project) => (filter === "All" || project.status === filter) && `${project.name} ${project.code} ${project.location}`.toLowerCase().includes(query.toLowerCase()));
  return <><ViewActions label="project" onAdd={onAdd}/><Toolbar query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} filters={["All", "On track", "At risk", "Complete"]} placeholder="Search projects"/><section className="project-grid">
    {projects.map((project) => { const team = data.labours.filter((labour) => labour.projectId === project.id).length; const units = data.equipment.filter((item) => item.projectId === project.id).length; return <article className="project-card" key={project.id}><div className="project-card-head"><span className="record-mark large">{initials(project.name)}</span><Status value={project.status}/></div><h2>{project.name}</h2><p>{project.code} · {project.location}</p><div className="project-metrics"><div><span>LB</span><strong>{team}</strong><small>People</small></div><div><span>EQ</span><strong>{units}</strong><small>Units</small></div><div><span>END</span><strong>{project.endDate ? new Date(`${project.endDate}T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) : "—"}</strong><small>Due</small></div></div><div className="project-progress"><div><span>Overall progress</span><strong>{project.progress}%</strong></div><span><i style={{ width: `${project.progress}%` }}/></span></div></article>; })}
    {!projects.length && <EmptyState text="No projects match your search."/>}
  </section></>;
}

function LabourView({ data, query, setQuery, filter, setFilter, onAdd, onAssign }: { data: WorkforceData; query: string; setQuery: (value: string) => void; filter: string; setFilter: (value: string) => void; onAdd: () => void; onAssign: (entity: "labour", id: string, projectId: string) => void }) {
  const records = data.labours.filter((labour) => (filter === "All" || labour.status === filter) && `${labour.name} ${labour.trade} ${labour.employeeCode} ${companyName(data, labour.companyId)}`.toLowerCase().includes(query.toLowerCase()));
  return <><ViewActions label="labour" onAdd={onAdd}/><Toolbar query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} filters={["All", "On site", "Available", "On leave"]} placeholder="Search by name, trade or company"/><section className="section-block directory-table"><div className="table-wrap"><table><thead><tr><th>Labour</th><th>Trade</th><th>Rental company</th><th>Project assignment</th><th>Status</th><th>Contact</th></tr></thead><tbody>
    {records.map((labour) => <tr key={labour.id}><td><div className="record-cell"><span className="person-mark">{initials(labour.name)}</span><div><strong>{labour.name}</strong><small>{labour.employeeCode || "No ID"}</small></div></div></td><td>{labour.trade}</td><td>{companyName(data, labour.companyId)}</td><td><select className="assignment-select" value={labour.projectId ?? ""} onChange={(event) => onAssign("labour", labour.id, event.target.value)} aria-label={`Assign ${labour.name} to project`}><option value="">Unassigned</option>{data.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></td><td><Status value={labour.status}/></td><td className="contact-cell">{labour.phone || "—"}</td></tr>)}
  </tbody></table></div>{!records.length && <EmptyState text="No labour records match your search."/>}</section></>;
}

function EquipmentView({ data, query, setQuery, filter, setFilter, onAdd, onAssign }: { data: WorkforceData; query: string; setQuery: (value: string) => void; filter: string; setFilter: (value: string) => void; onAdd: () => void; onAssign: (entity: "equipment", id: string, projectId: string) => void }) {
  const records = data.equipment.filter((item) => (filter === "All" || item.status === filter) && `${item.name} ${item.category} ${item.assetCode} ${companyName(data, item.companyId)}`.toLowerCase().includes(query.toLowerCase()));
  return <><ViewActions label="equipment" onAdd={onAdd}/><Toolbar query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} filters={["All", "Deployed", "Available", "Service"]} placeholder="Search equipment, category or company"/><section className="section-block directory-table"><div className="table-wrap"><table><thead><tr><th>Equipment</th><th>Category</th><th>Rental company</th><th>Project assignment</th><th>Daily rate</th><th>Status</th></tr></thead><tbody>
    {records.map((item) => <tr key={item.id}><td><div className="record-cell"><span className="equipment-mark">EQ</span><div><strong>{item.name}</strong><small>{item.assetCode || "No asset ID"}</small></div></div></td><td>{item.category}</td><td>{companyName(data, item.companyId)}</td><td><select className="assignment-select" value={item.projectId ?? ""} onChange={(event) => onAssign("equipment", item.id, event.target.value)} aria-label={`Assign ${item.name} to project`}><option value="">Unassigned</option>{data.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></td><td><strong>SAR {item.dailyRate.toLocaleString()}</strong><span className="muted"> / day</span></td><td><Status value={item.status}/></td></tr>)}
  </tbody></table></div>{!records.length && <EmptyState text="No equipment records match your search."/>}</section></>;
}

function CompaniesView({ data, query, setQuery, onAdd }: { data: WorkforceData; query: string; setQuery: (value: string) => void; onAdd: () => void }) {
  const records = data.companies.filter((company) => `${company.name} ${company.specialty} ${company.contact}`.toLowerCase().includes(query.toLowerCase()));
  return <><ViewActions label="company" onAdd={onAdd}/><Toolbar query={query} setQuery={setQuery} placeholder="Search rental companies"/><section className="company-grid">
    {records.map((company) => { const labour = data.labours.filter((record) => record.companyId === company.id).length; const equipment = data.equipment.filter((record) => record.companyId === company.id).length; return <article className="company-card" key={company.id}><div className="company-card-head"><span>{initials(company.name)}</span><Status value={company.status}/></div><h2>{company.name}</h2><p>{company.specialty}</p><div className="company-counts"><div><strong>{labour}</strong><span>Labour</span></div><div><strong>{equipment}</strong><span>Equipment</span></div></div><div className="company-contact"><div><small>Primary contact</small><strong>{company.contact || "—"}</strong></div><span>{company.phone || "No phone"}</span><span>{company.email || "No email"}</span></div></article>; })}
    {!records.length && <EmptyState text="No rental companies match your search."/>}
  </section></>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><span>⌕</span><strong>{text}</strong><small>Try a different search or clear the filter.</small></div>;
}

function AddModal({ entity, data, saving, onClose, onSubmit }: { entity: Entity; data: WorkforceData; saving: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><span className="modal-icon">{entity === "company" ? "RC" : entity.slice(0, 2).toUpperCase()}</span><div><p>Add record</p><h2 id="modal-title">New {entityLabels[entity]}</h2></div></div><button type="button" onClick={onClose} aria-label="Close">×</button></div><form onSubmit={onSubmit}><div className="form-grid">
    {entity === "project" && <><Field label="Project name" name="name" placeholder="e.g. Qiddiya Site Works" required/><Field label="Project code" name="code" placeholder="e.g. QSW-025" required/><Field label="Location" name="location" placeholder="City or site"/><Field label="Status" name="status" type="select" options={["On track", "At risk", "Complete"]}/><Field label="Start date" name="startDate" type="date"/><Field label="Target end date" name="endDate" type="date"/><Field label="Progress (%)" name="progress" type="number" placeholder="0" wide/></>}
    {entity === "company" && <><Field label="Company name" name="name" placeholder="Rental company name" required/><Field label="Specialty" name="specialty" placeholder="e.g. Heavy equipment" required/><Field label="Primary contact" name="contact" placeholder="Contact person"/><Field label="Phone" name="phone" placeholder="+966"/><Field label="Email" name="email" type="email" placeholder="operations@company.com" wide/></>}
    {entity === "labour" && <><Field label="Full name" name="name" placeholder="Worker name" required/><Field label="Employee ID" name="employeeCode" placeholder="e.g. AM-1234"/><Field label="Trade / skill" name="trade" placeholder="e.g. Electrician" required/><Field label="Phone" name="phone" placeholder="+966"/><SelectField label="Rental company" name="companyId" required options={data.companies.map((company) => ({ value: company.id, label: company.name }))}/><SelectField label="Assign to project" name="projectId" options={[{ value: "", label: "Keep unassigned" }, ...data.projects.map((project) => ({ value: project.id, label: project.name }))]}/></>}
    {entity === "equipment" && <><Field label="Equipment name" name="name" placeholder="e.g. CAT 320 Excavator" required/><Field label="Asset ID" name="assetCode" placeholder="e.g. DF-EX-205"/><Field label="Category" name="category" placeholder="e.g. Excavator" required/><Field label="Daily rate (SAR)" name="dailyRate" type="number" placeholder="0"/><SelectField label="Rental company" name="companyId" required options={data.companies.map((company) => ({ value: company.id, label: company.name }))}/><SelectField label="Assign to project" name="projectId" options={[{ value: "", label: "Keep unassigned" }, ...data.projects.map((project) => ({ value: project.id, label: project.name }))]}/></>}
  </div><div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving…" : `Add ${entityLabels[entity]}`}</button></div></form></section></div>;
}

function Field({ label, name, type = "text", placeholder, required, options, wide }: { label: string; name: string; type?: string; placeholder?: string; required?: boolean; options?: string[]; wide?: boolean }) {
  return <label className={wide ? "field wide" : "field"}><span>{label}{required && <b>*</b>}</span>{type === "select" ? <select name={name} required={required}>{options?.map((option) => <option key={option}>{option}</option>)}</select> : <input name={name} type={type} placeholder={placeholder} required={required} min={type === "number" ? "0" : undefined}/>}</label>;
}

function SelectField({ label, name, options, required }: { label: string; name: string; options: Array<{ value: string; label: string }>; required?: boolean }) {
  return <label className="field"><span>{label}{required && <b>*</b>}</span><select name={name} required={required}><option value="" disabled={required}>Select {label.toLowerCase()}</option>{options.map((option) => <option key={`${name}-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>;
}
