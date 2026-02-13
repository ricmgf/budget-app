// ============================================================
// Budget App — Master UI Controller (v1.40 - FINAL)
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
  },
  prevMonth: function() { this.currentMonth--; if(this.currentMonth < 1){ this.currentMonth=12; this.currentYear--; } this.initUI(); if(this.currentPage === 'dashboard') loadDashboard(); },
  nextMonth: function() { this.currentMonth++; if(this.currentMonth > 12){ this.currentMonth=1; this.currentYear++; } this.initUI(); if(this.currentPage === 'dashboard') loadDashboard(); }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

// --- FUNCIONES GLOBALES (Declaradas al inicio para evitar ReferenceError) ---

const loadDashboard = async () => {
  const c = document.getElementById('dashboard-content');
  if (!c) return;
  c.innerHTML = '<div style="padding:40px; text-align:center;">Cargando...</div>';
  const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
  c.innerHTML = `
    <div class="metric-grid">
      <div class="card" onclick="navigateTo('review')"><h3>Queue</h3><h2 style="color:var(--accent)">${d.pendingCount}</h2></div>
      <div class="card"><h3>Neto Mes</h3><h2>${Utils.formatCurrency(d.totalIngresos - d.totalGastos)}</h2></div>
      <div class="card"><h3>Variación</h3><h2>${Utils.formatCurrency(d.plannedGastos - d.totalGastos)}</h2></div>
    </div>`;
};

const renderBancosTab = (container, header, casas) => {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    container.innerHTML = `
      ${header}
      <div class="card">
        <h3 style="margin-bottom:24px; font-weight:600; font-size:18px;">Bancos</h3>
        <table style="width:100%; text-align:left; border-collapse:collapse;">
          <thead><tr style="color:var(--text-secondary); font-size:11px; text-transform:uppercase; border-bottom:1px solid var(--border-light);"><th>Alias</th><th>ID</th><th>Casa</th><th style="text-align:right;">Acciones</th></tr></thead>
          <tbody>
            ${accs.slice(1).filter(a => a[1] !== 'BORRADO').map((a, i) => `
              <tr style="border-bottom:1px solid #f8fafc;">
                <td style="padding:12px;"><strong>${a[0]}</strong></td><td>${a[1]}</td><td>${a[2]}</td>
                <td style="padding:12px; text-align:right;"><a href="#" onclick="editAccount(${i+2},'${a[0]}','${a[1]}','${a[2]}');return false;">Editar</a></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  });
};

const renderCategoriasTab = (container, header, cats) => {
  container.innerHTML = `
    ${header}
    <div class="card">
      <h3 style="margin-bottom:32px; font-weight:600; font-size:18px;">Categorías</h3>
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${Object.entries(cats).map(([cat, subs]) => `
          <div style="background:#fff; border:1px solid var(--border-light); border-radius:16px; padding:24px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
              <span style="font-weight:700; font-size:16px; color:var(--accent);">${cat}</span>
              <div style="font-size:12px;"><a href="#" onclick="renameCategory('${cat}');return false;">Editar</a></div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
};

const renderCasasTab = (container, header, casas) => {
  container.innerHTML = `
    ${header}
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:32px;">
        <h3 style="margin:0; font-weight:600; font-size:18px;">Casas</h3>
        <button onclick="addCasaMaster()" style="padding:8px 16px; background:var(--accent); color:white; border-radius:8px; font-weight:700; border:none; cursor:pointer;">+ Nueva Casa</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${casas.map(casa => `
          <div style="background:#fff; border:1px solid var(--border-light); border-radius:16px; padding:20px; display:flex; justify-content:space-between;">
            <span style="font-weight:700; font-size:16px; color:var(--accent);">${casa.name}</span>
            <div style="font-size:12px;"><a href="#" onclick="renameCasaMaster('${casa.row}', '${casa.name}');return false;">Editar</a> | <a href="#" onclick="deleteCasaMaster('${casa.row}');return false;">Eliminar</a></div>
          </div>`).join('')}
      </div>
    </div>`;
};

const loadSettingsPage = async () => {
  const c = document.getElementById('settings-content');
  if (!c) return;
  const cfg = await BudgetLogic.loadConfig();
  const tabHeader = `
    <div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
      <a href="#" onclick="setSettingsTab('bancos'); return false;" style="font-weight:700; color:${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'var(--text-secondary)'}">Bancos</a>
      <a href="#" onclick="setSettingsTab('categorias'); return false;" style="font-weight:700; color:${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'var(--text-secondary)'}">Categorías</a>
      <a href="#" onclick="setSettingsTab('casas'); return false;" style="font-weight:700; color:${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'var(--text-secondary)'}">Casas</a>
    </div>`;
  if (AppState.settingsTab === 'casas') renderCasasTab(c, tabHeader, cfg.casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(c, tabHeader, cfg.categorias);
  else renderBancosTab(c, tabHeader, cfg.casas);
};

// --- NAVEGACIÓN ---

function navigateTo(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
}

// --- ACCIONES DE CASAS (GLOBALES) ---

window.addCasaMaster = async function() {
  const n = prompt("Nombre de la nueva casa:");
  if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", n]); loadSettingsPage(); }
};

window.renameCasaMaster = async function(row, current) {
  const n = prompt("Nuevo nombre:", current);
  if (n && n !== current) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 4, n); loadSettingsPage(); }
};

window.deleteCasaMaster = async function(row) {
  if (confirm("¿Eliminar casa?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); loadSettingsPage(); }
};

window.setSettingsTab = function(t) { AppState.settingsTab = t; loadSettingsPage(); };

// --- ARRANQUE ---

window.addEventListener('DOMContentLoaded', async () => {
  try {
    AppState.config = await BudgetLogic.loadConfig();
    AppState.initUI();
    navigateTo('dashboard');
  } catch(e) { console.error("Fallo App:", e); }
});
