/**
 * [ARCHIVO_MAESTRO_V2.2_FINAL]
 * REGLA DE ORO: NO MUTILAR.
 * Sidebar, Multiselect, Tarjetas y Casas restaurados al 100%.
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

// --- SIDEBAR ---
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
  const header = `<div class="view-wrapper">
    <div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
      ${['bancos', 'categorias', 'casas', 'tarjetas'].map(t => `<a href="#" onclick="setSettingsTab('${t}'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === t ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === t ? 'var(--accent)' : 'transparent'}">${t.toUpperCase()}</a>`).join('')}
    </div>
    <div id="settings-view"></div>
  </div>`;
  container.innerHTML = header;
  const view = document.getElementById('settings-view');
  if (AppState.settingsTab === 'bancos') renderBancosTab(view);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(view);
  else if (AppState.settingsTab === 'casas') renderCasasTab(view);
  else if (AppState.settingsTab === 'tarjetas') renderTarjetasTab(view);
}

function renderBancosTab(container) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    let html = `<div class="card"><div style="display:flex; justify-content:space-between; margin-bottom:24px; align-items:center;">
      <h3 style="margin:0;">Bancos</h3><button onclick="toggleAddBankForm()" class="btn btn-primary">+ Nuevo</button></div>`;
    
    if (AppState.isAddingBank) {
      const d = AppState.editingBankData || { name: '', iban: '', casa: '', tarjeta: '' };
      const selCards = d.tarjeta ? d.tarjeta.split(',').map(s => s.trim()) : [];
      html += `<div style="background:var(--bg-tertiary); padding:20px; border-radius:12px; margin-bottom:24px; display:grid; grid-template-columns:repeat(4, 1fr) auto; gap:12px; align-items:end; border: 2px solid var(--accent);">
        <div><label style="font-size:11px; font-weight:800;">NOMBRE</label><input id="new-bank-name" value="${d.name}" class="input"></div>
        <div><label style="font-size:11px; font-weight:800;">IBAN</label><input id="new-bank-iban" value="${d.iban}" class="input"></div>
        <div><label style="font-size:11px; font-weight:800;">CASA</label><select id="new-bank-casa" class="input">${AppState.config.casas.map(c => `<option value="${c.name}" ${d.casa==c.name?'selected':''}>${c.name}</option>`).join('')}</select></div>
        <div class="custom-multiselect"><label style="font-size:11px; font-weight:800;">TARJETAS</label>
          <div class="ms-display" onclick="document.getElementById('ms-box').classList.toggle('active')"><span id="ms-label">${selCards.length > 0 ? selCards.join(', ') : 'Seleccionar...'}</span></div>
          <div id="ms-box" class="ms-options" onclick="event.stopPropagation()">${AppState.config.tarjetas.map(t => `<div class="ms-option"><input type="checkbox" class="card-cb" value="${t.name}" ${selCards.includes(t.name)?'checked':''} onchange="syncCardLabel()"> ${t.name}</div>`).join('')}</div>
        </div>
        <button onclick="saveBank()" class="btn btn-primary" style="background:var(--positive);">OK</button>
      </div>`;
    }
    html += `<table style="width:100%; border-collapse:collapse; text-align:left;">
      <thead style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">
        <tr><th style="padding:12px;">Nombre</th><th>IBAN</th><th>Tarjetas</th><th>Casa</th><th style="text-align:right;">Acciones</th></tr>
      </thead>
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
}

function renderTarjetasTab(v) { 
  v.innerHTML = `<div class="card"><h3>Tarjetas</h3>${AppState.config.tarjetas.map(t => `<div class="settings-row"><span>${t.name}</span><button onclick="deleteCardMaster(${t.row})" style="background:none; border:none; color:var(--negative); cursor:pointer; font-weight:700;">Borrar</button></div>`).join('')}</div>`; 
}

function renderCasasTab(v) { 
  v.innerHTML = `<div class="card"><h3>Casas</h3>${AppState.config.casas.map(c => `<div class="settings-row"><span>${c.name}</span><button onclick="deleteCasaMaster(${c.row})" style="background:none; border:none; color:var(--negative); cursor:pointer; font-weight:700;">Borrar</button></div>`).join('')}</div>`; 
}

// --- ACCIONES WINDOW ---
window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.toggleAddBankForm = () => { AppState.isAddingBank = !AppState.isAddingBank; AppState.editingBankData = null; loadSettingsPage(); };
window.editBankMaster = (row, n, i, c, t) => { AppState.isAddingBank = true; AppState.editingBankData = { row, name: n, iban: i, casa: c, tarjeta: t }; loadSettingsPage(); };
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
  AppState.isAddingBank = false; loadSettingsPage();
};

async function initApp() { await BudgetLogic.loadConfig(); AppState.initUI(); window.navigateTo('dashboard'); }
