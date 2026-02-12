// ============================================================
// Budget App — Page Controllers
// ============================================================

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
  container.innerHTML = '<div class="loading-overlay">Cargando datos...</div>';
  try {
    const data = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><h3>Ingresos</h3><p>${Utils.formatCurrency(data.totalIngresos)}</p></div>
        <div class="stat-card"><h3>Gastos</h3><p>${Utils.formatCurrency(data.totalGastos)}</p></div>
        <div class="stat-card"><h3>Neto</h3><p>${Utils.formatCurrency(data.ahorro)}</p></div>
      </div>`;
  } catch (err) {
    container.innerHTML = `<p class="error">Error: ${err.message}</p>`;
  }
}

// --- Other Pages ---
function loadImportPage() { document.getElementById('import-content').innerHTML = '<h3>📥 Importar</h3><p>Listo para procesar CSV.</p>'; }
function loadReviewPage() { document.getElementById('review-content').innerHTML = '<h3>✏️ Revisar</h3><p>No hay pendientes.</p>'; }
function loadRulesPage() { document.getElementById('rules-content').innerHTML = '<h3>⚙️ Reglas</h3><p>Gestión de automatización.</p>'; }
function loadReportingPage() { document.getElementById('reporting-content').innerHTML = '<h3>📈 Reportes</h3><p>Análisis mensual.</p>'; }
function loadBalancesPage() { document.getElementById('balances-content').innerHTML = '<h3>🏦 Saldos</h3><p>Estado de cuentas.</p>'; }
function loadSettingsPage() { document.getElementById('settings-content').innerHTML = '<h3>🔧 Ajustes</h3><p>Configuración general.</p>'; }

// --- App State & Utilities ---
const AppState = {
  config: null,
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  getMonthName: (m) => ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][m],
  prevMonth: function() { this.currentMonth--; if(this.currentMonth < 1){ this.currentMonth=12; this.currentYear--; } },
  nextMonth: function() { this.currentMonth++; if(this.currentMonth > 12){ this.currentMonth=1; this.currentYear++; } }
};

const Utils = {
  formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0)
};

function updateMonthSelector() {
  const el = document.getElementById('month-display');
  if(el) el.textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`;
}

function prevMonth() { AppState.prevMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }
function nextMonth() { AppState.nextMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }

async function initApp() {
  updateMonthSelector();
  try {
    AppState.config = await BudgetLogic.loadConfig();
    navigateTo('dashboard');
  } catch (err) {
    console.error(err);
    document.getElementById('dashboard-content').innerHTML = `<p>Error: ${err.message}</p>`;
  }
}
