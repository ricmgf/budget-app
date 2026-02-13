/**
 * [ARCHIVO_PROTEGIDO_V1.6.5] - CONTROLADOR DE UI
 * ⚠️ REGLA DE ORO: NO MODIFICAR CARGA, NAVEGACIÓN NI DASHBOARD.
 * ⚠️ SOLO SE PERMITE INYECTAR NUEVAS PESTAÑAS O FUNCIONES DE SOPORTE.
 */

const AppState = {
  config: null, 
  currentYear: new Date().getFullYear(), 
  currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard', 
  settingsTab: 'bancos',
  // [BLOQUE_PROTEGIDO] - No alterar la lógica de visualización de fecha
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
// [BLOQUE_PROTEGIDO] - NAVEGACIÓN Y CARGA (NO TOCAR)
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
  if (p === 'settings') loadSettingsPage();
  if (p === 'import') loadImportPage();
};

window.nextMonth = function() {
  if (AppState.currentMonth === 12) { AppState.currentMonth = 1; AppState.currentYear++; }
  else { AppState.currentMonth++; }
  AppState.initUI();
  // Restablecido: Carga dashboard solo si estamos en esa vista
  if (AppState.currentPage === 'dashboard') loadDashboard();
};

window.prevMonth = function() {
  if (AppState.currentMonth === 1) { AppState.currentMonth = 12; AppState.currentYear--; }
  else { AppState.currentMonth--; }
  AppState.initUI();
  // Restablecido: Carga dashboard solo si estamos en esa vista
  if (AppState.currentPage === 'dashboard') loadDashboard();
};

async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = '<div class="p-6">Cargando datos...</div>';
  try {
    const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    renderDashboard(container, data);
  } catch (e) {
    container.innerHTML = '<div class="p-6 text-danger">Error al cargar Dashboard</div>';
  }
}

function renderDashboard(container, data) {
  container.innerHTML = `
    <div class="dashboard-grid">
      <div class="card">
        <div class="text-secondary text-sm mb-1">Ingresos</div>
        <div class="text-2xl font-bold text-success">${Utils.formatCurrency(data.resumen.totalIngresos)}</div>
      </div>
      <div class="card">
        <div class="text-secondary text-sm mb-1">Gastos</div>
        <div class="text-2xl font-bold text-danger">${Utils.formatCurrency(data.resumen.totalGastos)}</div>
      </div>
      <div class="card">
        <div class="text-secondary text-sm mb-1">Balance</div>
        <div class="text-2xl font-bold">${Utils.formatCurrency(data.resumen.ahorro)}</div>
      </div>
    </div>
  `;
}

// ============================================================
// CONFIGURACIÓN (SETTINGS)
// ============================================================

async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  const cats = AppState.config.categorias;
  const casas = AppState.config.casas;

  const header = `
    <div class="settings-nav mb-6">
      <button class="btn ${AppState.settingsTab === 'bancos' ? 'btn-primary' : 'btn-ghost'}" onclick="setSettingsTab('bancos')">Bancos</button>
      <button class="btn ${AppState.settingsTab === 'categorias' ? 'btn-primary' : 'btn-ghost'}" onclick="setSettingsTab('categorias')">Categorías</button>
      <button class="btn ${AppState.settingsTab === 'casas' ? 'btn-primary' : 'btn-ghost'}" onclick="setSettingsTab('casas')">Casas</button>
    </div>
  `;

  if (AppState.settingsTab === 'casas') renderCasasTab(container, header, casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(container, header, cats);
  else container.innerHTML = header + '<div class="card">Gestión de Bancos (Próximamente)</div>';
}

function renderCasasTab(container, header, casas) {
  container.innerHTML = `${header}
    <div class="card">
      <div class="flex-between mb-6">
        <h3 style="font-weight:600; font-size:18px; margin:0;">Gestión de Residencias (Casas)</h3>
        <button class="btn btn-primary" onclick="addCasaMaster()">+ Nueva Casa</button>
      </div>
      <div class="grid-casas">
        ${casas.map(c => `
          <div class="item-row flex-between p-4 mb-2" style="border:1px solid var(--border-light); border-radius:8px;">
            <span style="font-weight:500;">${c.name}</span>
            <div style="display:flex; gap:12px;">
              <a href="javascript:void(0)" onclick="renameCasaMaster(${c.row}, '${c.name}')" style="color:var(--accent); font-size:13px;">Editar</a>
              <a href="javascript:void(0)" onclick="deleteCasaMaster(${c.row})" style="color:var(--danger); font-size:13px;">Eliminar</a>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function renderCategoriasTab(container, header, cats) {
  let html = `${header}
    <div class="card">
      <div class="flex-between mb-6">
        <h3 style="font-weight:600; font-size:18px; margin:0;">Gestión de Categorías y Subcategorías</h3>
        <button class="btn btn-primary" onclick="addCategoryMaster()">+ Nueva Categoría</button>
      </div>
      <div class="categories-grid" style="display: grid; gap: 20px;">`;

  Object.keys(cats).forEach(cat => {
    html += `
      <div class="category-group" style="padding: 20px; border: 1px solid var(--border-light); border-radius: 12px; background: #fafafa;">
        <div class="flex-between mb-4">
          <div style="display: flex; align-items: center; gap: 12px;">
            <strong style="font-size: 16px; color: var(--text-primary);">${cat}</strong>
            <span class="text-muted" style="font-size: 12px;">(${cats[cat].length} subcategorías)</span>
          </div>
          <div style="display: flex; gap: 15px;">
            <a href="javascript:void(0)" onclick="renameCategoryMaster('${cat}')" style="color: var(--accent); font-size: 13px; text-decoration: none;">Editar</a>
            <a href="javascript:void(0)" onclick="deleteCategoryMaster('${cat}')" style="color: var(--danger); font-size: 13px; text-decoration: none;">Eliminar</a>
          </div>
        </div>
        
        <div class="subcategories-tags" style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${cats[cat].map(sub => `
            <span class="tag" style="display: inline-flex; align-items: center; background: white; border: 1px solid var(--border-medium); padding: 4px 10px; border-radius: 20px; font-size: 13px;">
              ${sub}
              <button onclick="deleteSubcategory('${cat}', '${sub}')" style="margin-left: 8px; border: none; background: none; color: var(--text-tertiary); cursor: pointer; font-size: 14px; padding: 0 2px;">&times;</button>
            </span>
          `).join('')}
          <button class="btn-ghost" onclick="addSubcategory('${cat}')" style="padding: 4px 12px; font-size: 13px; color: var(--accent); border: 1px dashed var(--accent); border-radius: 20px; background: none; cursor: pointer;">+ Añadir</button>
        </div>
      </div>`;
  });

  html += `</div></div>`;
  container.innerHTML = html;
}

// ============================================================
// [BLOQUE_PROTEGIDO] - ARRANQUE DEL SISTEMA (NO TOCAR)
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

// ============================================================
// FUNCIONES DE ACCIÓN (GLOBALES)
// ============================================================

window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };

window.addCasaMaster = async function() {
  const n = prompt("Nombre de la nueva casa:"); 
  if (n) { 
    await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", n]); 
    await BudgetLogic.loadConfig();
    loadSettingsPage(); 
  }
};

window.renameCasaMaster = async function(row, current) {
  const n = prompt("Nuevo nombre:", current); 
  if (n && n !== current) { 
    await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 4, n); 
    await BudgetLogic.loadConfig();
    loadSettingsPage(); 
  }
};

window.deleteCasaMaster = async function(row) {
  if (confirm("¿Eliminar esta casa?")) {
    await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED');
    await BudgetLogic.loadConfig();
    loadSettingsPage();
  }
};

window.addCategoryMaster = async function() {
  const n = prompt("Nombre de la nueva categoría principal:");
  if (n) {
    await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [n, "General"]);
    await BudgetLogic.loadConfig();
    loadSettingsPage();
  }
};

window.addSubcategory = async function(cat) {
  const n = prompt(`Añadir subcategoría a "${cat}":`);
  if (n) {
    await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [cat, n]);
    await BudgetLogic.loadConfig();
    loadSettingsPage();
  }
};

window.deleteSubcategory = async function(cat, sub) {
  if (confirm(`¿Eliminar la subcategoría "${sub}"?`)) {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    const idx = rows.findIndex(r => r[0] === cat && r[1] === sub);
    if (idx !== -1) {
      await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, idx + 1, 5, 'DELETED');
      await BudgetLogic.loadConfig();
      loadSettingsPage();
    }
  }
};

window.renameCategoryMaster = function(cat) { alert("Editar Categoría: En desarrollo"); };
window.deleteCategoryMaster = function(cat) { alert("Eliminar Categoría: En desarrollo"); };

function loadImportPage() {
  const container = document.getElementById('import-content');
  container.innerHTML = `
    <div class="card">
      <h3 style="font-weight:600; font-size:18px; margin-bottom:16px;">Importar Extractos</h3>
      <div style="border:2px dashed var(--border-medium); padding:40px; text-align:center; border-radius:12px;">
        <input type="file" id="file-import" style="display:none" onchange="handleFileSelection(event)">
        <button class="btn btn-primary" onclick="document.getElementById('file-import').click()">Seleccionar Archivo</button>
      </div>
    </div>`;
}

function handleFileSelection(event) { alert("Importación: En desarrollo"); }
