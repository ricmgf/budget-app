/**
 * [ARCHIVO_MAESTRO_V1.7.3_PROTEGIDO]
 * REGLA DE ORO: NO MUTILAR.
 */
const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard', settingsTab: 'bancos', sidebarCollapsed: false,
  isAddingBank: false, editingBankRow: null,
  initUI: function() {
    const el = document.getElementById('month-display');
    if (el) {
      const mNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      el.textContent = `${mNames[this.currentMonth]} ${this.currentYear}`;
    }
  }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  const nav = document.querySelector(`[data-page="${p}"]`);
  if (nav) nav.classList.add('active');
  
  const titleMap = { dashboard: 'Dashboard', review: 'Review', balances: 'Balances', import: 'Importar', reporting: 'Reporting', rules: 'Reglas', settings: 'Ajustes' };
  document.getElementById('page-title').textContent = titleMap[p];

  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
  else if (p === 'import') loadImportPage();
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
          <div style="font-size:32px; font-weight:700; color:${neto >= 0 ? 'var(--positive)' : 'var(--negative)'}; margin-top:8px;">${Utils.formatCurrency(neto)}</div>
        </div>
        <div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="color:var(--text-secondary); font-size:14px; font-weight:600;">Variación Plan</div>
          <div style="font-size:32px; font-weight:700; color:var(--text-primary); margin-top:8px;">${Utils.formatCurrency((data.plannedGastos || 0) - data.resumen.totalGastos)}</div>
        </div>
      </div>`;
  } catch (e) { console.error(e); }
}

async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  const cats = AppState.config.categorias;
  const casas = AppState.config.casas;
  const header = `<div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
    ${['bancos', 'categorias', 'casas'].map(t => `<a href="#" onclick="setSettingsTab('${t}'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === t ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === t ? 'var(--accent)' : 'transparent'}">${t.toUpperCase()}</a>`).join('')}
  </div>`;
  if (AppState.settingsTab === 'casas') renderCasasTab(container, header, casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(container, header, cats);
  else renderBancosTab(container, header, casas);
}

function renderBancosTab(container, header, casas) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    let html = `${header}<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
           <h3 style="margin:0; color:var(--text-primary); font-weight:700;">Bancos</h3>
           <button onclick="toggleAddBankForm()" style="background:var(--accent); color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600;">${AppState.isAddingBank ? 'Cancelar' : '+ Nuevo'}</button>
        </div>`;
    if (AppState.isAddingBank) {
      html += `<div style="background:var(--bg-canvas); padding:20px; border-radius:12px; margin-bottom:24px; display:grid; grid-template-columns: repeat(4, 1fr) auto; gap:12px; align-items:end;">
          <div><label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">Nombre</label><input id="new-bank-name" type="text" style="width:100%; padding:8px; border-radius:6px; border:1px solid var(--border-light);"></div>
          <div><label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">IBAN</label><input id="new-bank-iban" type="text" style="width:100%; padding:8px; border-radius:6px; border:1px solid var(--border-light);"></div>
          <div><label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">Casa</label><select id="new-bank-casa" style="width:100%; padding:8px; border-radius:6px; border:1px solid var(--border-light);">${casas.map(c=>`<option value="${c.name}">${c.name}</option>`).join('')}</select></div>
          <div><label style="display:block; font-size:12px; margin-bottom:4px; font-weight:600;">Tipo</label><select id="new-bank-tipo" style="width:100%; padding:8px; border-radius:6px; border:1px solid var(--border-light);"><option value="Corriente">Corriente</option><option value="Ahorro">Ahorro</option><option value="Inversión">Inversión</option></select></div>
          <button onclick="saveBank()" style="background:var(--positive); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:600;">${AppState.editingBankRow ? 'Actualizar' : 'Guardar'}</button>
        </div>`;
    }
    html += `<table style="width:100%; border-collapse:collapse; text-align:left;">
          <thead style="color:var(--text-secondary); font-size:12px; text-transform:uppercase; border-bottom: 1px solid var(--border-light);">
            <tr><th style="padding:12px 8px;">Nombre</th><th>IBAN</th><th>Tipo</th><th>Casa</th><th style="text-align:right;">Acciones</th></tr>
          </thead>
          <tbody>
            ${accs.slice(1).map((a, i) => `<tr>
                <td style="padding:16px 8px; font-weight:600; color:var(--text-primary);">${a[0]||''}</td>
                <td style="font-family:monospace; color:var(--text-secondary);">${a[1]||''}</td>
                <td style="color:var(--text-secondary);">${a[3]||'Corriente'}</td> 
                <td><span style="background:var(--accent-subtle); color:var(--accent); padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600;">${a[2] || ''}</span></td> 
                <td style="text-align:right;">
                  <button onclick="initEditBank(${i+2}, '${a[0]}', '${a[1]}', '${a[2]}', '${a[3]}')" style="background:none; border:none; color:var(--accent); cursor:pointer; font-weight:600; margin-right:12px;">Editar</button>
                  <button onclick="deleteBankMaster(${i+2})" style="background:none; border:none; color:var(--negative); cursor:pointer; font-weight:600;">Eliminar</button>
                </td>
              </tr>`).join('')}
          </tbody></table></div>`;
    container.innerHTML = html;
  });
}

window.toggleAddBankForm = () => { AppState.isAddingBank = !AppState.isAddingBank; AppState.editingBankRow = null; loadSettingsPage(); };
window.initEditBank = (row, n, i, c, t) => { 
  AppState.isAddingBank = true; 
  AppState.editingBankRow = row; 
  loadSettingsPage(); 
  setTimeout(() => { 
    if(document.getElementById('new-bank-name')) document.getElementById('new-bank-name').value = n; 
    if(document.getElementById('new-bank-iban')) document.getElementById('new-bank-iban').value = i; 
    if(document.getElementById('new-bank-casa')) document.getElementById('new-bank-casa').value = c; 
    if(document.getElementById('new-bank-tipo')) document.getElementById('new-bank-tipo').value = t; 
  }, 50); 
};
window.saveBank = async function() {
  const n = document.getElementById('new-bank-name').value; const i = document.getElementById('new-bank-iban').value; const c = document.getElementById('new-bank-casa').value; const t = document.getElementById('new-bank-tipo').value;
  if (!n || !i) return alert("Nombre e IBAN obligatorios");
  if (AppState.editingBankRow) { 
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankRow, 1, n); 
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankRow, 2, i); 
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankRow, 3, c); 
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankRow, 4, t); 
  }
  else { await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [n, i, c, t]); }
  AppState.isAddingBank = false; AppState.editingBankRow = null; loadSettingsPage();
};

function renderCasasTab(container, header, casas) {
  container.innerHTML = `${header}<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;"><h3 style="margin:0; color:var(--text-primary); font-weight:700;">Casas</h3><button onclick="addCasaMaster()" style="background:var(--accent); color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600;">+ Nueva</button></div>
      <div style="display:grid; gap:12px;">${casas.map(c => `<div style="display:flex; justify-content:space-between; align-items:center; padding:16px; background:var(--bg-canvas); border-radius:12px;"><span style="font-weight:600; color:var(--text-primary);">${c.name}</span><div style="display:flex; gap:16px;"><button onclick="renameCasaMaster(${c.row}, '${c.name}')" style="background:none; border:none; color:var(--accent); cursor:pointer;">Renombrar</button><button onclick="deleteCasaMaster(${c.row})" style="background:none; border:none; color:var(--negative); cursor:pointer;">Eliminar</button></div></div>`).join('')}</div></div>`;
}

function renderCategoriasTab(container, header, cats) {
  let html = header + `<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.1);"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;"><h3 style="margin:0; color:var(--text-primary); font-weight:700;">Categorías</h3><button onclick="addCategoryMaster()" style="background:var(--accent); color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600;">+ Nueva</button></div>`;
  Object.keys(cats).forEach(cat => {
    html += `<div style="margin-bottom:24px; padding:20px; background:var(--bg-canvas); border-radius:16px; border: 1px solid var(--border-light);"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;"><strong style="font-size:16px; color:var(--text-primary);">${cat}</strong><div><button onclick="renameCategoryMaster('${cat}')" style="background:none; border:none; color:var(--accent); cursor:pointer; font-size:13px; margin-right:10px;">Editar</button><button onclick="deleteCategoryMaster('${cat}')" style="background:none; border:none; color:var(--negative); cursor:pointer; font-size:13px;">Eliminar</button></div></div><div style="display:flex; flex-wrap:wrap; gap:8px;">${cats[cat].map(sub => `<span style="background:white; border: 1px solid var(--border-light); padding:4px 12px; border-radius:20px; font-size:13px; color:var(--text-secondary); display:flex; align-items:center;">${sub}<button onclick="deleteSubcategory('${cat}','${sub}')" style="background:none; border:none; color:var(--negative); margin-left:6px; cursor:pointer; font-size:14px;">×</button></span>`).join('')}<button onclick="addSubcategory('${cat}')" style="background:none; border: 1px dashed var(--accent); color:var(--accent); padding:4px 12px; border-radius:20px; font-size:13px; cursor:pointer;">+ Sub</button></div></div>`;
  });
  container.innerHTML = html + `</div>`;
}

async function initApp() { try { let retry = 0; while (typeof gapi === 'undefined' || !gapi.client || !gapi.client.sheets) { if (retry > 20) throw new Error("API Timeout"); await new Promise(r => setTimeout(r, 200)); retry++; } await BudgetLogic.loadConfig(); AppState.initUI(); window.navigateTo('dashboard'); } catch(e) { console.error("Fallo initApp:", e); } }

window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.addCasaMaster = async function() { const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.renameCasaMaster = async function(row, current) { const n = prompt("Nombre:", current); if (n && n !== current) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 4, n); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCasaMaster = async function(row) { if (confirm("¿Eliminar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.addCategoryMaster = async function() { const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
initApp();
