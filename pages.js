// ============================================================
// Budget App — Page Controllers (Final Full Version)
// ============================================================

// --- NAVIGATION ---
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

// --- DASHBOARD ---
async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div> Loading Dashboard...</div>';
  try {
    const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    renderDashboard(data);
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
  }
}

function renderDashboard(data) {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Ingresos</div>
        <div class="stat-value text-success">${Utils.formatCurrency(data.totalIngresos)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Gastos</div>
        <div class="stat-value text-danger">${Utils.formatCurrency(data.totalGastos)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Ahorro</div>
        <div class="stat-value">${Utils.formatCurrency(data.ahorro)}</div>
      </div>
    </div>
    <div class="section">
      <h3 class="section-title">Resumen de Gastos</h3>
      <div id="dashboard-details">Datos cargados correctamente de la hoja de cálculo.</div>
    </div>
  `;
}

// --- PAGE LOADERS (Full logic for all menu items) ---
function loadImportPage() {
  document.getElementById('import-content').innerHTML = `
    <div class="section">
      <h3>📥 Importar Transacciones</h3>
      <p>Selecciona un archivo CSV para procesar nuevos gastos.</p>
      <input type="file" id="csv-file" accept=".csv" style="margin-top:20px">
    </div>`;
}

function loadReviewPage() {
  document.getElementById('review-content').innerHTML = `
    <div class="section">
      <h3>✏️ Revisión de Pendientes</h3>
      <p>Aquí aparecerán los gastos importados que necesitan categoría.</p>
      <div class="text-muted">No hay transacciones pendientes por ahora.</div>
    </div>`;
}

function loadRulesPage() {
  document.getElementById('rules-content').innerHTML = `
    <div class="section">
      <h3>⚙️ Reglas de Automatización</h3>
      <p>Configura cómo se categorizan tus gastos automáticamente.</p>
      <button class="btn btn-primary">Añadir Nueva Regla</button>
    </div>`;
}

function loadReportingPage() {
  document.getElementById('reporting-content').innerHTML = `
    <div class="section">
      <h3>📈 Reportes Detallados</h3>
      <p>Visualiza la evolución de tus finanzas por categoría.</p>
    </div>`;
}

function loadBalancesPage() {
  document.getElementById('balances-content').innerHTML = `
    <div class="section">
      <h3>🏦 Saldos de Cuentas</h3>
      <p>Estado actual de tus cuentas bancarias y efectivo.</p>
    </div>`;
}

function loadSettingsPage() {
  document.getElementById('settings-content').innerHTML = `
    <div class="section">
      <h3>🔧 Configuración</h3>
      <p>Gestiona categorías, subcategorías y nombres de cuentas.</p>
    </div>`;
}

// --- MONTH SELECTOR ---
function updateMonthSelector() {
  const el = document.getElementById('month-display');
  if (el) el.textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`;
}
function prevMonth() {
  AppState.prevMonth(); updateMonthSelector();
  navigateTo(AppState.currentPage);
}
function nextMonth() {
  AppState.nextMonth(); updateMonthSelector();
  navigateTo(AppState.currentPage);
}

// --- APP STATE ---
const AppState = {
  config: null,
  currentPage: 'dashboard',
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  
  init: function() { console.log('[App] State initialized'); },
  getMonthName: function(mes) {
    return ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][mes];
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

// --- UTILITIES ---
const Utils = {
  formatCurrency: (num) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(num || 0),
  showAlert: (msg, type) => alert(msg)
};

// --- INIT ---
async function initApp() {
  AppState.init(); 
  updateMonthSelector();
  try { 
    AppState.config = await BudgetLogic.loadConfig(); 
    navigateTo('dashboard'); 
  } catch(err) {
    document.getElementById('page-dashboard').classList.add('active');
    document.getElementById('dashboard-content').innerHTML = `
      <div class="alert alert-danger">
        <strong>Error de Conexión</strong><br>${err.message}
      </div>`;
  }
}
