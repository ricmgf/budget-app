// ============================================================
// Budget App — Page Controllers
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

// --- MONTH SELECTOR ---
function updateMonthSelector() {
  const el = document.getElementById('month-display');
  if (el) el.textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`;
}
function prevMonth() {
  AppState.prevMonth(); updateMonthSelector();
  const p = AppState.currentPage;
  if (['dashboard','reporting','balances'].includes(p)) navigateTo(p);
}
function nextMonth() {
  AppState.nextMonth(); updateMonthSelector();
  const p = AppState.currentPage;
  if (['dashboard','reporting','balances'].includes(p)) navigateTo(p);
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
  let html = `
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
  `;
  container.innerHTML = html;
}

// --- MODAL ---
function showModal(title, body, onConfirm, confirmText) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  const btn = document.getElementById('modal-confirm');
  if (onConfirm) {
    btn.classList.remove('hidden');
    btn.textContent = confirmText || 'Save';
    btn.onclick = onConfirm;
  } else {
    btn.classList.add('hidden');
  }
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// --- APP STATE ---
const AppState = {
  config: null,
  currentPage: 'dashboard',
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  
  init: function() {
    console.log('[App] State initialized');
  },
  
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
        <strong>Connection Error</strong><br>Could not load config.<br>
        <code style="font-size:10px">${err.message}</code>
      </div>`;
  }
}
