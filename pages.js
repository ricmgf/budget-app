/**
 * [ARCHIVO_MAESTRO_V2.2_AUDITADO]
 * REGLA DE ORO: NO SIMPLIFICAR. 
 * Sidebar, Multiselect y Navegación verificados contra ZIP.
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

// --- NAVEGACIÓN Y SIDEBAR ---
window.toggleSidebar = function() {
  const sidebar = document.querySelector('.app-sidebar');
  const btn = document.getElementById('sidebar-toggle');
  AppState.sidebarCollapsed = !AppState.sidebarCollapsed;
  if (sidebar) sidebar.classList.toggle('collapsed');
  if (btn) btn.innerHTML = AppState.sidebarCollapsed ? '›' : '‹';
};

window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  
  // Buscar botón por ID o por onclick (compatibilidad total)
  const navBtn = document.getElementById(`nav-${p}`) || document.querySelector(`[onclick="navigateTo('${p}')"]`);
  if (navBtn) navBtn.classList.add('active');
  
  const title = document.getElementById('page-title');
  if (title) title.textContent = p.charAt(0).toUpperCase() + p.slice(1);
  
  // Carga de módulos
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
  else if (p === 'import') typeof renderImportPage === 'function' && renderImportPage();
};

// --- RENDER DASHBOARD ---
async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  if (!container) return;
  const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
  const neto = data.resumen.totalIngresos - data.resumen.totalGastos;
  
  container.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
      <div style="background:white; padding:32px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <div style="color:var(--text-secondary); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">Neto Mensual</div>
        <div style="font-size:32px; font-weight:800; color:${neto >= 0 ? 'var(--positive)' : 'var(--negative)'}; margin-top:8px;">${Utils.formatCurrency(neto)}</div>
      </div>
      <div style="background:white; padding:32px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <div style="color:var(--text-secondary); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">Pendientes Review</div>
        <div style="font-size:32px; font-weight:800; color:var(--accent); margin-top:8px;">${data.pendingCount}</div>
      </div>
    </div>`;
}

// --- GESTIÓN DE AJUSTES (BANCOS CON TARJETAS) ---
async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  if (!container) return;
  const header = `<div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
    ${['bancos', 'categorias', 'casas', 'tarjetas'].map(t => `<a href="#" onclick="setSettingsTab('${t}'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === t ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === t ? 'var(--accent)' : 'transparent'}">${t.toUpperCase()}</a>`).join('')}
  </div>`;
  if (AppState.settingsTab === 'categorias') renderCategoriasTab(container, header);
  else if (AppState.settingsTab === 'bancos') renderBancosTab(container, header);
  else if (AppState.settingsTab === 'casas') renderCasasTab(container, header);
  else if (AppState.settingsTab === 'tarjetas') renderTarjetasTab(container, header);
}

function renderBancosTab(container, header) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    let html = `${header}<div style="display:flex; justify-content:space-between; margin-bottom:24px; align-items:center;">
      <h3>Gestión de Bancos</h3>
      <button onclick="toggleAddBankForm()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:700;">+ Nuevo Banco</button>
    </div>`;
    
    if (AppState.isAddingBank) {
      const d = AppState.editingBankData || { row: null, name: '', iban: '', casa: '', tarjeta: '' };
      const selectedCards = d.tarjeta ? d.tarjeta.split(',').map(s => s.trim()) : [];
      
      html += `<div class="settings-row" style="background:#f8fafc; padding:24px; display:grid; grid-template-columns: repeat(4, 1fr) auto; gap:16px; align-items:end; border: 2px solid var(--accent);">
        <div><label style="font-size:11px; font-weight:800; color:var(--text-secondary);">NOMBRE</label><input id="new-bank-name" value="${d.name}" class="input"></div>
        <div><label style="font-size:11px; font-weight:800; color:var(--text-secondary);">IBAN</label><input id="new-bank-iban" value="${d.iban}" class="input"></div>
        <div><label style="font-size:11px; font-weight:800; color:var(--text-secondary);">CASA</label>
          <select id="new-bank-casa" class="input">
            ${AppState.config.casas.map(c => `<option value="${c.name}" ${d.casa==c.name?'selected':''}>${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="custom-multiselect">
          <label style="font-size:11px; font-weight:800; color:var(--text-secondary);">TARJETAS</label>
          <div class="ms-display" onclick="document.getElementById('ms-options-box').classList.toggle('active')">
            <span id="ms-label" style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${selectedCards.length > 0 ? selectedCards.join(', ') : 'Seleccionar...'}</span>
          </div>
          <div id="ms-options-box" class="ms-options" onclick="event.stopPropagation()">
            ${AppState.config.tarjetas.map(t => `
              <div class="ms-option">
                <input type="checkbox" class="card-cb" value="${t.name}" ${selectedCards.includes(t.name) ? 'checked' : ''} onchange="syncCardLabel()"> ${t.name}
              </div>`).join('')}
          </div>
        </div>
        <button onclick="saveBank()" style="background:var(--positive); color:white; border:none; padding:12px 24px; border-radius:8px; cursor:pointer; font-weight:800;">OK</button>
      </div>`;
    }

    html += `<table style="width:100%; border-collapse:collapse;">
      <thead style="text-align:left; font-size:11px; color:var(--text-secondary); border-bottom:1px solid var(--border-light);">
        <tr><th style="padding:12px;">BANCO</th><th>IBAN</th><th>TARJETAS</th><th style="text-align:right;">ACCIONES</th></tr>
      </thead>
      <tbody>
        ${accs.slice(1).filter(a => a[0] && a[0] !== 'DELETED').map((a, i) => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:16px 12px; font-weight:700;">${a[0]}</td>
            <td style="font-family:monospace; color:var(--text-secondary); font-size:12px;">${a[1]}</td>
            <td>${(a[3] || '').split(',').map(c => c.trim() ? `<span class="tag-card">${c}</span>` : '').join('')}</td>
            <td style="text-align:right;">
              <button onclick="editBankMaster(${i+2},'${a[0]}','${a[1]}','${a[2]}','${a[3] || ''}')" style="background:none; border:none; color:var(--accent); font-weight:700; cursor:pointer; margin-right:12px;">Editar</button>
              <button onclick="deleteBankMaster(${i+2})" style="background:none; border:none; color:var(--negative); font-weight:700; cursor:pointer;">Eliminar</button>
            </td>
          </tr>`).join('')}
      </tbody></table>`;
    container.innerHTML = html;
  });
}

// --- AUXILIARES Y ACCIONES ---
window.syncCardLabel = () => {
  const sel = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value);
  const lbl = document.getElementById('ms-label');
  if (lbl) lbl.textContent = sel.length > 0 ? sel.join(', ') : 'Seleccionar...';
};

window.saveBank = async function() {
  const n = document.getElementById('new-bank-name').value;
  const i = document.getElementById('new-bank-iban').value;
  const c = document.getElementById('new-bank-casa').value;
  const t = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value).join(', ');
  
  if (!n) return alert("Nombre obligatorio");
  if (AppState.editingBankData?.row) {
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 1, n);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 2, i);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 3, c);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 4, t);
  } else {
    await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [n, i, c, t]);
  }
  AppState.isAddingBank = false; loadSettingsPage();
};

window.editBankMaster = (row, n, i, c, t) => { 
  AppState.isAddingBank = true; 
  AppState.editingBankData = { row, name: n, iban: i, casa: c, tarjeta: t }; 
  loadSettingsPage(); 
};

window.renderCategoriasTab = (container, header) => {
  const cats = AppState.config.categorias;
  let html = header + `<div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Categorías</h3><button onclick="addCategoryMaster()" style="background:var(--accent); color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer;">+ Nueva</button></div>`;
  Object.keys(cats).forEach(cat => {
    html += `<div class="settings-row" style="flex-direction:column; align-items:start; gap:12px;">
      <div style="display:flex; justify-content:space-between; width:100%;"><strong>${cat}</strong>
      <div><button onclick="deleteCategoryMaster('${cat}')" style="background:none; border:none; color:var(--negative); cursor:pointer;">Eliminar</button></div></div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${cats[cat].map(s => `<span class="tag-card">${s}</span>`).join('')}
        <button onclick="addSubcategory('${cat}')" style="border:1px dashed var(--accent); background:none; color:var(--accent); padding:2px 8px; border-radius:12px; cursor:pointer;">+ Sub</button>
      </div></div>`;
  });
  container.innerHTML = html;
};

window.renderTarjetasTab = (container, header) => {
  container.innerHTML = `${header}<div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Tarjetas</h3><button onclick="addCardMaster()" style="background:var(--accent); color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer;">+ Nueva</button></div>
    ${AppState.config.tarjetas.map(t => `<div class="settings-row"><span>${t.name}</span><button onclick="deleteCardMaster(${t.row})" style="background:none; border:none; color:var(--negative); cursor:pointer;">Eliminar</button></div>`).join('')}`;
};

window.renderCasasTab = (container, header) => {
  container.innerHTML = `${header}<div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Casas</h3><button onclick="addCasaMaster()" style="background:var(--accent); color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer;">+ Nueva</button></div>
    ${AppState.config.casas.map(c => `<div class="settings-row"><span>${c.name}</span><button onclick="deleteCasaMaster(${c.row})" style="background:none; border:none; color:var(--negative); cursor:pointer;">Eliminar</button></div>`).join('')}`;
};

// --- GLOBAL ACTIONS ---
window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.toggleAddBankForm = () => { AppState.isAddingBank = !AppState.isAddingBank; AppState.editingBankData = null; loadSettingsPage(); };
window.addCategoryMaster = async function() { const n = prompt("Categoría:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.addSubcategory = async function(cat) { const n = prompt(`Sub para ${cat}:`); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [cat, n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.addCardMaster = async function() { const n = prompt("Tarjeta:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["","","","",n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.addCasaMaster = async function() { const n = prompt("Casa:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["","","",n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCardMaster = async function(row) { if (confirm("¿Borrar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 7, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCasaMaster = async function(row) { if (confirm("¿Borrar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteBankMaster = async function(row) { if (confirm("¿Borrar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 1, 'DELETED'); loadSettingsPage(); } };

window.nextMonth = () => { AppState.currentMonth === 12 ? (AppState.currentMonth=1, AppState.currentYear++) : AppState.currentMonth++; AppState.initUI(); if(AppState.currentPage==='dashboard') loadDashboard(); };
window.prevMonth = () => { AppState.currentMonth === 1 ? (AppState.currentMonth=12, AppState.currentYear--) : AppState.currentMonth--; AppState.initUI(); if(AppState.currentPage==='dashboard') loadDashboard(); };

// --- INICIALIZACIÓN ---
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
