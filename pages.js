/**
 * [ARCHIVO_MAESTRO_V2.7_ESTABLE]
 * REGLA DE ORO: NO MUTILAR.
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

// --- RENDERS ---
window.loadDashboard = async function() {
  const container = document.getElementById('dashboard-content');
  if (!container) return;
  const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
  const neto = data.resumen.totalIngresos - data.resumen.totalGastos;
  container.innerHTML = `
    <div class="view-wrapper">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px;">
        <div class="card" style="padding:40px;">
          <div style="color:var(--text-secondary); font-size:12px; font-weight:800; text-transform:uppercase; margin-bottom:8px;">Neto Mensual</div>
          <div style="font-size:36px; font-weight:800; color:${neto >= 0 ? 'var(--positive)' : 'var(--negative)'};">${Utils.formatCurrency(neto)}</div>
        </div>
        <div class="card" style="padding:40px;">
          <div style="color:var(--text-secondary); font-size:12px; font-weight:800; text-transform:uppercase; margin-bottom:8px;">Pendientes</div>
          <div style="font-size:36px; font-weight:800; color:var(--accent);">${data.pendingCount}</div>
        </div>
      </div>
    </div>`;
};

window.renderBancosTab = function(container) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    let html = `<div class="card"><div style="display:flex; justify-content:space-between; margin-bottom:32px; align-items:center;">
      <h3 style="margin:0;">Bancos</h3><button onclick="toggleAddBankForm()" class="btn btn-primary">+ Nuevo Banco</button></div>`;
    if (AppState.isAddingBank) {
      const d = AppState.editingBankData || { name: '', iban: '', casa: '', tarjeta: '' };
      const selCards = d.tarjeta ? d.tarjeta.split(',').map(s => s.trim()) : [];
      html += `<div style="background:var(--bg-tertiary); padding:24px; border-radius:12px; margin-bottom:32px; display:grid; grid-template-columns:repeat(4, 1fr) auto; gap:16px; align-items:end; border:2px solid var(--accent);">
        <input id="new-bank-name" value="${d.name}" class="input" placeholder="Nombre">
        <input id="new-bank-iban" value="${d.iban}" class="input" placeholder="IBAN">
        <select id="new-bank-casa" class="input">${AppState.config.casas.map(c => `<option value="${c.name}" ${d.casa==c.name?'selected':''}>${c.name}</option>`).join('')}</select>
        <div class="custom-multiselect">
          <div class="ms-display" onclick="document.getElementById('ms-box').classList.toggle('active')"><span id="ms-label">${selCards.length > 0 ? selCards.join(', ') : 'Tarjetas...'}</span></div>
          <div id="ms-box" class="ms-options" onclick="event.stopPropagation()">${AppState.config.tarjetas.map(t => `<div style="display:flex; align-items:center; gap:8px; padding:4px;"><input type="checkbox" class="card-cb" value="${t.name}" ${selCards.includes(t.name)?'checked':''} onchange="syncCardLabel()"> ${t.name}</div>`).join('')}</div>
        </div>
        <button onclick="saveBank()" class="btn btn-primary" style="background:var(--positive);">OK</button>
      </div>`;
    }
    html += `<table style="width:100%; border-collapse:collapse; text-align:left;">
      <thead><tr><th style="padding:12px;">NOMBRE</th><th>IBAN</th><th>TARJETAS</th><th>CASA</th><th style="text-align:right;">ACCIONES</th></tr></thead>
      <tbody>${accs.slice(1).filter(a => a[0]!=='DELETED').map((a, i) => `
        <tr style="border-top:1px solid var(--border-light);">
          <td style="padding:16px 12px; font-weight:700;">${a[0]}</td>
          <td style="font-family:monospace; color:var(--text-secondary); font-size:12px;">${a[1]}</td>
          <td>${(a[3]||'').split(',').map(c => c.trim() ? `<span class="tag-card">${c}</span>` : '').join('')}</td>
          <td><span class="tag-card" style="background:#f1f5f9; color:#475569; border:none;">${a[2] || '-'}</span></td>
          <td style="text-align:right;"><button onclick="editBankMaster(${i+2},'${a[0]}','${a[1]}','${a[2]}','${a[3]||''}')" style="background:none; border:none; color:var(--accent); font-weight:700; cursor:pointer;">Editar</button></td>
        </tr>`).join('')}</tbody></table></div>`;
    container.innerHTML = html;
  });
};

window.renderCategoriasTab = function(container) {
  const cats = AppState.config.categorias;
  let html = `<div class="card"><div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Categorías</h3><button onclick="addCategoryMaster()" class="btn btn-primary">+ Nueva</button></div>`;
  Object.keys(cats).forEach(cat => {
    html += `<div class="settings-row"><div style="flex:1;"><strong>${cat}</strong><div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${cats[cat].map(s => `<span class="tag-card">${s} <button onclick="deleteSubcategory('${cat}','${s}')" style="background:none; border:none; color:var(--negative); cursor:pointer;">×</button></span>`).join('')}
          <button onclick="addSubcategory('${cat}')" style="border:1px dashed var(--accent); background:none; color:var(--accent); padding:2px 10px; border-radius:12px; cursor:pointer;">+ Sub</button>
        </div></div><button onclick="renameCategoryMaster('${cat}')" style="background:none; border:none; color:var(--accent); cursor:pointer; font-weight:700;">Editar</button></div>`;
  });
  container.innerHTML = html + `</div>`;
};

window.renderCasasTab = function(v) { v.innerHTML = `<div class="card"><div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Casas</h3><button onclick="addCasaMaster()" class="btn btn-primary">+ Nueva</button></div>${AppState.config.casas.map(c => `<div class="settings-row"><span>${c.name}</span><button onclick="deleteCasaMaster(${c.row})" style="background:none; border:none; color:var(--negative); cursor:pointer;">Borrar</button></div>`).join('')}</div>`; };
window.renderTarjetasTab = function(v) { v.innerHTML = `<div class="card"><div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Tarjetas</h3><button onclick="addCardMaster()" class="btn btn-primary">+ Nueva</button></div>${AppState.config.tarjetas.map(t => `<div class="settings-row"><span>${t.name}</span><button onclick="deleteCardMaster(${t.row})" style="background:none; border:none; color:var(--negative); cursor:pointer;">Borrar</button></div>`).join('')}</div>`; };

// --- NAVEGACIÓN ---
window.toggleSidebar = function() {
  const sidebar = document.querySelector('.app-sidebar');
  AppState.sidebarCollapsed = !AppState.sidebarCollapsed;
  if (sidebar) sidebar.classList.toggle('collapsed');
  document.getElementById('sidebar-toggle').innerHTML = AppState.sidebarCollapsed ? '›' : '‹';
};

window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  const btn = document.getElementById(`nav-${p}`) || document.querySelector(`[onclick*="navigateTo('${p}')"]`);
  if (btn) btn.classList.add('active');
  document.getElementById('page-title').textContent = p.charAt(0).toUpperCase() + p.slice(1);
  if (p === 'dashboard') window.loadDashboard();
  else if (p === 'settings') loadSettingsPage();
};

window.loadSettingsPage = function() {
  const container = document.getElementById('settings-content');
  if (!container) return;
  const header = `<div class="view-wrapper"><div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
    ${['bancos', 'categorias', 'casas', 'tarjetas'].map(t => `<a href="#" onclick="setSettingsTab('${t}'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === t ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === t ? 'var(--accent)' : 'transparent'}">${t.toUpperCase()}</a>`).join('')}
  </div><div id="settings-view"></div></div>`;
  container.innerHTML = header;
  const view = document.getElementById('settings-view');
  if (AppState.settingsTab === 'bancos') window.renderBancosTab(view);
  else if (AppState.settingsTab === 'categorias') window.renderCategoriasTab(view);
  else if (AppState.settingsTab === 'casas') window.renderCasasTab(view);
  else if (AppState.settingsTab === 'tarjetas') window.renderTarjetasTab(view);
};

// --- PUENTE GLOBAL ---
window.setSettingsTab = (t) => { AppState.settingsTab = t; window.loadSettingsPage(); };
window.toggleAddBankForm = () => { AppState.isAddingBank = !AppState.isAddingBank; AppState.editingBankData = null; window.loadSettingsPage(); };
window.editBankMaster = (row, n, i, c, t) => { AppState.isAddingBank = true; AppState.editingBankData = { row, name: n, iban: i, casa: c, tarjeta: t }; window.loadSettingsPage(); };
window.syncCardLabel = () => { const sel = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value); document.getElementById('ms-label').textContent = sel.length > 0 ? sel.join(', ') : 'Seleccionar...'; };
window.saveBank = async () => {
  const n = document.getElementById('new-bank-name').value, i = document.getElementById('new-bank-iban').value, c = document.getElementById('new-bank-casa').value;
  const t = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value).join(', ');
  if (AppState.editingBankData?.row) {
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 1, n);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 2, i);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 3, c);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 4, t);
  } else { await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [n, i, c, t]); }
  AppState.isAddingBank = false; window.loadSettingsPage();
};

// Acciones
window.addCategoryMaster = async () => { const n = prompt("Categoría:"); if(n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [n]); await BudgetLogic.loadConfig(); window.loadSettingsPage(); } };
window.renameCategoryMaster = async (cat) => { const n = prompt("Nuevo nombre:", cat); if(n && n!==cat) { alert("Use Excel."); } };
window.addSubcategory = async (cat) => { const n = prompt(`Sub para ${cat}:`); if(n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [cat, n]); await BudgetLogic.loadConfig(); window.loadSettingsPage(); } };
window.deleteSubcategory = async (cat, sub) => { if(confirm("¿Borrar?")) { alert("Use Excel."); } };
window.addCardMaster = async () => { const n = prompt("Tarjeta:"); if(n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["","","","",n]); await BudgetLogic.loadConfig(); window.loadSettingsPage(); } };
window.addCasaMaster = async () => { const n = prompt("Casa:"); if(n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["","","",n]); await BudgetLogic.loadConfig(); window.loadSettingsPage(); } };
window.deleteCardMaster = async (row) => { if(confirm("¿Borrar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 7, 'DELETED'); await BudgetLogic.loadConfig(); window.loadSettingsPage(); } };
window.deleteCasaMaster = async (row) => { if(confirm("¿Borrar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); await BudgetLogic.loadConfig(); window.loadSettingsPage(); } };

window.nextMonth = () => { AppState.currentMonth === 12 ? (AppState.currentMonth=1, AppState.currentYear++) : AppState.currentMonth++; AppState.initUI(); if(AppState.currentPage==='dashboard') window.loadDashboard(); };
window.prevMonth = () => { AppState.currentMonth === 1 ? (AppState.currentMonth=12, AppState.currentYear--) : AppState.currentMonth--; AppState.initUI(); if(AppState.currentPage==='dashboard') window.loadDashboard(); };

async function initApp() { await BudgetLogic.loadConfig(); AppState.initUI(); window.navigateTo('dashboard'); }
