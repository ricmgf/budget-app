/**
 * [BLOQUE_PROTEGIDO]: CONTROLADOR DE UI v1.50 (LEGACY TOTAL)
 * ⚠️ NO ELIMINAR window.onload.
 */

const AppState = {
  config: null, 
  currentYear: new Date().getFullYear(), 
  currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard', 
  settingsTab: 'bancos',

  initUI: function() {
    const el = document.getElementById('month-display');
    if (el) {
      const mNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      el.textContent = `${mNames[this.currentMonth]} ${this.currentYear}`;
    }
  },
  
  // FUNCIONES DE NAVEGACIÓN (Recuperadas de v1.38)
  prevMonth: function() {
    this.currentMonth--;
    if (this.currentMonth < 1) { this.currentMonth = 12; this.currentYear--; }
    this.initUI();
    if (this.currentPage === 'dashboard') loadDashboard();
  },
  nextMonth: function() {
    this.currentMonth++;
    if (this.currentMonth > 12) { this.currentMonth = 1; this.currentYear++; }
    this.initUI();
    if (this.currentPage === 'dashboard') loadDashboard();
  }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

// --- CARGA DE VISTAS ---

async function loadDashboard() {
  const c = document.getElementById('dashboard-content');
  if (!c) return;
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    c.innerHTML = `
      <div class="metric-grid">
        <div class="card" onclick="navigateTo('review')" style="cursor:pointer">
          <h3>Queue</h3><h2 style="color:var(--accent)">${d.pendingCount}</h2>
        </div>
        <div class="card">
          <h3>Neto Mes</h3><h2>${Utils.formatCurrency(d.totalIngresos - d.totalGastos)}</h2>
        </div>
        <div class="card">
          <h3>Variación Plan</h3><h2>${Utils.formatCurrency(d.plannedGastos - d.totalGastos)}</h2>
        </div>
      </div>
      <div class="card" style="margin-top:24px;">
        <h3 style="margin-bottom:16px;">Funding por Cuenta</h3>
        ${Object.entries(d.fundingPlan).map(([acc, amt]) => `
          <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-light);">
            <span>${acc}</span><strong>${Utils.formatCurrency(amt)}</strong>
          </div>
        `).join('')}
      </div>`;
  } catch(e) { console.error(e); }
}

async function loadSettingsPage() {
  const c = document.getElementById('settings-content');
  if (!c) return;
  const cfg = await BudgetLogic.loadConfig();
  const tabHeader = `
    <div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
      <a href="#" onclick="setSettingsTab('bancos'); return false;" style="padding:12px 0; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'transparent'}">Bancos</a>
      <a href="#" onclick="setSettingsTab('categorias'); return false;" style="padding:12px 0; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'transparent'}">Categorías</a>
      <a href="#" onclick="setSettingsTab('casas'); return false;" style="padding:12px 0; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'transparent'}">Casas</a>
    </div>`;

  if (AppState.settingsTab === 'casas') renderCasasTab(c, tabHeader, cfg.casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(c, tabHeader, cfg.categorias);
  else renderBancosTab(c, tabHeader, cfg.casas);
}

// RENDERERS (Estilo 18px Semibold)
function renderCasasTab(container, header, casas) {
  container.innerHTML = `
    ${header}
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h3 style="margin:0; font-weight:600; font-size:18px;">Casas</h3>
        <button onclick="addCasaMaster()" style="padding:8px 16px; background:var(--accent); color:white; border:none; border-radius:8px; font-weight:700; cursor:pointer;">+ Nueva Casa</button>
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

// --- NAVEGACIÓN Y BOOTSTRAP ---

function navigateTo(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  const t = document.getElementById(`page-${p}`);
  if (t) t.classList.add('active');
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
}

// ARRANQUE BLINDADO (v1.38 + Seguro de Espera)
window.onload = async function() {
  try {
    let retry = 0;
    while (typeof gapi === 'undefined' || !gapi.client || !gapi.client.sheets) {
      if (retry > 20) throw new Error("Google API Timeout");
      await new Promise(r => setTimeout(r, 200));
      retry++;
    }
    AppState.config = await BudgetLogic.loadConfig();
    AppState.initUI();
    navigateTo('dashboard');
  } catch(e) { console.error("Fallo App:", e.message); }
};

// EXPOSICIÓN GLOBAL DE FUNCIONES (Para onclick)
window.prevMonth = () => AppState.prevMonth();
window.nextMonth = () => AppState.nextMonth();
window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.addCasaMaster = async function() {
  const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", n]); loadSettingsPage(); }
};
window.renameCasaMaster = async function(row, current) {
  const n = prompt("Nuevo nombre:", current); if (n && n !== current) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 4, n); loadSettingsPage(); }
};
window.deleteCasaMaster = async function(row) {
  if (confirm("¿Eliminar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); loadSettingsPage(); }
};
