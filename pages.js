// ============================================================
// Budget App — Master UI Controller (v1.39 - Fixed Actions)
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
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando...</div>';
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
      <a href="#" onclick="setSettingsTab('bancos'); return false;" style="padding:12px 0; text-decoration:none; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'transparent'}">Bancos</a>
      <a href="#" onclick="setSettingsTab('categorias'); return false;" style="padding:12px 0; text-decoration:none; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'transparent'}">Categorías</a>
      <a href="#" onclick="setSettingsTab('casas'); return false;" style="padding:12px 0; text-decoration:none; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'transparent'}">Casas</a>
    </div>`;

  if (AppState.settingsTab === 'casas') renderCasasTab(c, tabHeader, cfg.casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(c, tabHeader, cfg.categorias);
  else renderBancosTab(c, tabHeader, cfg.casas);
}

function renderCategoriasTab(container, header, cats) {
  container.innerHTML = `
    ${header}
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:32px;">
        <h3 style="margin:0; font-weight:600; font-size:18px;">Categorías</h3>
        <button onclick="addCategory()" style="padding:8px 16px; background:var(--accent); color:white; border-radius:8px; border:none; font-weight:700; cursor:pointer;">+ Nueva Categoría</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${Object.entries(cats).map(([cat, subs]) => `
          <div style="background:#fff; border:1px solid var(--border-light); border-radius:16px; padding:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <span style="font-weight:700; font-size:16px; color:var(--accent);">${cat}</span>
              <div style="font-size:12px;"><a href="#" onclick="renameCategory('${cat}');return false;">Editar</a> | <a href="#" onclick="fullDeleteCategory('${cat}');return false;">Eliminar</a></div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:10px;">
              ${subs.map(s => `<div style="background:#f1f5f9; padding:6px 12px; border-radius:6px; font-size:13px;">${s} <a href="#" onclick="deleteSubcategory('${cat}','${s}');return false;" style="color:#94a3b8; text-decoration:none;">✕</a></div>`).join('')}
              <button onclick="addSubcategory('${cat}')" style="background:none; border:1px dashed var(--accent); color:var(--accent); padding:6px 12px; border-radius:8px; font-size:12px; cursor:pointer;">+ subcategoría</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderCasasTab(container, header, casas) {
  container.innerHTML = `
    ${header}
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:32px;">
        <h3 style="margin:0; font-weight:600; font-size:18px;">Casas</h3>
        <button onclick="addCasaMaster()" style="padding:8px 16px; background:var(--accent); color:white; border-radius:8px; border:none; font-weight:700; cursor:pointer;">+ Nueva Casa</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${casas.map(casa => `
          <div style="background:#fff; border:1px solid var(--border-light); border-radius:16px; padding:20px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; font-size:16px; color:var(--accent);">${casa.name}</span>
            <div style="font-size:12px;"><a href="#" onclick="renameCasaMaster('${casa.row}', '${casa.name}');return false;">Editar</a> | <a href="#" onclick="deleteCasaMaster('${casa.row}');return false;">Eliminar</a></div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderBancosTab(container, header, casas) {
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
                <td style="padding:12px; font-weight:500;">${a[0]}</td><td>${a[1]}</td><td>${a[2]}</td>
                <td style="padding:12px; text-align:right; font-size:12px;">
                  <a href="#" onclick="editAccount(${i+2},'${a[0]}','${a[1]}','${a[2]}');return false;">Editar</a> | 
                  <a href="#" onclick="deleteAccount(${i+2});return false;">Eliminar</a>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div style="margin-top:40px; padding:24px; background:#f8fafc; border-radius:16px;">
          <h4 style="font-weight:600; margin-bottom:16px; font-size:15px;">Añadir cuenta</h4>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
            <input type="text" id="n-alias" placeholder="Alias"><input type="text" id="n-id" placeholder="IBAN">
            <select id="n-casa"><option value="">Seleccionar casa...</option>${casas.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}</select>
          </div>
          <button onclick="saveAccount()" style="margin-top:20px; padding:12px 32px; background:var(--accent); color:white; border:none; border-radius:12px; font-weight:700;">Guardar Banco</button>
        </div>
      </div>`;
  });
}

// --- ACCIONES GLOBALES (Fuera de cualquier bloque para ser accesibles por onclick) ---

async function addCasaMaster() {
  const n = prompt("Nombre de la nueva casa:");
  if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", n]); loadSettingsPage(); }
}

async function renameCasaMaster(row, current) {
  const n = prompt("Nuevo nombre para " + current + ":", current);
  if (n && n !== current) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 4, n); loadSettingsPage(); }
}

async function deleteCasaMaster(row) {
  if (confirm("¿Eliminar casa de la tabla maestra?")) {
    await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED');
    loadSettingsPage();
  }
}

function setSettingsTab(t) { AppState.settingsTab = t; loadSettingsPage(); }

function navigateTo(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
}

// --- ARRANQUE ---

window.addEventListener('DOMContentLoaded', async () => {
  try {
    AppState.config = await BudgetLogic.loadConfig();
    AppState.initUI();
    navigateTo('dashboard');
  } catch(e) { console.error("Fallo:", e); }
});

function prevMonth() { AppState.prevMonth(); }
function nextMonth() { AppState.nextMonth(); }
