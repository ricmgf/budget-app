/**
 * ============================================================
 * BUDGET APP — MASTER UI CONTROLLER (v1.47)
 * ============================================================
 * * ⚠️ SEGURIDAD - NO CAMBIAR:
 * 1. MANTENER window.addEventListener('DOMContentLoaded') para el arranque.
 * Esto evita que initApp() se llame antes de que el script sea leído.
 * 2. NO mover funciones de carga (loadDashboard, loadSettingsPage) a bloques 
 * internos; deben ser accesibles para navigateTo.
 * 3. FUNCIONES DE ACCIÓN (addCasaMaster, etc.) DEBEN estar en el objeto window 
 * para que el atributo onclick del HTML funcione siempre.
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
  },
  prevMonth: function() { this.currentMonth--; if(this.currentMonth < 1){ this.currentMonth=12; this.currentYear--; } this.initUI(); if(this.currentPage === 'dashboard') loadDashboard(); },
  nextMonth: function() { this.currentMonth++; if(this.currentMonth > 12){ this.currentMonth=1; this.currentYear++; } this.initUI(); if(this.currentPage === 'dashboard') loadDashboard(); }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

// --- VISTAS DE PÁGINA ---

async function loadDashboard() {
  const c = document.getElementById('dashboard-content');
  if (!c) return;
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    c.innerHTML = `
      <div class="metric-grid">
        <div class="card" onclick="navigateTo('review')" style="cursor:pointer"><h3>Queue</h3><h2 style="color:var(--accent)">${d.pendingCount}</h2></div>
        <div class="card"><h3>Neto Mes</h3><h2>${Utils.formatCurrency(d.totalIngresos - d.totalGastos)}</h2></div>
        <div class="card"><h3>Variación Plan</h3><h2>${Utils.formatCurrency(d.plannedGastos - d.totalGastos)}</h2></div>
      </div>`;
  } catch(e) { console.error(e); c.innerHTML = '<div class="card">Error en Dashboard.</div>'; }
}

async function loadSettingsPage() {
  const c = document.getElementById('settings-content');
  if (!c) return;
  c.innerHTML = '<div style="padding:40px; text-align:center;">Cargando...</div>';
  const cfg = await BudgetLogic.loadConfig();
  const tabHeader = `
    <div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
      <a href="#" onclick="setSettingsTab('bancos'); return false;" style="padding:12px 0; text-decoration:none; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'transparent'}">Bancos</a>
      <a href="#" onclick="setSettingsTab('categorias'); return false;" style="padding:12px 0; text-decoration:none; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'transparent'}">Categorías</a>
      <a href="#" onclick="setSettingsTab('casas'); return false;" style="padding:12px 0; text-decoration:none; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'transparent'}">Casas</a>
    </div>`;

  if (AppState.settingsTab === 'casas') renderCasasTab(c, tabHeader, cfg.casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(c, tabHeader, cfg.categorias);
  else renderBancosTab(c, tabHeader, cfg.casas);
}

function renderCasasTab(container, header, casas) {
  container.innerHTML = `
    ${header}
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h3 style="margin:0; font-weight:600; font-size:18px;">Casas</h3>
        <button onclick="addCasaMaster()" style="padding:8px 16px; background:var(--accent); color:white; border-radius:8px; border:none; font-weight:700; cursor:pointer;">+ Nueva Casa</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${casas.map(casa => `
          <div style="background:#fff; border:1px solid var(--border-light); border-radius:16px; padding:20px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; font-size:16px; color:var(--accent);">${casa.name}</span>
            <div style="font-size:12px;">
              <a href="#" onclick="renameCasaMaster('${casa.row}', '${casa.name}');return false;">Editar</a> | 
              <a href="#" onclick="deleteCasaMaster('${casa.row}');return false;">Eliminar</a>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

// --- NAVEGACIÓN Y ARRANQUE ---

function navigateTo(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  const t = document.getElementById(`page-${p}`);
  if (t) t.classList.add('active');
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
}

// ARRANQUE SEGURO (Mismo modelo que v1.38)
window.addEventListener('DOMContentLoaded', async () => {
  try {
    AppState.config = await BudgetLogic.loadConfig();
    AppState.initUI();
    navigateTo('dashboard');
  } catch(e) { console.error("Fallo App:", e); }
});

// --- ACCIONES GLOBALES (Expuestas al window para acceso desde HTML) ---
window.addCasaMaster = async function() {
  const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", n]); loadSettingsPage(); }
};
window.renameCasaMaster = async function(row, current) {
  const n = prompt("Nuevo nombre:", current); if (n && n !== current) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 4, n); loadSettingsPage(); }
};
window.deleteCasaMaster = async function(row) {
  if (confirm("¿Eliminar casa?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); loadSettingsPage(); }
};
window.setSettingsTab = function(t) { AppState.settingsTab = t; loadSettingsPage(); };
window.prevMonth = function() { AppState.prevMonth(); };
window.nextMonth = function() { AppState.nextMonth(); };
