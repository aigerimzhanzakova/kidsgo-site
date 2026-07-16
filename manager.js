const STORAGE_KEY = "kidsgo_leads_v2";
const STATUSES = ["Новая", "В работе", "Связались", "Архив"];

const leadsList = document.querySelector("[data-leads-list]");
const leadsEmpty = document.querySelector("[data-leads-empty]");
const routesEl = document.querySelector("[data-routes]");
const routesEmpty = document.querySelector("[data-routes-empty]");
const totalEl = document.querySelector("[data-total]");
const newEl = document.querySelector("[data-new]");
const progressEl = document.querySelector("[data-progress]");
const routesCountEl = document.querySelector("[data-routes-count]");
const exportButton = document.querySelector("[data-export]");
const clearButton = document.querySelector("[data-clear]");
const toast = document.querySelector("[data-toast]");
const menuButton = document.querySelector("[data-menu-button]");
const nav = document.querySelector(".site-nav");

let leads = loadLeads();
let toastTimer;

renderDashboard();

menuButton?.addEventListener("click", () => {
  nav?.classList.toggle("is-open");
});

nav?.addEventListener("click", () => {
  nav.classList.remove("is-open");
});

leadsList.addEventListener("change", (event) => {
  if (!event.target.matches("[data-status]")) {
    return;
  }

  const lead = leads.find((item) => item.id === event.target.dataset.status);
  if (!lead) {
    return;
  }

  lead.status = event.target.value;
  saveLeads();
  renderDashboard();
  showToast("Статус обновлен.");
});

exportButton.addEventListener("click", () => {
  if (!leads.length) {
    showToast("Сначала добавьте заявку.");
    return;
  }

  const headers = [
    "status",
    "createdAt",
    "parentName",
    "phone",
    "district",
    "childName",
    "childBirthYear",
    "homeAddress",
    "homeLat",
    "homeLng",
    "schoolAddress",
    "schoolLat",
    "schoolLng",
    "direction",
    "startTime",
    "endTime",
    "childrenCount",
    "comment",
  ];
  const rows = leads.map((lead) => headers.map((key) => csvCell(lead[key])).join(";"));
  const csv = "\uFEFF" + headers.join(";") + "\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kidsgo-leads.csv";
  link.click();
  URL.revokeObjectURL(url);
});

clearButton.addEventListener("click", () => {
  if (!leads.length) {
    showToast("Список заявок уже пуст.");
    return;
  }

  if (!window.confirm("Очистить все заявки?")) {
    return;
  }

  leads = [];
  saveLeads();
  renderDashboard();
  showToast("Заявки очищены.");
});

function renderDashboard() {
  const routeGroups = groupRoutes(leads);
  totalEl.textContent = String(leads.length);
  newEl.textContent = String(countStatus("Новая"));
  progressEl.textContent = String(countStatus("В работе"));
  routesCountEl.textContent = String(routeGroups.length);

  renderRoutes(routeGroups);
  renderLeads();
}

function renderRoutes(routeGroups) {
  routesEl.innerHTML = "";
  routesEmpty.hidden = routeGroups.length > 0;

  routeGroups.forEach((group, index) => {
    const first = group.items[0];
    const card = document.createElement("article");
    card.className = "route-card";
    card.innerHTML = `
      <div class="route-card-head">
        <span class="route-index">R-${String(index + 1).padStart(2, "0")}</span>
        <strong>${escapeHtml(group.destination)}</strong>
      </div>
      <div class="route-meta">
        <span>${escapeHtml(first.district)}</span>
        <span>${escapeHtml(first.direction)}</span>
        <span>${group.items.length} заявок</span>
      </div>
      <div class="address-stack">
        ${group.items
          .map(
            (lead) => `
              <div>
                <span>${escapeHtml(lead.childName)}</span>
                <strong>${escapeHtml(lead.homeAddress)}</strong>
                <small>${escapeHtml(lead.startTime)} - ${escapeHtml(lead.endTime)}</small>
              </div>
            `
          )
          .join("")}
      </div>
    `;
    routesEl.append(card);
  });
}

function renderLeads() {
  leadsList.innerHTML = "";
  leadsEmpty.hidden = leads.length > 0;

  leads.forEach((lead) => {
    const card = document.createElement("article");
    card.className = "lead-card";
    card.innerHTML = `
      <div class="lead-card-main">
        <div>
          <span class="lead-date">${formatDate(lead.createdAt)}</span>
          <h3>${escapeHtml(lead.parentName)} - ${escapeHtml(lead.childName)}</h3>
          <p>${escapeHtml(lead.phone)}</p>
        </div>
        <select data-status="${escapeHtml(lead.id)}" aria-label="Статус заявки">
          ${STATUSES.map((status) => statusOption(status, lead.status)).join("")}
        </select>
      </div>
      <div class="lead-address-grid">
        <div>
          <span>Дом</span>
          <strong>${escapeHtml(lead.homeAddress)}</strong>
        </div>
        <div>
          <span>Назначение</span>
          <strong>${escapeHtml(lead.schoolAddress)}</strong>
        </div>
        <div>
          <span>Город</span>
          <strong>${escapeHtml(lead.district)}</strong>
        </div>
        <div>
          <span>Год рождения</span>
          <strong>${escapeHtml(lead.childBirthYear || "-")}</strong>
        </div>
        <div>
          <span>Время</span>
          <strong>${escapeHtml(lead.startTime)} - ${escapeHtml(lead.endTime)}</strong>
        </div>
      </div>
      ${
        lead.comment
          ? `<p class="lead-comment">${escapeHtml(lead.comment)}</p>`
          : ""
      }
    `;
    leadsList.append(card);
  });
}

function groupRoutes(items) {
  const map = new Map();

  items.forEach((lead) => {
    const key = `${normalize(lead.district)}|${normalize(lead.schoolAddress)}|${normalize(
      lead.direction
    )}`;
    const existing = map.get(key);
    if (existing) {
      existing.items.push(lead);
      return;
    }

    map.set(key, {
      destination: lead.schoolAddress,
      items: [lead],
    });
  });

  return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
}

function countStatus(status) {
  return leads.filter((lead) => lead.status === status).length;
}

function loadLeads() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLeads() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function statusOption(value, current) {
  const selected = value === current ? "selected" : "";
  return `<option ${selected}>${value}</option>`;
}

function csvCell(value) {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2800);
}
