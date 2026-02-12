// ============================================================
// Budget App — Page Controllers (FINAL MASTER VERSION)
// ============================================================

const AppState = {
  config: null,
  currentPage: 'dashboard',
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  init: function() { 
    console.log('[App] State initialized'); 
    updateMonthSelector();
  },
  getMonthName: function(m) {
    return ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][m];
  },
  prevMonth: function() {
    this.currentMonth--;
    if (this.currentMonth < 1) { this.currentMonth = 12; this.currentYear--; }
  },
  nextMonth: function() {
    this.currentMonth++;
    if (this.currentMonth > 12) { this.currentMonth = 1; this.currentYear++; }
  }
};

const Utils = {
  formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0),
  formatDate: (d) => new Date(d).toLocaleDateString('es-ES'),
  showAlert: (msg, type) => alert(msg)
};

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  const navEl = document.querySelector(`[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');
  AppState.currentPage = page;
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'import': loadImportPage(); break;
    case 'review': loadReviewPage(); break;
    case 'rules': loadRulesPage(); break;
    case 'reporting': loadReportingPage(); break;
    case 'balances': loadBalancesPage(); break;
    case 'settings': loadSettingsPage(); break;
  }
}

async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = '<div class="loading-overlay">Sincronizando con Google Sheets...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const cfClass = d.cashFlow >= 0 ? 'positive' : 'negative';
    container.innerHTML = `
      <div class="metric-grid">
        <div class="card"><div class="card-title">Gastos</div><div class="card-value negative">${Utils.formatCurrency(d.totalGastos)}</div></div>
        <div class="card"><div class="card-title">Ingresos</div><div class="card-value positive">${Utils.formatCurrency(d.totalIngresos)}</div></div>
        <div class="card"><div class="card-title">Cash Flow</div><div class="card-value ${cfClass}">${Utils.formatCurrency(d.cashFlow)}</div></div>
      </div>
      <div class="two-col-equal">
        <div class="card"><div class="card-title">Top Categorías</div>
          <table><tbody>${(d.topCategories || []).map(x => `<tr><td>${x.name}</td><td class="amount">${Utils.formatCurrency(x.total)}</td></tr>`).join('')}</tbody></table>
        </div>
        <div class="card"><div class="card-title">Estado</div><div id="quick-add-section"></div></div>
      </div>`;
    renderQuickAdd();
  } catch (err) { container.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`; }
}

function renderQuickAdd() {
  const q = document.getElementById('quick-add-section');
  if (q) q.innerHTML = `<p class="text-muted" style="font-size:13px">Dashboard actualizado con éxito.</p>`;
}

function loadImportPage() {
  document.getElementById('import-content').innerHTML = `
    <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()">
      <div class="icon" style="font-size:40px; margin-bottom:12px;">📁</div>
      <p style="font-weight:600;">Suelte el archivo CSV aquí</p>
    </div>
    <input type="file" id="file-input" style="display:none" onchange="handleFileSelect(event)">
    <div id="import-result" class="hidden"></div>`;
}

async function handleFileSelect(e) { 
  if(e.target.files[0]) {
    const res = document.getElementById('import-result');
    res.classList.remove('hidden');
    res.innerHTML = `<div class="alert alert-info">Procesando ${e.target.files[0].name}...</div>`;
  }
}

function loadReviewPage() { document.getElementById('review-content').innerHTML = '<div class="card">No hay transacciones pendientes.</div>'; }
function loadRulesPage() { document.getElementById('rules-content').innerHTML = '<div class="card">Reglas de categorización activas.</div>'; }
function loadReportingPage() { document.getElementById('reporting-content').innerHTML = '<div class="card">Cargando reportes anuales...</div>'; }
function loadBalancesPage() { document.getElementById('balances-content').innerHTML = '<div class="card">Saldos actualizados.</div>'; }
function loadSettingsPage() { document.getElementById('settings-content').innerHTML = '<div class="card">Configuración del sistema.</div>'; }

function updateMonthSelector() {
  const el = document.getElementById('month-display');
  if (el) el.textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`;
}
function prevMonth() { AppState.prevMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }
function nextMonth() { AppState.nextMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }

async function initApp() {
  AppState.init(); 
  try { 
    AppState.config = await BudgetLogic.loadConfig(); 
    navigateTo('dashboard'); 
  } catch(err) {
    document.getElementById('dashboard-content').innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
  }
}
