// ============================================================
// Budget App — Master UI Controller (Complete)
// ============================================================

const AppState = {
  config: null,
  currentPage: 'dashboard',
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  init: function() { 
    console.log('[App] Initialized'); 
    updateMonthSelector();
  },
  getMonthName: (m) => ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][m],
  prevMonth: function() { this.currentMonth--; if(this.currentMonth < 1){ this.currentMonth=12; this.currentYear--; } },
  nextMonth: function() { this.currentMonth++; if(this.currentMonth > 12){ this.currentMonth=1; this.currentYear++; } }
};

const Utils = {
  formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0),
  showAlert: (m) => alert(m)
};

// --- NAVIGATION ---
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  const pageEl = document.getElementById(`page-${page}`);
  const navEl = document.querySelector(`[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');
  
  AppState.currentPage = page;
  document.getElementById('page-title').textContent = page.charAt(0).toUpperCase() + page.slice(1);

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

// --- PAGE LOADERS ---
async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = '<div class="loading-overlay">Sincronizando datos...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const cfClass = d.cashFlow >= 0 ? 'positive' : 'negative';
    container.innerHTML = `
      <div class="metric-grid">
        <div class="card"><div class="card-title">Gastos Reales</div><div class="card-value negative">${Utils.formatCurrency(d.totalGastos)}</div></div>
        <div class="card"><div class="card-title">Presupuesto</div><div class="card-value" style="color:#666">${Utils.formatCurrency(d.plannedGastos)}</div></div>
        <div class="card"><div class="card-title">Cash Flow</div><div class="card-value ${cfClass}">${Utils.formatCurrency(d.cashFlow)}</div></div>
      </div>
      <div class="section"><h3 class="section-title">Análisis de Desviación</h3>
        <p>Variance: <strong>${Utils.formatCurrency(d.plannedGastos - d.totalGastos)}</strong></p>
      </div>`;
  } catch (err) { container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`; }
}

function loadImportPage() {
  const config = AppState.config;
  document.getElementById('import-content').innerHTML = `
    <div class="card">
      <h3>📥 Ingestión Universal</h3>
      <select id="import-account" class="form-input" style="margin-bottom:20px;">
        ${config.cuentas.map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <div class="upload-zone" onclick="document.getElementById('file-input').click()" style="border:2px dashed #ccc; padding:40px; text-align:center; border-radius:12px; cursor:pointer;">
        <p>Arrastra CSV o Excel aquí</p>
      </div>
      <input type="file" id="file-input" style="display:none" onchange="handleFileImport(event)">
      <div style="margin-top:20px;">
        <label>O pega texto de PDF:</label>
        <textarea id="manual-paste" class="form-input" rows="4" style="width:100%"></textarea>
        <button class="btn btn-primary" onclick="processManualPaste()" style="margin-top:10px">Procesar</button>
      </div>
    </div>`;
}

// Restored missing page loaders
function loadReviewPage() { document.getElementById('review-content').innerHTML = '<div class="card"><h3>✏️ Revisar</h3><p>Pendiente de categorización...</p></div>'; }
function loadRulesPage() { document.getElementById('rules-content').innerHTML = '<div class="card"><h3>⚙️ Reglas</h3><p>Gestión de patrones de auto-mapeo.</p></div>'; }
function loadReportingPage() { document.getElementById('reporting-content').innerHTML = '<div class="card"><h3>📈 Reportes</h3><p>Comparativas mensuales y anuales.</p></div>'; }
function loadBalancesPage() { document.getElementById('balances-content').innerHTML = '<div class="card"><h3>🏦 Saldos</h3><p>Saldos actuales por cuenta.</p></div>'; }
function loadSettingsPage() { document.getElementById('settings-content').innerHTML = '<div class="card"><h3>🔧 Ajustes</h3><p>Configuración de categorías y propiedades.</p></div>'; }

// --- HELPERS ---
async function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    const data = new Uint8Array(evt.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    const normalized = rows.map(r => ({
      date: r['Fecha'] || r['Date'] || r['F.Valor'],
      desc: r['Concepto'] || r['Description'] || r['Concept'],
      amount: r['Importe'] || r['Amount'] || r['Value']
    })).filter(r => r.date && r.amount);
    const stats = await BudgetLogic.processImport(normalized, document.getElementById('import-account').value, file.name);
    alert(`Importado: ${stats.importedGastos} gastos.`); navigateTo('dashboard');
  };
  reader.readAsArrayBuffer(file);
}

async function processManualPaste() {
  const text = document.getElementById('manual-paste').value;
  const extracted = text.split('\n').map(line => {
    const p = line.split(/\t| {2,}/);
    return (p.length >= 3) ? { date: p[0], desc: p[1], amount: p[p.length-1].replace(',','.') } : null;
  }).filter(r => r && !isNaN(parseFloat(r.amount)));
  const stats = await BudgetLogic.processImport(extracted, document.getElementById('import-account').value, "Manual");
  alert(`Importado: ${stats.importedGastos} registros.`); navigateTo('dashboard');
}

function updateMonthSelector() { document.getElementById('month-display').textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`; }
function prevMonth() { AppState.prevMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }
function nextMonth() { AppState.nextMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }

async function initApp() {
  AppState.init();
  try { AppState.config = await BudgetLogic.loadConfig(); navigateTo('dashboard'); }
  catch(e) { console.error(e); }
}
