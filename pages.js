/**
 * [ARCHIVO_RESTAURADO_V1.7.8]
 * INTEGRIDAD TOTAL: NO SIMPLIFICAR.
 */
const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard', settingsTab: 'bancos', sidebarCollapsed: false,
  initUI: function() {
    const el = document.getElementById('month-display');
    if (el) {
      const mNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      el.textContent = `${mNames[this.currentMonth]} ${this.currentYear}`;
    }
  }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

window.toggleSidebar = function() {
  const sidebar = document.getElementById('main-sidebar');
  const btn = document.getElementById('sidebar-toggle');
  AppState.sidebarCollapsed = !AppState.sidebarCollapsed;
  if (sidebar) sidebar.classList.toggle('collapsed');
  if (btn) btn.innerHTML = AppState.sidebarCollapsed ? '›' : '‹';
};

window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  const nav = document.querySelector(`[data-page="${p}"]`);
  if (nav) nav.classList.add('active');
  
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
  else if (p === 'import') loadImportPage();
  else if (p === 'review') loadReviewPage();
  else if (p === 'balances') loadBalancesPage();
  else if (p === 'reporting') loadReportingPage();
  else if (p === 'rules') loadRulesPage();
};

window.nextMonth = () => { 
  if (AppState.currentMonth === 12) { AppState.currentMonth = 1; AppState.currentYear++; }
  else { AppState.currentMonth++; }
  AppState.initUI(); 
  if (AppState.currentPage === 'dashboard') loadDashboard(); 
};

window.prevMonth = () => { 
  if (AppState.currentMonth === 1) { AppState.currentMonth = 12; AppState.currentYear--; }
  else { AppState.currentMonth--; }
  AppState.initUI(); 
  if (AppState.currentPage === 'dashboard') loadDashboard(); 
};

// --- DASHBOARD ---
async function loadDashboard() {
  const c = document.getElementById('dashboard-content');
  if (!c) return;
  c.innerHTML = '<div class="card">Cargando datos...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const neto = d.resumen.totalIngresos - d.resumen.totalGastos;
    c.innerHTML = `
      <div class="metric-grid">
        <div class="card" onclick="navigateTo('review')" style="cursor:pointer">
          <div style="color:var(--text-secondary); font-size:14px;">Queue</div>
          <div class="metric-value" style="color:var(--accent);">${d.pendingCount || 0}</div>
        </div>
        <div class="card">
          <div style="color:var(--text-secondary); font-size:14px;">Neto Mes</div>
          <div class="metric-value" style="color:${neto >= 0 ? 'var(--success)' : 'var(--danger)'};">${Utils.formatCurrency(neto)}</div>
        </div>
        <div class="card">
          <div style="color:var(--text-secondary); font-size:14px;">Variación Plan</div>
          <div class="metric-value">${Utils.formatCurrency((d.plannedGastos || 0) - d.resumen.totalGastos)}</div>
        </div>
      </div>`;
  } catch (e) { console.error(e); }
}

// --- SETTINGS ---
async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  const header = `<div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
    ${['bancos', 'categorias', 'casas'].map(t => `<a href="#" onclick="setSettingsTab('${t}'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === t ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === t ? 'var(--accent)' : 'transparent'}">${t.toUpperCase()}</a>`).join('')}
  </div>`;
  
  if (AppState.settingsTab === 'bancos') {
    const accs = await SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS);
    container.innerHTML = header + `<div class="card">
      <div class="flex-between mb-6"><h3>Bancos</h3><button class="btn btn-primary" onclick="addNewBank()">+ Nuevo</button></div>
      <table class="data-table"><thead><tr><th>Nombre</th><th>IBAN</th><th>Tipo</th><th>Casa</th></tr></thead><tbody>
      ${accs.slice(1).map(a => `<tr><td style="font-weight:600;">${a[0]||''}</td><td class="font-mono">${a[1]||''}</td><td>${a[3]||''}</td><td><span class="badge badge-accent">${a[2]||'Global'}</span></td></tr>`).join('')}
    </tbody></table></div>`;
  } else if (AppState.settingsTab === 'categorias') {
    renderCategoriasTab(container, header, AppState.config.categorias);
  } else if (AppState.settingsTab === 'casas') {
    renderCasasTab(container, header, AppState.config.casas);
  }
}

function renderCategoriasTab(container, header, cats) {
  let html = header + `<div class="card"><div class="flex-between mb-6"><h3>Categorías</h3><button class="btn btn-primary" onclick="addCategoryMaster()">+ Nueva</button></div>`;
  Object.keys(cats).forEach(cat => {
    html += `<div class="cat-group"><div class="flex-between mb-4"><strong>${cat}</strong></div>
      <div style="display:flex; flex-wrap:wrap; gap:10px;">
        ${cats[cat].map(sub => `<span class="tag-sub">${sub}</span>`).join('')}
      </div></div>`;
  });
  container.innerHTML = html + `</div>`;
}

function renderCasasTab(container, header, casas) {
  container.innerHTML = header + `<div class="card"><div class="flex-between mb-6"><h3>Mis Casas</h3><button class="btn btn-primary" onclick="addCasaMaster()">+ Nueva</button></div>
    ${casas.map(c => `<div class="flex-between mb-4 card" style="padding:16px;"><strong>${c.name}</strong><div><a href="#" onclick="deleteCasaMaster(${c.row})">Borrar</a></div></div>`).join('')}</div>`;
}

// --- OTROS MENUS ---
function loadImportPage() { document.getElementById('import-content').innerHTML = '<div class="card"><h2>📥 Importar</h2></div>'; }
function loadReviewPage() { document.getElementById('review-content').innerHTML = '<div class="card"><h3>👁️ Review</h3></div>'; }
function loadBalancesPage() { document.getElementById('balances-content').innerHTML = '<div class="card"><h3>⚖️ Balances</h3></div>'; }
function loadReportingPage() { document.getElementById('reporting-content').innerHTML = '<div class="card"><h3>📈 Reporting</h3></div>'; }
function loadRulesPage() { document.getElementById('rules-content').innerHTML = '<div class="card"><h3>⚡ Reglas</h3></div>'; }

// --- ARRANQUE SEGURO ---
async function initApp() {
  try {
    // Esperamos a que gapi esté cargado antes de llamar a logic.js
    if (typeof gapi === 'undefined' || !gapi.client) {
      setTimeout(initApp, 200);
      return;
    }
    await BudgetLogic.loadConfig();
    AppState.initUI();
    window.navigateTo('dashboard');
  } catch(e) { console.error("Fallo initApp:", e); }
}

window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.addCategoryMaster = async function() { const n = prompt("Cat:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [n, "General"]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.addCasaMaster = async function() { const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["","","",n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCasaMaster = async function(row) { if (confirm("¿Borrar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
