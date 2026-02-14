/**
 * [ARCHIVO_RESTAURADO_V1.7.7]
 * REGLA DE ORO: CARGA Y LOGIC.JS INTACTOS.
 * AJUSTES: Columnas Bancos (a[3] Tipo, a[2] Casa) y Colapso Sidebar.
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
  sidebar.classList.toggle('collapsed');
  btn.innerHTML = AppState.sidebarCollapsed ? '›' : '‹';
};

window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  document.getElementById(`page-${p}`).classList.add('active');
  document.querySelector(`[data-page="${p}"]`).classList.add('active');
  
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
  else if (p === 'import') loadImportPage();
  else if (p === 'review') loadReviewPage();
};

window.nextMonth = () => { AppState.currentMonth === 12 ? (AppState.currentMonth = 1, AppState.currentYear++) : AppState.currentMonth++; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };
window.prevMonth = () => { AppState.currentMonth === 1 ? (AppState.currentMonth = 12, AppState.currentYear--) : AppState.currentMonth--; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };

async function loadDashboard() {
  const c = document.getElementById('dashboard-content');
  if (!c) return;
  c.innerHTML = 'Cargando...';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const neto = d.resumen.totalIngresos - d.resumen.totalGastos;
    c.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;">
        <div class="card"><h3 style="color:#64748b; font-size:14px; margin:0;">Queue</h3><div class="metric-value" style="color:#2563eb;">${d.pendingCount || 0}</div></div>
        <div class="card"><h3 style="color:#64748b; font-size:14px; margin:0;">Neto Mes</h3><div class="metric-value" style="color:${neto >= 0 ? '#10b981' : '#ef4444'};">${Utils.formatCurrency(neto)}</div></div>
        <div class="card"><h3 style="color:#64748b; font-size:14px; margin:0;">Variación Plan</h3><div class="metric-value">${Utils.formatCurrency((d.plannedGastos || 0) - d.resumen.totalGastos)}</div></div>
      </div>`;
  } catch (e) { console.error(e); }
}

async function loadSettingsPage() {
  const c = document.getElementById('settings-content');
  const header = `<div style="display:flex; gap:32px; border-bottom:1px solid #e2e8f0; margin-bottom:32px;">
    ${['bancos', 'categorias', 'casas'].map(t => `<a href="#" onclick="setSettingsTab('${t}'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === t ? '#2563eb' : '#64748b'}; border-bottom: 2px solid ${AppState.settingsTab === t ? '#2563eb' : 'transparent'}">${t.toUpperCase()}</a>`).join('')}
  </div>`;
  
  if (AppState.settingsTab === 'bancos') renderBancosTab(c, header, AppState.config.casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(c, header, AppState.config.categorias);
}

function renderBancosTab(container, header, casas) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    container.innerHTML = `${header}<div class="card">
      <table style="width:100%; border-collapse:collapse;">
        <thead><tr style="text-align:left; color:#64748b;"><th>Nombre</th><th>IBAN</th><th>Tipo</th><th>Casa</th></tr></thead>
        <tbody>
          ${accs.slice(1).map(a => `<tr><td style="padding:12px 0; font-weight:600;">${a[0]||''}</td><td>${a[1]||''}</td><td>${a[3]||''}</td><td><span style="background:#eff6ff; color:#2563eb; padding:2px 8px; border-radius:4px;">${a[2]||'Global'}</span></td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  });
}

function renderCategoriasTab(container, header, cats) {
  let html = `${header}<div class="card"><h3>Categorías</h3>`;
  Object.keys(cats).forEach(cat => {
    html += `<div style="padding:20px; background:#fafafa; border-radius:12px; margin-bottom:16px;">
      <strong>${cat}</strong>
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;">
        ${cats[cat].map(sub => `<span style="background:white; border:1px solid #e2e8f0; padding:4px 12px; border-radius:20px;">${sub}</span>`).join('')}
      </div>
    </div>`;
  });
  container.innerHTML = html + `</div>`;
}

function loadImportPage() {
  document.getElementById('import-content').innerHTML = `
    <div class="card" style="text-align:center; padding:60px;">
      <div style="font-size:48px; margin-bottom:20px;">📂</div>
      <h2>Arrastra tus extractos aquí</h2>
      <button class="btn-primary" onclick="document.getElementById('file-import').click()">Seleccionar Archivos</button>
      <input type="file" id="file-import" style="display:none" multiple onchange="handleFileSelection(event)">
    </div>`;
}

async function initApp() {
  try {
    await BudgetLogic.loadConfig();
    AppState.initUI();
    window.navigateTo('dashboard');
  } catch(e) { console.error(e); }
}

window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.handleFileSelection = (e) => { alert("Archivos listos."); };
function loadReviewPage() { document.getElementById('review-content').innerHTML = `<div class="card"><h3>Review</h3></div>`; }
function loadBalancesPage() { document.getElementById('balances-content').innerHTML = `<div class="card"><h3>Balances</h3></div>`; }
function loadReportingPage() { document.getElementById('reporting-content').innerHTML = `<div class="card"><h3>Reporting</h3></div>`; }
function loadRulesPage() { document.getElementById('rules-content').innerHTML = `<div class="card"><h3>Reglas</h3></div>`; }
