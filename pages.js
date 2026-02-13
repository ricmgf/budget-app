/**
 * [ARCHIVO_PROTEGIDO_V1.55_ESTABLE]
 * ⚠️ REGLA DE ORO: PROHIBIDO SIMPLIFICAR, MODIFICAR O ELIMINAR LA CARGA 
 * DE LA APLICACIÓN (initApp) Y DEL DASHBOARD (loadDashboard, renderDashboard).
 * ESTE CÓDIGO FUNCIONA PERFECTAMENTE. NO TOCAR SALVO ORDEN EXPLÍCITA.
 */
const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard', settingsTab: 'bancos',
  initUI: function() {
    const el = document.getElementById('month-display');
    if (el) {
      const mNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      el.textContent = `${mNames[this.currentMonth]} ${this.currentYear}`;
    }
  }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

// --- NAVEGACIÓN ---
window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const t = document.getElementById(`page-${p}`);
  if (t) t.classList.add('active');
  const nav = document.querySelector(`[data-page="${p}"]`);
  if (nav) nav.classList.add('active');
  
  if (p === 'dashboard') loadDashboard();
  if (p === 'settings') loadSettingsPage();
  if (p === 'import') loadImportPage();
};

window.nextMonth = function() {
  if (AppState.currentMonth === 12) { AppState.currentMonth = 1; AppState.currentYear++; }
  else { AppState.currentMonth++; }
  AppState.initUI();
  if (AppState.currentPage === 'dashboard') loadDashboard();
};

window.prevMonth = function() {
  if (AppState.currentMonth === 1) { AppState.currentMonth = 12; AppState.currentYear--; }
  else { AppState.currentMonth--; }
  AppState.initUI();
  if (AppState.currentPage === 'dashboard') loadDashboard();
};

// ============================================================
// [BLOQUE_PROTEGIDO] - DASHBOARD (NO MODIFICAR)
// ============================================================
async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = '<div class="p-6">Cargando datos...</div>';
  try {
    const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    renderDashboard(container, data);
  } catch (e) {
    container.innerHTML = '<div class="p-6 text-danger">Error al cargar Dashboard</div>';
  }
}

function renderDashboard(container, data) {
  container.innerHTML = `
    <div class="dashboard-grid">
      <div class="card">
        <div class="text-secondary text-sm mb-1">Ingresos</div>
        <div class="text-2xl font-bold text-success">${Utils.formatCurrency(data.resumen.totalIngresos)}</div>
      </div>
      <div class="card">
        <div class="text-secondary text-sm mb-1">Gastos</div>
        <div class="text-2xl font-bold text-danger">${Utils.formatCurrency(data.resumen.totalGastos)}</div>
      </div>
      <div class="card">
        <div class="text-secondary text-sm mb-1">Balance</div>
        <div class="text-2xl font-bold">${Utils.formatCurrency(data.resumen.ahorro)}</div>
      </div>
    </div>
  `;
}

// --- SETTINGS ---
async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  const cats = AppState.config.categorias;
  const casas = AppState.config.casas;

  const header = `
    <div class="settings-nav mb-6">
      <button class="btn ${AppState.settingsTab === 'bancos' ? 'btn-primary' : 'btn-ghost'}" onclick="setSettingsTab('bancos')">Bancos</button>
      <button class="btn ${AppState.settingsTab === 'categorias' ? 'btn-primary' : 'btn-ghost'}" onclick="setSettingsTab('categorias')">Categorías</button>
      <button class="btn ${AppState.settingsTab === 'casas' ? 'btn-primary' : 'btn-ghost'}" onclick="setSettingsTab('casas')">Casas</button>
    </div>
  `;

  if (AppState.settingsTab === 'casas') renderCasasTab(container, header, casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(container, header, cats);
  else container.innerHTML = header + '<div class="card">Gestión de Bancos (Próximamente)</div>';
}

function renderCasasTab(container, header, casas) {
  container.innerHTML = `${header}
    <div class="card">
      <div class="flex-between mb-6">
        <h3 style="font-weight:600; font-size:18px; margin:0;">Gestión de Residencias (Casas)</h3>
        <button class="btn btn-primary" onclick="addCasaMaster()">+ Nueva Casa</button>
      </div>
      <div class="grid-casas">
        ${casas.map(c => `
          <div class="item-row flex-between p-4 mb-2" style="border:1px solid var(--border-light); border-radius:8px;">
            <span style="font-weight:500;">${c.name}</span>
            <div style="display:flex; gap:12px;">
              <a href="javascript:void(0)" onclick="renameCasaMaster(${c.row}, '${c.name}')" style="color:var(--accent); font-size:13px;">Editar</a>
              <a href="javascript:void(0)" onclick="deleteCasaMaster(${c.row})" style="color:var(--danger); font-size:13px;">Eliminar</a>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function renderCategoriasTab(container, header, cats) {
  container.innerHTML = `${header}<div class="card"><h3 style="margin-bottom:24px; font-weight:600; font-size:18px;">Categorías</h3>
    ${Object.keys(cats).map(c => `<div style="padding:12px; border-bottom:1px solid #f1f5f9;">${c}</div>`).join('')}</div>`;
}

// ============================================================
// [BLOQUE_PROTEGIDO] - ARRANQUE (NO MODIFICAR)
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
  const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", n]); loadSettingsPage(); }
};
window.renameCasaMaster = async function(row, current) {
  const n = prompt("Nombre:", current); if (n && n !== current) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 4, n); loadSettingsPage(); }
};
window.deleteCasaMaster = async function(row) {
  if (confirm("¿Eliminar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); loadSettingsPage(); }
};
function loadImportPage() { document.getElementById('import-content').innerHTML = '<div class="card">Módulo de Importación</div>'; }
