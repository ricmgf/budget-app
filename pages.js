/**
 * [MASTER_PAGES_V2.3.0_FINAL]
 * REGLA DE ORO: NO MUTILAR. ARRANQUE PRESERVADO.
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
  container.innerHTML = 'Cargando...';
  try {
    const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const neto = (data.resumen?.totalIngresos || 0) - (data.resumen?.totalGastos || 0);
    container.innerHTML = `<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:20px;">
      <div style="background:white; padding:20px; border-radius:12px; border:1px solid #eee;">
        <div style="font-size:12px; color:#666;">PENDIENTES</div>
        <div style="font-size:24px; font-weight:700;">${data.pendingCount || 0}</div>
      </div>
      <div style="background:white; padding:20px; border-radius:12px; border:1px solid #eee;">
        <div style="font-size:12px; color:#666;">NETO</div>
        <div style="font-size:24px; font-weight:700; color:${neto >= 0 ? 'green' : 'red'};">${Utils.formatCurrency(neto)}</div>
      </div>
    </div>`;
  } catch (e) { console.error(e); }
}

// --- AJUSTES ---
async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  if (!container) return;
  const header = `<div style="display:flex; gap:20px; border-bottom:1px solid #eee; margin-bottom:20px;">
    ${['bancos', 'categorias', 'casas', 'tarjetas'].map(t => `<a href="#" onclick="setSettingsTab('${t}'); return false;" style="padding:10px; color:${AppState.settingsTab === t ? 'blue' : 'gray'}">${t.toUpperCase()}</a>`).join('')}
  </div>`;
  const config = AppState.config;
  if (AppState.settingsTab === 'casas') renderList(container, header, 'Casas', config.casas, addCasaMaster, deleteCasaMaster);
  else if (AppState.settingsTab === 'tarjetas') renderList(container, header, 'Tarjetas', config.tarjetas, addCardMaster, deleteCardMaster);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(container, header, config.categorias);
  else renderBancosTab(container, header);
}

function renderList(container, header, title, data, addFn, delFn) {
  const list = data || [];
  container.innerHTML = `${header}<h3>${title}</h3>
    <button onclick="${addFn.name}()">+ Nueva</button>
    <div style="margin-top:10px;">
      ${list.map(item => `<div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
        <span>${item.name}</span>
        <button onclick="${delFn.name}(${item.row})">Eliminar</button>
      </div>`).join('')}
    </div>`;
}

function renderBancosTab(container, header) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    let html = `${header}<h3>Bancos</h3><button onclick="toggleAddBankForm()">+ Nuevo</button>`;
    if (AppState.isAddingBank) {
      const d = AppState.editingBankData || { name: '', iban: '', casa: '', tarjeta: '' };
      const selectedCards = d.tarjeta ? d.tarjeta.split(',') : [];
      html += `<div style="padding:20px; background:#f9f9f9; margin:10px 0;">
          <input id="new-bank-name" placeholder="Nombre" value="${d.name}">
          <input id="new-bank-iban" placeholder="IBAN" value="${d.iban}">
          <select id="new-bank-casa">${AppState.config.casas.map(c => `<option value="${c.name}" ${d.casa === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
          <div class="custom-multiselect">
            <div onclick="document.querySelector('.ms-options').classList.toggle('active')">Tarjetas: <span id="ms-label">${selectedCards.join(',')}</span></div>
            <div class="ms-options" style="display:none; background:white; border:1px solid #ccc; position:absolute;">
              ${AppState.config.tarjetas.map(t => `<div><input type="checkbox" class="card-cb" value="${t.name}" ${selectedCards.includes(t.name) ? 'checked' : ''} onchange="syncCardLabel()"> ${t.name}</div>`).join('')}
            </div>
          </div>
          <button onclick="saveBank()">Guardar</button>
        </div>`;
    }
    html += `<table>${accs.slice(1).filter(a => a[0] !== 'DELETED').map((a, i) => `<tr><td>${a[0]}</td><td>${a[3]}</td><td><button onclick="deleteBankMaster(${i+2})">Eliminar</button></td></tr>`).join('')}</table>`;
    container.innerHTML = html;
  });
}

window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.syncCardLabel = () => {
  const selected = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value);
  document.getElementById('ms-label').textContent = selected.join(',');
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
window.addCardMaster = async function() { const n = prompt("Nombre:"); if (n) { alert("Escríbela en Columna E y refresca."); } };
window.deleteCardMaster = async function(row) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 5, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); };
window.addCasaMaster = async function() { const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, ["", "", "", n]); await BudgetLogic.loadConfig(); loadSettingsPage(); } };
window.deleteCasaMaster = async function(row) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, row, 4, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); };
function renderCategoriasTab(container, header, cats) { container.innerHTML = header + "Categorías (Carga OK)"; }

// --- ARRANQUE FINAL ---
async function initApp() {
  await BudgetLogic.loadConfig();
  AppState.initUI();
  window.navigateTo('dashboard');
}
