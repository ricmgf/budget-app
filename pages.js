/**
 * [ARCHIVO_PROTEGIDO_V1.7.6_FINAL]
 * ⚠️ REGLA DE ORO: INYECCIÓN QUIRÚRGICA SOBRE BASE V1.55.
 * CAMBIOS: 1. Sidebar Inteligente (-25% ancho y colapsable). 2. Maximización área trabajo.
 * PROHIBIDO ALTERAR CARGA, FECHAS O ESTRUCTURA DE AppState.
 */
const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard', settingsTab: 'bancos',
  sidebarCollapsed: false, // Estado del menú
  initUI: function() {
    const el = document.getElementById('month-display');
    if (el) {
      const mNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      el.textContent = `${mNames[this.currentMonth]} ${this.currentYear}`;
    }
    
    // --- INYECCIÓN DE ESTILOS PROFESIONALES (SIDEBAR & LAYOUT) ---
    const style = document.createElement('style');
    style.innerHTML = `
      :root { 
        --sidebar-width: 195px !important; /* Reducción 25% */
        --sidebar-collapsed: 64px !important;
      }
      .app-sidebar { transition: width 0.3s ease !important; width: var(--sidebar-width) !important; position: relative; overflow: hidden; }
      .app-sidebar.collapsed { width: var(--sidebar-collapsed) !important; }
      .app-sidebar.collapsed .nav-label, .app-sidebar.collapsed .sidebar-header h1 { display: none; }
      .app-sidebar.collapsed .nav-item { justify-content: center; padding: 12px 0; }
      .app-sidebar.collapsed .nav-icon { margin: 0 !important; font-size: 20px; }
      
      .view-wrapper { 
        padding-left: 35px !important; padding-right: 25px !important; 
        max-width: 98% !important; transition: all 0.3s ease; 
      }
      .toggle-sidebar-btn {
        position: absolute; bottom: 20px; right: 15px; background: var(--bg-tertiary);
        border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer;
        display: flex; align-items: center; justify-content: center; z-index: 100;
      }
    `;
    document.head.appendChild(style);

    // Añadir botón de colapso si no existe
    const sidebar = document.querySelector('.app-sidebar');
    if (sidebar && !document.querySelector('.toggle-sidebar-btn')) {
      const btn = document.createElement('button');
      btn.className = 'toggle-sidebar-btn';
      btn.innerHTML = '⇄';
      btn.onclick = window.toggleSidebar;
      sidebar.appendChild(btn);
    }
  }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

// --- FUNCIONES DE INTERFAZ ---
window.toggleSidebar = function() {
  const sidebar = document.querySelector('.app-sidebar');
  AppState.sidebarCollapsed = !AppState.sidebarCollapsed;
  if (AppState.sidebarCollapsed) sidebar.classList.add('collapsed');
  else sidebar.classList.remove('collapsed');
};

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

// --- DASHBOARD (28PX / COLOR DINÁMICO) ---
async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  if (!container) return;
  container.innerHTML = '<div class="p-6">Cargando datos...</div>';
  try {
    const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const neto = data.resumen.totalIngresos - data.resumen.totalGastos;
    const netoColor = neto >= 0 ? 'var(--positive)' : 'var(--negative)';
    
    container.innerHTML = `
      <div class="metric-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
        <div class="card" onclick="navigateTo('review')" style="cursor:pointer">
          <h3 style="font-weight:600; font-size:15px; color:var(--text-secondary);">Queue</h3>
          <h2 style="color:var(--accent); font-size:28px; font-weight:700;">${data.pendingCount || 0}</h2>
        </div>
        <div class="card">
          <h3 style="font-weight:600; font-size:15px; color:var(--text-secondary);">Neto Mes</h3>
          <h2 style="font-size:28px; font-weight:700; color:${netoColor};">${Utils.formatCurrency(neto)}</h2>
        </div>
        <div class="card">
          <h3 style="font-weight:600; font-size:15px; color:var(--text-secondary);">Variación Plan</h3>
          <h2 style="font-size:28px; font-weight:700;">${Utils.formatCurrency((data.plannedGastos || 0) - data.resumen.totalGastos)}</h2>
        </div>
      </div>`;
  } catch (e) { container.innerHTML = '<div class="p-6 text-danger">Error al cargar Dashboard</div>'; }
}

// --- IMPORTACIÓN (DRAG & DROP) ---
function loadImportPage() {
  const c = document.getElementById('import-content');
  c.innerHTML = `
    <div class="card" style="max-width:800px; margin:0 auto;">
      <h3 style="font-weight:600; font-size:18px; margin-bottom:16px;">Importar Extractos</h3>
      <div id="drop-zone" style="border:2px dashed var(--border-medium); border-radius:16px; padding:60px; text-align:center; background:#fcfdfe; transition:0.2s; cursor:pointer;">
        <div style="font-size:48px; margin-bottom:16px;">📂</div>
        <p style="font-weight:600; font-size:16px; margin-bottom:8px;">Arrastra tus archivos aquí</p>
        <p style="color:var(--text-tertiary); font-size:13px; margin-bottom:24px;">o haz clic para buscar</p>
        <input type="file" id="file-import" style="display:none" onchange="handleFileSelection(event)" multiple>
        <button class="btn btn-primary" onclick="document.getElementById('file-import').click()">Seleccionar Archivos</button>
      </div>
    </div>`;
  const dz = document.getElementById('drop-zone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.background = 'var(--accent-subtle)'; dz.style.borderColor = 'var(--accent)'; });
  dz.addEventListener('dragleave', () => { dz.style.background = '#fcfdfe'; dz.style.borderColor = 'var(--border-medium)'; });
  dz.addEventListener('drop', (e) => { e.preventDefault(); handleFileSelection({ target: { files: e.dataTransfer.files } }); });
}

// --- SETTINGS (CORRECCIÓN MAPEO BANCOS) ---
async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  const cats = AppState.config.categorias;
  const casas = AppState.config.casas;
  const header = `
    <div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
      <a href="#" onclick="setSettingsTab('bancos'); return false;" style="padding:12px 0; font-weight:700; font-size:15px; text-decoration:none; color:${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'transparent'}">Bancos</a>
      <a href="#" onclick="setSettingsTab('categorias'); return false;" style="padding:12px 0; font-weight:700; font-size:15px; text-decoration:none; color:${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'transparent'}">Categorías</a>
      <a href="#" onclick="setSettingsTab('casas'); return false;" style="padding:12px 0; font-weight:700; font-size:15px; text-decoration:none; color:${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'transparent'}">Casas</a>
    </div>`;
  if (AppState.settingsTab === 'casas') renderCasasTab(container, header, casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(container, header, cats);
  else renderBancosTab(container, header, casas);
}

function renderBancosTab(container, header, casas) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    container.innerHTML = `${header}
      <div class="card">
        <h3 style="margin-bottom:24px; font-weight:600; font-size:18px;">Bancos</h3>
        <table style="width:100%; text-align:left; border-collapse:collapse; font-size:14px; margin-bottom:32px;">
          <thead style="color:var(--text-tertiary); border-bottom:1px solid var(--border-light);">
            <tr><th style="padding:12px 8px;">Nombre</th><th style="padding:12px 8px;">IBAN</th><th style="padding:12px 8px;">Tipo</th><th style="padding:12px 8px;">Casa</th></tr>
          </thead>
          <tbody>
            ${accs.slice(1).map(a => `<tr style="border-bottom:1px solid #f8fafc;">
                <td style="padding:14px 8px; font-weight:600;">${a[0]||''}</td>
                <td style="padding:14px 8px; font-family:var(--font-mono); font-size:12px;">${a[1]||''}</td>
                <td style="padding:14px 8px;">${a[3]||''}</td>
                <td style="padding:14px 8px;"><span style="background:var(--accent-subtle); color:var(--accent); padding:2px 8px; border-radius:4px; font-size:12px;">${a[2]||'Global'}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div style="padding:24px; background:#f8fafc; border-radius:12px; border:1px solid var(--border-light);">
          <h4 style="margin-bottom:20px; font-size:15px; font-weight:600;">Añadir Banco</h4>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
            <input type="text" id="new-bank-name" placeholder="Nombre" style="padding:10px; border-radius:8px; border:1px solid var(--border-medium);">
            <input type="text" id="new-bank-iban" placeholder="IBAN" style="padding:10px; border-radius:8px; border:1px solid var(--border-medium);">
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
            <select id="new-bank-type" style="padding:10px; border-radius:8px; border:1px solid var(--border-medium);"><option value="Corriente">Corriente</option><option value="Tarjeta">Tarjeta</option><option value="Ahorro">Ahorro</option></select>
            <select id="new-bank-casa" style="padding:10px; border-radius:8px; border:1px solid var(--border-medium);">${casas.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}</select>
            <button class="btn btn-primary" onclick="addNewBank()">Guardar</button>
          </div>
        </div>
      </div>`;
  });
}

function renderCasasTab(container, header, casas) {
  container.innerHTML = `${header}
    <div class="card">
      <div class="flex-between mb-6"><h3 style="margin:0; font-weight:600; font-size:18px;">Casas</h3><button class="btn btn-primary" onclick="addCasaMaster()">+ Nueva Casa</button></div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${casas.map(c => `
          <div style="background:#fff; border:1px solid var(--border-light); border-radius:16px; padding:20px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 4px 6px -1px rgba(0,0,0,0.03);">
            <span style="font-weight:600; font-size:16px; color:var(--accent);">${c.name}</span>
            <div style="font-size:13px; display:flex; gap:15px;"><a href="#" onclick="renameCasaMaster(${c.row}, '${c.name}');return false;" style="text-decoration:none; color:var(--accent);">Editar</a> | <a href="#" onclick="deleteCasaMaster(${c.row});return false;" style="text-decoration:none; color:var(--danger);">Eliminar</a></div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderCategoriasTab(container, header, cats) {
  let html = `${header}
    <div class="card">
      <div class="flex-between mb-6"><h3 style="margin:0; font-weight:600; font-size:18px;">Categorías</h3><button class="btn btn-primary" onclick="addCategoryMaster()">+ Nueva</button></div>
      <div style="display:grid; gap:20px;">`;
  Object.keys(cats).forEach(cat => {
    html += `<div style="padding:24px; border:1px solid var(--border-light); border-radius:12px; background:#fafafa;">
      <div class="flex-between mb-4"><strong style="font-size:16px;">${cat}</strong><div style="display:flex; gap:15px; font-size:13px;"><a href="#" onclick="renameCategoryMaster('${cat}');return false;" style="color:var(--accent); text-decoration:none;">Editar</a> | <a href="#" onclick="deleteCategoryMaster('${cat}');return false;" style="color:var(--danger); text-decoration:none;">Eliminar</a></div></div>
      <div style="display:flex; flex-wrap:wrap; gap:10px;">
        ${cats[cat].map(sub => `<span style="display:inline-flex; align-items:center; background:white; border:1px solid var(--border-medium); padding:5px 12px; border-radius:20px; font-size:13px;">${sub}<button onclick="deleteSubcategory('${cat}', '${sub}')" style="margin-left:8px; border:none; background:none; color:#cbd5e1; cursor:pointer; font-size:18px;">&times;</button></span>`).join('')}
        <button onclick="addSubcategory('${cat}')" style="padding:5px 15px; font-size:13px; color:var(--accent); border:1px dashed var(--accent); border-radius:20px; background:none; cursor:pointer;">+ Añadir</button>
      </div></div>`;
  });
  container.innerHTML = html + `</div></div>`;
}

// --- MENÚS ---
function loadReviewPage() { document.getElementById('review-content').innerHTML = `<div class="card"><h3>Review</h3><p>Pendiente...</p></div>`; }
function loadBalancesPage() { document.getElementById('balances-content').innerHTML = `<div class="card"><h3>Balances</h3><p>Cash Flow...</p></div>`; }
function loadReportingPage() { document.getElementById('reporting-content').innerHTML = `<div class="card"><h3>Reporting</h3><p>Análisis...</p></div>`; }
function loadRulesPage() { document.getElementById('rules-content').innerHTML = `<div class="card"><h3>Reglas</h3><p>Gestión...</p></div>`; }

// --- ARRANQUE (V1.55) ---
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
window.addCasaMaster = async function() { const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["","","",n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.renameCasaMaster = async function(row, current) { const n = prompt("Nombre:", current); if (n && n !== current) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 4, n); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCasaMaster = async function(row) { if (confirm("¿Borrar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.addNewBank = async function() { 
  const n = document.getElementById('new-bank-name').value, i = document.getElementById('new-bank-iban').value, t = document.getElementById('new-bank-type').value, c = document.getElementById('new-bank-casa').value;
  if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [n, i, t, c]); loadSettingsPage(); }
};
window.addCategoryMaster = async function() { const n = prompt("Cat:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [n, "General"]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.addSubcategory = async function(cat) { const n = prompt("Sub:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [cat, n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.handleFileSelection = (e) => { alert("Archivos listos."); };

initApp();
