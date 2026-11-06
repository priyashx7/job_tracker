/* ---------- Defaults & state ---------- */
const DEFAULT_CONFIG = {
  visibleColumns: { strategy: true, status: true, health: true, notes: true, updated: true },

  // Roles YOU are searching for at a company
  searchRoles: [
    "Software Engineer", "Frontend Engineer", "Backend Engineer", "Full Stack Engineer",
    "Product Engineer", "Engineering Manager", "Product Manager", "Founding Engineer",
    "Solutions Architect"
  ],

  // Roles of the PEOPLE you reach out to
  personRoles: [
    "Recruiter / Talent", "HR / People Partner", "Hiring Manager", "Engineering Manager",
    "Product Manager", "Team Member / Peer", "Alumni", "Executive / Founder"
  ],

  // Stages with a PERSON (independent of the company status)
  personStages: [
    "Request sent", "Accepted", "Message sent", "Follow-up sent", "Responded",
    "Referral asked", "Referral received"
  ],

  // Company level statuses and their sub-categories
  statusHierarchy: {
    "Applied": ["Reached out", "Application submitted", "Referral requested", "Referral received", "Responded"],
    "In process": ["Recruiter Screen", "Hiring Manager Interview", "Technical Round", "Final Loop / Onsite"],
    "Succeeded": ["Verbal Offer", "Offer Letter Received", "Negotiation", "Offer Accepted"],
    "Rejected": ["Resume Screen", "Post-Interview", "Position Closed / Ghosted"]
  },

  approaches: [
    "LinkedIn InMail / DM", "Cold Email", "Employee Referral", "Mutual Connection",
    "Twitter / X DM", "Alumni Network", "Careers Portal / Direct Apply"
  ]
};

const STALE_DAYS = 5;

const clone = o => JSON.parse(JSON.stringify(o));

let config = clone(DEFAULT_CONFIG);
let draft = null;          // working copy of config while Settings is open (nothing is saved until confirmed)
let pendingConfirm = null; // function to run when the confirm popup is accepted
let data = [];
let open = null;
let filter = "All";
let activeMenuCoId = null;
let activeMenuPId = null;

const DOTS_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="12" cy="19" r="2"/></svg>`;
const EDIT_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
const TRASH_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const CHEVRON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

const $ = id => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 9);
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- Helpers ---------- */
const getStatuses = () => Object.keys(config.statusHierarchy || {});
const getSubcategories = status => (config.statusHierarchy && config.statusHierarchy[status]) || [];

function days(d) {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
}

function formatCalendarDate(isoStr) {
  const dt = isoStr ? new Date(isoStr) : new Date();
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatRelativeTime(isoStr) {
  if (!isoStr) return "Today";
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 864e5);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff} days ago`;
}

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Picks a colour tone for an overall status
function tone(name) {
  const n = (name || "").toLowerCase();
  if (/reject|closed|declin|ghost/.test(n)) return "red";
  if (/succe|offer|hired|won|accepted/.test(n)) return "green";
  if (/process|interview|progress|screen/.test(n)) return "amber";
  if (/appl/.test(n)) return "blue";
  const idx = Math.max(0, getStatuses().indexOf(name));
  return ["blue", "purple", "teal", "amber"][idx % 4];
}

function showToast(message, type = "info") {
  const container = $("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast";
  const color = type === "success" ? "var(--ok)" : type === "warn" ? "var(--warn)" : "var(--primary)";
  el.innerHTML = `<span style="color:${color}">●</span><span>${esc(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = "all 0.2s ease";
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

/* ---------- Confirm popup (used for every delete and for saving settings) ---------- */
// options: { title, message (html, escape any user text first), items[], note, confirmLabel, danger, onConfirm }
function askConfirm(opts) {
  pendingConfirm = opts.onConfirm || null;
  $("confirmTitle").textContent = opts.title || "Are you sure?";
  $("confirmTitle").style.color = opts.danger ? "var(--bad)" : "";
  $("confirmMessage").innerHTML = opts.message || "";

  const list = $("confirmList");
  const items = opts.items || [];
  if (items.length) {
    const MAX = 12;
    const shown = items.slice(0, MAX).map(i => `<li>${esc(i)}</li>`);
    if (items.length > MAX) shown.push(`<li>and ${items.length - MAX} more</li>`);
    list.innerHTML = shown.join("");
    list.hidden = false;
  } else {
    list.innerHTML = "";
    list.hidden = true;
  }

  const note = $("confirmNote");
  note.textContent = opts.note || "";
  note.hidden = !opts.note;

  const ok = $("okConfirmBtn");
  ok.textContent = opts.confirmLabel || "Confirm";
  ok.className = "btn " + (opts.danger ? "btn-danger-solid" : "btn-primary");
  showModal("confirmModal");
  ok.focus();
}

function closeConfirm() {
  pendingConfirm = null;
  hideModal("confirmModal");
}

$("okConfirmBtn").onclick = () => {
  const fn = pendingConfirm;
  closeConfirm();
  if (fn) fn();
};
$("cancelConfirmBtn").onclick = closeConfirm;
$("closeConfirmBtn").onclick = closeConfirm;

/* ---------- Storage ---------- */

// Turns any saved or imported config (old or new) into the current shape
function normalizeConfig(parsed) {
  const out = clone(DEFAULT_CONFIG);
  if (!parsed || typeof parsed !== "object") return out;

  if (parsed.visibleColumns) out.visibleColumns = Object.assign({}, out.visibleColumns, parsed.visibleColumns);

  // Old configs had a single "roles" list. It becomes the searching roles.
  if (Array.isArray(parsed.searchRoles) && parsed.searchRoles.length) out.searchRoles = parsed.searchRoles.slice();
  else if (Array.isArray(parsed.roles) && parsed.roles.length) out.searchRoles = parsed.roles.slice();

  if (Array.isArray(parsed.personRoles) && parsed.personRoles.length) out.personRoles = parsed.personRoles.slice();
  if (Array.isArray(parsed.personStages) && parsed.personStages.length) out.personStages = parsed.personStages.slice();

  if (parsed.statusHierarchy && Object.keys(parsed.statusHierarchy).length) out.statusHierarchy = clone(parsed.statusHierarchy);
  if (Array.isArray(parsed.approaches) && parsed.approaches.length) out.approaches = parsed.approaches.slice();
  return out;
}

function loadConfig() {
  try {
    const raw = localStorage.getItem("jot-config");
    config = normalizeConfig(raw ? JSON.parse(raw) : null);
  } catch (e) {
    config = clone(DEFAULT_CONFIG);
  }
}

function saveConfig() {
  try { localStorage.setItem("jot-config", JSON.stringify(config)); } catch (e) { }
}

function save() {
  try { localStorage.setItem("jot", JSON.stringify(data)); } catch (e) { }
}

function sampleData() {
  const hrs = h => new Date(Date.now() - h * 3600e3).toISOString();
  const dayStr = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  return [
    {
      id: "demo1", company: "Northwind Labs", role: "Product Engineer", type: "Proactive",
      approach: "LinkedIn InMail / DM", status: "Applied", subCategory: "Referral requested",
      comment: "Sample company. Delete it when you start adding your own.",
      updatedAt: hrs(2),
      contacts: [
        { id: "c1", name: "Maya Rivera", role: "Hiring Manager", url: "https://linkedin.com/in/example", stage: "Responded", comment: "Asked me to send over a short portfolio.", date: today(), updatedAt: hrs(2) },
        { id: "c2", name: "Sam Okafor", role: "Recruiter / Talent", url: "", stage: "Request sent", comment: "", date: dayStr(7), updatedAt: hrs(168) },
        { id: "c3", name: "Lena Park", role: "Team Member / Peer", url: "", stage: "Referral asked", comment: "", date: dayStr(2), updatedAt: hrs(48) }
      ]
    },
    {
      id: "demo2", company: "Brightside Cloud", role: "Frontend Engineer", type: "Reactive",
      approach: "Careers Portal / Direct Apply", status: "In process", subCategory: "Technical Round",
      comment: "Technical round booked for next week.", updatedAt: hrs(30), contacts: []
    }
  ];
}

function load() {
  loadConfig();
  try {
    const raw = localStorage.getItem("jot");
    if (raw) {
      data = JSON.parse(raw);
    } else {
      data = sampleData();
      save();
    }
  } catch (e) {
    data = [];
  }
}

/* ---------- Derived info ---------- */
function getLatestUpdateInfo(c) {
  let latest = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
  (c.contacts || []).forEach(p => {
    const t = p.updatedAt ? new Date(p.updatedAt).getTime() : (p.date ? new Date(p.date).getTime() : 0);
    if (t > latest) latest = t;
  });
  const iso = latest > 0 ? new Date(latest).toISOString() : (c.updatedAt || nowIso());
  return { iso, calendarDate: formatCalendarDate(iso), relativeText: formatRelativeTime(iso) };
}

// Nudge uses PERSON stages, never the company sub-categories
function getSubStageNudge(c) {
  if (/succe|reject/i.test(c.status || "")) return "";
  const stages = config.personStages || [];
  const contacts = c.contacts || [];
  if (!contacts.length || !stages.length) return "";
  const ranked = contacts.map(p => ({ p, r: stages.indexOf(p.stage) })).filter(x => x.r >= 0);
  if (!ranked.length) return "";
  const best = Math.max(...ranked.map(x => x.r));
  if (best >= stages.length - 1) return "";
  const atBest = ranked.filter(x => x.r === best);
  const last = Math.min(...atBest.map(x => days(x.p.date || x.p.updatedAt)));
  if (last < STALE_DAYS) return "";
  return best === 0 ? `No movement in ${last}d` : `No reply in ${last}d`;
}

/* ---------- Dropdown syncing ---------- */
function optionList(list, selected, placeholder) {
  const items = [...list];
  if (selected && !items.includes(selected)) items.unshift(selected);
  return (placeholder ? `<option value="">${placeholder}</option>` : "") +
    items.map(r => `<option value="${esc(r)}" ${r === selected ? "selected" : ""}>${esc(r)}</option>`).join("");
}

const searchRoleOptions = selected => optionList(config.searchRoles || [], selected, "Select searching role...");
const personRoleOptions = selected => optionList(config.personRoles || [], selected, "Select person role...");
const approachOptions = selected => optionList(config.approaches || [], selected, "Select approach...");
function stageOptions(selected) {
  const list = (config.personStages && config.personStages.length) ? config.personStages : ["Contacted"];
  return optionList(list, selected || list[0], "");
}

function subcatOptions(status, selected) {
  const subs = getSubcategories(status);
  return subs.length
    ? subs.map(s => `<option value="${esc(s)}" ${s === selected ? "selected" : ""}>${esc(s)}</option>`).join("")
    : `<option value="General">General</option>`;
}

function syncDropdownOptions() {
  const statuses = getStatuses();
  if ($("nRole")) $("nRole").innerHTML = searchRoleOptions($("nRole").value);
  if ($("nApproach")) $("nApproach").innerHTML = approachOptions($("nApproach").value);
  if ($("nStatus")) {
    const cur = statuses.includes($("nStatus").value) ? $("nStatus").value : statuses[0];
    $("nStatus").innerHTML = statuses.map(s => `<option value="${esc(s)}" ${s === cur ? "selected" : ""}>${esc(s)}</option>`).join("");
    updateAddSubCategoryOptions();
  }
}

function updateAddSubCategoryOptions() {
  $("nSubCategory").innerHTML = subcatOptions($("nStatus").value || getStatuses()[0]);
}

function updateEditSubCategoryOptions(selected) {
  $("editSubCategory").innerHTML = subcatOptions($("editStatus").value || getStatuses()[0], selected);
}

$("nStatus").addEventListener("change", updateAddSubCategoryOptions);
$("editStatus").addEventListener("change", () => updateEditSubCategoryOptions());

/* ---------- Rendering ---------- */
function renderTableHeaders() {
  const cols = config.visibleColumns;
  let h = `<tr><th style="min-width:240px;">Company and searching role</th>`;
  if (cols.strategy) h += `<th style="width:17%;">Strategy and approach</th>`;
  if (cols.status) h += `<th style="width:14%;">Overall status</th>`;
  if (cols.health) h += `<th style="width:18%;">Sub-category</th>`;
  if (cols.notes) h += `<th style="width:18%;">Notes and comments</th>`;
  if (cols.updated) h += `<th style="width:13%;">Updated</th>`;
  h += `<th style="width:60px;text-align:right;">Actions</th></tr>`;
  $("tableHead").innerHTML = h;
}

function renderContactCard(c, p) {
  const isStale = days(p.date || p.updatedAt) >= STALE_DAYS;
  const cleanUrl = (p.url || "").replace(/^https?:\/\/(www\.)?/, "");
  const when = `${formatCalendarDate(p.updatedAt || p.date)} • ${formatRelativeTime(p.updatedAt || p.date)}`;
  const ref = `${c.id}|${p.id}`;
  return `
    <div class="contact-card">
      <div class="contact-top-row">
        <div class="contact-name-col">
          <div class="contact-avatar">${esc((p.name || "U").charAt(0).toUpperCase())}</div>
          <div class="contact-person-info">
            <span class="contact-person-name">${esc(p.name)}</span>
            <span class="contact-person-role">${esc(p.role || "Role unspecified")}</span>
          </div>
        </div>
        <div class="contact-link-col">
          ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" title="${esc(p.url)}">${esc(cleanUrl)}</a>` : `<span class="no-link">No LinkedIn link</span>`}
        </div>
        <div>
          <select class="stage-select" data-pst="${ref}" aria-label="Stage">
            ${stageOptions(p.stage)}
          </select>
        </div>
        <div><span class="contact-date-badge ${isStale ? "stale" : ""}">${esc(when)}</span></div>
        <div class="contact-actions-col">
          <button class="btn-dots" data-pdots="${p.id}" title="Person actions" aria-label="Person options">${DOTS_SVG}</button>
          <div class="action-dropdown ${activeMenuPId === p.id ? "show" : ""}">
            <button class="dropdown-item" data-paction="edit" data-ref="${ref}">${EDIT_SVG}<span>Edit person</span></button>
            <button class="dropdown-item danger" data-paction="delete" data-ref="${ref}">${TRASH_SVG}<span>Remove person</span></button>
          </div>
        </div>
      </div>
      ${p.comment ? `<div class="contact-note-display-box">${esc(p.comment)}</div>` : ""}
    </div>`;
}

// Menus are position:fixed, so place them next to their button
function placeMenu() {
  document.querySelectorAll(".action-dropdown.show").forEach(m => {
    const b = m.parentElement.querySelector("[data-dots],[data-pdots]");
    if (!b) return;
    const r = b.getBoundingClientRect();
    const h = m.offsetHeight;
    m.style.left = Math.max(8, r.right - m.offsetWidth) + "px";
    m.style.top = (r.bottom + 4 + h > window.innerHeight ? r.top - h - 4 : r.bottom + 4) + "px";
  });
}

function closeMenus() {
  if (activeMenuCoId || activeMenuPId) {
    activeMenuCoId = null;
    activeMenuPId = null;
    render();
  }
}

window.addEventListener("scroll", closeMenus, true);
window.addEventListener("resize", closeMenus);

function render() {
  syncDropdownOptions();
  renderTableHeaders();

  const statuses = getStatuses();
  const cols = config.visibleColumns;

  $("tabs").innerHTML = ["All", ...statuses].map(t => {
    const count = t === "All" ? data.length : data.filter(c => c.status === t).length;
    const tn = t === "All" ? "neutral" : tone(t);
    return `<button class="tab-btn tone-${tn} ${filter === t ? "active" : ""}" data-t="${esc(t)}">${t === "All" ? "" : `<span class="tab-dot"></span>`}<span>${esc(t)}</span><span class="tab-badge">${count}</span></button>`;
  }).join("");

  const q = $("q").value.trim().toLowerCase();
  $("clearSearch").classList.toggle("show", q.length > 0);

  const rows = data.filter(c => {
    if (filter !== "All" && c.status !== filter) return false;
    const hay = [
      c.company, c.role, c.type, c.approach, c.subCategory, c.comment,
      ...(c.contacts || []).map(p => `${p.name} ${p.role || ""} ${p.stage || ""} ${p.comment || ""}`)
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });

  const totalCols = 2 + ["strategy", "status", "health", "notes", "updated"].filter(k => cols[k]).length;

  if (!rows.length) {
    const filtered = data.length > 0;
    $("body").innerHTML = `
      <tr><td colspan="${totalCols}">
        <div class="empty-state">
          <div class="empty-title">${filtered ? "No matching companies" : "No companies tracked yet"}</div>
          <p class="empty-desc">${filtered ? "Try a different search or switch to another status tab." : "Add the companies you are targeting to start tracking your outreach."}</p>
          ${filtered ? "" : `<button class="btn btn-primary" data-open-add="1">Add your first company</button>`}
        </div>
      </td></tr>`;
    return;
  }

  $("body").innerHTML = rows.map(c => {
    const isOpen = open === c.id;
    const isProactive = c.type === "Proactive";
    const info = getLatestUpdateInfo(c);
    const subs = getSubcategories(c.status);
    const activeSub = c.subCategory || subs[0] || "";
    const nudge = getSubStageNudge(c);
    const contactNotes = (c.contacts || []).filter(p => p.comment && p.comment.trim());
    const hasNote = Boolean(c.comment && c.comment.trim());
    const tn = tone(c.status);

    let html = `
      <tr class="co-row tone-${tn} ${isOpen ? "is-open" : ""}" data-id="${c.id}">
        <td>
          <div class="company-cell">
            <button class="btn-chevron-toggle ${isOpen ? "open" : ""}" data-toggle-co="${c.id}" title="Show or hide people" aria-label="Toggle people">${CHEVRON_SVG}</button>
            <div class="company-logo">${esc((c.company || "C").trim().charAt(0).toUpperCase())}</div>
            <div class="company-meta">
              <span class="company-name">${esc(c.company)}</span>
              <span class="company-role">${esc(c.role || "No role specified")}</span>
            </div>
          </div>
        </td>`;

    if (cols.strategy) {
      html += `
        <td>
          <div class="strategy-approach-cell">
            <span class="badge ${isProactive ? "badge-proactive" : "badge-reactive"}">${esc(c.type || "Proactive")}</span>
            <span class="approach-tag">${esc(c.approach || (isProactive ? "Direct outreach" : "Job application"))}</span>
          </div>
        </td>`;
    }

    if (cols.status) {
      html += `
        <td>
          <select class="status-pill-select" data-st="${c.id}" aria-label="Change status">
            ${statuses.map(s => `<option value="${esc(s)}" ${s === c.status ? "selected" : ""}>${esc(s)}</option>`).join("")}
          </select>
        </td>`;
    }

    if (cols.health) {
      html += `
        <td>
          <div class="subcategory-cell">
            <select class="subcategory-pill-select" data-subcat="${c.id}" aria-label="Sub-category for ${esc(c.status)}">
              ${subcatOptions(c.status, activeSub)}
            </select>
            ${nudge ? `<div class="nudge-badge">${esc(nudge)}</div>` : ""}
          </div>
        </td>`;
    }

    if (cols.notes) {
      html += `
        <td>
          <div class="notes-cell">
            ${hasNote ? `<div class="company-note-preview" title="${esc(c.comment)}">${esc(c.comment)}</div>` : (!contactNotes.length ? `<span class="no-notes-text">No notes yet</span>` : "")}
            ${contactNotes.length ? `<div class="contact-notes-pill" title="${esc(contactNotes.map(p => `${p.name}: ${p.comment}`).join("\n"))}">${contactNotes.length} person note${contactNotes.length > 1 ? "s" : ""}</div>` : ""}
          </div>
        </td>`;
    }

    if (cols.updated) {
      html += `
        <td>
          <div class="date-cell" title="Updated: ${esc(info.iso)}">
            <span class="date-main">${esc(info.calendarDate)}</span>
            <span class="date-sub">${esc(info.relativeText)}</span>
          </div>
        </td>`;
    }

    html += `
        <td>
          <div class="action-cell">
            <button class="btn-dots" data-dots="${c.id}" title="Company actions" aria-label="Company options">${DOTS_SVG}</button>
            <div class="action-dropdown ${activeMenuCoId === c.id ? "show" : ""}">
              <button class="dropdown-item" data-action="edit" data-co="${c.id}">${EDIT_SVG}<span>Edit company</span></button>
              <button class="dropdown-item danger" data-action="delete" data-co="${c.id}">${TRASH_SVG}<span>Delete company</span></button>
            </div>
          </div>
        </td>
      </tr>`;

    if (isOpen) {
      html += `
        <tr class="detail-row">
          <td colspan="${totalCols}">
            <div class="detail-panel">
              <div class="detail-header">
                <div class="detail-title">
                  <span>People reached out to at ${esc(c.company)}</span>
                  <span class="tab-badge">${(c.contacts || []).length}</span>
                </div>
                <button class="btn btn-primary btn-sm" data-open-person="${c.id}">Add person</button>
              </div>
              ${(c.contacts && c.contacts.length)
          ? `<div class="contacts-container">${c.contacts.map(p => renderContactCard(c, p)).join("")}</div>`
          : `<div class="no-notes-text">No one added yet. Use Add person to log your first contact.</div>`}
            </div>
          </td>
        </tr>`;
    }
    return html;
  }).join("");

  placeMenu();
}

/* ---------- Modal helpers ---------- */
const MODALS = ["addForm", "personModal", "editModal", "settingsModal", "confirmModal"];
const showModal = id => $(id).classList.add("show");
const hideModal = id => $(id).classList.remove("show");

function openAddModal() {
  syncDropdownOptions();
  showModal("addForm");
  $("nCo").focus();
}

function openEditModal(coId) {
  const c = data.find(x => x.id === coId);
  if (!c) return;
  $("editId").value = c.id;
  $("editCo").value = c.company || "";
  $("editType").value = c.type || "Proactive";
  $("editRole").innerHTML = searchRoleOptions(c.role);
  $("editApproach").innerHTML = approachOptions(c.approach);
  $("editStatus").innerHTML = getStatuses().map(s => `<option value="${esc(s)}" ${s === c.status ? "selected" : ""}>${esc(s)}</option>`).join("");
  updateEditSubCategoryOptions(c.subCategory);
  $("editComment").value = c.comment || "";
  showModal("editModal");
}

function openPersonModal(coId, pId) {
  const c = data.find(x => x.id === coId);
  if (!c) return;
  const p = pId ? (c.contacts || []).find(x => x.id === pId) : null;

  $("pCo").value = coId;
  $("pId").value = pId || "";
  $("personModalTitle").textContent = p ? `Edit person at ${c.company}` : `Add person at ${c.company}`;
  $("savePersonBtn").textContent = p ? "Save changes" : "Add person";
  $("pn").value = p ? p.name : "";
  $("pr").innerHTML = personRoleOptions(p ? p.role : "");
  $("pu").value = p ? (p.url || "") : "";
  // Person stages are independent of the company status, so every stage is always available
  $("ps").innerHTML = stageOptions(p ? p.stage : "");
  $("pnNote").value = p ? (p.comment || "") : "";
  showModal("personModal");
  $("pn").focus();
}

/* ---------- Delete company / person (confirmed in the popup) ---------- */
function openDeleteConfirmModal(coId) {
  const c = data.find(x => x.id === coId);
  if (!c) return;
  const people = (c.contacts || []).length;
  askConfirm({
    title: "Delete company",
    message: `Delete <strong>${esc(c.company)}</strong>?`,
    note: `This permanently removes the company${people ? ` and its ${people} contact${people > 1 ? "s" : ""}` : ""}. It can’t be undone.`,
    confirmLabel: "Delete company",
    danger: true,
    onConfirm: () => {
      data = data.filter(x => x.id !== coId);
      if (open === coId) open = null;
      save();
      render();
      showToast(`Deleted ${c.company}`);
    }
  });
}

function openDeletePersonModal(coId, pId, personName) {
  askConfirm({
    title: "Remove person",
    message: `Remove <strong>${esc(personName)}</strong>?`,
    note: "This permanently removes this person from the company. It can’t be undone.",
    confirmLabel: "Remove person",
    danger: true,
    onConfirm: () => {
      const c = data.find(x => x.id === coId);
      if (c) {
        c.contacts = (c.contacts || []).filter(p => p.id !== pId);
        c.updatedAt = nowIso();
        save();
      }
      render();
      showToast(`Removed ${personName}`);
    }
  });
}

/* ---------- Settings (edits a draft, saved only after confirmation) ---------- */
const SIMPLE_LISTS = {
  searchRoles: { box: "roleChips", label: "searching role", plural: "searching roles", ordered: false },
  personRoles: { box: "personRoleChips", label: "person role", plural: "person roles", ordered: false },
  personStages: { box: "stageChips", label: "person stage", plural: "person stages", ordered: true },
  approaches: { box: "approachChips", label: "approach", plural: "approaches", ordered: false }
};

const COL_MAP = { colStrategy: "strategy", colStatus: "status", colHealth: "health", colNotes: "notes", colUpdated: "updated" };
const COL_NAMES = { strategy: "Strategy and approach", status: "Overall status", health: "Sub-category", notes: "Notes and comments", updated: "Last updated date" };

const settingsChanged = () => Boolean(draft) && JSON.stringify(draft) !== JSON.stringify(config);

function updateSettingsFooter() {
  const changed = settingsChanged();
  $("doneSettingsBtn").disabled = !changed;
  const hint = $("settingsHint");
  hint.textContent = changed ? "You have unsaved changes" : "No changes yet";
  hint.classList.toggle("dirty", changed);
}

function renderList(listKey) {
  if (!draft) return;
  const meta = SIMPLE_LISTS[listKey];
  const list = draft[listKey] || [];
  $(meta.box).innerHTML = list.map((item, i) => `
    <span class="chip">${meta.ordered ? `<span class="chip-order">${i + 1}</span>` : ""}<span>${esc(item)}</span>
    ${list.length > 1 ? `<button class="chip-remove" data-del-list="${listKey}|${i}" title="Remove ${meta.label}">✕</button>` : ""}</span>`).join("");
}

function renderAllLists() {
  Object.keys(SIMPLE_LISTS).forEach(renderList);
}

function addToList(listKey, inputId) {
  if (!draft) return;
  const val = $(inputId).value.trim();
  if (!val) return;
  if (!draft[listKey].includes(val)) {
    draft[listKey].push(val);
    $(inputId).value = "";
    renderList(listKey);
    updateSettingsFooter();
  }
}

function renderSettingsHierarchy() {
  if (!draft) return;
  const statuses = Object.keys(draft.statusHierarchy || {});
  $("statusHierarchyContainer").innerHTML = statuses.map(name => {
    const subs = draft.statusHierarchy[name] || [];
    return `
      <div class="status-card-config">
        <div class="status-card-header">
          <div class="status-badge-title">
            <span class="badge">${esc(name)}</span>
            <span style="font-size:12px;color:var(--ink-muted);font-weight:500;">${subs.length} sub-categor${subs.length === 1 ? "y" : "ies"}</span>
          </div>
          ${statuses.length > 1 ? `<button class="btn btn-sm btn-danger" data-del-status="${esc(name)}">Remove status</button>` : ""}
        </div>
        <div class="subcategories-container">
          <span class="subcategories-label">Sub-categories for ${esc(name)}</span>
          <div class="chip-container">
            ${subs.length ? subs.map((sc, i) => `
              <span class="chip"><span>${esc(sc)}</span><button class="chip-remove" data-del-sub="${esc(name)}|${i}" title="Remove sub-category">✕</button></span>`).join("")
        : `<span style="font-size:12px;color:var(--ink-faint);font-style:italic;">No sub-categories yet</span>`}
          </div>
          <div class="chip-add-bar">
            <input data-sub-input="${esc(name)}" placeholder="Add a sub-category under ${esc(name)}" autocomplete="off">
            <button class="btn btn-sm btn-primary" data-add-sub="${esc(name)}">Add</button>
          </div>
        </div>
      </div>`;
  }).join("");
}

function openSettingsModal() {
  draft = clone(config);
  const cols = draft.visibleColumns;
  Object.keys(COL_MAP).forEach(id => { $(id).checked = cols[COL_MAP[id]] !== false; });
  renderAllLists();
  renderSettingsHierarchy();
  updateSettingsFooter();
  showModal("settingsModal");
}

// Closing Settings in any way (Cancel, the X, Escape, clicking outside) throws the draft away
function closeSettings() {
  draft = null;
  ["newRoleInput", "newPersonRoleInput", "newStageInput", "newApproachInput", "newOverallStatusInput"].forEach(id => { $(id).value = ""; });
  hideModal("settingsModal");
}

function describeChanges(before, after) {
  const out = [];
  Object.keys(SIMPLE_LISTS).forEach(k => {
    const b = before[k] || [], a = after[k] || [];
    a.filter(x => !b.includes(x)).forEach(x => out.push(`Add "${x}" to ${SIMPLE_LISTS[k].plural}`));
    b.filter(x => !a.includes(x)).forEach(x => out.push(`Remove "${x}" from ${SIMPLE_LISTS[k].plural}`));
  });
  const bs = before.statusHierarchy || {}, as = after.statusHierarchy || {};
  Object.keys(as).filter(s => !(s in bs)).forEach(s => out.push(`Add overall status "${s}"`));
  Object.keys(bs).filter(s => !(s in as)).forEach(s => out.push(`Remove overall status "${s}"`));
  Object.keys(as).filter(s => s in bs).forEach(s => {
    as[s].filter(x => !bs[s].includes(x)).forEach(x => out.push(`Add sub-category "${x}" under ${s}`));
    bs[s].filter(x => !as[s].includes(x)).forEach(x => out.push(`Remove sub-category "${x}" from ${s}`));
  });
  Object.keys(COL_NAMES).forEach(k => {
    const was = (before.visibleColumns || {})[k] !== false;
    const now = (after.visibleColumns || {})[k] !== false;
    if (was !== now) out.push(`${now ? "Show" : "Hide"} column "${COL_NAMES[k]}"`);
  });
  return out.length ? out : ["Update settings"];
}

/* ---------- Click handling ---------- */
document.addEventListener("click", e => {
  const t = e.target;

  // Click on a modal backdrop closes that modal (Settings discards its draft)
  if (t.classList && t.classList.contains("modal-overlay")) {
    if (t.id === "confirmModal") closeConfirm();
    else if (t.id === "settingsModal") closeSettings();
    else hideModal(t.id);
    return;
  }

  // Click outside an open three dot menu closes it
  let menuWasOpen = false;
  if ((activeMenuCoId || activeMenuPId) && !t.closest(".action-dropdown, [data-dots], [data-pdots]")) {
    activeMenuCoId = null;
    activeMenuPId = null;
    menuWasOpen = true;
  }

  const tab = t.closest("[data-t]");
  if (tab) { filter = tab.dataset.t; render(); return; }

  if (t.closest("[data-open-add]")) { openAddModal(); return; }

  const chevron = t.closest("[data-toggle-co]");
  if (chevron) {
    open = open === chevron.dataset.toggleCo ? null : chevron.dataset.toggleCo;
    render();
    return;
  }

  const dots = t.closest("[data-dots]");
  if (dots) {
    const id = dots.dataset.dots;
    activeMenuCoId = activeMenuCoId === id ? null : id;
    activeMenuPId = null;
    render();
    return;
  }

  const pDots = t.closest("[data-pdots]");
  if (pDots) {
    const id = pDots.dataset.pdots;
    activeMenuPId = activeMenuPId === id ? null : id;
    activeMenuCoId = null;
    render();
    return;
  }

  const coAction = t.closest("[data-action]");
  if (coAction) {
    const coId = coAction.dataset.co;
    activeMenuCoId = null;
    render();
    if (coAction.dataset.action === "edit") openEditModal(coId);
    else openDeleteConfirmModal(coId);
    return;
  }

  const pAction = t.closest("[data-paction]");
  if (pAction) {
    const [coId, pId] = pAction.dataset.ref.split("|");
    activeMenuPId = null;
    render();
    if (pAction.dataset.paction === "edit") {
      openPersonModal(coId, pId);
    } else {
      const c = data.find(x => x.id === coId);
      const p = c && c.contacts.find(x => x.id === pId);
      openDeletePersonModal(coId, pId, p ? p.name : "this person");
    }
    return;
  }

  const addPerson = t.closest("[data-open-person]");
  if (addPerson) { openPersonModal(addPerson.dataset.openPerson); return; }

  // Settings: remove an item from a simple list (confirm first)
  const delList = t.closest("[data-del-list]");
  if (delList && draft) {
    const [listKey, idx] = delList.dataset.delList.split("|");
    const item = (draft[listKey] || [])[parseInt(idx, 10)];
    if (item === undefined) return;
    const meta = SIMPLE_LISTS[listKey];
    askConfirm({
      title: `Remove ${meta.label}`,
      message: `Remove <strong>${esc(item)}</strong> from ${esc(meta.plural)}?`,
      note: "This is applied only when you save your settings.",
      confirmLabel: "Remove",
      danger: true,
      onConfirm: () => {
        if (!draft) return;
        const list = draft[listKey];
        const i = list.indexOf(item);
        if (i >= 0 && list.length > 1) list.splice(i, 1);
        renderList(listKey);
        updateSettingsFooter();
      }
    });
    return;
  }

  // Settings: add sub-category
  const addSub = t.closest("[data-add-sub]");
  if (addSub && draft) {
    const name = addSub.dataset.addSub;
    const input = Array.from(document.querySelectorAll("[data-sub-input]")).find(i => i.dataset.subInput === name);
    const val = input ? input.value.trim() : "";
    if (val) {
      if (!draft.statusHierarchy[name]) draft.statusHierarchy[name] = [];
      if (!draft.statusHierarchy[name].includes(val)) {
        draft.statusHierarchy[name].push(val);
        renderSettingsHierarchy();
        updateSettingsFooter();
      }
    }
    return;
  }

  // Settings: remove sub-category (confirm first)
  const delSub = t.closest("[data-del-sub]");
  if (delSub && draft) {
    const [name, idx] = delSub.dataset.delSub.split("|");
    const item = (draft.statusHierarchy[name] || [])[parseInt(idx, 10)];
    if (item === undefined) return;
    askConfirm({
      title: "Remove sub-category",
      message: `Remove <strong>${esc(item)}</strong> from <strong>${esc(name)}</strong>?`,
      note: "This is applied only when you save your settings.",
      confirmLabel: "Remove",
      danger: true,
      onConfirm: () => {
        if (!draft || !draft.statusHierarchy[name]) return;
        const list = draft.statusHierarchy[name];
        const i = list.indexOf(item);
        if (i >= 0) list.splice(i, 1);
        renderSettingsHierarchy();
        updateSettingsFooter();
      }
    });
    return;
  }

  // Settings: remove status (confirm first)
  const delStatus = t.closest("[data-del-status]");
  if (delStatus && draft) {
    const name = delStatus.dataset.delStatus;
    if (Object.keys(draft.statusHierarchy).length <= 1) return;
    const inUse = data.filter(c => c.status === name).length;
    askConfirm({
      title: "Remove status",
      message: `Remove the status <strong>${esc(name)}</strong> and all its sub-categories?`,
      note: (inUse ? `${inUse} compan${inUse === 1 ? "y uses" : "ies use"} this status right now and will need a new one. ` : "") + "This is applied only when you save your settings.",
      confirmLabel: "Remove status",
      danger: true,
      onConfirm: () => {
        if (!draft) return;
        delete draft.statusHierarchy[name];
        renderSettingsHierarchy();
        updateSettingsFooter();
      }
    });
    return;
  }

  // Click anywhere on a company row (not on a control) toggles its people
  const tr = t.closest("tr.co-row");
  if (tr && !t.closest("select, button, a, input, .action-dropdown")) {
    open = open === tr.dataset.id ? null : tr.dataset.id;
    render();
    return;
  }

  if (menuWasOpen) render();
});

/* ---------- Dropdown changes in the table ---------- */
document.addEventListener("change", e => {
  const t = e.target;

  if (t.dataset.st) {
    const c = data.find(x => x.id === t.dataset.st);
    if (c) {
      c.status = t.value;
      c.subCategory = getSubcategories(c.status)[0] || "General";
      c.updatedAt = nowIso();
      save();
      render();
      showToast(`Updated ${c.company} to ${t.value}`);
    }
  }

  if (t.dataset.subcat) {
    const c = data.find(x => x.id === t.dataset.subcat);
    if (c) {
      c.subCategory = t.value;
      c.updatedAt = nowIso();
      save();
      render();
      showToast(`Updated sub-category to ${t.value}`);
    }
  }

  if (t.dataset.pst) {
    const [coId, pId] = t.dataset.pst.split("|");
    const c = data.find(x => x.id === coId);
    const p = c && c.contacts.find(x => x.id === pId);
    if (p) {
      const ts = nowIso();
      p.stage = t.value;
      p.date = today();
      p.updatedAt = ts;
      c.updatedAt = ts;
      save();
      render();
      showToast(`Updated ${p.name} to ${t.value}`);
    }
  }
});

/* ---------- Search ---------- */
$("q").addEventListener("input", render);
$("clearSearch").addEventListener("click", () => { $("q").value = ""; render(); $("q").focus(); });

/* ---------- Add company ---------- */
$("addBtn").onclick = openAddModal;
$("closeAddBtn").onclick = () => hideModal("addForm");
$("cancelAdd").onclick = () => hideModal("addForm");

$("save").onclick = () => {
  const company = $("nCo").value.trim();
  if (!company) return $("nCo").focus();
  const type = $("nType").value;
  const status = $("nStatus").value || getStatuses()[0] || "Applied";
  const c = {
    id: uid(),
    company,
    role: $("nRole").value.trim(),
    type,
    approach: $("nApproach").value.trim() || (type === "Proactive" ? "LinkedIn InMail / DM" : "Careers Portal / Direct Apply"),
    status,
    subCategory: $("nSubCategory").value || getSubcategories(status)[0] || "General",
    comment: $("nComment").value.trim(),
    updatedAt: nowIso(),
    contacts: []
  };
  data.unshift(c);
  open = c.id;
  save();
  $("nCo").value = "";
  $("nRole").value = "";
  $("nApproach").value = "";
  $("nComment").value = "";
  hideModal("addForm");
  render();
  showToast(`Added ${company}`, "success");
};

/* ---------- Add / edit person ---------- */
$("closePersonBtn").onclick = () => hideModal("personModal");
$("cancelPersonBtn").onclick = () => hideModal("personModal");

$("savePersonBtn").onclick = () => {
  const c = data.find(x => x.id === $("pCo").value);
  if (!c) return;
  const name = $("pn").value.trim();
  if (!name) return $("pn").focus();
  const ts = nowIso();
  const pId = $("pId").value;
  const fields = {
    name,
    role: $("pr").value,
    url: $("pu").value.trim(),
    stage: $("ps").value,
    comment: $("pnNote").value.trim()
  };
  if (!c.contacts) c.contacts = [];
  if (pId) {
    const p = c.contacts.find(x => x.id === pId);
    if (p) {
      if (p.stage !== fields.stage) p.date = today();
      Object.assign(p, fields, { updatedAt: ts });
    }
  } else {
    c.contacts.push({ id: uid(), ...fields, date: today(), updatedAt: ts });
  }
  c.updatedAt = ts;
  save();
  hideModal("personModal");
  render();
  showToast(pId ? `Updated ${name}` : `Added ${name} to ${c.company}`, "success");
};

/* ---------- Edit company ---------- */
$("closeEditBtn").onclick = () => hideModal("editModal");
$("cancelEditBtn").onclick = () => hideModal("editModal");

$("saveEditBtn").onclick = () => {
  const c = data.find(x => x.id === $("editId").value);
  if (!c) return;
  const name = $("editCo").value.trim();
  if (!name) return $("editCo").focus();
  c.company = name;
  c.role = $("editRole").value.trim();
  c.type = $("editType").value;
  c.approach = $("editApproach").value.trim() || (c.type === "Proactive" ? "LinkedIn InMail / DM" : "Careers Portal / Direct Apply");
  c.status = $("editStatus").value;
  c.subCategory = $("editSubCategory").value || getSubcategories(c.status)[0] || "General";
  c.comment = $("editComment").value.trim();
  c.updatedAt = nowIso();
  save();
  hideModal("editModal");
  render();
  showToast(`Updated ${c.company}`, "success");
};

/* ---------- Settings buttons ---------- */
$("settingsBtn").onclick = openSettingsModal;
$("closeSettingsBtn").onclick = closeSettings;
$("cancelSettingsBtn").onclick = closeSettings;

Object.keys(COL_MAP).forEach(id => {
  $(id).addEventListener("change", () => {
    if (!draft) return;
    draft.visibleColumns[COL_MAP[id]] = $(id).checked;
    updateSettingsFooter();
  });
});

$("doneSettingsBtn").onclick = () => {
  if (!settingsChanged()) return;
  askConfirm({
    title: "Save settings changes",
    message: "Apply these changes?",
    items: describeChanges(config, draft),
    confirmLabel: "Save changes",
    danger: false,
    onConfirm: () => {
      if (!draft) return;
      config = clone(draft);
      saveConfig();
      closeSettings();
      render();
      showToast("Settings updated", "success");
    }
  });
};

$("addRoleBtn").onclick = () => addToList("searchRoles", "newRoleInput");
$("addPersonRoleBtn").onclick = () => addToList("personRoles", "newPersonRoleInput");
$("addStageBtn").onclick = () => addToList("personStages", "newStageInput");
$("addApproachBtn").onclick = () => addToList("approaches", "newApproachInput");

$("addOverallStatusBtn").onclick = () => {
  if (!draft) return;
  const val = $("newOverallStatusInput").value.trim();
  if (val && !draft.statusHierarchy[val]) {
    draft.statusHierarchy[val] = ["Stage 1", "Stage 2"];
    $("newOverallStatusInput").value = "";
    renderSettingsHierarchy();
    updateSettingsFooter();
  }
};

/* ---------- Export to Excel ---------- */
// Tab 1 "Companies": one row per company.
// Tab 2 "People": one row per person, with the company name as the first column.
function sheetFromRows(rows, headers, widths) {
  const aoa = [headers, ...rows.map(r => headers.map(h => (r[h] === undefined || r[h] === null) ? "" : r[h]))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = widths.map(w => ({ wch: w }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(aoa.length - 1, 0), c: headers.length - 1 } }) };
  return ws;
}

function exportToExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Excel export needs an internet connection to load. Please try again.", "warn");
    return;
  }

  const companyHeaders = ["Company", "Searching role", "Strategy", "Approach", "Overall status", "Sub-category", "Notes", "People count", "Last updated"];
  const peopleHeaders = ["Company", "Name", "Person role", "LinkedIn URL", "Stage", "Notes", "Last contact date", "Last updated"];

  const companyRows = [];
  const peopleRows = [];

  data.forEach(c => {
    const info = getLatestUpdateInfo(c);
    companyRows.push({
      "Company": c.company || "",
      "Searching role": c.role || "",
      "Strategy": c.type || "",
      "Approach": c.approach || "",
      "Overall status": c.status || "",
      "Sub-category": c.subCategory || "",
      "Notes": c.comment || "",
      "People count": (c.contacts || []).length,
      "Last updated": info.calendarDate
    });

    (c.contacts || []).forEach(p => {
      peopleRows.push({
        "Company": c.company || "",
        "Name": p.name || "",
        "Person role": p.role || "",
        "LinkedIn URL": p.url || "",
        "Stage": p.stage || "",
        "Notes": p.comment || "",
        "Last contact date": p.date ? formatCalendarDate(p.date) : "",
        "Last updated": formatCalendarDate(p.updatedAt || p.date)
      });
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows(companyRows, companyHeaders, [26, 24, 12, 26, 16, 26, 40, 13, 16]), "Companies");
  XLSX.utils.book_append_sheet(wb, sheetFromRows(peopleRows, peopleHeaders, [26, 24, 24, 40, 20, 40, 18, 16]), "People");

  XLSX.writeFile(wb, `job-outreach-${today()}.xlsx`);
  showToast(`Exported ${companyRows.length} companies and ${peopleRows.length} people`, "success");
}

$("expBtn").onclick = exportToExcel;

/* ---------- Theme ---------- */
const SUN_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
const MOON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $("themeToggle").innerHTML = theme === "dark" ? MOON_SVG : SUN_SVG;
}

let savedTheme = null;
try { savedTheme = localStorage.getItem("jot-theme"); } catch (e) { }
applyTheme(savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

$("themeToggle").addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  try { localStorage.setItem("jot-theme", next); } catch (e) { }
  applyTheme(next);
});

/* ---------- Keyboard ---------- */
const ENTER_ADD = {
  newRoleInput: "addRoleBtn",
  newPersonRoleInput: "addPersonRoleBtn",
  newStageInput: "addStageBtn",
  newApproachInput: "addApproachBtn",
  newOverallStatusInput: "addOverallStatusBtn"
};

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    // Close only the top most popup. Closing Settings discards unsaved changes.
    if ($("confirmModal").classList.contains("show")) closeConfirm();
    else if ($("settingsModal").classList.contains("show")) closeSettings();
    else MODALS.forEach(hideModal);
    activeMenuCoId = null;
    activeMenuPId = null;
    render();
    return;
  }

  if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "file") {
    // Settings: Enter in an "add" box clicks its Add button
    if (ENTER_ADD[e.target.id]) { $(ENTER_ADD[e.target.id]).click(); return; }
    if (e.target.dataset && e.target.dataset.subInput !== undefined) {
      const btn = Array.from(document.querySelectorAll("[data-add-sub]")).find(b => b.dataset.addSub === e.target.dataset.subInput);
      if (btn) btn.click();
      return;
    }
    // Enter submits the add company, edit company and person popups from a text field
    if ($("addForm").classList.contains("show")) $("save").click();
    else if ($("personModal").classList.contains("show")) $("savePersonBtn").click();
    else if ($("editModal").classList.contains("show")) $("saveEditBtn").click();
  }
});

/* ---------- Boot ---------- */
load();
render();