/**
 * [ARCHIVO_MAESTRO_V1.9.1_PROTEGIDO]
 * REGLA DE ORO: NO MUTILAR. ARRANQUE PRESERVADO DEL ZIP.
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

window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  const nav = document.querySelector(`[data-page="${p}"]`);
  if (nav) nav.classList.add('active');
  const titleMap = { dashboard: 'Dashboard', review: 'Review', balances: 'Balances', import: 'Importar', reporting: 'Reporting', rules: 'Reglas', settings: 'Ajustes' };
  if (document.getElementById('page-title')) document.getElementById('page-title').textContent = titleMap[p];
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
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
        <div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light);">
          <div style="color:var(--text-secondary); font-size:14px; font-weight:600;">Pendientes Review</div>
          <div style="font-size:32px; font-weight:700; color:var(--accent); margin-top:8px;">${data.pendingCount || 0}</div>
        </div>
        <div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light);">
          <div style="color:var(--text-secondary); font-size:14px; font-weight:600;">Neto Mes</div>
          <div style="font-size:32px; font-weight:700; color:${neto >= 0 ? '#10b981' : '#ef4444'}; margin-top:8px;">${Utils.formatCurrency(neto)}</div>
        </div>
      </div>`;
  } catch (e) { console.error(e); }
}

async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  const casas = AppState.config.casas;
  const tarjetas = AppState.config.tarjetas || [];
  const header = `<div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
    ${['bancos', 'categorias', 'casas', 'tarjetas'].map(t => `<a href="#" onclick="setSettingsTab('${t}'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === t ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === t ? 'var(--accent)' : 'transparent'}">${t.toUpperCase()}</a>`).join('')}
  </div>`;
  if (AppState.settingsTab === 'casas') renderCasasTab(container, header, casas);
  else if (AppState.settingsTab === 'tarjetas') renderTarjetasTab(container, header, tarjetas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(container, header, AppState.config.categorias);
  else renderBancosTab(container, header, casas);
}

function renderBancosTab(container, header, casas) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    let html = `${header}<h3>Bancos</h3><button onclick="toggleAddBankForm()">+ Nuevo</button>`;
    if (AppState.isAddingBank) {
      const d = AppState.editingBankData || { row: null, name: '', iban: '', casa: '', tarjeta: '' };
      const selectedCards = d.tarjeta ? d.tarjeta.split(',').map(s => s.trim()) : [];
      html += `<div style="padding:20px; background:var(--bg-canvas); border-radius:12px; margin-bottom:24px; display:grid; grid-template-columns: repeat(4, 1fr) auto; gap:12px; align-items:end;">
          <div><label>Nombre</label><input id="new-bank-name" type="text" value="${d.name}"></div>
          <div><label>IBAN</label><input id="new-bank-iban" type="text" value="${d.iban}"></div>
          <div><label>Casa</label><select id="new-bank-casa">${casas.map(c => `<option value="${c.name}" ${d.casa === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
          <div><label>Tarjetas</label>
            <div class="custom-multiselect">
              <div class="ms-display" onclick="document.querySelector('.ms-options').classList.toggle('active')"><span id="ms-label">${selectedCards.length > 0 ? selectedCards.join(', ') : 'Seleccionar...'}</span></div>
              <div class="ms-options">
                ${(AppState.config.tarjetas || []).map(t => `<div class="ms-option" onclick="event.stopPropagation()"><input type="checkbox" class="card-cb" value="${t.name}" ${selectedCards.includes(t.name) ? 'checked' : ''} onchange="syncCardLabel()"><label>${t.name}</label></div>`).join('')}
              </div>
            </div>
          </div>
          <button onclick="saveBank()">Guardar</button>
        </div>`;
    }
    html += `<table>${accs.slice(1).filter(a => a[0] !== 'DELETED').map((a, i) => `<tr><td>${a[0]}</td><td>${a[3]}</td><td><button onclick="deleteBankMaster(${i+2})">Eliminar</button></td></tr>`).join('')}</table>`;
    container.innerHTML = html;
  });
}

window.syncCardLabel = () => {
  const selected = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value);
  document.getElementById('ms-label').textContent = selected.length > 0 ? selected.join(', ') : 'Seleccionar...';
};

window.saveBank = async function() {
  const n = document.getElementById('new-bank-name').value;
  const i = document.getElementById('new-bank-iban').value;
  const c = document.getElementById('new-bank-casa').value;
  const t = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value).join(',');
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

window.deleteBankMaster = async function(row) { if (confirm("¿Eliminar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 1, 'DELETED'); loadSettingsPage(); } };
function renderCasasTab(container, header, casas) { container.innerHTML = `${header}<h3>Casas</h3><button onclick="addCasaMaster()">+ Nueva</button><div>${casas.map(c => `<div>${c.name} <button onclick="deleteCasaMaster(${c.row})">X</button></div>`).join('')}</div>`; }
function renderTarjetasTab(container, header, tarjetas) { container.innerHTML = `${header}<h3>Tarjetas</h3><button onclick="addCardMaster()">+ Nueva</button><div>${tarjetas.map(t => `<div>${t.name} <button onclick="deleteCardMaster(${t.row})">X</button></div>`).join('')}</div>`; }
function renderCategoriasTab(container, header, cats) { container.innerHTML = header + "<h3>Categorías</h3>"; }

async function initApp() { try { let retry = 0; while (typeof gapi === 'undefined' || !gapi.client || !gapi.client.sheets) { if (retry > 20) throw new Error("API Timeout"); await new Promise(r => setTimeout(r, 200)); retry++; } await BudgetLogic.loadConfig(); AppState.initUI(); window.navigateTo('dashboard'); } catch(e) { console.error("Fallo initApp:", e); } }

window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.toggleAddBankForm = () => { AppState.isAddingBank = !AppState.isAddingBank; loadSettingsPage(); };
window.addCasaMaster = async function() { const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCasaMaster = async function(row) { if (confirm("¿Eliminar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 6, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.addCardMaster = async function() { const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", "", n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCardMaster = async function(row) { if (confirm("¿Eliminar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 7, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); } };

initApp();
