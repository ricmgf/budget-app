/**
 * [ARCHIVO_MAESTRO_RESTAURADO]
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

window.toggleSidebar = function() {
  const sidebar = document.getElementById('main-sidebar');
  const btn = document.getElementById('sidebar-toggle');
  AppState.sidebarCollapsed = !AppState.sidebarCollapsed;
  sidebar.classList.toggle('collapsed');
  btn.innerHTML = AppState.sidebarCollapsed ? '›' : '‹';
};

window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  document.getElementById(`page-${p}`).classList.add('active');
  document.getElementById(`nav-${p}`).classList.add('active');
  document.getElementById('page-title').textContent = p.charAt(0).toUpperCase() + p.slice(1);
  
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
  else if (p === 'import') renderImportPage();
};

async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
  const neto = data.resumen.totalIngresos - data.resumen.totalGastos;
  
  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:20px;">
      <div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="color:var(--text-secondary); font-size:12px; font-weight:700; text-transform:uppercase;">Neto Mensual</div>
        <div style="font-size:32px; font-weight:800; color:${neto >= 0 ? 'var(--positive)' : 'var(--negative)'}; margin-top:8px;">${Utils.formatCurrency(neto)}</div>
      </div>
      <div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="color:var(--text-secondary); font-size:12px; font-weight:700; text-transform:uppercase;">Pendientes Review</div>
        <div style="font-size:32px; font-weight:800; color:var(--accent); margin-top:8px;">${data.pendingCount || 0}</div>
      </div>
    </div>`;
}

function renderImportPage() {
  const container = document.getElementById('import-content');
  container.innerHTML = `
    <div style="background:white; padding:40px; border-radius:20px; border:1px solid var(--border-light); text-align:center;">
      <div style="font-size:48px; margin-bottom:20px;">📥</div>
      <h3 style="margin:0 0 10px 0;">Importar Movimientos</h3>
      <input type="file" id="file-upload" style="display:none" onchange="handleFileUpload(event)">
      <button onclick="document.getElementById('file-upload').click()" style="background:var(--accent); color:white; border:none; padding:12px 32px; border-radius:12px; font-weight:700; cursor:pointer;">Seleccionar Archivo</button>
    </div>`;
}

async function loadSettingsPage() {
  const container = document.getElementById('settings-content');
  const header = `<div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
    ${['bancos', 'categorias', 'casas', 'tarjetas'].map(t => `<a href="#" onclick="setSettingsTab('${t}'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === t ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === t ? 'var(--accent)' : 'transparent'}">${t.toUpperCase()}</a>`).join('')}
  </div>`;
  
  if (AppState.settingsTab === 'categorias') renderCategoriasTab(container, header);
  else if (AppState.settingsTab === 'bancos') renderBancosTab(container, header);
  else if (AppState.settingsTab === 'tarjetas') renderTarjetasTab(container, header);
  else if (AppState.settingsTab === 'casas') renderCasasTab(container, header);
}

function renderCategoriasTab(container, header) {
  const cats = AppState.config.categorias;
  let html = header + `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:20px;">`;
  Object.keys(cats).forEach(cat => {
    html += `<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light);">
      <div style="font-weight:800; margin-bottom:12px; color:var(--accent);">${cat}</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">${cats[cat].map(s => `<span class="tag-card">${s}</span>`).join('')}</div>
    </div>`;
  });
  container.innerHTML = html + `</div>`;
}

function renderBancosTab(container, header) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    let html = `${header}<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light);">
      <div style="display:flex; justify-content:space-between; margin-bottom:24px; align-items:center;">
        <h3 style="margin:0; font-weight:800;">Bancos</h3>
        <button onclick="toggleAddBankForm()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:700;">+ Nuevo</button>
      </div>
      <table style="width:100%; border-collapse:collapse;">
        ${accs.slice(1).filter(a => a[0] !== 'DELETED').map((a, i) => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:12px; font-weight:700;">${a[0]}</td>
            <td style="color:var(--text-secondary); font-family:monospace;">${a[1]}</td>
            <td>${(a[3] || '').split(',').map(c => c.trim() ? `<span class="tag-card">${c}</span>` : '').join('')}</td>
            <td style="text-align:right;"><button onclick="deleteBankMaster(${i+2})" style="background:none; border:none; color:var(--negative); cursor:pointer;">Eliminar</button></td>
          </tr>`).join('')}
      </table>
    </div>`;
    container.innerHTML = html;
  });
}

function renderTarjetasTab(container, header) {
  container.innerHTML = `${header}<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light);">
    <div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Tarjetas</h3><button onclick="addCardMaster()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:700;">+ Nueva</button></div>
    <div style="display:grid; gap:10px;">
      ${AppState.config.tarjetas.map(t => `<div style="display:flex; justify-content:space-between; padding:16px; background:var(--bg-canvas); border-radius:12px; font-weight:700;"><span>${t.name}</span><button onclick="deleteCardMaster(${t.row})" style="background:none; border:none; color:var(--negative); cursor:pointer;">Eliminar</button></div>`).join('')}
    </div></div>`;
}

function renderCasasTab(container, header) {
  container.innerHTML = `${header}<div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light);">
    <div style="display:flex; justify-content:space-between; margin-bottom:24px;"><h3>Casas</h3><button onclick="addCasaMaster()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-weight:700;">+ Nueva</button></div>
    <div style="display:grid; gap:10px;">
      ${AppState.config.casas.map(c => `<div style="display:flex; justify-content:space-between; padding:16px; background:var(--bg-canvas); border-radius:12px; font-weight:700;"><span>${c.name}</span><button onclick="deleteCasaMaster(${c.row})" style="background:none; border:none; color:var(--negative); cursor:pointer;">Eliminar</button></div>`).join('')}
    </div></div>`;
}

window.syncCardLabel = () => {
  const sel = Array.from(document.querySelectorAll('.card-cb:checked')).map(cb => cb.value);
  document.getElementById('ms-label').textContent = sel.length > 0 ? sel.join(', ') : 'Seleccionar...';
};

window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.toggleAddBankForm = () => { AppState.isAddingBank = !AppState.isAddingBank; loadSettingsPage(); };
window.nextMonth = () => { AppState.currentMonth === 12 ? (AppState.currentMonth = 1, AppState.currentYear++) : AppState.currentMonth++; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };
window.prevMonth = () => { AppState.currentMonth === 1 ? (AppState.currentMonth = 12, AppState.currentYear--) : AppState.currentMonth--; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };

async function initApp() { await BudgetLogic.loadConfig(); AppState.initUI(); window.navigateTo('dashboard'); }
