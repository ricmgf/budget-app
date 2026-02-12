// ============================================================
// Budget App — Master UI Controller (World-Class Production)
// ============================================================

const AppState = {
  config: null,
  currentPage: 'dashboard',
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  
  init: function() { 
    updateMonthSelector(); 
  },
  
  getMonthName: (m) => ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][m],
  
  prevMonth: function() { 
    this.currentMonth--; 
    if(this.currentMonth < 1){ this.currentMonth=12; this.currentYear--; } 
  },
  
  nextMonth: function() { 
    this.currentMonth++; 
    if(this.currentMonth > 12){ this.currentMonth=1; this.currentYear++; } 
  }
};

const Utils = {
  formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0),
  showAlert: (m) => alert(m)
};

// --- NAVIGATION ---
function navigateTo(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  
  const target = document.getElementById(`page-${p}`);
  if (target) target.classList.add('active');
  
  const nav = document.querySelector(`[data-page="${p}"]`);
  if (nav) nav.classList.add('active');
  
  AppState.currentPage = p;
  document.getElementById('page-title').textContent = p.charAt(0).toUpperCase() + p.slice(1);

  if (p === 'dashboard') loadDashboard();
  if (p === 'import') loadImportPage();
  if (p === 'review') loadReviewPage();
  if (p === 'rules') loadRulesPage();
  if (p === 'reporting') loadReportingPage();
  if (p === 'balances') loadBalancesPage();
  if (p === 'settings') loadSettingsPage();
}

// --- DASHBOARD ---
async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = '<div class="loading-overlay">Sincronizando...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const cfClass = d.cashFlow >= 0 ? 'positive' : 'negative';
    
    container.innerHTML = `
      <div class="metric-grid">
        <div class="card" onclick="navigateTo('review')" style="cursor:pointer">
          <h3>Queue de Revisión</h3><h2 style="color:var(--accent)">${d.pendingCount} items</h2>
        </div>
        <div class="card"><h3>Neto (Cash Flow)</h3><h2 class="${cfClass}">${Utils.formatCurrency(d.cashFlow)}</h2></div>
        <div class="card"><h3>Diferencia Plan</h3><h2>${Utils.formatCurrency(d.plannedGastos - d.totalGastos)}</h2></div>
      </div>
      <div class="two-col-equal" style="margin-top:24px;">
        <div class="card">
          <h3>🏦 Plan de Fondeo</h3>
          ${Object.entries(d.fundingPlan).map(([acc, amt]) => `
            <div style="display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid #eee;">
              <span><strong>${acc}</strong></span><span style="font-weight:700;">${Utils.formatCurrency(amt)}</span>
            </div>`).join('')}
        </div>
        <div class="card">
          <h3>📈 Forecast Mensual</h3>
          <p>Previsto: ${Utils.formatCurrency(d.plannedIngresos)} Ingresos</p>
          <p>Previsto: ${Utils.formatCurrency(d.plannedGastos)} Gastos</p>
        </div>
      </div>`;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

// --- REVIEW (DECISION QUEUE) ---
async function loadReviewPage() {
  const container = document.getElementById('review-content');
  container.innerHTML = '<div class="loading-overlay">Entrenando Clasificador...</div>';
  try {
    const all = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
    const pending = all.filter(r => r[GASTOS_COLS.ESTADO] === 'Pendiente');
    
    if (pending.length === 0) {
      container.innerHTML = '<div class="card" style="text-align:center; padding:60px;"><h3>Inbox Zero 🎉</h3><p>Todas tus transacciones están clasificadas.</p></div>';
      return;
    }

    const item = pending[0];
    container.innerHTML = `
      <div class="decision-queue">
        <div class="card" style="border: 2px solid var(--accent);">
          <span class="badge" style="background:#fee2e2; color:#991b1b; padding:4px 12px; border-radius:99px; font-weight:700; font-size:12px;">PENDIENTE</span>
          <h2 style="margin:20px 0;">${item[GASTOS_COLS.CONCEPTO]}</h2>
          <h1 style="font-size:32px; margin-bottom:24px;">${Utils.formatCurrency(item[GASTOS_COLS.IMPORTE])}</h1>
          
          <div class="form-group"><label style="font-weight:700;">Casa</label>
            <div class="chip-group" id="casa-chips">${AppState.config.casas.map(c => `<button class="chip" onclick="selectChip(this, 'casa')">${c}</button>`).join('')}</div>
          </div>
          
          <div class="form-group" style="margin-top:20px;"><label style="font-weight:700;">Categoría</label>
            <div class="chip-group" id="cat-chips">${Object.keys(AppState.config.categorias).map(c => `<button class="chip" onclick="selectChip(this, 'cat')">${c}</button>`).join('')}</div>
          </div>
          
          <button class="btn btn-primary" style="width:100%; margin-top:32px; padding:20px; font-weight:700;" onclick="resolveItem('${item[GASTOS_COLS.CONCEPTO]}')">CREAR REGLA Y GUARDAR</button>
        </div>
      </div>`;
  } catch(e) { container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
}

async function resolveItem(pattern) {
  const casa = document.querySelector('#casa-chips .active')?.textContent;
  const cat = document.querySelector('#cat-chips .active')?.textContent;
  if (!casa || !cat) return alert("Selección incompleta");
  await BudgetLogic.saveRuleAndApply(pattern, cat, "", casa);
  loadReviewPage();
}

function selectChip(el, group) {
  document.querySelectorAll(`#${group}-chips .chip`).forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

// --- IMPORT ---
function loadImportPage() {
  document.getElementById('import-content').innerHTML = `
    <div class="card">
      <h3>📥 Ingestión de Movimientos</h3>
      <div class="upload-zone" onclick="document.getElementById('f').click()" style="border:2px dashed #cbd5e1; padding:60px; text-align:center; border-radius:16px; cursor:pointer; background:var(--bg-secondary);">
        <p style="font-weight:700; font-size:18px;">Subir archivo Excel o CSV</p>
        <p style="color:var(--text-secondary); font-size:14px;">Revolut, Caixa, Amex, etc.</p>
      </div>
      <input type="file" id="f" style="display:none" onchange="handleFileImport(event)">
    </div>`;
}

async function handleFileImport(e) {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = async (evt) => {
    const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    const normalized = rows.map(r => ({ date: r['Fecha']||r['Date'], desc: r['Concepto']||r['Description'], amount: r['Importe']||r['Amount'] }));
    await BudgetLogic.processImport(normalized, "Importación", file.name);
    navigateTo('review');
  };
  reader.readAsArrayBuffer(file);
}

// --- STUBS (Restoring missing menus) ---
function loadRulesPage() { document.getElementById('rules-content').innerHTML = '<div class="card"><h3>⚙️ Reglas</h3><p>Gestión de automatización.</p></div>'; }
function loadReportingPage() { document.getElementById('reporting-content').innerHTML = '<div class="card"><h3>📈 Reportes</h3><p>Análisis anual.</p></div>'; }
function loadBalancesPage() { document.getElementById('balances-content').innerHTML = '<div class="card"><h3>🏦 Saldos</h3><p>Saldos bancarios.</p></div>'; }
function loadSettingsPage() { document.getElementById('settings-content').innerHTML = '<div class="card"><h3>🔧 Ajustes</h3><p>Configuración de categorías.</p></div>'; }

// --- HELPERS ---
function updateMonthSelector() { 
  const el = document.getElementById('month-display');
  if (el) el.textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`; 
}
function prevMonth() { AppState.prevMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }
function nextMonth() { AppState.nextMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }

async function initApp() {
  AppState.init(); // Fixed: Added month rendering on init
  try { 
    AppState.config = await BudgetLogic.loadConfig(); 
    navigateTo('dashboard'); 
  } catch(e) { console.error(e); }
}
