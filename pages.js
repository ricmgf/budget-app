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
  const t = document.getElementById(`page-${p}`);
  if (t) t.classList.add('active');
  const nav = document.querySelector(`[data-page="${p}"]`);
  if (nav) nav.classList.add('active');
  
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
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
// [BLOQUE_PROTEGIDO] - DASHBOARD (ESTILO 18PX / QUEUE)
// ============================================================
async function loadDashboard() {
  const c = document.getElementById('dashboard-content');
  if (!c) return;
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    // Recuperamos tu estructura original de 3 tarjetas
    c.innerHTML = `
      <div class="metric-grid">
        <div class="card" onclick="navigateTo('review')" style="cursor:pointer">
          <h3 style="font-weight:600; font-size:15px; color:var(--text-secondary);">Queue</h3>
          <h2 style="color:var(--accent); font-size:28px; font-weight:700;">${d.pendingCount || 0}</h2>
        </div>
        <div class="card">
          <h3 style="font-weight:600; font-size:15px; color:var(--text-secondary);">Neto Mes</h3>
          <h2 style="font-size:28px; font-weight:700;">${Utils.formatCurrency(d.resumen.totalIngresos - d.resumen.totalGastos)}</h2>
        </div>
        <div class="card">
          <h3 style="font-weight:600; font-size:15px; color:var(--text-secondary);">Variación Plan</h3>
          <h2 style="font-size:28px; font-weight:700;">${Utils.formatCurrency((d.plannedGastos || 0) - d.resumen.totalGastos)}</h2>
        </div>
      </div>`;
  } catch(e) { 
    c.innerHTML = '<div class="card">Error de acceso a datos (403).</div>'; 
  }
}

// ============================================================
// [BLOQUE_PROTEGIDO] - SETTINGS (ESTILO ORIGINAL ELEGANTE)
// ============================================================
async function loadSettingsPage() {
  const c = document.getElementById('settings-content');
  if (!c) return;
  
  const tabHeader = `
    <div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
      <a href="#" onclick="setSettingsTab('bancos'); return false;" style="padding:12px 0; font-weight:700; font-size:15px; text-decoration:none; color:${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'transparent'}">Bancos</a>
      <a href="#" onclick="setSettingsTab('categorias'); return false;" style="padding:12px 0; font-weight:700; font-size:15px; text-decoration:none; color:${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'transparent'}">Categorías</a>
      <a href="#" onclick="setSettingsTab('casas'); return false;" style="padding:12px 0; font-weight:700; font-size:15px; text-decoration:none; color:${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'transparent'}">Casas</a>
    </div>`;

  const cfg = AppState.config;
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
        <button onclick="addCasaMaster()" style="padding:8px 16px; background:var(--accent); color:white; border:none; border-radius:8px; font-weight:700; cursor:pointer;">+ Nueva Casa</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${casas.map(casa => `
          <div style="background:#fff; border:1px solid var(--border-light); border-radius:16px; padding:20px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; font-size:16px; color:var(--accent);">${casa.name}</span>
            <div style="font-size:12px;"><a href="#" onclick="renameCasaMaster('${casa.row}', '${casa.name}');return false;" style="text-decoration:none; color:var(--accent);">Editar</a> | <a href="#" onclick="deleteCasaMaster('${casa.row}');return false;" style="text-decoration:none; color:var(--danger);">Eliminar</a></div>
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
        <table style="width:100%; text-align:left; border-collapse:collapse; font-size:14px;">
          ${accs.slice(1).map(a => `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:12px; font-weight:600;">${a[0] || ''}</td><td>${a[1] || ''}</td><td>${a[2] || ''}</td></tr>`).join('')}
        </table>
        <div style="margin-top:24px; padding:20px; background:#f8fafc; border-radius:12px;">
          <h4 style="margin-bottom:16px; font-size:15px;">Añadir Banco</h4>
          <select id="n-casa" style="padding:8px; border-radius:6px; border:1px solid var(--border-light);">${casas.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}</select>
        </div>
      </div>`;
  });
}

function renderCategoriasTab(container, header, cats) {
  container.innerHTML = `
    ${header}
    <div class="card">
      <h3 style="margin-bottom:24px; font-weight:600; font-size:18px;">Categorías</h3>
      <div style="display:grid; gap:8px;">
        ${Object.keys(cats).map(c => `<div style="padding:12px; border-bottom:1px solid #f1f5f9; font-weight:500;">${c}</div>`).join('')}
      </div>
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
  const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", n]); loadSettingsPage(); }
};
window.renameCasaMaster = async function(row, current) {
  const n = prompt("Nombre:", current); if (n && n !== current) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 4, n); loadSettingsPage(); }
};
window.deleteCasaMaster = async function(row) {
  if (confirm("¿Borrar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); loadSettingsPage(); }
};

// Iniciar aplicación
initApp();
