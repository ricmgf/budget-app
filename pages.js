/**
 * [ARCHIVO_MAESTRO_V1.9.1_PROTEGIDO]
 * REGLA DE ORO: NO MUTILAR. ARRANQUE PRESERVADO.
 * FIX: Multi-select real con checkboxes y cierre al clicar fuera.
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

// --- SIDEBAR Y NAVEGACIÓN ---
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
  const navBtn = document.getElementById(`nav-${p}`) || document.querySelector(`[onclick*="navigateTo('${p}')"]`);
  if (navBtn) navBtn.classList.add('active');
  document.getElementById('page-title').textContent = p.charAt(0).toUpperCase() + p.slice(1);
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
};

// --- RENDER DASHBOARD ---
async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
  const neto = data.resumen.totalIngresos - data.resumen.totalGastos;
  container.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
      <div class="settings-row" style="padding:32px; flex-direction:column; align-items:start;">
        <div style="color:var(--text-secondary); font-size:12px; font-weight:700;">NETO MENSUAL</div>
        <div style="font-size:32px; font-weight:800; color:${neto >= 0 ? 'var(--positive)' : 'var(--negative)'}; margin-top:8px;">${Utils.formatCurrency(neto)}</div>
      </div>
      <div class="settings-row" style="padding:32px; flex-direction:column; align-items:start;">
        <div style="color:var(--text-secondary); font-size:12px; font-weight:700;">PENDIENTES</div>
        <div style="font-size:32px; font-weight:800; color:var(--accent); margin-top:8px;">${data.pendingCount}</div>
      </div>
    </div>`;
}

// --- MÓDULO BANCOS (CON CASA Y TARJETAS) ---
function renderBancosTab(container, header) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    let html = `${header}<div style="display:flex; justify-content:space-between; margin-bottom:24px; align-items:center;">
      <h3>Gestión de Bancos</h3>
      <button onclick="toggleAddBankForm()" class="nav-item active" style="width:auto; padding:10px 20px;">+ Nuevo Banco</button>
    </div>`;
    
    if (AppState.isAddingBank) {
      const d = AppState.editingBankData || { row: null, name: '', iban: '', casa: '', tarjeta: '' };
      const selCards = d.tarjeta ? d.tarjeta.split(',').map(s => s.trim()) : [];
      html += `<div class="settings-row" style="background:#f8fafc; display:grid; grid-template-columns: repeat(4, 1fr) auto; gap:12px; align-items:end; border: 2px solid var(--accent);">
        <div><label style="font-size:11px; font-weight:800;">NOMBRE</label><input id="new-bank-name" value="${d.name}" class="input"></div>
        <div><label style="font-size:11px; font-weight:800;">IBAN</label><input id="new-bank-iban" value="${d.iban}" class="input"></div>
        <div><label style="font-size:11px; font-weight:800;">CASA</label><select id="new-bank-casa" class="input">${AppState.config.casas.map(c => `<option value="${c.name}" ${d.casa==c.name?'selected':''}>${c.name}</option>`).join('')}</select></div>
        <div class="custom-multiselect">
          <label style="font-size:11px; font-weight:800;">TARJETAS</label>
          <div class="ms-display" onclick="document.getElementById('ms-box').classList.toggle('active')"><span id="ms-label">${selCards.length > 0 ? selCards.join(', ') : 'Seleccionar...'}</span></div>
          <div id="ms-box" class="ms-options" onclick="event.stopPropagation()">${AppState.config.tarjetas.map(t => `<div class="ms-option"><input type="checkbox" class="card-cb" value="${t.name}" ${selCards.includes(t.name)?'checked':''} onchange="syncCardLabel()"> ${t.name}</div>`).join('')}</div>
        </div>
        <button onclick="saveBank()" class="nav-item active" style="width:auto; padding:10px 20px; background:var(--positive);">OK</button>
      </div>`;
    }
    
    html += `<table style="width:100%; text-align:left; border-collapse:collapse;">
      <thead style="font-size:11px; color:var(--text-secondary); border-bottom:1px solid var(--border-light);">
        <tr><th style="padding:12px;">BANCO</th><th>IBAN</th><th>CASA</th><th>TARJETAS</th><th style="text-align:right;">ACCIONES</th></tr>
      </thead>
      <tbody>${accs.slice(1).filter(a => a[0]!=='DELETED').map((a, i) => `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:16px 12px; font-weight:700;">${a[0]}</td>
          <td style="font-family:monospace; font-size:12px;">${a[1]}</td>
          <td>${a[2] || '-'}</td>
          <td>${(a[3] || '').split(',').map(c => c.trim() ? `<span class="tag-card">${c}</span>` : '').join('')}</td>
          <td style="text-align:right;">
            <button onclick="editBankMaster(${i+2},'${a[0]}','${a[1]}','${a[2]}','${a[3] || ''}')" style="background:none; border:none; color:var(--accent); cursor:pointer; font-weight:700; margin-right:12px;">Editar</button>
            <button onclick="deleteBankMaster(${i+2})" style="background:none; border:none; color:var(--negative); cursor:pointer; font-weight:700;">Borrar</button>
          </td>
        </tr>`).join('')}</tbody>
    </table>`;
    container.innerHTML = html;
  });
}

// --- CATEGORÍAS (CON ASPAS ×) ---
function renderCategoriasTab(container, header) {
  const cats = AppState.config.categorias;
  let html = header + `<div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Categorías</h3><button onclick="addCategoryMaster()" class="nav-item active" style="width:auto;">+ Nueva</button></div>`;
  Object.keys(cats).forEach(cat => {
    html += `<div class="settings-row" style="flex-direction:column; align-items:start; gap:12px;">
      <div style="display:flex; justify-content:space-between; width:100%;"><strong>${cat}</strong>
      <div><button onclick="renameCategoryMaster('${cat}')" style="background:none; border:none; color:var(--accent); cursor:pointer; margin-right:12px;">Editar</button><button onclick="deleteCategoryMaster('${cat}')" style="background:none; border:none; color:var(--negative); cursor:pointer;">Borrar</button></div></div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${cats[cat].map(s => `<span class="tag-card">${s} <button onclick="deleteSubcategory('${cat}','${s}')" style="background:none; border:none; color:var(--negative); cursor:pointer; font-weight:bold; margin-left:4px;">×</button></span>`).join('')}
        <button onclick="addSubcategory('${cat}')" style="border:1px dashed var(--accent); background:none; color:var(--accent); padding:2px 10px; border-radius:12px; cursor:pointer;">+ Sub</button>
      </div></div>`;
  });
  container.innerHTML = html;
}

// --- FUNCIONES GLOBALES ---
window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.toggleAddBankForm = () => { AppState.isAddingBank = !AppState.isAddingBank; AppState.editingBankData = null; loadSettingsPage(); };
window.syncCardLabel = () => { const sel = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value); document.getElementById('ms-label').textContent = sel.length > 0 ? sel.join(', ') : 'Seleccionar...'; };
window.editBankMaster = (row, n, i, c, t) => { AppState.isAddingBank = true; AppState.editingBankData = { row, name: n, iban: i, casa: c, tarjeta: t }; loadSettingsPage(); };

window.saveBank = async () => {
  const n = document.getElementById('new-bank-name').value, i = document.getElementById('new-bank-iban').value, c = document.getElementById('new-bank-casa').value;
  const t = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value).join(', ');
  if (AppState.editingBankData?.row) {
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 1, n);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 2, i);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 3, c);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 4, t);
  } else { await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [n, i, c, t]); }
  AppState.isAddingBank = false; loadSettingsPage();
};

window.addCategoryMaster = async () => { const n = prompt("Categoría:"); if(n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.renameCategoryMaster = async (cat) => { const n = prompt("Nuevo nombre:", cat); if(n && n!==cat) { alert("Use el Excel para renombrar esta versión."); } };
window.addSubcategory = async (cat) => { const n = prompt(`Sub para ${cat}:`); if(n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [cat, n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };

window.addCardMaster = async () => { const n = prompt("Tarjeta:"); if(n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["","","","",n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.addCasaMaster = async () => { const n = prompt("Casa:"); if(n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["","","",n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCardMaster = async (row) => { if(confirm("¿Borrar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 7, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCasaMaster = async (row) => { if(confirm("¿Borrar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteBankMaster = async (row) => { if(confirm("¿Borrar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 1, 'DELETED'); loadSettingsPage(); } };

window.nextMonth = () => { AppState.currentMonth === 12 ? (AppState.currentMonth=1, AppState.currentYear++) : AppState.currentMonth++; AppState.initUI(); if(AppState.currentPage==='dashboard') loadDashboard(); };
window.prevMonth = () => { AppState.currentMonth === 1 ? (AppState.currentMonth=12, AppState.currentYear--) : AppState.currentMonth--; AppState.initUI(); if(AppState.currentPage==='dashboard') loadDashboard(); };

async function initApp() { await BudgetLogic.loadConfig(); AppState.initUI(); window.navigateTo('dashboard'); }
