// ============================================================
// Budget App — Master UI Controller (Production v1.2)
// ============================================================

const AppState = {
  config: null,
  currentPage: 'dashboard',
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  init: function() { updateMonthSelector(); },
  getMonthName: (m) => ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][m],
  prevMonth: function() { this.currentMonth--; if(this.currentMonth < 1){ this.currentMonth=12; this.currentYear--; } },
  nextMonth: function() { this.currentMonth++; if(this.currentMonth > 12){ this.currentMonth=1; this.currentYear++; } }
};

const Utils = {
  formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0)
};

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
}

async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = '<div class="loading-overlay">Sincronizando...</div>';
  const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
  container.innerHTML = `
    <div class="metric-grid">
      <div class="card" onclick="navigateTo('review')" style="cursor:pointer"><h3>Queue</h3><h2 style="color:var(--accent)">${d.pendingCount} items</h2></div>
      <div class="card"><h3>Neto Mes</h3><h2 class="${d.cashFlow >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(d.cashFlow)}</h2></div>
      <div class="card"><h3>Variación</h3><h2>${Utils.formatCurrency(d.plannedGastos - d.totalGastos)}</h2></div>
    </div>
    <div class="two-col-equal" style="margin-top:24px;">
      <div class="card"><h3>🏦 Funding Plan</h3>
        ${Object.entries(d.fundingPlan).map(([acc, amt]) => `<div style="display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid #eee;"><span>Fondeo <strong>${acc}</strong></span><strong>${Utils.formatCurrency(amt)}</strong></div>`).join('')}
      </div>
      <div class="card"><h3>📈 Forecast</h3><p>Planned In: ${Utils.formatCurrency(d.plannedIngresos)}</p><p>Planned Out: ${Utils.formatCurrency(d.plannedGastos)}</p></div>
    </div>`;
}

async function loadReviewPage() {
  const container = document.getElementById('review-content');
  container.innerHTML = '<div class="loading-overlay">Cargando...</div>';
  const all = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
  const pending = all.filter(r => r[GASTOS_COLS.ESTADO] === 'Pendiente');
  if (pending.length === 0) { container.innerHTML = '<div class="card" style="text-align:center; padding:60px;"><h3>Inbox Zero 🎉</h3></div>'; return; }
  const item = pending[0];
  container.innerHTML = `
    <div class="decision-queue">
      <div class="card" style="border: 2px solid var(--accent);">
        <h2 style="margin:20px 0;">${item[GASTOS_COLS.CONCEPTO]}</h2>
        <h1>${Utils.formatCurrency(item[GASTOS_COLS.IMPORTE])}</h1>
        <div class="form-group"><label>Casa</label><div class="chip-group" id="casa-chips">${AppState.config.casas.map(c => `<button class="chip" onclick="selectChip(this, 'casa')">${c}</button>`).join('')}</div></div>
        <div class="form-group" style="margin-top:20px;"><label>Categoría</label><div class="chip-group" id="cat-chips">${Object.keys(AppState.config.categorias).map(c => `<button class="chip" onclick="selectChip(this, 'cat')">${c}</button>`).join('')}</div></div>
        <button class="btn btn-primary" style="width:100%; margin-top:30px; padding:20px;" onclick="resolveItem('${item[GASTOS_COLS.CONCEPTO]}')">Crear Regla Permanente</button>
      </div>
    </div>`;
}

async function resolveItem(pattern) {
  const casa = document.querySelector('#casa-chips .active')?.textContent;
  const cat = document.querySelector('#cat-chips .active')?.textContent;
  if (!casa || !cat) return alert("Selección incompleta");
  await BudgetLogic.saveRuleAndApply(pattern, cat, "", casa);
  loadReviewPage();
}

function selectChip(el, group) { document.querySelectorAll(`#${group}-chips .chip`).forEach(c => c.classList.remove('active')); el.classList.add('active'); }

async function handleFileImport(e) {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = async (evt) => {
    const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    const normalized = rows.map(r => ({ date: r['Fecha']||r['Date'], desc: r['Concepto']||r['Description'], amount: r['Importe']||r['Amount'] }));
    await BudgetLogic.processImport(normalized, "Manual", file.name);
    navigateTo('review');
  };
  reader.readAsArrayBuffer(file);
}

function loadImportPage() {
  document.getElementById('import-content').innerHTML = `<div class="card"><h3>📥 Import</h3><div class="upload-zone" onclick="document.getElementById('f').click()"><p>Subir Excel/CSV</p></div><input type="file" id="f" style="display:none" onchange="handleFileImport(event)"></div>`;
}

function updateMonthSelector() { 
  const el = document.getElementById('month-display');
  if (el) el.textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`; 
}
function prevMonth() { AppState.prevMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }
function nextMonth() { AppState.nextMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }

async function initApp() {
  AppState.init();
  try { AppState.config = await BudgetLogic.loadConfig(); navigateTo('dashboard'); }
  catch(e) { console.error(e); }
}

// Ensure visibility before Auth
updateMonthSelector();
