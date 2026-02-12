// ============================================================
// Budget App — Master UI Controller (Phase 1 & 2 Complete)
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
  document.getElementById('page-title').textContent = page.charAt(0).toUpperCase() + page.slice(1);

  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'import': loadImportPage(); break;
    case 'review': loadReviewPage(); break;
    case 'rules': loadRulesPage(); break;
  }
}

// --- DASHBOARD (Phase 2 Variance View) ---
async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = '<div class="loading-overlay">Cargando datos...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const cfClass = d.cashFlow >= 0 ? 'positive' : 'negative';
    
    container.innerHTML = `
      <div class="metric-grid">
        <div class="card"><div class="card-title">Gastos Reales</div><div class="card-value negative">${Utils.formatCurrency(d.totalGastos)}</div></div>
        <div class="card"><div class="card-title">Presupuesto</div><div class="card-value" style="color:#666">${Utils.formatCurrency(d.plannedGastos)}</div></div>
        <div class="card"><div class="card-title">Neto (Cash Flow)</div><div class="card-value ${cfClass}">${Utils.formatCurrency(d.cashFlow)}</div></div>
      </div>
      <div class="section">
        <h3 class="section-title">Análisis de Desviación</h3>
        <p>Estás ${d.totalGastos > d.plannedGastos ? 'por encima' : 'por debajo'} de tu presupuesto en <strong>${Utils.formatCurrency(Math.abs(d.plannedGastos - d.totalGastos))}</strong>.</p>
      </div>`;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
  }
}

// --- IMPORT & INGESTION (Phase 2 Multi-Format) ---
function loadImportPage() {
  const config = AppState.config;
  document.getElementById('import-content').innerHTML = `
    <div class="section">
      <div class="card">
        <h3>📥 Importar Movimientos</h3>
        <div class="form-group" style="margin-bottom:20px;">
          <label>1. Seleccionar Cuenta de Origen</label>
          <select id="import-account" class="form-input" style="width:100%; max-width:300px;">
            ${config.cuentas.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        
        <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()" style="border: 2px dashed #ccc; padding: 40px; text-align: center; border-radius: 12px; cursor: pointer;">
          <div style="font-size:32px;">📄</div>
          <p>Haga clic o arrastre un archivo <strong>Excel/CSV</strong></p>
          <span style="font-size:12px; color:#666;">(Revolut, Caixa, Amex, etc.)</span>
        </div>
        <input type="file" id="file-input" style="display:none" onchange="handleFileImport(event)">

        <div style="margin-top:30px; border-top:1px solid #eee; padding-top:20px;">
          <label><strong>2. O Pegar Texto desde PDF</strong></label>
          <textarea id="manual-paste" class="form-input" rows="5" style="width:100%; margin-top:10px;" placeholder="Pega aquí el contenido del PDF..."></textarea>
          <button class="btn btn-primary" onclick="processManualPaste()" style="margin-top:10px;">Procesar Texto</button>
        </div>
      </div>
    </div>`;
}

async function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(firstSheet);
      
      const normalized = rawRows.map(r => ({
        date: r['Fecha'] || r['Date'] || r['F.Valor'] || r['Transaction Date'],
        desc: r['Concepto'] || r['Description'] || r['Reference'] || r['Concept'],
        amount: r['Importe'] || r['Amount'] || r['Value'] || r['Debit/Credit']
      })).filter(r => r.date && r.amount);

      const account = document.getElementById('import-account').value;
      const stats = await BudgetLogic.processImport(normalized, account, file.name);
      
      alert(`Éxito: ${stats.importedGastos} gastos y ${stats.importedIngresos} ingresos importados. (${stats.skipped} duplicados omitidos)`);
      navigateTo('dashboard');
    } catch (err) {
      alert("Error leyendo el archivo: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

async function processManualPaste() {
  const text = document.getElementById('manual-paste').value;
  if (!text) return;
  
  const account = document.getElementById('import-account').value;
  const lines = text.split('\n');
  const extracted = lines.map(line => {
    const parts = line.split(/\t| {2,}/);
    if (parts.length >= 3) {
      return { date: parts[0], desc: parts[1], amount: parts[parts.length - 1].replace(',', '.') };
    }
    return null;
  }).filter(r => r && !isNaN(parseFloat(r.amount)));

  const stats = await BudgetLogic.processImport(extracted, account, "Manual_Paste");
  alert(`Procesado: ${stats.importedGastos} registros importados.`);
  navigateTo('dashboard');
}

// --- REVIEW & RULES STUBS ---
function loadReviewPage() { document.getElementById('review-content').innerHTML = '<div class="card">Módulo de revisión en construcción.</div>'; }
function loadRulesPage() { document.getElementById('rules-content').innerHTML = '<div class="card">Gestión de reglas de auto-categorización.</div>'; }

// --- HELPERS ---
const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  getMonthName: (m) => ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][m],
  prevMonth: function() { this.currentMonth--; if(this.currentMonth < 1){ this.currentMonth=12; this.currentYear--; } },
  nextMonth: function() { this.currentMonth++; if(this.currentMonth > 12){ this.currentMonth=1; this.currentYear++; } }
};

const Utils = {
  formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0),
  showAlert: (m) => alert(m)
};

function updateMonthSelector() { document.getElementById('month-display').textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`; }
function prevMonth() { AppState.prevMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }
function nextMonth() { AppState.nextMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }

async function initApp() {
  updateMonthSelector();
  try { AppState.config = await BudgetLogic.loadConfig(); navigateTo('dashboard'); }
  catch(e) { console.error(e); }
}
