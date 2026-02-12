function navigateTo(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  document.getElementById(`page-${p}`).classList.add('active');
  const navBtn = document.querySelector(`[data-page="${p}"]`);
  if(navBtn) navBtn.classList.add('active');
  AppState.currentPage = p;
  switch (p) {
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
  const c = document.getElementById('dashboard-content');
  c.innerHTML = '<div class="loading-overlay">Cargando...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const cfClass = d.cashFlow >= 0 ? 'positive' : 'negative';
    c.innerHTML = `
      <div class="metric-grid">
        <div class="card"><div class="card-title">Gastos</div><div class="card-value negative">${Utils.formatCurrency(d.totalGastos)}</div></div>
        <div class="card"><div class="card-title">Ingresos</div><div class="card-value positive">${Utils.formatCurrency(d.totalIngresos)}</div></div>
        <div class="card"><div class="card-title">Cash Flow</div><div class="card-value ${cfClass}">${Utils.formatCurrency(d.cashFlow)}</div></div>
      </div>
      <div class="two-col-equal">
        <div class="card"><div class="card-title">Top Categorías</div><table><tbody>${(d.topCategories||[]).map(x=>`<tr><td>${x.name}</td><td class="amount">${Utils.formatCurrency(x.total)}</td></tr>`).join('')}</tbody></table></div>
        <div class="card"><div class="card-title">Por Casa</div><table><tbody>${(d.byCasa||[]).map(x=>`<tr><td>${x.name}</td><td class="amount">${Utils.formatCurrency(x.total)}</td></tr>`).join('')}</tbody></table></div>
      </div>`;
  } catch(e) { c.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
}

function loadImportPage() {
  const c = document.getElementById('import-content');
  c.innerHTML = `<div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()"><div class="icon">📁</div><p>Suelte el CSV aquí o haga clic</p></div><input type="file" id="file-input" style="display:none" onchange="handleFileSelect(event)"><div id="import-result" class="hidden"></div>`;
}

// ... Additional loaders (review, rules, etc.) from original pages.js continue here ...

const AppState = {
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  getMonthName: (m) => ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][m],
  prevMonth: function() { this.currentMonth--; if(this.currentMonth < 1){ this.currentMonth = 12; this.currentYear--; } },
  nextMonth: function() { this.currentMonth++; if(this.currentMonth > 12){ this.currentMonth = 1; this.currentYear++; } },
  init: function() { console.log('[App] Initialized'); }
};

const Utils = {
  formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0)
};

function updateMonthSelector() { document.getElementById('month-display').textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`; }
function prevMonth() { AppState.prevMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }
function nextMonth() { AppState.nextMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }

async function initApp() {
  AppState.init(); updateMonthSelector();
  try { AppState.config = await BudgetLogic.loadConfig(); navigateTo('dashboard'); }
  catch(e) { console.error(e); }
}
