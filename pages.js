/**
 * [ARCHIVO_MAESTRO_ARQUITECTURA_V2.0.0]
 * ⚠️ REGLA DE ORO: ARQUITECTURA BASADA EN ESTADOS Y COMPONENTES.
 * MANTIENE: DASHBOARD 28PX, PASTILLAS, BANCOS CORREGIDOS Y WIDGET D&D.
 * NUEVO: SIDEBAR INTELIGENTE ESCALABLE (CSS-DRIVEN).
 */

const AppState = {
  config: null,
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard',
  settingsTab: 'bancos',
  sidebarCollapsed: false,

  /**
   * Inicializa la interfaz y las reglas de estilo globales (Arquitectura Limpia).
   */
  initUI: function() {
    this.injectGlobalStyles();
    this.updateMonthDisplay();
    this.setupSidebarToggle();
  },

  injectGlobalStyles: function() {
    if (document.getElementById('app-core-styles')) return;
    const style = document.createElement('style');
    style.id = 'app-core-styles';
    style.innerHTML = `
      :root {
        --sidebar-width: 200px;
        --sidebar-collapsed: 64px;
        --transition-speed: 0.3s;
      }
      
      /* Layout & Sidebar */
      .app-sidebar { 
        width: var(--sidebar-width) !important; 
        transition: width var(--transition-speed) ease !important;
        position: relative;
        overflow: hidden;
      }
      .app-sidebar.collapsed { width: var(--sidebar-collapsed) !important; }
      .app-sidebar.collapsed .nav-label, .app-sidebar.collapsed .sidebar-header h1 { display: none; }
      .app-sidebar.collapsed .nav-item { justify-content: center; padding: 12px 0; }
      .app-sidebar.collapsed .nav-icon { margin: 0 !important; font-size: 20px; }

      /* Botón Toggle Minimalista */
      .sidebar-toggle-btn {
        position: absolute; top: 15px; right: 10px;
        background: transparent; border: 1px solid var(--border-light);
        color: var(--text-secondary); border-radius: 4px;
        width: 24px; height: 24px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 14px; z-index: 100; transition: all 0.2s;
      }
      .sidebar-toggle-btn:hover { background: var(--bg-hover); color: var(--accent); }

      /* Área de Trabajo Maximizada (Pactado: Izq -20%, Der -35%) */
      .view-wrapper {
        padding-left: 40px !important; 
        padding-right: 32px !important;
        max-width: 98% !important;
        transition: padding var(--transition-speed) ease;
        margin: 0 auto;
      }

      /* Dashboard Metrics (Pactado 28px) */
      .metric-value { font-size: 28px !important; font-weight: 700 !important; }
      
      /* Categorías (Pastillas) */
      .cat-card { background: #fafafa; border-radius: 12px; border: 1px solid var(--border-light); padding: 24px; }
      .tag-sub { 
        display: inline-flex; align-items: center; background: white; 
        border: 1px solid var(--border-medium); padding: 5px 12px; 
        border-radius: 20px; font-size: 13px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      }
    `;
    document.head.appendChild(style);
  },

  updateMonthDisplay: function() {
    const el = document.getElementById('month-display');
    if (el) {
      const mNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      el.textContent = `${mNames[this.currentMonth]} ${this.currentYear}`;
    }
  },

  setupSidebarToggle: function() {
    const sidebar = document.querySelector('.app-sidebar');
    if (sidebar && !document.querySelector('.sidebar-toggle-btn')) {
      const btn = document.createElement('button');
      btn.className = 'sidebar-toggle-btn';
      btn.innerHTML = '‹'; // Símbolo inicial
      btn.onclick = () => {
        this.sidebarCollapsed = !this.sidebarCollapsed;
        sidebar.classList.toggle('collapsed');
        btn.innerHTML = this.sidebarCollapsed ? '›' : '‹';
      };
      sidebar.appendChild(btn);
    }
  }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

// --- GESTIÓN DE NAVEGACIÓN ---
window.navigateTo = function(pageId) {
  AppState.currentPage = pageId;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add('active');
  
  const navItem = document.querySelector(`[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');
  
  // Enrutador de carga
  const routes = {
    'dashboard': loadDashboard,
    'settings': loadSettingsPage,
    'import': loadImportPage,
    'review': loadReviewPage,
    'balances': loadBalancesPage,
    'reporting': loadReportingPage,
    'rules': loadRulesPage
  };
  if (routes[pageId]) routes[pageId]();
};

window.nextMonth = () => { AppState.currentMonth === 12 ? (AppState.currentMonth = 1, AppState.currentYear++) : AppState.currentMonth++; AppState.updateMonthDisplay(); if (AppState.currentPage === 'dashboard') loadDashboard(); };
window.prevMonth = () => { AppState.currentMonth === 1 ? (AppState.currentMonth = 12, AppState.currentYear--) : AppState.currentMonth--; AppState.updateMonthDisplay(); if (AppState.currentPage === 'dashboard') loadDashboard(); };

// --- COMPONENTES DE INTERFAZ ---

async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  if (!container) return;
  container.innerHTML = '<div class="p-6">Sincronizando Dashboard...</div>';
  try {
    const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const neto = data.resumen.totalIngresos - data.resumen.totalGastos;
    const netoColor = neto >= 0 ? 'var(--positive)' : 'var(--negative)';
    
    container.innerHTML = `
      <div class="metric-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
        <div class="card" onclick="navigateTo('review')" style="cursor:pointer">
          <h3 style="font-weight:600; font-size:15px; color:var(--text-secondary);">Queue</h3>
          <div class="metric-value" style="color:var(--accent);">${data.pendingCount || 0}</div>
        </div>
        <div class="card">
          <h3 style="font-weight:600; font-size:15px; color:var(--text-secondary);">Neto Mes</h3>
          <div class="metric-value" style="color:${netoColor};">${Utils.formatCurrency(neto)}</div>
        </div>
        <div class="card">
          <h3 style="font-weight:600; font-size:15px; color:var(--text-secondary);">Variación Plan</h3>
          <div class="metric-value">${Utils.formatCurrency((data.plannedGastos || 0) - data.resumen.totalGastos)}</div>
        </div>
      </div>`;
  } catch (e) { container.innerHTML = '<div class="p-6 text-danger">Error de carga.</div>'; }
}

function loadImportPage() {
  const c = document.getElementById('import-content');
  c.innerHTML = `
    <div class="card" style="max-width:800px; margin:0 auto;">
      <h3 style="font-weight:600; font-size:18px; margin-bottom:16px;">Importar Extractos</h3>
      <div id="drop-zone" style="border:2px dashed var(--border-medium); border-radius:16px; padding:60px; text-align:center; background:#fcfdfe; transition:0.2s; cursor:pointer;">
        <div style="font-size:48px; margin-bottom:16px;">📂</div>
        <p style="font-weight:600; font-size:16px;">Arrastra tus archivos aquí</p>
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

async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  const header = `
    <div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
      ${['bancos', 'categorias', 'casas'].map(t => `
        <a href="#" onclick="setSettingsTab('${t}'); return false;" 
           style="padding:12px 0; font-weight:700; font-size:15px; text-decoration:none; 
           color:${AppState.settingsTab === t ? 'var(--accent)' : 'var(--text-secondary)'}; 
           border-bottom: 2px solid ${AppState.settingsTab === t ? 'var(--accent)' : 'transparent'}">
           ${t.charAt(0).toUpperCase() + t.slice(1)}
        </a>`).join('')}
    </div>`;
  
  if (AppState.settingsTab === 'casas') renderCasasTab(container, header, AppState.config.casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(container, header, AppState.config.categorias);
  else renderBancosTab(container, header, AppState.config.casas);
}

function renderBancosTab(container, header, casas) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    container.innerHTML = `${header}
      <div class="card">
        <h3 style="margin-bottom:24px; font-weight:600; font-size:18px;">Bancos</h3>
        <table style="width:100%; text-align:left; border-collapse:collapse; font-size:14px; margin-bottom:32px;">
          <thead style="color:var(--text-tertiary); border-bottom:1px solid var(--border-light);">
            <tr><th>Nombre</th><th>IBAN</th><th>Tipo</th><th>Casa</th></tr>
          </thead>
          <tbody>
            ${accs.slice(1).map(a => `<tr style="border-bottom:1px solid #f8fafc;">
                <td style="padding:14px 8px; font-weight:600;">${a[0]||''}</td>
                <td style="padding:14px 8px; font-family:var(--font-mono); font-size:12px;">${a[1]||''}</td>
                <td style="padding:14px 8px;">${a[2]||''}</td> <td style="padding:14px 8px;"><span style="background:var(--accent-subtle); color:var(--accent); padding:2px 8px; border-radius:4px; font-size:12px;">${a[3]||'Global'}</span></td> </tr>`).join('')}
          </tbody>
        </table>
        <div style="padding:24px; background:#f8fafc; border-radius:12px; border:1px solid var(--border-light);">
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

function renderCategoriasTab(container, header, cats) {
  let html = `${header}<div class="card"><div class="flex-between mb-6"><h3 style="margin:0; font-weight:600; font-size:18px;">Categorías</h3><button class="btn btn-primary" onclick="addCategoryMaster()">+ Nueva</button></div><div style="display:grid; gap:20px;">`;
  Object.keys(cats).forEach(cat => {
    html += `<div class="cat-card">
      <div class="flex-between mb-4"><strong style="font-size:16px;">${cat}</strong><div style="display:flex; gap:15px; font-size:13px;"><a href="#" onclick="renameCategoryMaster('${cat}');return false;" style="color:var(--accent); text-decoration:none;">Editar</a> | <a href="#" onclick="deleteCategoryMaster('${cat}');return false;" style="color:var(--danger); text-decoration:none;">Eliminar</a></div></div>
      <div style="display:flex; flex-wrap:wrap; gap:10px;">
        ${cats[cat].map(sub => `<span class="tag-sub">${sub}<button onclick="deleteSubcategory('${cat}', '${sub}')" style="margin-left:8px; border:none; background:none; color:#cbd5e1; cursor:pointer; font-size:18px;">&times;</button></span>`).join('')}
        <button onclick="addSubcategory('${cat}')" style="padding:5px 15px; font-size:13px; color:var(--accent); border:1px dashed var(--accent); border-radius:20px; background:none; cursor:pointer;">+ Añadir</button>
      </div></div>`;
  });
  container.innerHTML = html + `</div></div>`;
}

function renderCasasTab(container, header, casas) {
  container.innerHTML = `${header}<div class="card"><div class="flex-between mb-6"><h3 style="margin:0; font-weight:600; font-size:18px;">Casas</h3><button class="btn btn-primary" onclick="addCasaMaster()">+ Nueva</button></div><div style="display:flex; flex-direction:column; gap:12px;">
    ${casas.map(c => `<div style="background:#fff; border:1px solid var(--border-light); border-radius:16px; padding:20px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 4px 6px -1px rgba(0,0,0,0.03);">
      <span style="font-weight:600; font-size:16px; color:var(--accent);">${c.name}</span>
      <div style="font-size:13px; display:flex; gap:15px;"><a href="#" onclick="renameCasaMaster(${c.row}, '${c.name}');return false;" style="color:var(--accent); text-decoration:none;">Editar</a> | <a href="#" onclick="deleteCasaMaster(${c.row});return false;" style="color:var(--danger); text-decoration:none;">Eliminar</a></div>
    </div>`).join('')}</div></div>`;
}

// --- ARRANQUE SEGURO ---
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

// --- ACCIONES GLOBALES ---
window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.addCasaMaster = async function() { const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["","","",n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.addNewBank = async function() { 
  const n = document.getElementById('new-bank-name').value, i = document.getElementById('new-bank-iban').value, t = document.getElementById('new-bank-type').value, c = document.getElementById('new-bank-casa').value;
  if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [n, i, t, c]); loadSettingsPage(); }
};
window.handleFileSelection = (e) => { alert("Archivos listos."); };

// Menús vacíos protegidos
function loadReviewPage() { document.getElementById('review-content').innerHTML = `<div class="card"><h3>Review</h3><p>Validación de movimientos pendiente.</p></div>`; }
function loadBalancesPage() { document.getElementById('balances-content').innerHTML = `<div class="card"><h3>Balances</h3><p>Cash Flow por bancos.</p></div>`; }
function loadReportingPage() { document.getElementById('reporting-content').innerHTML = `<div class="card"><h3>Reporting</h3><p>Análisis anual.</p></div>`; }
function loadRulesPage() { document.getElementById('rules-content').innerHTML = `<div class="card"><h3>Reglas</h3><p>Autocategorización.</p></div>`; }

initApp();
