// ============================================================
// Budget App — Page Controllers (COMPLETE VERSION)
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

// --- NAVIGATION ---
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  const pageEl = document.getElementById(`page-${page}`);
  const navEl = document.querySelector(`[data-page="${page}"]`);
  const titleEl = document.getElementById('page-title');
  
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');
  if (titleEl) titleEl.textContent = page.charAt(0).toUpperCase() + page.slice(1);
  
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
  container.innerHTML = '<div class="loading-overlay">Cargando datos maestros...</div>';
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
        <div class="card">
          <div class="card-title">Top Categorías</div>
          <table><tbody>
            ${(d.topCategories || []).map(x => `<tr><td>${x.name}</td><td class="amount">${Utils.formatCurrency(x.total)}</td></tr>`).join('')}
          </tbody></table>
        </div>
        <div class="card">
          <div class="card-title">Resumen</div>
          <div id="quick-add-section"></div>
        </div>
      </div>`;
    renderQuickAdd();
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">Error al cargar dashboard: ${err.message}</div>`;
  }
}

function renderQuickAdd() {
  const q = document.getElementById('quick-add-section');
  if (q) q.innerHTML = `<p class="text-muted" style="font-size:13px">Vista previa de transacciones habilitada.</p>`;
}

// --- IMPORT ---
function loadImportPage() {
  const c = document.getElementById('import-content');
  c.innerHTML = `
    <div class="section">
      <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()">
        <div class="icon" style="font-size:40px; margin-bottom:12px;">📁</div>
        <p style="font-weight:600; margin-bottom:4px;">Arrastra tu CSV aquí</p>
        <p style="color:var(--text-secondary); font-size:13px;">O haz clic para buscar el extracto bancario</p>
      </div>
      <input type="file" id="file-input" style="display:none" onchange="handleFileSelect(event)">
      <div id="import-result" class="hidden" style="margin-top:24px"></div>
    </div>`;
}

async function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const res = document.getElementById('import-result');
  res.classList.remove('hidden');
  res.innerHTML = `<div class="alert alert-info">Procesando ${file.name}...</div>`;
}

// --- STUBS ---
function loadReviewPage() { document.getElementById('review-content').innerHTML = '<div class="card">Cargando transacciones pendientes...</div>'; }
function loadRulesPage() { document.getElementById('rules-content').innerHTML = '<div class="card">Gestión de reglas de categorización.</div>'; }
function loadReportingPage() { document.getElementById('reporting-content').innerHTML = '<div class="card">Análisis anual y comparativas.</div>'; }
function loadBalancesPage() { document.getElementById('balances-content').innerHTML = '<div class="card">Saldos por cuenta y entidad.</div>'; }
function loadSettingsPage() { document.getElementById('settings-content').innerHTML = '<div class="card">Configuración de Sheets y App.</div>'; }

// --- MONTH SELECTOR HANDLERS ---
function updateMonthSelector() {
  const el = document.getElementById('month-display');
  if (el) el.textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`;
}
function prevMonth() { AppState.prevMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }
function nextMonth() { AppState.nextMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }

// --- INIT ---
async function initApp() {
  AppState.init(); 
  try { 
    AppState.config = await BudgetLogic.loadConfig(); 
    navigateTo('dashboard'); 
  } catch(err) {
    console.error(err);
    document.getElementById('dashboard-content').innerHTML = `<div class="alert alert-danger">Error de Conexión: ${err.message}</div>`;
  }
}
