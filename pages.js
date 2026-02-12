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
  container.innerHTML = '<div class="loading-overlay">Cargando datos de la hoja...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const cfClass = d.cashFlow >= 0 ? 'text-success' : 'text-danger';
    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><h3>Gastos</h3><div class="stat-value text-danger">${Utils.formatCurrency(d.totalGastos)}</div></div>
        <div class="stat-card"><h3>Ingresos</h3><div class="stat-value text-success">${Utils.formatCurrency(d.totalIngresos)}</div></div>
        <div class="stat-card"><h3>Neto</h3><div class="stat-value ${cfClass}">${Utils.formatCurrency(d.cashFlow)}</div></div>
      </div>
      <div class="section"><h3 class="section-title">Top Categorías</h3>
        <table><tbody>${(d.topCategories||[]).map(x=>`<tr><td>${x.name}</td><td>${Utils.formatCurrency(x.total)}</td></tr>`).join('')}</tbody></table>
      </div>`;
  } catch (err) { container.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`; }
}

function loadImportPage() { document.getElementById('import-content').innerHTML = '<h3>📥 Importar</h3><p>Sube tu archivo CSV aquí.</p><input type="file" onchange="handleFileSelect(event)">'; }
function loadReviewPage() { document.getElementById('review-content').innerHTML = '<h3>✏️ Revisar</h3>'; }
function loadRulesPage() { document.getElementById('rules-content').innerHTML = '<h3>⚙️ Reglas</h3>'; }
function loadReportingPage() { document.getElementById('reporting-content').innerHTML = '<h3>📈 Reportes</h3>'; }
function loadBalancesPage() { document.getElementById('balances-content').innerHTML = '<h3>🏦 Saldos</h3>'; }
function loadSettingsPage() { document.getElementById('settings-content').innerHTML = '<h3>🔧 Ajustes</h3>'; }

// --- APP STATE ---
const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  getMonthName: (m) => ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][m],
  prevMonth: function() { this.currentMonth--; if(this.currentMonth < 1){ this.currentMonth=12; this.currentYear--; } },
  nextMonth: function() { this.currentMonth++; if(this.currentMonth > 12){ this.currentMonth=1; this.currentYear++; } }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };
function updateMonthSelector() { document.getElementById('month-display').textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`; }
function prevMonth() { AppState.prevMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }
function nextMonth() { AppState.nextMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }

async function initApp() {
  updateMonthSelector();
  try { AppState.config = await BudgetLogic.loadConfig(); navigateTo('dashboard'); }
  catch(err) { console.error(err); }
}
