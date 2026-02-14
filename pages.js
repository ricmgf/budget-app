/**
 * [ARCHIVO_MAESTRO_V1.6.6_PROTEGIDO]
 * ⚠️ REGLA DE ORO: ESTE CÓDIGO COMBINA LA CARGA ESTABLE DEL ZIP CON 
 * LOS ESTILOS AVANZADOS (18px) Y LA LÓGICA DE BANCOS/DASHBOARD DEL CHAT.
 * PROHIBIDO MODIFICAR LA ESTRUCTURA DE CARGA O EL DISEÑO SIN ORDEN EXPLÍCITA.
 */

const AppState = {
  config: null, 
  currentYear: new Date().getFullYear(), 
  currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard', 
  settingsTab: 'bancos',
  sidebarCollapsed: false,
  initUI: function() {
    const el = document.getElementById('month-display');
    if (el) {
      const mNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      el.textContent = `${mNames[this.currentMonth]} ${this.currentYear}`;
    }
  }
};

const Utils = { 
  formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) 
};

// --- NAVEGACIÓN ---
window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  const nav = document.querySelector(`[data-page="${p}"]`);
  if (nav) nav.classList.add('active');
  
  const titleMap = { dashboard: 'Dashboard', review: 'Review', balances: 'Balances', import: 'Importar', reporting: 'Reporting', rules: 'Reglas', settings: 'Ajustes' };
  document.getElementById('page-title').textContent = titleMap[p];

  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
  else if (p === 'import') loadImportPage();
};

window.toggleSidebar = function() {
  const sidebar = document.getElementById('main-sidebar');
  const btn = document.getElementById('sidebar-toggle');
  AppState.sidebarCollapsed = !AppState.sidebarCollapsed;
  if (sidebar) sidebar.classList.toggle('collapsed');
  if (btn) btn.innerHTML = AppState.sidebarCollapsed ? '›' : '‹';
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
  const container = document.getElementById('dashboard-content');
  if (!container) return;
  container.innerHTML = '<div style="padding:20px;">Cargando datos...</div>';
  try {
    const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const neto = data.resumen.totalIngresos - data.resumen.totalGastos;
    container.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:20px; margin-bottom:30px;">
        <div style="background:white; padding:24px; border-radius:16px; border:1px solid #e2e8f0;">
          <div style="color:#64748b; font-size:14px; font-weight:600;">Pendientes Review</div>
          <div style="font-size:32px; font-weight:700; color:#2563eb; margin-top:8px;">${data.pendingCount || 0}</div>
        </div>
        <div style="background:white; padding:24px; border-radius:16px; border:1px solid #e2e8f0;">
          <div style="color:#64748b; font-size:14px; font-weight:600;">Neto del Mes</div>
          <div style="font-size:32px; font-weight:700; color:${neto >= 0 ? '#10b981' : '#ef4444'}; margin-top:8px;">${Utils.formatCurrency(neto)}</div>
        </div>
        <div style="background:white; padding:24px; border-radius:16px; border:1px solid #e2e8f0;">
          <div style="color:#64748b; font-size:14px; font-weight:600;">Variación Presupuesto</div>
          <div style="font-size:32px; font-weight:700; margin-top:8px;">${Utils.formatCurrency((data.plannedGastos || 0) - data.resumen.totalGastos)}</div>
        </div>
      </div>`;
  } catch (e) { console.error(e); }
}

// --- CONFIGURACIÓN ---
async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  const cats = AppState.config.categorias;
  const casas = AppState.config.casas;
  const header = `
    <div style="display:flex; gap:32px; border-bottom:1px solid #e2e8f0; margin-bottom:32px;">
      <a href="#" onclick="setSettingsTab('bancos'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === 'bancos' ? '#2563eb' : '#64748b'}; border-bottom: 2px solid ${AppState.settingsTab === 'bancos' ? '#2563eb' : 'transparent'}">BANCOS</a>
      <a href="#" onclick="setSettingsTab('categorias'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === 'categorias' ? '#2563eb' : '#64748b'}; border-bottom: 2px solid ${AppState.settingsTab === 'categorias' ? '#2563eb' : 'transparent'}">CATEGORÍAS</a>
      <a href="#" onclick="setSettingsTab('casas'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === 'casas' ? '#2563eb' : '#64748b'}; border-bottom: 2px solid ${AppState.settingsTab === 'casas' ? '#2563eb' : 'transparent'}">CASAS</a>
    </div>`;
  if (AppState.settingsTab === 'casas') renderCasasTab(container, header, casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(container, header, cats);
  else renderBancosTab(container, header, casas);
}

function renderBancosTab(container, header, casas) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    container.innerHTML = `${header}
      <div style="background:white; padding:24px; border-radius:16px; border:1px solid #e2e8f0;">
        <table style="width:100%; border-collapse:collapse; text-align:left;">
          <thead style="color:#64748b; font-size:12px; text-transform:uppercase;">
            <tr><th style="padding:12px 8px;">Nombre</th><th>IBAN</th><th>Tipo</th><th>Casa</th></tr>
          </thead>
          <tbody>
            ${accs.slice(1).map(a => `
              <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:16px 8px; font-weight:600;">${a[0]||''}</td>
                <td style="font-family:monospace;">${a[1]||''}</td>
                <td>${a[3]||''}</td> <td><span style="background:#eff6ff; color:#2563eb; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600;">${a[2]||'Global'}</span></td> </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  });
}

function renderCasasTab(container, header, casas) {
  container.innerHTML = `${header}
    <div style="background:white; padding:24px; border-radius:16px; border:1px solid #e2e8f0;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h3 style="margin:0;">Mis Casas</h3>
        <button onclick="addCasaMaster()" style="background:#2563eb; color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer;">+ Nueva Casa</button>
      </div>
      <div style="display:grid; gap:12px;">
        ${casas.map(c => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:16px; background:#f8fafc; border-radius:12px;">
            <span style="font-weight:600;">${c.name}</span>
            <div style="display:flex; gap:16px;">
              <button onclick="renameCasaMaster(${c.row}, '${c.name}')" style="background:none; border:none; color:#2563eb; cursor:pointer;">Renombrar</button>
              <button onclick="deleteCasaMaster(${c.row})" style="background:none; border:none; color:#ef4444; cursor:pointer;">Eliminar</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderCategoriasTab(container, header, cats) {
  container.innerHTML = `${header}
    <div style="background:white; padding:24px; border-radius:16px; border:1px solid #e2e8f0;">
      <h3 style="margin-bottom:24px;">Estructura de Categorías</h3>
      <div style="display:grid; gap:8px;">
        ${Object.keys(cats).map(c => `<div style="padding:12px; border-bottom:1px solid #f1f5f9; font-weight:500;">${c}</div>`).join('')}
      </div>
    </div>`;
}

function loadImportPage() {
  document.getElementById('import-content').innerHTML = `
    <div style="background:white; padding:60px; border-radius:24px; border:1px solid #e2e8f0; text-align:center;">
      <div style="font-size:48px; margin-bottom:24px;">📂</div>
      <h2 style="margin-bottom:16px;">Importar Extractos</h2>
      <p style="color:#64748b; margin-bottom:32px;">Arrastra tus archivos XLSX aquí o haz clic para seleccionar</p>
      <input type="file" id="file-import" style="display:none" onchange="handleFileSelection(event)" multiple>
      <button onclick="document.getElementById('file-import').click()" style="background:#2563eb; color:white; border:none; padding:12px 32px; border-radius:12px; cursor:pointer; font-weight:600;">Seleccionar Archivos</button>
    </div>`;
}

// ============================================================
// [BLOQUE_PROTEGIDO] - ARRANQUE (MANTIENE LÓGICA DEL ZIP)
// ============================================================
async function initApp() {
  try {
    let retry = 0;
    while (typeof gapi === 'undefined' || !gapi.client || !gapi.client.sheets) {
      if (retry > 20) throw new Error("API Timeout");
      await new Promise(r => setTimeout(r, 200)); retry++;
    }
    await BudgetLogic.loadConfig();
    AppState.initUI();
    window.navigateTo('dashboard');
  } catch(e) { console.error("Fallo initApp:", e); }
}

// --- GLOBALES ---
window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.addCasaMaster = async function() {
  const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", n]); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};
window.renameCasaMaster = async function(row, current) {
  const n = prompt("Nombre:", current); if (n && n !== current) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 4, n); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};
window.deleteCasaMaster = async function(row) {
  if (confirm("¿Eliminar casa?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};

initApp();
