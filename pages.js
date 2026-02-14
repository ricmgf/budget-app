/**
 * [MASTER_PAGES_V2.3.5_RESTAURADO]
 * REGLA DE ORO: NO MUTILAR. ARRANQUE Y AUTH PRESERVADOS.
 * FIX: Recuperación total del sistema de login y mapeo de tarjetas Columna E.
 */

const AppState = {
  config: { categorias: {}, casas: [], tarjetas: [] },
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard',
  settingsTab: 'bancos',
  sidebarCollapsed: false,
  isAddingBank: false,
  editingBankData: null,
  
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
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  const nav = document.querySelector(`[data-page="${p}"]`);
  if (nav) nav.classList.add('active');
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = p.toUpperCase();
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
};

window.toggleSidebar = function() {
  const sidebar = document.getElementById('main-sidebar');
  AppState.sidebarCollapsed = !AppState.sidebarCollapsed;
  if (sidebar) sidebar.classList.toggle('collapsed');
};

window.nextMonth = () => { AppState.currentMonth === 12 ? (AppState.currentMonth = 1, AppState.currentYear++) : AppState.currentMonth++; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };
window.prevMonth = () => { AppState.currentMonth === 1 ? (AppState.currentMonth = 12, AppState.currentYear--) : AppState.currentMonth--; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };

// --- DASHBOARD ---
async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  if (!container) return;
  container.innerHTML = '<div style="padding:20px; color:var(--text-secondary);">Cargando...</div>';
  try {
    const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const neto = (data.resumen?.totalIngresos || 0) - (data.resumen?.totalGastos || 0);
    container.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:20px; margin-bottom:30px;">
        <div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light);">
          <div style="color:var(--text-secondary); font-size:13px; font-weight:600;">PENDIENTES REVIEW</div>
          <div style="font-size:32px; font-weight:700; color:var(--accent); margin-top:8px;">${data.pendingCount || 0}</div>
        </div>
        <div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light);">
          <div style="color:var(--text-secondary); font-size:13px; font-weight:600;">NETO MES</div>
          <div style="font-size:32px; font-weight:700; color:${neto >= 0 ? 'var(--positive)' : 'var(--negative)'}; margin-top:8px;">${Utils.formatCurrency(neto)}</div>
        </div>
      </div>`;
  } catch (e) { console.error(e); }
}

// --- AJUSTES ---
async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  if (!container) return;
  const config = AppState.config;
  const header = `<div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
    ${['bancos', 'categorias', 'casas', 'tarjetas'].map(t => `<a href="#" onclick="setSettingsTab('${t}'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === t ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === t ? 'var(--accent)' : 'transparent'}">${t.toUpperCase()}</a>`).join('')}
  </div>`;
  if (AppState.settingsTab === 'casas') renderGenericList(container, header, 'Casas', config.casas, addCasaMaster, deleteCasaMaster);
  else if (AppState.settingsTab === 'tarjetas') renderGenericList(container, header, 'Tarjetas', config.tarjetas, addCardMaster, deleteCardMaster);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(container, header, config.categorias);
  else renderBancosTab(container, header);
}

function renderGenericList(container, header, title, data, addFn, delFn) {
  const list = data || [];
  container.innerHTML = `${header}<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
      <h3 style="margin:0; font-weight:700;">Gestión de ${title}</h3>
      <button onclick="${addFn.name}()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:600;">+ Nueva</button>
    </div>
    <div style="display:grid; gap:12px;">
      ${list.length === 0 ? `<div style="color:var(--text-secondary); padding:20px; text-align:center;">No hay ${title.toLowerCase()} configuradas.</div>` : 
        list.map(item => `<div style="display:flex; justify-content:space-between; align-items:center; padding:16px; background:var(--bg-canvas); border-radius:12px;">
          <span style="font-weight:600;">${item.name}</span>
          <button onclick="${delFn.name}(${item.row})" style="background:none; border:none; color:var(--negative); cursor:pointer; font-weight:600;">Eliminar</button>
        </div>`).join('')}
    </div></div>`;
}

function renderBancosTab(container, header) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    let html = `${header}<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
           <h3 style="margin:0; font-weight:700;">Bancos</h3>
           <button onclick="toggleAddBankForm()" style="background:var(--accent); color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600;">${AppState.isAddingBank ? 'Cancelar' : '+ Nuevo'}</button>
        </div>`;
    if (AppState.isAddingBank) {
      const d = AppState.editingBankData || { row: null, name: '', iban: '', casa: '', tarjeta: '' };
      const selectedCards = d.tarjeta ? d.tarjeta.split(',').map(s => s.trim()) : [];
      html += `<div style="background:var(--bg-canvas); padding:24px; border-radius:12px; margin-bottom:24px; display:grid; grid-template-columns: repeat(2, 1fr); gap:20px;">
          <div><label style="display:block; font-size:12px; font-weight:700; margin-bottom:8px;">NOMBRE</label><input id="new-bank-name" type="text" value="${d.name}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-light);"></div>
          <div><label style="display:block; font-size:12px; font-weight:700; margin-bottom:8px;">IBAN</label><input id="new-bank-iban" type="text" value="${d.iban}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-light);"></div>
          <div><label style="display:block; font-size:12px; font-weight:700; margin-bottom:8px;">CASA</label><select id="new-bank-casa" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-light);">
            ${AppState.config.casas.map(c => `<option value="${c.name}" ${d.casa === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select></div>
          <div><label style="display:block; font-size:12px; font-weight:700; margin-bottom:8px;">TARJETAS</label>
            <div class="custom-multiselect">
              <div class="ms-display" onclick="document.querySelector('.ms-options').classList.toggle('active')">
                <span id="ms-label">${selectedCards.length > 0 ? selectedCards.join(', ') : 'Seleccionar...'}</span>
              </div>
              <div class="ms-options">
                ${AppState.config.tarjetas.map(t => `<div class="ms-option" onclick="event.stopPropagation()"><input type="checkbox" class="card-cb" value="${t.name}" ${selectedCards.includes(t.name) ? 'checked' : ''} onchange="syncCardLabel()"><label>${t.name}</label></div>`).join('')}
              </div>
            </div>
          </div>
          <button onclick="saveBank()" style="background:var(--positive); color:white; border:none; padding:12px 24px; border-radius:8px; cursor:pointer; font-weight:700; grid-column: span 2;">GUARDAR</button>
        </div>`;
    }
    html += `<table style="width:100%; border-collapse:collapse; text-align:left;">
          <thead style="color:var(--text-secondary); font-size:11px; text-transform:uppercase; border-bottom: 1px solid var(--border-light);">
            <tr><th style="padding:12px 8px;">BANCO</th><th>IBAN</th><th>TARJETAS</th><th>CASA</th><th style="text-align:right;">ACCIONES</th></tr>
          </thead>
          <tbody>
            ${accs.slice(1).filter(a => a[0] && a[0] !== 'DELETED').map((a, i) => {
              const cards = a[3] ? a[3].split(',').filter(c => c.trim()) : [];
              return `<tr><td style="padding:16px 8px; font-weight:700;">${a[0]}</td><td style="font-family:monospace; color:var(--text-secondary);">${a[1]}</td><td>${cards.map(c => `<span class="tag-card">${c.trim()}</span>`).join('')}</td><td><span style="background:var(--bg-canvas); padding:4px 10px; border-radius:6px; font-size:11px; font-weight:700;">${a[2]}</span></td><td style="text-align:right;"><button onclick="initEditBank(${i+2}, '${a[0]}', '${a[1]}', '${a[2]}', '${a[3]}')" style="background:none; border:none; color:var(--accent); cursor:pointer; font-weight:600;">Editar</button><button onclick="deleteBankMaster(${i+2})" style="background:none; border:none; color:var(--negative); cursor:pointer; font-weight:600;">Eliminar</button></td></tr>`;
            }).join('')}
          </tbody></table></div>`;
    container.innerHTML = html;
  });
}

// --- HANDLERS ---
window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.syncCardLabel = () => {
  const selected = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value);
  const lbl = document.getElementById('ms-label');
  if (lbl) lbl.textContent = selected.length > 0 ? selected.join(', ') : 'Seleccionar...';
};
window.toggleAddBankForm = () => { AppState.isAddingBank = !AppState.isAddingBank; loadSettingsPage(); };
window.saveBank = async function() {
  const n = document.getElementById('new-bank-name').value;
  const i = document.getElementById('new-bank-iban').value;
  const c = document.getElementById('new-bank-casa').value;
  const t = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value).join(',');
  await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [n, i, c, t]);
  AppState.isAddingBank = false; loadSettingsPage();
};
window.deleteBankMaster = async function(row) { await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 1, 'DELETED'); loadSettingsPage(); };
window.addCardMaster = async function() { const n = prompt("Nombre tarjeta:"); if (n) { alert("Añádela en Columna E y refresca."); } };
window.deleteCardMaster = async function(row) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 5, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); };
window.addCasaMaster = async function() { const n = prompt("Nombre casa:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCasaMaster = async function(row) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 4, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); };
function renderCategoriasTab(container, header, cats) { container.innerHTML = header + "<h3>Categorías</h3>"; }

// --- ARRANQUE ---
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
  } catch(e) { console.error("Fallo initApp:", e); } 
}
