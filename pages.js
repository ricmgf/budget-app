/**
 * [ARCHIVO_MAESTRO_V1.7.1_PROTEGIDO]
 * ⚠️ REGLA DE ORO: PROHIBIDO SIMPLIFICAR O MODIFICAR CARGA (initApp) O SISTEMA DE IDS.
 * ESTE CÓDIGO INCLUYE: DASHBOARD 28PX, PASTILLAS CATEGORÍAS, BANCOS CON INPUTS/CASAS Y DRAG&DROP.
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
// [BLOQUE_PROTEGIDO] - DASHBOARD (DISEÑO 28PX / COLOR DINÁMICO)
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
// [BLOQUE_PROTEGIDO] - IMPORTACIÓN (WIDGET DRAG & DROP)
// ============================================================
function loadImportPage() {
  const container = document.getElementById('import-content');
  container.innerHTML = `
    <div class="card" style="max-width: 800px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <h3 style="font-weight:600; font-size:18px; margin-bottom:16px;">Importar Extractos</h3>
      <div id="drop-zone" style="border: 2px dashed var(--border-medium); border-radius: 16px; padding: 60px 40px; text-align: center; background: #fcfdfe; transition: all 0.2s ease; cursor: pointer;">
        <div style="font-size: 48px; margin-bottom: 16px;">📂</div>
        <p style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">Arrastra tus archivos aquí</p>
        <p style="color: var(--text-tertiary); font-size: 13px; margin-bottom: 24px;">o haz clic para buscar</p>
        <input type="file" id="file-import" style="display:none" onchange="handleFileSelection(event)" multiple>
        <button class="btn btn-primary" onclick="document.getElementById('file-import').click()">Seleccionar Archivos</button>
      </div>
    </div>`;

  const dz = document.getElementById('drop-zone');
  ['dragenter', 'dragover'].forEach(e => dz.addEventListener(e, (evt) => { 
    evt.preventDefault();
    dz.style.background = 'var(--accent-subtle)'; 
    dz.style.borderColor = 'var(--accent)'; 
  }));
  ['dragleave', 'drop'].forEach(e => dz.addEventListener(e, (evt) => { 
    evt.preventDefault();
    dz.style.background = '#fcfdfe'; 
    dz.style.borderColor = 'var(--border-medium)'; 
  }));
  dz.addEventListener('drop', (e) => {
    handleFileSelection({ target: { files: e.dataTransfer.files } });
  });
}

// ============================================================
// [BLOQUE_PROTEGIDO] - SETTINGS (BANCOS CON INPUTS Y PASTILLAS)
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
          <div style="background:#fff; border:1px solid var(--border-light); border-radius:16px; padding:20px; display:flex; justify-content:space-between; align-items:center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03);">
            <span style="font-weight:600; font-size:16px; color:var(--accent);">${casa.name}</span>
            <div style="font-size:13px; display:flex; gap:15px;">
              <a href="#" onclick="renameCasaMaster('${casa.row}', '${casa.name}');return false;" style="text-decoration:none; color:var(--accent);">Editar</a>
              <span style="color:#e2e8f0">|</span>
              <a href="#" onclick="deleteCasaMaster('${casa.row}');return false;" style="text-decoration:none; color:var(--danger);">Eliminar</a>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderBancosTab(container, header, casas) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    container.innerHTML = `
      ${header}
      <div class="card">
        <h3 style="margin-bottom:24px; font-weight:600; font-size:18px;">Bancos y Cuentas</h3>
        <table style="width:100%; text-align:left; border-collapse:collapse; font-size:14px; margin-bottom:32px;">
          <thead style="color:var(--text-tertiary); border-bottom:1px solid var(--border-light);">
            <tr><th style="padding:12px 8px;">Nombre</th><th style="padding:12px 8px;">IBAN / Cuenta</th><th style="padding:12px 8px;">Tipo</th><th style="padding:12px 8px;">Casa</th></tr>
          </thead>
          <tbody>
            ${accs.slice(1).map(a => `
              <tr style="border-bottom:1px solid #f8fafc;">
                <td style="padding:14px 8px; font-weight:600;">${a[0] || ''}</td>
                <td style="padding:14px 8px; color:var(--text-secondary); font-family:var(--font-mono); font-size:12px;">${a[1] || ''}</td>
                <td style="padding:14px 8px;">${a[2] || ''}</td>
                <td style="padding:14px 8px;"><span style="background:var(--accent-subtle); color:var(--accent); padding:2px 8px; border-radius:4px; font-size:12px; font-weight:500;">${a[3] || 'Global'}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
        
        <div style="padding:24px; background:#f8fafc; border-radius:12px; border:1px solid var(--border-light);">
          <h4 style="margin-bottom:20px; font-size:15px; font-weight:600;">Añadir Nuevo Banco</h4>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:16px;">
            <input type="text" id="new-bank-name" placeholder="Nombre del Banco" style="padding:10px; border-radius:8px; border:1px solid var(--border-medium);">
            <input type="text" id="new-bank-iban" placeholder="IBAN / Cuenta" style="padding:10px; border-radius:8px; border:1px solid var(--border-medium);">
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:16px;">
            <select id="new-bank-type" style="padding:10px; border-radius:8px; border:1px solid var(--border-medium);">
               <option value="Corriente">Corriente</option><option value="Tarjeta">Tarjeta</option><option value="Ahorro">Ahorro</option>
            </select>
            <select id="new-bank-casa" style="padding:10px; border-radius:8px; border:1px solid var(--border-medium);">
               ${casas.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
            </select>
            <button class="btn btn-primary" onclick="addNewBank()">Guardar Banco</button>
          </div>
        </div>
      </div>`;
  });
}

function renderCategoriasTab(container, header, cats) {
  let html = `${header}
    <div class="card">
      <div class="flex-between mb-6">
        <h3 style="margin:0; font-weight:600; font-size:18px;">Categorías y Subcategorías</h3>
        <button class="btn btn-primary" onclick="addCategoryMaster()">+ Nueva Categoría</button>
      </div>
      <div style="display: grid; gap: 20px;">`;

  Object.keys(cats).forEach(cat => {
    html += `
      <div style="padding: 24px; border: 1px solid var(--border-light); border-radius: 12px; background: #fafafa;">
        <div class="flex-between mb-4">
          <strong style="font-size: 16px; color: var(--text-primary);">${cat}</strong>
          <div style="display: flex; gap: 15px; font-size: 13px;">
            <a href="javascript:void(0)" onclick="renameCategoryMaster('${cat}')" style="color: var(--accent); text-decoration: none;">Editar</a>
            <a href="javascript:void(0)" onclick="deleteCategoryMaster('${cat}')" style="color: var(--danger); text-decoration: none;">Eliminar</a>
          </div>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 10px;">
          ${cats[cat].map(sub => `
            <span style="display: inline-flex; align-items: center; background: white; border: 1px solid var(--border-medium); padding: 5px 12px; border-radius: 20px; font-size: 13px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
              ${sub}
              <button onclick="deleteSubcategory('${cat}', '${sub}')" style="margin-left: 8px; border: none; background: none; color: #cbd5e1; cursor: pointer; font-size: 18px; line-height: 1;">&times;</button>
            </span>
          `).join('')}
          <button onclick="addSubcategory('${cat}')" style="padding: 5px 15px; font-size: 13px; color: var(--accent); border: 1px dashed var(--accent); border-radius: 20px; background: none; cursor: pointer;">+ Añadir</button>
        </div>
      </div>`;
  });
  container.innerHTML = html + `</div></div>`;
}

// ============================================================
// [BLOQUE_PROTEGIDO] - MENÚS ADICIONALES (RESTAURADOS)
// ============================================================
function loadReviewPage() {
  document.getElementById('review-content').innerHTML = `
    <div class="card"><h3 style="font-weight:600; font-size:18px;">Revisión de Movimientos (Queue)</h3>
    <p style="color:var(--text-secondary); margin-top:16px;">Procesando transacciones pendientes...</p></div>`;
}
function loadBalancesPage() {
  document.getElementById('balances-content').innerHTML = `
    <div class="card"><h3 style="font-weight:600; font-size:18px;">Balances y Cash Flow</h3>
    <p style="color:var(--text-secondary); margin-top:16px;">Comparativa de saldos vs compromisos.</p></div>`;
}
function loadReportingPage() {
  document.getElementById('reporting-content').innerHTML = `
    <div class="card"><h3 style="font-weight:600; font-size:18px;">Reporting Anual</h3>
    <p style="color:var(--text-secondary); margin-top:16px;">Análisis de gastos e ingresos.</p></div>`;
}
function loadRulesPage() {
  document.getElementById('rules-content').innerHTML = `
    <div class="card"><h3 style="font-weight:600; font-size:18px;">Reglas de Autocategorización</h3>
    <p style="color:var(--text-secondary); margin-top:16px;">Gestión de la hoja RULES.</p></div>`;
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

// --- GLOBALES / ACCIONES ---
window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.handleFileSelection = (e) => { alert("Archivos listos."); };
window.addCasaMaster = async function() {
  const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", n]); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};
window.renameCasaMaster = async function(row, current) {
  const n = prompt("Nombre:", current); if (n && n !== current) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 4, n); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};
window.deleteCasaMaster = async function(row) {
  if (confirm("¿Borrar definitivamente?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};
window.addNewBank = async function() {
  const name = document.getElementById('new-bank-name').value;
  const iban = document.getElementById('new-bank-iban').value;
  const type = document.getElementById('new-bank-type').value;
  const casa = document.getElementById('new-bank-casa').value;
  if (name) { await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [name, iban, type, casa]); loadSettingsPage(); }
};
window.addCategoryMaster = async function() {
  const n = prompt("Categoría:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [n, "General"]); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};
window.addSubcategory = async function(cat) {
  const n = prompt("Subcategoría:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [cat, n]); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};
window.deleteSubcategory = async function(cat, sub) {
  if (confirm(`¿Eliminar "${sub}"?`)) {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    const idx = rows.findIndex(r => r[0] === cat && r[1] === sub);
    if (idx !== -1) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, idx + 1, 5, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); }
  }
};

initApp();
