/**
 * [ARCHIVO_MAESTRO_RESTAURADO]
 * REGLA DE ORO: NO SIMPLIFICAR. TODAS LAS FUNCIONES EXPUESTAS AL OBJETO WINDOW.
 */
const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard', settingsTab: 'bancos', isAddingBank: false, editingBankData: null,
  initUI: function() {
    const el = document.getElementById('month-display');
    if (el) {
      const mNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      el.textContent = `${mNames[this.currentMonth]} ${this.currentYear}`;
    }
  }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

// --- NAVEGACIÓN ---
window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  document.getElementById('page-title').textContent = p.charAt(0).toUpperCase() + p.slice(1);
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
};

window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };

// --- RENDERS ---
async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
  const neto = data.resumen.totalIngresos - data.resumen.totalGastos;
  container.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
      <div style="background:white; padding:32px; border-radius:16px; border:1px solid var(--border-light);">
        <div style="color:var(--text-secondary); font-size:12px; font-weight:700; text-transform:uppercase;">Neto Mensual</div>
        <div style="font-size:32px; font-weight:800; color:${neto >= 0 ? 'var(--positive)' : 'var(--negative)'}; margin-top:8px;">${Utils.formatCurrency(neto)}</div>
      </div>
      <div style="background:white; padding:32px; border-radius:16px; border:1px solid var(--border-light);">
        <div style="color:var(--text-secondary); font-size:12px; font-weight:700; text-transform:uppercase;">Pendientes</div>
        <div style="font-size:32px; font-weight:800; color:var(--accent); margin-top:8px;">${data.pendingCount}</div>
      </div>
    </div>`;
}

async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  const header = `<div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
    ${['bancos', 'categorias', 'casas', 'tarjetas'].map(t => `<a href="#" onclick="setSettingsTab('${t}'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === t ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === t ? 'var(--accent)' : 'transparent'}">${t.toUpperCase()}</a>`).join('')}
  </div>`;
  if (AppState.settingsTab === 'categorias') renderCategoriasTab(container, header);
  else if (AppState.settingsTab === 'bancos') renderBancosTab(container, header);
  else if (AppState.settingsTab === 'casas') renderCasasTab(container, header);
  else if (AppState.settingsTab === 'tarjetas') renderTarjetasTab(container, header);
}

function renderCategoriasTab(container, header) {
  const cats = AppState.config.categorias;
  let html = header + `<div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Categorías</h3><button onclick="addCategoryMaster()" style="background:var(--accent); color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer;">+ Nueva Categoría</button></div>`;
  Object.keys(cats).forEach(cat => {
    html += `<div class="settings-row" style="flex-direction:column; align-items:start; gap:12px;">
      <div style="display:flex; justify-content:space-between; width:100%;">
        <strong>${cat}</strong>
        <div>
          <button onclick="renameCategoryMaster('${cat}')" style="background:none; border:none; color:var(--accent); cursor:pointer; margin-right:12px;">Editar</button>
          <button onclick="deleteCategoryMaster('${cat}')" style="background:none; border:none; color:var(--negative); cursor:pointer;">Eliminar</button>
        </div>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${cats[cat].map(s => `<span class="tag-card">${s} <button onclick="deleteSubcategory('${cat}','${s}')" style="background:none; border:none; color:var(--negative); cursor:pointer;">×</button></span>`).join('')}
        <button onclick="addSubcategory('${cat}')" style="border:1px dashed var(--accent); background:none; color:var(--accent); padding:2px 8px; border-radius:12px; cursor:pointer;">+ Sub</button>
      </div></div>`;
  });
  container.innerHTML = html;
}

function renderBancosTab(container, header) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    let html = `${header}<div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Bancos</h3><button onclick="toggleAddBankForm()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer;">+ Nuevo Banco</button></div>`;
    if (AppState.isAddingBank) {
      const d = AppState.editingBankData || { row: null, name: '', iban: '', casa: '' };
      html += `<div class="settings-row" style="background:#f8fafc; padding:20px; display:grid; grid-template-columns: repeat(3, 1fr) auto; gap:12px; align-items:end;">
        <input id="new-bank-name" value="${d.name}" placeholder="Nombre">
        <input id="new-bank-iban" value="${d.iban}" placeholder="IBAN">
        <select id="new-bank-casa">${AppState.config.casas.map(c => `<option value="${c.name}" ${d.casa==c.name?'selected':''}>${c.name}</option>`).join('')}</select>
        <button onclick="saveBank()" style="background:var(--positive); color:white; border:none; padding:10px; border-radius:8px; cursor:pointer;">OK</button>
      </div>`;
    }
    html += `<table style="width:100%; text-align:left; border-collapse:collapse;">
      <thead style="font-size:12px; color:var(--text-secondary); border-bottom:1px solid var(--border-light);"><tr><th>NOMBRE</th><th>IBAN</th><th style="text-align:right;">ACCIONES</th></tr></thead>
      <tbody>${accs.slice(1).filter(a => a[0] && a[0] !== 'DELETED').map((a, i) => `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:16px 0; font-weight:700;">${a[0]}</td><td>${a[1]}</td><td style="text-align:right;"><button onclick="editBankMaster(${i+2},'${a[0]}','${a[1]}','${a[2]}')" style="background:none; border:none; color:var(--accent); cursor:pointer; margin-right:12px;">Editar</button><button onclick="deleteBankMaster(${i+2})" style="background:none; border:none; color:var(--negative); cursor:pointer;">Eliminar</button></td></tr>`).join('')}</tbody>
    </table>`;
    container.innerHTML = html;
  });
}

function renderTarjetasTab(container, header) {
  container.innerHTML = `${header}<div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Tarjetas</h3><button onclick="addCardMaster()" style="background:var(--accent); color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer;">+ Nueva</button></div>
    ${AppState.config.tarjetas.map(t => `<div class="settings-row"><span>${t.name}</span><button onclick="deleteCardMaster(${t.row})" style="background:none; border:none; color:var(--negative); cursor:pointer;">Borrar</button></div>`).join('')}`;
}

function renderCasasTab(container, header) {
  container.innerHTML = `${header}<div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Casas</h3><button onclick="addCasaMaster()" style="background:var(--accent); color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer;">+ Nueva</button></div>
    ${AppState.config.casas.map(c => `<div class="settings-row"><span>${c.name}</span><button onclick="deleteCasaMaster(${c.row})" style="background:none; border:none; color:var(--negative); cursor:pointer;">Borrar</button></div>`).join('')}`;
}

// --- FUNCIONES GLOBALES ---
window.toggleAddBankForm = () => { AppState.isAddingBank = !AppState.isAddingBank; AppState.editingBankData = null; loadSettingsPage(); };
window.editBankMaster = (row, n, i, c) => { AppState.isAddingBank = true; AppState.editingBankData = { row, name: n, iban: i, casa: c }; loadSettingsPage(); };
window.saveBank = async () => {
  const n = document.getElementById('new-bank-name').value, i = document.getElementById('new-bank-iban').value, c = document.getElementById('new-bank-casa').value;
  if (AppState.editingBankData?.row) {
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 1, n);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 2, i);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 3, c);
  } else { await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [n, i, c]); }
  AppState.isAddingBank = false; loadSettingsPage();
};
window.deleteBankMaster = async (row) => { if (confirm("¿Borrar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 1, 'DELETED'); loadSettingsPage(); } };

window.addCategoryMaster = async () => { const n = prompt("Categoría:"); if(n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.addSubcategory = async (cat) => { const n = prompt(`Sub para ${cat}:`); if(n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [cat, n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };

window.addCardMaster = async () => { const n = prompt("Tarjeta:"); if(n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["","","","",n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCardMaster = async (row) => { if(confirm("¿Borrar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 7, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); } };

window.addCasaMaster = async () => { const n = prompt("Casa:"); if(n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["","","",n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCasaMaster = async (row) => { if(confirm("¿Borrar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); } };

window.nextMonth = () => { AppState.currentMonth === 12 ? (AppState.currentMonth=1, AppState.currentYear++) : AppState.currentMonth++; AppState.initUI(); if(AppState.currentPage==='dashboard') loadDashboard(); };
window.prevMonth = () => { AppState.currentMonth === 1 ? (AppState.currentMonth=12, AppState.currentYear--) : AppState.currentMonth--; AppState.initUI(); if(AppState.currentPage==='dashboard') loadDashboard(); };

async function initApp() { await BudgetLogic.loadConfig(); AppState.initUI(); window.navigateTo('dashboard'); }
