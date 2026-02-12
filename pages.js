// ============================================================
// Budget App — Page Controllers (Full Version)
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

  // Each case below calls the function to build that specific screen
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
      <div class="stat-card"><div class="stat-label">Ingresos</div><div class="stat-value text-success">${Utils.formatCurrency(data.totalIngresos)}</div></div>
      <div class="stat-card"><div class="stat-label">Gastos</div><div class="stat-value text-danger">${Utils.formatCurrency(data.totalGastos)}</div></div>
      <div class="stat-card"><div class="stat-label">Ahorro</div><div class="stat-value">${Utils.formatCurrency(data.ahorro)}</div></div>
    </div>
    <div class="section"><h3 class="section-title">Quick Add</h3><div id="quick-add-container"></div></div>
  `;
}

// --- PAGE STUBS (Prevents "not defined" errors) ---
function loadImportPage() { document.getElementById('import-content').innerHTML = '<h3>📥 Import Transactions</h3><p>Select a CSV file to begin.</p>'; }
function loadReviewPage() { document.getElementById('review-content').innerHTML = '<h3>✏️ Review Pending</h3><p>No transactions pending review.</p>'; }
function loadRulesPage() { document.getElementById('rules-content').innerHTML = '<h3>⚙️ Automation Rules</h3><p>Manage your categorization rules here.</p>'; }
function loadReportingPage() { document.getElementById('reporting-content').innerHTML = '<h3>📈 Financial Reporting</h3><p>Select a month to view details.</p>'; }
function loadBalancesPage() { document.getElementById('balances-content').innerHTML = '<h3>🏦 Account Balances</h3><p>Current standing across all accounts.</p>'; }
function loadSettingsPage() { document.getElementById('settings-content').innerHTML = '<h3>🔧 Settings</h3><p>Configure categories and accounts.</p>'; }

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
    document.getElementById('dashboard-content').innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
  }
}
