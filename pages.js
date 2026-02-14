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

window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.getElementById(`page-${p}`).classList.add('active');
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
};

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
  let html = header + `<div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Categorías</h3><button onclick="addCategoryMaster()" style="background:var(--accent); color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer;">+ Nueva</button></div>`;
  Object.keys(cats).forEach(cat => {
    html += `<div class="settings-row" style="flex-direction:column; align-items:flex-start; gap:12px;">
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
      </div>
    </div>`;
  });
  container.innerHTML = html;
}

function renderBancosTab(container, header) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    let html = `${header}<div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Bancos</h3><button onclick="toggleAddBankForm()" style="background:var(--accent); color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer;">+ Nuevo</button></div>`;
    if (AppState.isAddingBank) {
      const d = AppState.editingBankData || { row: null, name: '', iban: '', casa: '', tarjeta: '' };
      html += `<div class="settings-row" style="background:#f8fafc; display:grid; grid-template-columns: repeat(4, 1fr) auto; gap:12px;">
        <input id="new-bank-name" value="${d.name}" placeholder="Nombre">
        <input id="new-bank-iban" value="${d.iban}" placeholder="IBAN">
        <select id="new-bank-casa">${AppState.config.casas.map(c => `<option value="${c.name}" ${d.casa==c.name?'selected':''}>${c.name}</option>`).join('')}</select>
        <button onclick="saveBank()" style="background:var(--positive); color:white; border:none; padding:8px; border-radius:8px; cursor:pointer;">OK</button>
      </div>`;
    }
    html += `<table style="width:100%; text-align:left;">
      <thead style="font-size:12px; color:var(--text-secondary);"><tr><th>NOMBRE</th><th>IBAN</th><th style="text-align:right;">ACCIONES</th></tr></thead>
      <tbody>${accs.slice(1).filter(a => a[0]!=='DELETED').map((a, i) => `<tr><td style="padding:12px 0;">${a[0]}</td><td>${a[1]}</td><td style="text-align:right;"><button onclick="editBankMaster(${i+2},'${a[0]}','${a[1]}','${a[2]}','${a[3]}')" style="background:none; border:none; color:var(--accent); cursor:pointer; margin-right:12px;">Editar</button><button onclick="deleteBankMaster(${i+2})" style="background:none; border:none; color:var(--negative); cursor:pointer;">Eliminar</button></td></tr>`).join('')}</tbody>
    </table>`;
    container.innerHTML = html;
  });
}

window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.toggleAddBankForm = () => { AppState.isAddingBank = !AppState.isAddingBank; AppState.editingBankData = null; loadSettingsPage(); };
window.editBankMaster = (row, n, i, c, t) => { AppState.isAddingBank = true; AppState.editingBankData = { row, name: n, iban: i, casa: c, tarjeta: t }; loadSettingsPage(); };
window.addCardMaster = async function() { const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["","","","",n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.addCasaMaster = async function() { const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["","","",n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteBankMaster = async function(row) { if (confirm("¿Eliminar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 1, 'DELETED'); loadSettingsPage(); } };
window.saveBank = async function() {
  const n = document.getElementById('new-bank-name').value, i = document.getElementById('new-bank-iban').value;
  if (AppState.editingBankData?.row) await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, AppState.editingBankData.row, 1, n);
  else await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [n, i]);
  AppState.isAddingBank = false; loadSettingsPage();
};

async function initApp() { await BudgetLogic.loadConfig(); AppState.initUI(); window.navigateTo('dashboard'); }
