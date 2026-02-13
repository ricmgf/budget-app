/**
 * [ARCHIVO_MAESTRO_V1.7.0_PROTEGIDO]
 * ⚠️ REGLA DE ORO: PROHIBIDO SIMPLIFICAR O MODIFICAR CARGA (initApp) O DASHBOARD FUNCIONAL.
 * INYECCIÓN: WIDGET IMPORT (DRAG&DROP), CATEGORÍAS (PASTILLAS), BANCOS (INPUTS/CASAS) Y MENÚS VACÍOS.
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

// ============================================================
// NAVEGACIÓN Y CARGA (PROTEGIDO)
// ============================================================
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
  else if (p === 'import') loadImportPage();
  else if (p === 'review') loadReviewPage();
  else if (p === 'balances') loadBalancesPage();
  else if (p === 'reporting') loadReportingPage();
  else if (p === 'rules') loadRulesPage();
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
// [BLOQUE_PROTEGIDO] - DASHBOARD (ESTILOS 28PX Y COLORES)
// ============================================================
async function loadDashboard() {
  const c = document.getElementById('dashboard-content');
  if (!c) return;
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const neto = (d.resumen.totalIngresos || 0) - (d.resumen.totalGastos || 0);
    const netoColor = neto >= 0 ? 'var(--positive)' : 'var(--negative)';
    
    c.innerHTML = `
      <div class="metric-grid">
        <div class="card" onclick="navigateTo('review')" style="cursor:pointer">
          <h3 style="font-weight:600; font-size:15px; color:var(--text-secondary);">Queue</h3>
          <h2 style="color:var(--accent); font-size:28px; font-weight:700;">${d.pendingCount || 0}</h2>
        </div>
        <div class="card">
          <h3 style="font-weight:600; font-size:15px; color:var(--text-secondary);">Neto Mes</h3>
          <h2 style="font-size:28px; font-weight:700; color:${netoColor};">${Utils.formatCurrency(neto)}</h2>
        </div>
        <div class="card">
          <h3 style="font-weight:600; font-size:15px; color:var(--text-secondary);">Variación Plan</h3>
          <h2 style="font-size:28px; font-weight:700;">${Utils.formatCurrency((d.plannedGastos || 0) - (d.resumen.totalGastos || 0))}</h2>
        </div>
      </div>`;
  } catch(e) { 
    c.innerHTML = '<div class="card">Error de acceso a datos.</div>'; 
  }
}

// ============================================================
// [INYECTADO] - IMPORTACIÓN (WIDGET DRAG & DROP PREMIUM)
// ============================================================
function loadImportPage() {
  const container = document.getElementById('import-content');
  container.innerHTML = `
    <div class="card" style="max-width: 800px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <h3 style="font-weight:600; font-size:18px; margin-bottom:16px;">Importar Extractos</h3>
      <p style="color:var(--text-secondary); font-size:14px; margin-bottom:24px;">Sube tus archivos para procesar gastos e ingresos automáticamente.</p>
      
      <div id="drop-zone" style="border: 2px dashed var(--border-medium); border-radius: 16px; padding: 60px 40px; text-align: center; background: #fcfdfe; transition: all 0.2s ease; cursor: pointer;">
        <div style="font-size: 48px; margin-bottom: 16px;">📂</div>
        <p style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">Arrastra tus archivos aquí</p>
        <p style="color: var(--text-tertiary); font-size: 13px; margin-bottom: 24px;">o haz clic para buscar en tu dispositivo</p>
        <input type="file" id="file-import" style="display:none" onchange="handleFileSelection(event)" multiple>
        <button class="btn btn-primary" onclick="document.getElementById('file-import').click()">Seleccionar Archivos</button>
      </div>
    </div>`;

  const dz = document.getElementById('drop-zone');
  ['dragenter', 'dragover'].forEach(e => dz.addEventListener(e, () => { 
    dz.style.background = 'var(--accent-subtle)'; 
    dz.style.borderColor = 'var(--accent)'; 
  }));
  ['dragleave', 'drop'].forEach(e => dz.addEventListener(e, () => { 
    dz.style.background = '#fcfdfe'; 
    dz.style.borderColor = 'var(--border-medium)'; 
  }));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    handleFileSelection({ target: { files: e.dataTransfer.files } });
  });
}

// ============================================================
// [INYECTADO] - SETTINGS (BANCOS CON INPUTS Y CATEGORÍAS CON PASTILLAS)
// ============================================================
async function loadSettingsPage() {
  const c = document.getElementById('settings-content');
  const tabHeader = `
    <div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
      <a href="#" onclick="setSettingsTab('bancos'); return false;" style="padding:12px 0; font-weight:700; font-size:15px; text-decoration:none; color:${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'transparent'}">Bancos</a>
      <a href="#" onclick="setSettingsTab('categorias'); return false;" style="padding:12px 0; font-weight:700; font-size:15px; text-decoration:none; color:${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'transparent'}">Categorías</a>
      <a href="#" onclick="setSettingsTab('casas'); return false;" style="padding:12px 0; font-weight:700; font-size:15px; text-decoration:none; color:${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'transparent'}">Casas</a>
    </div>`;

  if (AppState.settingsTab === 'casas') renderCasasTab(c, tabHeader, AppState.config.casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(c, tabHeader, AppState.config.categorias);
  else renderBancosTab(c, tabHeader, AppState.config.casas);
}

function renderCasasTab(container, header, casas) {
  container.innerHTML = `
    ${header}
    <div class="card">
      <div class="flex-between mb-6">
        <h3 style="margin:0; font-weight:600; font-size:18px;">Gestión de Casas</h3>
        <button class="btn btn-primary" onclick="addCasaMaster()">+ Nueva Casa</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${casas.map(casa => `
          <div style="background:#fff; border:1px solid var(--border-light); border-radius:16px; padding:20px; display:flex; justify-content:space-between; align-items:center; box-shadow: 0 4px 6px -1px rgba(0,0,
