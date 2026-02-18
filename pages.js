/**
 * [ARCHIVO_MAESTRO_V2.0]
 * REGLA DE ORO: NO MUTILAR ARRANQUE.
 * Tabs: Bancos, Categorías, Casas, Tarjetas
 * Import: CSV, HTML, PDF widget
 * Sidebar: Colapsable con iconos
 */

const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard', settingsTab: 'bancos', sidebarCollapsed: false,
  isAddingBank: false, editingBankData: null,
  initUI: function() {
    const el = document.getElementById('month-display');
    if (el) {
      const mNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      el.textContent = `${mNames[this.currentMonth]} ${this.currentYear}`;
    }
  }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

// ===================== NAVEGACIÓN =====================
window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  const nav = document.querySelector(`[data-page="${p}"]`);
  if (nav) nav.classList.add('active');
  const titleMap = { dashboard: 'Dashboard', budget: 'Budget', review: 'Review', balances: 'Balances', import: 'Importar', reporting: 'Reporting', rules: 'Reglas', settings: 'Settings' };
  if (document.getElementById('page-title')) document.getElementById('page-title').textContent = titleMap[p] || p;

  // Toggle full-width mode for budget
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    if (p === 'budget') mainContent.classList.add('full-width');
    else mainContent.classList.remove('full-width');
  }

  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
  else if (p === 'rules') loadRulesPage();
  else if (p === 'import') loadImportPage();
  else if (p === 'budget') BudgetGrid.init();
};

window.toggleSidebar = function() {
  const sidebar = document.getElementById('main-sidebar');
  const btn = document.getElementById('sidebar-toggle');
  AppState.sidebarCollapsed = !AppState.sidebarCollapsed;
  if (sidebar) sidebar.classList.toggle('collapsed');
  if (btn) btn.innerHTML = AppState.sidebarCollapsed ? '›' : '‹';
};

window.nextMonth = () => { AppState.currentMonth === 12 ? (AppState.currentMonth = 1, AppState.currentYear++) : AppState.currentMonth++; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };
window.prevMonth = () => { AppState.currentMonth === 1 ? (AppState.currentMonth = 12, AppState.currentYear--) : AppState.currentMonth--; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };

// ===================== DASHBOARD =====================
async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  if (!container) return;
  container.innerHTML = '<div style="padding:20px; color:var(--text-secondary);">Cargando...</div>';
  try {
    const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const neto = data.resumen.totalIngresos - data.resumen.totalGastos;
    container.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:20px; margin-bottom:30px;">
        <div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="color:var(--text-secondary); font-size:14px; font-weight:600;">Pendientes Review</div>
          <div style="font-size:32px; font-weight:700; color:var(--accent); margin-top:8px;">${data.pendingCount || 0}</div>
        </div>
        <div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="color:var(--text-secondary); font-size:14px; font-weight:600;">Neto Mes</div>
          <div style="font-size:32px; font-weight:700; color:${neto >= 0 ? '#10b981' : '#ef4444'}; margin-top:8px;">${Utils.formatCurrency(neto)}</div>
        </div>
        <div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="color:var(--text-secondary); font-size:14px; font-weight:600;">Variación Plan</div>
          <div style="font-size:32px; font-weight:700; color:var(--text-primary); margin-top:8px;">${Utils.formatCurrency((data.plannedGastos || 0) - data.resumen.totalGastos)}</div>
        </div>
      </div>`;
  } catch (e) { console.error(e); }
}

// ===================== SETTINGS =====================
function buildSettingsHeader() {
  const tabs = ['bancos', 'categorias', 'casas', 'tarjetas'];
  return `<div class="settings-tabs">
    ${tabs.map(t => `<button class="settings-tab ${AppState.settingsTab === t ? 'active' : ''}" onclick="setSettingsTab('${t}')">${t.toUpperCase()}</button>`).join('')}
  </div>`;
}

async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  if (!container) return;
  if (!AppState.config) await BudgetLogic.loadConfig();
  const cats = AppState.config.categorias;
  const casas = AppState.config.casas;
  const tarjetas = AppState.config.tarjetas || [];
  const header = buildSettingsHeader();

  if (AppState.settingsTab === 'casas') renderCasasTab(container, header, casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(container, header, cats);
  else if (AppState.settingsTab === 'tarjetas') renderTarjetasTab(container, header, tarjetas);
  else renderBancosTab(container, header, casas, tarjetas);
}

// -------- BANCOS TAB --------
function renderBancosTab(container, header, casas, tarjetas) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    let html = `${header}<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
           <h3 style="margin:0; color:var(--text-primary); font-weight:700;">Gestión de Bancos</h3>
           <button onclick="toggleAddBankForm()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:600; font-size:14px;">${AppState.isAddingBank ? 'Cancelar' : '+ Nuevo Banco'}</button>
        </div>`;

    if (AppState.isAddingBank) {
      const d = AppState.editingBankData || { row: null, name: '', iban: '', casa: '', tarjeta: '' };
      const selectedCards = d.tarjeta ? d.tarjeta.split(',').map(s => s.trim()).filter(Boolean) : [];
      const tarjetaNames = tarjetas.map(t => t.name);

      html += `<div style="background:var(--bg-canvas,#f1f5f9); padding:20px; border-radius:12px; margin-bottom:24px; display:grid; grid-template-columns: 1fr 1fr 1fr 1fr auto; gap:12px; align-items:end;">
          <div><label style="display:block; font-size:11px; margin-bottom:6px; font-weight:700; text-transform:uppercase; color:var(--text-secondary);">Nombre</label><input id="new-bank-name" type="text" value="${d.name}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-light); font-size:14px;"></div>
          <div><label style="display:block; font-size:11px; margin-bottom:6px; font-weight:700; text-transform:uppercase; color:var(--text-secondary);">IBAN</label><input id="new-bank-iban" type="text" value="${d.iban}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-light); font-size:14px;"></div>
          <div><label style="display:block; font-size:11px; margin-bottom:6px; font-weight:700; text-transform:uppercase; color:var(--text-secondary);">Casa</label><select id="new-bank-casa" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-light); font-size:14px;">
            ${casas.map(c => `<option value="${c.name}" ${String(d.casa).trim().toLowerCase() === String(c.name).trim().toLowerCase() ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select></div>
          <div>
            <label style="display:block; font-size:11px; margin-bottom:6px; font-weight:700; text-transform:uppercase; color:var(--text-secondary);">Tarjetas</label>
            <div class="custom-multiselect">
              <div class="ms-display" onclick="document.querySelector('.ms-options').classList.toggle('active')">
                <span id="ms-label">${selectedCards.length > 0 ? selectedCards.join(', ') : 'Seleccionar...'}</span>
              </div>
              <div class="ms-options">
                ${tarjetaNames.map(t => `
                  <div class="ms-option">
                    <input type="checkbox" class="card-cb" value="${t}" ${selectedCards.includes(t) ? 'checked' : ''} onchange="syncCardLabel()">
                    <label>${t}</label>
                  </div>`).join('')}
              </div>
            </div>
          </div>
          <button onclick="saveBank()" style="background:var(--positive,#10b981); color:white; border:none; padding:10px 24px; border-radius:8px; cursor:pointer; font-weight:700; font-size:14px; text-transform:uppercase;">${d.row ? 'Actualizar' : 'GUARDAR'}</button>
        </div>`;
    }

    html += `<table style="width:100%; border-collapse:collapse; text-align:left;">
          <thead><tr style="color:var(--text-secondary); font-size:11px; text-transform:uppercase; letter-spacing:0.05em; border-bottom: 1px solid var(--border-light);">
            <th style="padding:12px 8px; font-weight:700;">Banco</th><th style="font-weight:700;">IBAN</th><th style="font-weight:700;">Tarjetas</th><th style="font-weight:700;">Casa</th><th style="text-align:right; font-weight:700;">Acciones</th></tr>
          </thead>
          <tbody>
            ${(accs || []).slice(1).filter(a => a[0] && a[0] !== 'DELETED').map((a, i) => {
              const cards = a[3] ? a[3].split(',').filter(c => c.trim()) : [];
              const safeName = (a[0]||'').replace(/'/g, "\\'");
              const safeIban = (a[1]||'').replace(/'/g, "\\'");
              const safeCasa = (a[2]||'').replace(/'/g, "\\'");
              const safeCards = (a[3]||'').replace(/'/g, "\\'");
              return `<tr style="border-bottom:1px solid var(--border-light);">
                <td style="padding:16px 8px; font-weight:600; color:var(--text-primary);">${a[0]||''}</td>
                <td style="font-family:monospace; color:var(--text-secondary); font-size:13px;">${a[1]||''}</td>
                <td>${cards.map(c => `<span class="tag-card">${c.trim()}</span>`).join('')}</td>
                <td><span style="color:var(--text-secondary); font-size:13px;">${a[2] || ''}</span></td>
                <td style="text-align:right;">
                  <button onclick="initEditBank(${i+2}, '${safeName}', '${safeIban}', '${safeCasa}', '${safeCards}')" style="background:none; border:none; color:var(--accent); cursor:pointer; font-weight:600; margin-right:12px;">Editar</button>
                  <button onclick="deleteBankMaster(${i+2})" style="background:none; border:none; color:var(--negative,#ef4444); cursor:pointer; font-weight:600;">Eliminar</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody></table></div>`;
    container.innerHTML = html;
  }).catch(e => {
    console.error("Error cargando bancos:", e);
    container.innerHTML = header + '<div style="padding:24px; color:var(--text-secondary);">Error al cargar bancos. Verifica que la hoja ACCOUNTS exista.</div>';
  });
}

// Close multiselect on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('.custom-multiselect')) {
    document.querySelectorAll('.ms-options.active').forEach(el => el.classList.remove('active'));
  }
});

window.syncCardLabel = () => {
  const selected = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value);
  const label = document.getElementById('ms-label');
  if (label) label.textContent = selected.length > 0 ? selected.join(', ') : 'Seleccionar...';
};

window.toggleAddBankForm = () => { AppState.isAddingBank = !AppState.isAddingBank; AppState.editingBankData = null; loadSettingsPage(); };
window.initEditBank = (row, n, i, c, t) => { AppState.isAddingBank = true; AppState.editingBankData = { row, name: n, iban: i, casa: c, tarjeta: t }; loadSettingsPage(); };

window.saveBank = async function() {
  const n = document.getElementById('new-bank-name').value;
  const i = document.getElementById('new-bank-iban').value;
  const c = document.getElementById('new-bank-casa').value;
  const t = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value).join(',');

  if (!n || !i) return alert("Nombre e IBAN obligatorios");
  try {
    if (AppState.editingBankData && AppState.editingBankData.row) {
      await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 1, n);
      await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 2, i);
      await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 3, c);
      await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 4, t);
    } else {
      await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [n, i, c, t]);
    }
    AppState.isAddingBank = false; AppState.editingBankData = null; loadSettingsPage();
  } catch(e) { console.error("Error guardando banco:", e); alert("Error al guardar"); }
};

window.deleteBankMaster = async function(row) {
  if (confirm("¿Seguro que quieres eliminar este banco?")) {
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 1, 'DELETED');
    loadSettingsPage();
  }
};

// -------- CATEGORÍAS TAB --------
function renderCategoriasTab(container, header, cats) {
  let html = header + `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
      <h3 style="margin:0; color:var(--text-primary); font-weight:700;">Categorías</h3>
      <button onclick="addCategoryMaster()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:600; font-size:14px;">+ Nueva</button>
    </div>`;
  Object.keys(cats).forEach(cat => {
    const safeCat = cat.replace(/'/g, "\\'");
    html += `<div style="margin-bottom:16px; padding:20px; background:white; border-radius:16px; border: 1px solid var(--border-light); box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <strong style="font-size:16px; color:var(--text-primary);">${cat}</strong>
          <div>
            <button onclick="renameCategoryMaster('${safeCat}')" style="background:none; border:none; color:var(--accent); cursor:pointer; font-size:13px; font-weight:600; margin-right:10px;">Editar</button>
            <button onclick="deleteCategoryMaster('${safeCat}')" style="background:none; border:none; color:var(--negative,#ef4444); cursor:pointer; font-size:13px; font-weight:600;">Borrar</button>
          </div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${cats[cat].map(sub => {
            const safeSub = sub.replace(/'/g, "\\'");
            return `<span style="background:white; border: 1px solid var(--border-light); padding:6px 14px; border-radius:20px; font-size:13px; color:var(--text-secondary); display:inline-flex; align-items:center; gap:6px;">
            ${sub}
            <button onclick="deleteSubcategory('${safeCat}','${safeSub}')" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:14px; padding:0; line-height:1;">×</button>
          </span>`;
          }).join('')}
          <button onclick="addSubcategory('${safeCat}')" style="background:none; border: 1px dashed var(--accent); color:var(--accent); padding:6px 14px; border-radius:20px; font-size:13px; cursor:pointer; font-weight:500;">+ Sub</button>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

// -------- CASAS TAB --------
function renderCasasTab(container, header, casas) {
  container.innerHTML = `${header}<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h3 style="margin:0; color:var(--text-primary); font-weight:700;">Mis Casas</h3>
        <button onclick="addCasaMaster()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:600; font-size:14px;">+ Nueva Casa</button>
      </div>
      <div style="display:grid; gap:12px;">${casas.map(c => {
        const safeName = c.name.replace(/'/g, "\\'");
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:16px; background:var(--bg-canvas,#f1f5f9); border-radius:12px;">
            <span style="font-weight:600; color:var(--text-primary);">${c.name}</span>
            <div style="display:flex; gap:16px;">
              <button onclick="renameCasaMaster(${c.row}, '${safeName}')" style="background:none; border:none; color:var(--accent); cursor:pointer; font-weight:600;">Editar</button>
              <button onclick="deleteCasaMaster(${c.row})" style="background:none; border:none; color:var(--negative,#ef4444); cursor:pointer; font-weight:600;">Eliminar</button>
            </div>
          </div>`;
      }).join('')}</div></div>`;
}

// -------- TARJETAS TAB --------
function renderTarjetasTab(container, header, tarjetas) {
  container.innerHTML = `${header}<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h3 style="margin:0; color:var(--text-primary); font-weight:700;">Mis Tarjetas</h3>
        <button onclick="addTarjetaMaster()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:600; font-size:14px;">+ Nueva Tarjeta</button>
      </div>
      <div style="display:grid; gap:12px;">${tarjetas.map(t => {
        const safeName = t.name.replace(/'/g, "\\'");
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:16px; background:var(--bg-canvas,#f1f5f9); border-radius:12px;">
            <span style="font-weight:600; color:var(--text-primary);">${t.name}</span>
            <div style="display:flex; gap:16px;">
              <button onclick="renameTarjetaMaster(${t.row}, '${safeName}')" style="background:none; border:none; color:var(--accent); cursor:pointer; font-weight:600;">Editar</button>
              <button onclick="deleteTarjetaMaster(${t.row})" style="background:none; border:none; color:var(--negative,#ef4444); cursor:pointer; font-weight:600;">Eliminar</button>
            </div>
          </div>`;
      }).join('')}</div></div>`;
}

// ===================== IMPORT PAGE =====================
function loadImportPage() {
  const container = document.getElementById('import-content');
  if (!container) return;
  container.innerHTML = `
    <div style="background:white; padding:32px; border-radius:16px; border:1px solid var(--border-light); box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <h3 style="margin:0 0 24px 0; font-weight:700;">Importar Movimientos</h3>
      <div class="import-dropzone" id="import-dropzone" onclick="document.getElementById('import-file-input').click()">
        <div class="import-dropzone-icon">📁</div>
        <div class="import-dropzone-text">Arrastra tu archivo aquí o haz clic para seleccionar</div>
        <div class="import-dropzone-sub">Formatos soportados:</div>
        <div class="import-format-badges">
          <span class="import-format-badge">CSV</span>
          <span class="import-format-badge">HTML</span>
          <span class="import-format-badge">PDF</span>
          <span class="import-format-badge">XLS/XLSX</span>
        </div>
        <input type="file" id="import-file-input" accept=".csv,.html,.htm,.pdf,.xls,.xlsx" style="display:none" onchange="handleImportFile(this)">
      </div>
      <div id="import-preview" style="margin-top:24px;"></div>
      <div id="import-actions" style="display:none; margin-top:16px; text-align:right;">
        <button onclick="cancelImport()" style="background:var(--bg-tertiary,#eef0f4); color:var(--text-secondary); border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:600; margin-right:8px;">Cancelar</button>
        <button onclick="confirmImport()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:600;">Importar a Google Sheets</button>
      </div>
    </div>`;

  // Drag & drop
  const dz = document.getElementById('import-dropzone');
  if (dz) {
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('dragover'); if (e.dataTransfer.files.length) handleImportFileObj(e.dataTransfer.files[0]); });
  }
}

window._importedRows = [];

window.handleImportFile = function(input) {
  if (input.files.length) handleImportFileObj(input.files[0]);
};

async function handleImportFileObj(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const preview = document.getElementById('import-preview');
  const actions = document.getElementById('import-actions');
  preview.innerHTML = '<div style="color:var(--text-secondary); padding:12px;">Procesando archivo...</div>';

  try {
    let rows = [];
    if (ext === 'csv') {
      rows = await parseCSV(file);
    } else if (ext === 'html' || ext === 'htm') {
      rows = await parseHTML(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      rows = await parseXLSX(file);
    } else if (ext === 'pdf') {
      preview.innerHTML = '<div style="color:var(--warning,#d97706); padding:12px; background:var(--warning-light,#fef3c7); border-radius:8px;">⚠️ La importación de PDF requiere extracción de texto. Por favor convierte a CSV primero si es posible.</div>';
      return;
    } else {
      preview.innerHTML = '<div style="color:var(--danger,#dc2626); padding:12px;">Formato no soportado</div>';
      return;
    }

    window._importedRows = rows;
    if (rows.length === 0) {
      preview.innerHTML = '<div style="color:var(--text-secondary); padding:12px;">No se encontraron datos en el archivo.</div>';
      return;
    }

    const headerRow = rows[0];
    const dataRows = rows.slice(0, 11);
    let tbl = `<div style="font-size:13px; color:var(--text-secondary); margin-bottom:8px;">Vista previa — ${rows.length - 1} filas encontradas (mostrando máx. 10)</div>
      <div style="overflow-x:auto; border:1px solid var(--border-light); border-radius:8px;">
      <table class="import-preview-table">
        <thead><tr>${headerRow.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${dataRows.slice(1).map(r => `<tr>${r.map(c => `<td>${c || ''}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    preview.innerHTML = tbl;
    if (actions) actions.style.display = 'block';
  } catch (e) {
    console.error("Error parsing file:", e);
    preview.innerHTML = `<div style="color:var(--danger,#dc2626); padding:12px;">Error al procesar: ${e.message}</div>`;
  }
}

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const rows = lines.map(l => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < l.length; i++) {
          const ch = l[i];
          if (ch === '"') { inQuotes = !inQuotes; }
          else if ((ch === ',' || ch === ';') && !inQuotes) { result.push(current.trim()); current = ''; }
          else { current += ch; }
        }
        result.push(current.trim());
        return result;
      });
      resolve(rows);
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function parseHTML(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(e.target.result, 'text/html');
      const table = doc.querySelector('table');
      if (!table) { resolve([]); return; }
      const rows = [];
      table.querySelectorAll('tr').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('th, td').forEach(td => cells.push(td.textContent.trim()));
        if (cells.length > 0) rows.push(cells);
      });
      resolve(rows);
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function parseXLSX(file) {
  return new Promise((resolve, reject) => {
    if (typeof XLSX === 'undefined') { reject(new Error("Librería XLSX no cargada")); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      resolve(rows);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

window.cancelImport = function() {
  window._importedRows = [];
  const preview = document.getElementById('import-preview');
  const actions = document.getElementById('import-actions');
  if (preview) preview.innerHTML = '';
  if (actions) actions.style.display = 'none';
};

window.confirmImport = async function() {
  const rows = window._importedRows;
  if (!rows || rows.length <= 1) return alert("No hay datos para importar");
  const preview = document.getElementById('import-preview');
  preview.innerHTML = '<div style="color:var(--text-secondary); padding:12px;">Importando filas a Google Sheets...</div>';
  try {
    for (let i = 1; i < rows.length; i++) {
      await SheetsAPI.appendRow(CONFIG.SHEETS.GASTOS, rows[i]);
    }
    preview.innerHTML = `<div style="color:var(--success,#16a34a); padding:16px; background:var(--success-light,#dcfce7); border-radius:8px; font-weight:600;">✅ ${rows.length - 1} filas importadas correctamente a ${CONFIG.SHEETS.GASTOS}</div>`;
    document.getElementById('import-actions').style.display = 'none';
    window._importedRows = [];
  } catch (e) {
    console.error("Error importando:", e);
    preview.innerHTML = `<div style="color:var(--danger,#dc2626); padding:12px;">Error al importar: ${e.message}</div>`;
  }
};

// ===================== CRUD: CASAS =====================
window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };

window.addCasaMaster = async function() {
  const n = prompt("Nombre de la nueva casa:");
  if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", n]); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};
window.renameCasaMaster = async function(row, current) {
  const n = prompt("Nuevo nombre:", current);
  if (n && n !== current) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 4, n); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};
window.deleteCasaMaster = async function(row) {
  if (confirm("¿Eliminar esta casa?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};

// ===================== CRUD: TARJETAS (Col E = col 5 en Sheets) =====================
window.addTarjetaMaster = async function() {
  const n = prompt("Nombre de la nueva tarjeta:");
  if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", "", n]); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};
window.renameTarjetaMaster = async function(row, current) {
  const n = prompt("Nuevo nombre:", current);
  if (n && n !== current) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 5, n); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};
window.deleteTarjetaMaster = async function(row) {
  if (confirm("¿Eliminar esta tarjeta?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 7, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};

// ===================== CRUD: CATEGORÍAS =====================
window.addCategoryMaster = async function() {
  const n = prompt("Nombre de la nueva categoría:");
  if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [n]); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};
window.renameCategoryMaster = async function(oldName) {
  const n = prompt("Nuevo nombre para la categoría:", oldName);
  if (n && n !== oldName) {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].trim() === oldName) {
        await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, i + 1, 1, n);
      }
    }
    await BudgetLogic.loadConfig(); loadSettingsPage();
  }
};
window.deleteCategoryMaster = async function(catName) {
  if (confirm(`¿Eliminar la categoría "${catName}" y todas sus subcategorías?`)) {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].trim() === catName) {
        await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, i + 1, 5, 'DELETED');
      }
    }
    await BudgetLogic.loadConfig(); loadSettingsPage();
  }
};
window.addSubcategory = async function(catName) {
  const n = prompt(`Nueva subcategoría para "${catName}":`);
  if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [catName, n]); await BudgetLogic.loadConfig(); loadSettingsPage(); }
};
window.deleteSubcategory = async function(catName, subName) {
  if (confirm(`¿Eliminar "${subName}" de "${catName}"?`)) {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].trim() === catName && rows[i][1] && rows[i][1].trim() === subName) {
        await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, i + 1, 5, 'DELETED');
        break;
      }
    }
    await BudgetLogic.loadConfig(); loadSettingsPage();
  }
};

// ===================== INIT (llamado por onSignedIn en api.js) =====================
async function initApp() {
  try {
    let retry = 0;
    while (typeof gapi === 'undefined' || !gapi.client || !gapi.client.sheets) {
      if (retry > 20) throw new Error("API Timeout");
      await new Promise(r => setTimeout(r, 200));
      retry++;
    }
    await BudgetLogic.loadConfig();
    AppState.initUI();
    window.navigateTo('dashboard');
  } catch(e) {
    console.error("Fallo initApp:", e);
  }
}

// ===================== RULES PAGE =====================
async function loadRulesPage() {
  const container = document.getElementById('rules-content');
  if (!container) return;
  // Ensure rules are loaded
  if (!BudgetLogic._groupRules.length && !BudgetLogic._rules.length) await BudgetLogic.loadRules();

  const tab = `<div class="settings-tabs">
    <button class="settings-tab active">AGRUPACIONES</button>
  </div>`;

  const rules = BudgetLogic._groupRules;
  // Group by label
  const groups = new Map();
  rules.forEach(r => {
    if (!groups.has(r.label)) groups.set(r.label, []);
    groups.get(r.label).push(r);
  });

  let html = tab + '<div style="padding:20px 0;">';

  if (!groups.size) {
    html += '<p style="color:var(--text-tertiary);">No hay reglas de agrupación. Créalas desde el drawer de edición de cada línea en Budget.</p>';
  } else {
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">`;
    for (const [label, patterns] of groups) {
      html += `<div class="rules-group-card">
        <div class="rules-group-hdr">
          <strong>${esc(label)}</strong>
          <span class="rules-group-count">${patterns.length} patrón${patterns.length > 1 ? 'es' : ''}</span>
        </div>`;
      patterns.forEach(r => {
        html += `<div class="rules-pattern-row">
          <code>${esc(r.pattern)}</code>
          <span class="rules-pattern-bank">${r.bank || 'todos'}</span>
          <button class="rules-del-btn" onclick="deleteGroupPattern('${esc(r.pattern)}')" title="Eliminar">✕</button>
        </div>`;
      });
      html += `<div class="rules-add-row">
          <input class="rules-add-input" placeholder="Añadir patrón..." data-label="${esc(label)}">
          <button class="rules-add-btn" onclick="addGroupPatternFromPage(this)">+</button>
        </div>
      </div>`;
    }
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;

  // Wire Enter key
  container.querySelectorAll('.rules-add-input').forEach(inp => {
    inp.onkeydown = (e) => { if (e.key === 'Enter') addGroupPatternFromPage(inp.nextElementSibling); };
  });
}

function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') : ''; }

window.deleteGroupPattern = async function(pattern) {
  const rule = BudgetLogic._groupRules.find(r => r.pattern === pattern.toUpperCase());
  if (!rule) return;
  try {
    if (rule.sheetRow > 0) {
      await SheetsAPI.updateCell(CONFIG.SHEETS.RULES, rule.sheetRow, 10, 'FALSE');
    } else {
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.RULES);
      if (rows) {
        for (let i = 1; i < rows.length; i++) {
          if (String(rows[i][0]||'').trim().toUpperCase() === rule.pattern && String(rows[i][3]||'') === 'group') {
            await SheetsAPI.updateCell(CONFIG.SHEETS.RULES, i + 1, 10, 'FALSE');
            break;
          }
        }
      }
    }
    const idx = BudgetLogic._groupRules.indexOf(rule);
    if (idx >= 0) BudgetLogic._groupRules.splice(idx, 1);
    loadRulesPage();
  } catch(e) { alert('Error: ' + (e?.result?.error?.message || e.message || 'Error')); }
};

window.addGroupPatternFromPage = async function(btn) {
  const input = btn.previousElementSibling;
  const pattern = input?.value?.trim();
  const label = input?.dataset?.label;
  if (!pattern || !label) return;
  try {
    await BudgetLogic.createGroupRule(pattern, label, '');
    input.value = '';
    loadRulesPage();
  } catch(e) { alert('Error: ' + (e?.result?.error?.message || e.message || 'Error')); }
};
