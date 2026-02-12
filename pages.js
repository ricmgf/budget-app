const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  init: function() { updateMonthSelector(); },
  getMonthName: (m) => ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][m],
  prevMonth: function() { this.currentMonth--; if(this.currentMonth < 1){ this.currentMonth=12; this.currentYear--; } },
  nextMonth: function() { this.currentMonth++; if(this.currentMonth > 12){ this.currentMonth=1; this.currentYear++; } }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

function navigateTo(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  document.getElementById(`page-${p}`).classList.add('active');
  const nav = document.querySelector(`[data-page="${p}"]`); if (nav) nav.classList.add('active');
  document.getElementById('page-title').textContent = p.charAt(0).toUpperCase() + p.slice(1);
  if (p === 'dashboard') loadDashboard();
  if (p === 'import') loadImportPage();
  if (p === 'review') loadReviewPage();
  if (p === 'settings') loadSettingsPage();
}

async function loadDashboard() {
  const c = document.getElementById('dashboard-content');
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando...</div>';
  const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
  c.innerHTML = `
    <div class="metric-grid">
      <div class="card" onclick="navigateTo('review')" style="cursor:pointer"><h3>Queue</h3><h2 style="color:var(--accent)">${d.pendingCount} items</h2></div>
      <div class="card"><h3>Neto Mes</h3><h2 class="${(d.totalIngresos - d.totalGastos) >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(d.totalIngresos - d.totalGastos)}</h2></div>
      <div class="card"><h3>Variación Plan</h3><h2 class="${(d.plannedGastos - d.totalGastos) >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(d.plannedGastos - d.totalGastos)}</h2></div>
    </div>
    <div class="two-col-equal">
      <div class="card"><h3>🏦 Funding Plan</h3>
        ${Object.entries(d.fundingPlan).map(([acc, amt]) => `<div style="display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid var(--border-light);"><span>${acc}</span><strong>${Utils.formatCurrency(amt)}</strong></div>`).join('')}
      </div>
      <div class="card"><h3>📈 Status</h3><p>Gastos: ${Utils.formatCurrency(d.totalGastos)} / ${Utils.formatCurrency(d.plannedGastos)}</p></div>
    </div>`;
}

async function loadSettingsPage() {
  const c = document.getElementById('settings-content');
  const accs = await SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS);
  c.innerHTML = `
    <div class="card">
      <h3>🏦 Bank Registry</h3>
      <p style="color:var(--text-secondary); margin-bottom:20px;">Map identifiers (IBAN/Card #) to aliases for auto-detection.</p>
      <table style="width:100%; text-align:left; border-collapse:collapse;">
        ${accs.slice(1).map(a => `<tr style="border-bottom:1px solid #eee;"><td style="padding:12px;"><strong>${a[0]}</strong></td><td style="font-family:monospace;">${a[1]}</td><td>${a[2]}</td></tr>`).join('')}
      </table>
    </div>`;
}

async function handleFileImport(e) {
  const file = e.target.files[0]; const reader = new FileReader();
  reader.onload = async (evt) => {
    const rawText = new TextDecoder().decode(evt.target.result);
    const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    const res = await BudgetLogic.processImport(rows, rawText, file.name);
    alert(`Detected: ${res.account}. Imported: ${res.imported}.`); navigateTo('dashboard');
  }; reader.readAsArrayBuffer(file);
}

// Classifier Stubs & Helpers
async function loadReviewPage() { /* Same Card Queue logic from previous turns */ }
function loadImportPage() { document.getElementById('import-content').innerHTML = `<div class="card"><div class="upload-zone" onclick="document.getElementById('f').click()"><h3>📥 Upload CSV/XLSX</h3></div><input type="file" id="f" style="display:none" onchange="handleFileImport(event)"></div>`; }
function updateMonthSelector() { document.getElementById('month-display').textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`; }
function prevMonth() { AppState.prevMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }
function nextMonth() { AppState.nextMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }
async function initApp() { AppState.init(); try { AppState.config = await BudgetLogic.loadConfig(); navigateTo('dashboard'); } catch(e) { console.error(e); } }
updateMonthSelector();
