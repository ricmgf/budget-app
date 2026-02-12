// ============================================================
// Budget App — Master UI Controller (Final Stage 3)
// ============================================================

const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
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
  
  if (p === 'dashboard') loadDashboard();
  if (p === 'import') loadImportPage();
  if (p === 'review') loadReviewPage();
}

async function loadDashboard() {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = '<div class="loading-overlay">Calculando Cash Flow...</div>';
  const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
  
  container.innerHTML = `
    <div class="metric-grid">
      <div class="card" onclick="navigateTo('review')" style="cursor:pointer">
        <h3>Inbox Queue</h3><h2 style="color:var(--accent)">${d.pendingCount} items</h2>
      </div>
      <div class="card">
        <h3>Cash Flow</h3><h2 class="${d.cashFlow >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(d.cashFlow)}</h2>
      </div>
      <div class="card">
        <h3>Presupuesto vs Real</h3><h2>${Utils.formatCurrency(d.plannedGastos - d.totalGastos)}</h2>
      </div>
    </div>
    
    <div class="two-col-equal" style="margin-top:24px;">
      <div class="card">
        <h3>🏦 Plan de Fondos</h3>
        <p style="font-size:13px; color:var(--text-secondary); margin-bottom:16px;">Transferencias necesarias para cubrir obligaciones.</p>
        ${Object.entries(d.fundingPlan).map(([acc, amt]) => `
          <div style="display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid #eee;">
            <span>Fondeo <strong>${acc}</strong></span>
            <span style="font-weight:700;">${Utils.formatCurrency(amt)}</span>
          </div>
        `).join('')}
      </div>
      <div class="card">
        <h3>📈 Resumen de Planificación</h3>
        <div style="margin-top:16px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span>Ingresos Previstos</span><span>${Utils.formatCurrency(d.plannedIngresos)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span>Gastos Previstos</span><span>${Utils.formatCurrency(d.plannedGastos)}</span>
          </div>
        </div>
      </div>
    </div>`;
}

// ... (Rest of Ingestion and Decision Queue logic from Stage 2 remains exactly the same) ...

async function loadReviewPage() {
  const container = document.getElementById('review-content');
  container.innerHTML = '<div class="loading-overlay">Cargando Decision Queue...</div>';
  const all = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
  const pending = all.filter(r => r[GASTOS_COLS.ESTADO] === 'Pendiente');
  
  if (pending.length === 0) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:60px;"><h3>Inbox Zero 🎉</h3><p>Tu clasificador está al día.</p></div>';
    return;
  }

  const item = pending[0];
  container.innerHTML = `
    <div class="decision-queue">
      <div class="card" style="border: 2px solid var(--accent);">
        <span class="badge">Pendiente</span>
        <h2 style="margin:20px 0;">${item[GASTOS_COLS.CONCEPTO]}</h2>
        <h1>${Utils.formatCurrency(item[GASTOS_COLS.IMPORTE])}</h1>
        <div class="form-group"><label>Casa</label><div class="chip-group" id="casa-chips">${AppState.config.casas.map(c => `<button class="chip" onclick="selectChip(this, 'casa')">${c}</button>`).join('')}</div></div>
        <div class="form-group" style="margin-top:20px;"><label>Categoría</label><div class="chip-group" id="cat-chips">${Object.keys(AppState.config.categorias).map(c => `<button class="chip" onclick="selectChip(this, 'cat')">${c}</button>`).join('')}</div></div>
        <button class="btn btn-primary" style="width:100%; margin-top:30px; padding:20px;" onclick="resolveItem('${item[GASTOS_COLS.CONCEPTO]}')">Entrenar Regla</button>
      </div>
    </div>`;
}

// ... (Rest of helpers) ...
function loadImportPage() {
  document.getElementById('import-content').innerHTML = `
    <div class="card">
      <h3>📥 Ingestión de Extractos</h3>
      <div class="upload-zone" onclick="document.getElementById('f').click()">
        <p>Seleccionar Excel o CSV</p>
      </div>
      <input type="file" id="f" style="display:none" onchange="handleFileImport(event)">
    </div>`;
}

async function resolveItem(pattern) {
  const casa = document.querySelector('#casa-chips .active')?.textContent;
  const cat = document.querySelector('#cat-chips .active')?.textContent;
  if (!casa || !cat) return alert("Selecciona Casa y Categoría");
  await BudgetLogic.saveRuleAndApply(pattern, cat, "", casa);
  loadReviewPage();
}

function selectChip(el, group) {
  document.querySelectorAll(`#${group}-chips .chip`).forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

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

function updateMonthSelector() { document.getElementById('month-display').textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`; }
function prevMonth() { AppState.prevMonth(); updateMonthSelector(); navigateTo('dashboard'); }
function nextMonth() { AppState.nextMonth(); updateMonthSelector(); navigateTo('dashboard'); }

async function initApp() {
  try { AppState.config = await BudgetLogic.loadConfig(); navigateTo('dashboard'); } catch(e) { console.error(e); }
}
