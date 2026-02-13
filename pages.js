// ============================================================
// Budget App — Master UI Controller (v1.38)
// ============================================================

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

// --- VISTAS ---

async function loadDashboard() {
  const c = document.getElementById('dashboard-content');
  if (!c) return;
  c.innerHTML = '<div style="padding:40px; text-align:center;">Cargando Dashboard...</div>';
  const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
  c.innerHTML = `
    <div class="metric-grid">
      <div class="card" onclick="navigateTo('review')"><h3>Queue</h3><h2 style="color:var(--accent)">${d.pendingCount}</h2></div>
      <div class="card"><h3>Neto Mes</h3><h2>${Utils.formatCurrency(d.totalIngresos - d.totalGastos)}</h2></div>
      <div class="card"><h3>Variación</h3><h2>${Utils.formatCurrency(d.plannedGastos - d.totalGastos)}</h2></div>
    </div>`;
}

async function loadSettingsPage() {
  const c = document.getElementById('settings-content');
  if (!c) return;
  const cfg = await BudgetLogic.loadConfig();
  const tabHeader = `
    <div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
      <a href="#" onclick="setSettingsTab('bancos'); return false;" style="padding:12px 0; font-weight:700; color:${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'var(--text-secondary)'}">Bancos</a>
      <a href="#" onclick="setSettingsTab('categorias'); return false;" style="padding:12px 0; font-weight:700; color:${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'var(--text-secondary)'}">Categorías</a>
      <a href="#" onclick="setSettingsTab('casas'); return false;" style="padding:12px 0; font-weight:700; color:${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'var(--text-secondary)'}">Casas</a>
    </div>`;

  if (AppState.settingsTab === 'casas') renderCasasTab(c, tabHeader, cfg.casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(c, tabHeader, cfg.categorias);
  else renderBancosTab(c, tabHeader, cfg.casas);
}

function renderCasasTab(container, header, casas) {
  container.innerHTML = `
    ${header}
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:32px;">
        <h3 style="margin:0; font-weight:600; font-size:24px;">Casas</h3>
        <button onclick="addCasaMaster()" style="padding:10px 24px; background:var(--accent); color:white; border-radius:10px; font-weight:700; border:none; cursor:pointer;">+ Nueva Casa</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${casas.map(casa => `
          <div style="background:#fff; border:1px solid var(--border-light); border-radius:16px; padding:24px; display:flex; justify-content:space-between;">
            <span style="font-weight:700; font-size:18px; color:var(--accent);">${casa.name}</span>
            <div><a href="#" onclick="renameCasa('${casa.row}');return false;">Editar</a> | <a href="#" onclick="deleteCasaMaster('${casa.row}');return false;">Eliminar</a></div>
          </div>`).join('')}
      </div>
    </div>`;
}

// --- NAVEGACIÓN Y ARRANQUE ---

function navigateTo(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
}

// ESTE ES EL CAMBIO REAL: Solo arranca cuando el DOM está 100% cargado
window.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log("Iniciando aplicación v1.38...");
    AppState.config = await BudgetLogic.loadConfig();
    AppState.initUI();
    navigateTo('dashboard');
  } catch(e) {
    console.error("Error crítico en el arranque:", e);
  }
});

function setSettingsTab(t) { AppState.settingsTab = t; loadSettingsPage(); }
// ... Resto de funciones legacy (saveAccount, addCategory, etc.)
