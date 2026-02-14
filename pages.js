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
        <div style="color:var(--text-secondary); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">Neto Mensual</div>
        <div style="font-size:32px; font-weight:800; color:${neto >= 0 ? 'var(--positive)' : 'var(--negative)'}; margin-top:8px;">${Utils.formatCurrency(neto)}</div>
      </div>
      <div style="background:white; padding:24px; border-radius:16px; border:1px solid var(--border-light); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="color:var(--text-secondary); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">Pendientes</div>
        <div style="font-size:32px; font-weight:800; color:var(--accent); margin-top:8px;">${data.pendingCount || 0}</div>
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
  else if (AppState.settingsTab === 'tarjetas') renderTarjetasTab(container, header);
  else if (AppState.settingsTab === 'casas') renderCasasTab(container, header);
}

function renderCategoriasTab(container, header) {
  const cats = AppState.config.categorias;
  let html = header + `<div style="display:grid; gap:16px;">`;
  Object.keys(cats).forEach(cat => {
    html += `<div style="background:white; padding:20px; border-radius:16px; border:1px solid var(--border-light);">
      <div style="font-weight:800; margin-bottom:12px; color:var(--accent);">${cat}</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">${cats[cat].map(s => `<span class="tag-card">${s}</span>`).join('')}</div>
    </div>`;
  });
  container.innerHTML = html + `</div>`;
}

function renderImportPage() {
  const container = document.getElementById('import-content');
  container.innerHTML = `<div style="background:white; padding:40px; border-radius:20px; border:1px solid var(--border-light); text-align:center;">
      <div style="font-size:48px; margin-bottom:20px;">📥</div><h3 style="margin:0 0 10px 0;">Importar Movimientos</h3><p style="color:var(--text-secondary); margin-bottom:30px;">Sube tu Excel (.xlsx) para procesar.</p>
      <input type="file" id="file-upload" style="display:none" onchange="handleFileUpload(event)"><button onclick="document.getElementById('file-upload').click()" style="background:var(--accent); color:white; border:none; padding:12px 32px; border-radius:12px; font-weight:700; cursor:pointer;">Seleccionar Archivo</button>
    </div>`;
}

// [MISMAS FUNCIONES DE APOYO: renderBancosTab, renderTarjetasTab, renderCasasTab...]
async function initApp() { await BudgetLogic.loadConfig(); AppState.initUI(); window.navigateTo('dashboard'); }
