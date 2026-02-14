/**
 * [ARCHIVO_MAESTRO_V1.9.1_PROTEGIDO]
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

window.toggleSidebar = function() {
  const sidebar = document.getElementById('main-sidebar');
  const btn = document.getElementById('sidebar-toggle');
  AppState.sidebarCollapsed = !AppState.sidebarCollapsed;
  sidebar.classList.toggle('collapsed');
  btn.innerHTML = AppState.sidebarCollapsed ? '›' : '‹';
};

window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  document.getElementById(`page-${p}`).classList.add('active');
  document.getElementById(`nav-${p}`).classList.add('active');
  document.getElementById('page-title').textContent = p.charAt(0).toUpperCase() + p.slice(1);
  
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
  else if (p === 'import') renderImportPage();
};

async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
  const neto = data.resumen.totalIngresos - data.resumen.totalGastos;
  
  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:20px;">
      <div style="background:white; padding:32px; border-radius:24px; border:1px solid var(--border-light); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="color:var(--text-secondary); font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">Neto Mensual</div>
        <div style="font-size:36px; font-weight:800; color:${neto >= 0 ? 'var(--positive)' : 'var(--negative)'}; margin-top:8px;">${Utils.formatCurrency(neto)}</div>
      </div>
      <div style="background:white; padding:32px; border-radius:24px; border:1px solid var(--border-light); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="color:var(--text-secondary); font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">Pendientes Review</div>
        <div style="font-size:36px; font-weight:800; color:var(--accent); margin-top:8px;">${data.pendingCount || 0}</div>
      </div>
    </div>`;
}

function renderImportPage() {
  const container = document.getElementById('import-content');
  container.innerHTML = `
    <div style="background:white; padding:60px; border-radius:32px; border:1px solid var(--border-light); text-align:center; box-shadow: 0 4px 20px rgba(0,0,0,0.03);">
      <div style="font-size:64px; margin-bottom:24px;">📥</div>
      <h3 style="margin:0 0 12px 0; font-size:24px; font-weight:800;">Importar Movimientos</h3>
      <p style="color:var(--text-secondary); margin-bottom:40px; font-size:16px;">Sube tu archivo Excel (.xlsx) de la entidad bancaria.</p>
      <input type="file" id="file-upload" style="display:none" onchange="handleFileUpload(event)">
      <button onclick="document.getElementById('file-upload').click()" style="background:var(--accent); color:white; border:none; padding:16px 40px; border-radius:16px; font-weight:700; cursor:pointer; font-size:16px; transition: transform 0.2s;">Seleccionar Archivo</button>
    </div>`;
}

async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  const header = `<div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
    ${['bancos', 'categorias', 'casas', 'tarjetas'].map(t => `<a href="#" onclick="setSettingsTab('${t}'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === t ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === t ? 'var(--accent)' : 'transparent'}">${t.toUpperCase()}</a>`).join('')}
  </div>`;
  
  if (AppState.settingsTab === 'categorias') renderCategoriasTab(container, header);
  else if (AppState.settingsTab === 'bancos') renderBancosTab(container, header);
  else if (AppState.settingsTab === 'tarjetas') renderTarjetasTab(container, header);
  else if (AppState.settingsTab === 'casas') renderCasasTab(container, header);
}

function renderCategoriasTab(container, header) {
  const cats = AppState.config.categorias;
  let html = header + `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:20px;">`;
  Object.keys(cats).forEach(cat => {
    html += `<div style="background:white; padding:24px; border-radius:20px; border:1px solid var(--border-light); box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
      <div style="font-weight:800; margin-bottom:16px; color:var(--accent); font-size:16px; display:flex; justify-content:space-between;">${cat} <button style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:12px;">+ Sub</button></div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${cats[cat].map(s => `<span class="tag-card" style="padding:6px 12px; border-radius:8px;">${s}</span>`).join('')}
      </div>
    </div>`;
  });
  container.innerHTML = html + `</div>`;
}

function renderBancosTab(container, header) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    let html = `${header}<div style="background:white; padding:32px; border-radius:24px; border:1px solid var(--border-light);">
      <div style="display:flex; justify-content:space-between; margin-bottom:32px; align-items:center;">
        <h3 style="margin:0; font-weight:800;">Gestión de Bancos</h3>
        <button onclick="toggleAddBankForm()" style="background:var(--accent); color:white; border:none; padding:12px 24px; border-radius:12px; cursor:pointer; font-weight:700;">+ Nuevo Banco</button>
      </div>`;
    
    if (AppState.isAddingBank) {
      const d = AppState.editingBankData || { name: '', iban: '', casa: '', tarjeta: '' };
      const selected = d.tarjeta ? d.tarjeta.split(',').map(s => s.trim()) : [];
      html += `<div style="background:var(--bg-canvas); padding:24px; border-radius:16px; margin-bottom:32px; display:grid; grid-template-columns: repeat(4, 1fr) auto; gap:16px; align-items:end;">
          <div><label style="display:block; font-size:11px; font-weight:800; color:var(--text-secondary); margin-bottom:8px;">NOMBRE</label><input id="new-bank-name" type="text" value="${d.name}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-light);"></div>
          <div><label style="display:block; font-size:11px; font-weight:800; color:var(--text-secondary); margin-bottom:8px;">IBAN</label><input id="new-bank-iban" type="text" value="${d.iban}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-light);"></div>
          <div><label style="display:block; font-size:11px; font-weight:800; color:var(--text-secondary); margin-bottom:8px;">CASA</label><select id="new-bank-casa" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-light);">
            ${AppState.config.casas.map(c => `<option value="${c.name}" ${d.casa === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select></div>
          <div class="custom-multiselect">
            <label style="display:block; font-size:11px; font-weight:800; color:var(--text-secondary); margin-bottom:8px;">TARJETAS</label>
            <div class="ms-display" onclick="document.querySelector('.ms-options').classList.toggle('active')"><span id="ms-label" style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis; display:block;">${selected.length > 0 ? selected.join(', ') : 'Seleccionar...'}</span></div>
            <div class="ms-options">${AppState.config.tarjetas.map(t => `<div class="ms-option" onclick="event.stopPropagation()"><input type="checkbox" class="card-cb" value="${t.name}" ${selected.includes(t.name) ? 'checked' : ''} onchange="syncCardLabel()"> ${t.name}</div>`).join('')}</div>
          </div>
          <button onclick="saveBank()" style="background:var(--positive); color:white; border:none; padding:12px 24px; border-radius:10px; cursor:pointer; font-weight:800;">OK</button>
        </div>`;
    }
    
    html += `<table style="width:100%; border-collapse:collapse;">
      <thead style="text-align:left; font-size:11px; color:var(--text-secondary); border-bottom:1px solid var(--border-light);">
        <tr><th style="padding:12px;">BANCO</th><th>IBAN</th><th>TARJETAS</th><th style="text-align:right;">ACCIONES</th></tr>
      </thead>
      <tbody>
        ${accs.slice(1).filter(a => a[0] !== 'DELETED').map((a, i) => `
          <tr style="border-bottom:1px solid #f8fafc;">
            <td style="padding:16px 12px; font-weight:700;">${a[0]}</td>
            <td style="font-family:monospace; font-size:12px; color:var(--text-secondary);">${a[1]}</td>
            <td>${(a[3] || '').split(',').map(c => c.trim() ? `<span class="tag-card">${c}</span>` : '').join('')}</td>
            <td style="text-align:right;"><button onclick="deleteBankMaster(${i+2})" style="background:none; border:none; color:var(--negative); font-weight:700; cursor:pointer;">Eliminar</button></td>
          </tr>`).join('')}
      </tbody></table></div>`;
    container.innerHTML = html;
  });
}

function renderTarjetasTab(container, header) {
  container.innerHTML = `${header}<div style="background:white; padding:32px; border-radius:24px; border:1px solid var(--border-light);">
    <div style="display:flex; justify-content:space-between; margin-bottom:32px; align-items:center;">
      <h3 style="margin:0; font-weight:800;">Gestión de Tarjetas</h3>
      <button onclick="addCardMaster()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:10px; cursor:pointer; font-weight:700;">+ Nueva Tarjeta</button>
    </div>
    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:12px;">
      ${AppState.config.tarjetas.map(t => `<div style="display:flex; justify-content:space-between; padding:16px; background:var(--bg-canvas); border-radius:16px; font-weight:700; align-items:center;"><span>${t.name}</span><button onclick="deleteCardMaster(${t.row})" style="background:none; border:none; color:var(--negative); font-weight:700; cursor:pointer;">×</button></div>`).join('')}
    </div></div>`;
}

function renderCasasTab(container, header) {
  container.innerHTML = `${header}<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light);">
    <div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Casas</h3><button onclick="addCasaMaster()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:700;">+ Nueva</button></div>
    <div style="display:grid; gap:10px;">
      ${AppState.config.casas.map(c => `<div style="display:flex; justify-content:space-between; padding:16px; background:var(--bg-canvas); border-radius:12px; font-weight:700;"><span>${c.name}</span><button onclick="deleteCasaMaster(${c.row})" style="background:none; border:none; color:var(--negative); cursor:pointer;">×</button></div>`).join('')}
    </div></div>`;
}

// FUNCIONES DE SOPORTE
window.syncCardLabel = () => {
  const sel = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value);
  const lbl = document.getElementById('ms-label');
  if (lbl) lbl.textContent = sel.length > 0 ? sel.join(', ') : 'Seleccionar...';
};

window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.toggleAddBankForm = () => { AppState.isAddingBank = !AppState.isAddingBank; loadSettingsPage(); };
window.saveBank = async function() {
  const n = document.getElementById('new-bank-name').value, i = document.getElementById('new-bank-iban').value, c = document.getElementById('new-bank-casa').value;
  const t = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value).join(',');
  if (!n || !i) return alert("Nombre e IBAN obligatorios");
  await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [n, i, c, t]); AppState.isAddingBank = false; loadSettingsPage();
};

window.nextMonth = () => { AppState.currentMonth === 12 ? (AppState.currentMonth = 1, AppState.currentYear++) : AppState.currentMonth++; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };
window.prevMonth = () => { AppState.currentMonth === 1 ? (AppState.currentMonth = 12, AppState.currentYear--) : AppState.currentMonth--; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };
window.addCardMaster = async function() { const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", "", n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCardMaster = async function(row) { if (confirm("¿Eliminar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 7, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.addCasaMaster = async function() { const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCasaMaster = async function(row) { if (confirm("¿Eliminar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteBankMaster = async function(row) { if (confirm("¿Eliminar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 1, 'DELETED'); loadSettingsPage(); } };

async function initApp() { await BudgetLogic.loadConfig(); AppState.initUI(); window.navigateTo('dashboard'); }
