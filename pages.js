/**
 * [ARCHIVO_MAESTRO_V2.1_FINAL]
 * FIX: Sidebar Colapsable, Menús Completos y Bancos en Card Centrada.
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

window.toggleSidebar = function() {
  const sidebar = document.querySelector('.app-sidebar');
  AppState.sidebarCollapsed = !AppState.sidebarCollapsed;
  if (sidebar) sidebar.classList.toggle('collapsed');
  document.getElementById('sidebar-toggle').innerHTML = AppState.sidebarCollapsed ? '›' : '‹';
};

window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  
  const btn = document.getElementById(`nav-${p}`);
  if (btn) btn.classList.add('active');
  
  document.getElementById('page-title').textContent = p.charAt(0).toUpperCase() + p.slice(1);
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
};

async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  const header = `<div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
    ${['bancos', 'categorias', 'casas', 'tarjetas'].map(t => `<a href="#" onclick="setSettingsTab('${t}'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === t ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === t ? 'var(--accent)' : 'transparent'}">${t.toUpperCase()}</a>`).join('')}
  </div>`;
  
  // Envolvemos en view-wrapper para ganar el margen gris lateral
  container.innerHTML = `<div class="view-wrapper">${header}<div id="settings-view"></div></div>`;
  const view = document.getElementById('settings-view');
  
  if (AppState.settingsTab === 'bancos') renderBancosTab(view);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(view);
  else if (AppState.settingsTab === 'casas') renderCasasTab(view);
  else if (AppState.settingsTab === 'tarjetas') renderTarjetasTab(view);
}

function renderBancosTab(container) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    let html = `<div class="card">
      <div style="display:flex; justify-content:space-between; margin-bottom:24px; align-items:center;">
        <h3 style="margin:0;">Bancos</h3>
        <button onclick="toggleAddBankForm()" class="btn btn-primary">+ Nuevo</button>
      </div>`;
    
    if (AppState.isAddingBank) {
      const d = AppState.editingBankData || { name: '', iban: '', casa: '' };
      html += `<div style="background:var(--bg-primary); padding:20px; border-radius:12px; margin-bottom:24px; display:grid; grid-template-columns:repeat(3, 1fr) auto; gap:12px; align-items:end;">
        <input id="new-bank-name" value="${d.name}" class="input" placeholder="Nombre">
        <input id="new-bank-iban" value="${d.iban}" class="input" placeholder="IBAN">
        <select id="new-bank-casa" class="input">${AppState.config.casas.map(c => `<option value="${c.name}" ${d.casa==c.name?'selected':''}>${c.name}</option>`).join('')}</select>
        <button onclick="saveBank()" class="btn btn-primary" style="background:var(--positive);">OK</button>
      </div>`;
    }

    html += `<table style="width:100%; border-collapse:collapse; text-align:left;">
      <thead style="color:var(--text-secondary); font-size:11px; text-transform:uppercase;">
        <tr><th style="padding:12px;">Nombre</th><th>IBAN</th><th>Casa</th><th style="text-align:right;">Acciones</th></tr>
      </thead>
      <tbody>
        ${accs.slice(1).filter(a => a[0] !== 'DELETED').map((a, i) => `
          <tr style="border-top:1px solid var(--border-light);">
            <td style="padding:16px 12px; font-weight:700;">${a[0]}</td>
            <td style="font-family:monospace; color:var(--text-secondary);">${a[1]}</td>
            <td><span class="tag-card" style="background:#f1f5f9;">${a[2] || '-'}</span></td>
            <td style="text-align:right;">
              <button onclick="editBankMaster(${i+2},'${a[0]}','${a[1]}','${a[2]}')" style="background:none; border:none; color:var(--accent); cursor:pointer; font-weight:700;">Editar</button>
            </td>
          </tr>`).join('')}
      </tbody></table></div>`;
    container.innerHTML = html;
  });
}

function renderCategoriasTab(container) {
  const cats = AppState.config.categorias;
  let html = `<div class="card"><h3>Categorías</h3>`;
  Object.keys(cats).forEach(cat => {
    html += `<div class="settings-row">
      <div style="flex:1;">
        <div style="font-weight:700; margin-bottom:8px;">${cat}</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${cats[cat].map(s => `<span class="tag-card">${s} <button onclick="deleteSubcategory('${cat}','${s}')" style="background:none; border:none; color:var(--negative); cursor:pointer; font-weight:bold;">×</button></span>`).join('')}
          <button onclick="addSubcategory('${cat}')" style="border:1px dashed var(--accent); background:none; color:var(--accent); padding:2px 10px; border-radius:12px; cursor:pointer; font-size:10px;">+ Sub</button>
        </div>
      </div>
      <button onclick="renameCategoryMaster('${cat}')" style="background:none; border:none; color:var(--accent); cursor:pointer;">Editar</button>
    </div>`;
  });
  container.innerHTML = html + `</div>`;
}

// --- ACCIONES GLOBALES ---
window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.toggleAddBankForm = () => { AppState.isAddingBank = !AppState.isAddingBank; loadSettingsPage(); };
window.editBankMaster = (row, n, i, c) => { AppState.isAddingBank = true; AppState.editingBankData = { row, name: n, iban: i, casa: c }; loadSettingsPage(); };
window.saveBank = async () => {
  const n = document.getElementById('new-bank-name').value, i = document.getElementById('new-bank-iban').value, c = document.getElementById('new-bank-casa').value;
  if (AppState.editingBankData?.row) await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 1, n);
  else await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [n, i, c]);
  AppState.isAddingBank = false; loadSettingsPage();
};

window.nextMonth = () => { AppState.currentMonth === 12 ? (AppState.currentMonth=1, AppState.currentYear++) : AppState.currentMonth++; AppState.initUI(); if(AppState.currentPage==='dashboard') loadDashboard(); };
window.prevMonth = () => { AppState.currentMonth === 1 ? (AppState.currentMonth=12, AppState.currentYear--) : AppState.currentMonth--; AppState.initUI(); if(AppState.currentPage==='dashboard') loadDashboard(); };
async function initApp() { await BudgetLogic.loadConfig(); AppState.initUI(); window.navigateTo('dashboard'); }
