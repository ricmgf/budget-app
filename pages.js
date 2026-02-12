// ============================================================
// Budget App — Master UI Controller (Final Production v1.2.1)
// ============================================================

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
  const nav = document.querySelector(`[data-page="${p}"]`);
  if (nav) nav.classList.add('active');
  document.getElementById('page-title').textContent = p.charAt(0).toUpperCase() + p.slice(1);
  if (p === 'dashboard') loadDashboard();
  if (p === 'import') loadImportPage();
  if (p === 'review') loadReviewPage();
}

async function loadDashboard() {
  const c = document.getElementById('dashboard-content'); 
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando patrimonio...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const cfClass = d.cashFlow >= 0 ? 'positive' : 'negative';
    
    c.innerHTML = `
      <div class="metric-grid">
        <div class="card" onclick="navigateTo('review')" style="cursor:pointer">
          <h3>Queue</h3><h2 style="color:var(--accent)">${d.pendingCount} items</h2>
        </div>
        <div class="card"><h3>Neto Mes</h3><h2 class="${cfClass}">${Utils.formatCurrency(d.cashFlow)}</h2></div>
        <div class="card"><h3>Variación Plan</h3><h2 class="${(d.plannedGastos - d.totalGastos) >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(d.plannedGastos - d.totalGastos)}</h2></div>
      </div>
      <div class="two-col-equal">
        <div class="card">
          <h3>🏦 Funding Plan</h3>
          ${Object.entries(d.fundingPlan).map(([acc, amt]) => `
            <div style="display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid var(--border-light);">
              <span style="font-size:14px;">Mover a <strong>${acc}</strong></span>
              <span style="font-weight:700;">${Utils.formatCurrency(amt)}</span>
            </div>`).join('')}
        </div>
        <div class="card">
          <h3>📈 Forecast Mensual</h3>
          <div style="margin-top:12px;">
            <p style="display:flex; justify-content:space-between;"><span>Previsto In:</span> <strong>${Utils.formatCurrency(d.plannedIngresos)}</strong></p>
            <p style="display:flex; justify-content:space-between;"><span>Previsto Out:</span> <strong>${Utils.formatCurrency(d.plannedGastos)}</strong></p>
          </div>
        </div>
      </div>`;
  } catch(e) { c.innerHTML = `Error: ${e.message}`; }
}

async function loadReviewPage() {
  const c = document.getElementById('review-content');
  c.innerHTML = '<div style="padding:40px; text-align:center;">Cargando Decision Queue...</div>';
  const all = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
  const pending = all.filter(r => r[GASTOS_COLS.ESTADO] === 'Pendiente');
  if (pending.length === 0) { c.innerHTML = '<div class="card" style="text-align:center; padding:60px;"><h3>Inbox Zero 🎉</h3></div>'; return; }
  const item = pending[0];
  c.innerHTML = `
    <div class="decision-queue">
      <div class="card" style="border: 2px solid var(--accent);">
        <h2 style="margin:0 0 8px 0;">${item[GASTOS_COLS.CONCEPTO]}</h2>
        <h1 style="margin:0 0 24px 0;">${Utils.formatCurrency(item[GASTOS_COLS.IMPORTE])}</h1>
        <div class="form-group"><label>Casa</label><div class="chip-group" id="casa-chips">${AppState.config.casas.map(c => `<button class="chip" onclick="selectChip(this, 'casa')">${c}</button>`).join('')}</div></div>
        <div class="form-group" style="margin-top:20px;"><label>Categoría</label><div class="chip-group" id="cat-chips">${Object.keys(AppState.config.categorias).map(c => `<button class="chip" onclick="selectChip(this, 'cat')">${c}</button>`).join('')}</div></div>
        <button id="resolve-btn" style="width:100%; margin-top:32px; padding:20px; background:var(--accent); color:#fff; border:none; border-radius:12px; font-weight:700; cursor:pointer;" onclick="resolveItem('${item[GASTOS_COLS.CONCEPTO]}')">ENTRENAR REGLA</button>
      </div>
    </div>`;
}

async function resolveItem(p) {
  const casa = document.querySelector('#casa-chips .active')?.textContent, cat = document.querySelector('#cat-chips .active')?.textContent;
  if (!casa || !cat) return alert("Selecciona Casa y Categoría");
  const btn = document.getElementById('resolve-btn'); btn.disabled = true; btn.textContent = 'Guardando...';
  await BudgetLogic.saveRuleAndApply(p, cat, "", casa); loadReviewPage();
}

function selectChip(el, group) { document.querySelectorAll(`#${group}-chips .chip`).forEach(c => c.classList.remove('active')); el.classList.add('active'); }
function loadImportPage() { document.getElementById('import-content').innerHTML = `<div class="card"><div class="upload-zone" onclick="document.getElementById('f').click()" style="padding:80px; text-align:center; cursor:pointer; background:var(--bg-secondary); border-radius:12px; border:2px dashed var(--border-light);"><h3>📥 Importar XLSX/CSV</h3></div><input type="file" id="f" style="display:none" onchange="handleFileImport(event)"></div>`; }
async function handleFileImport(e) {
  const file = e.target.files[0]; const reader = new FileReader();
  reader.onload = async (evt) => {
    const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    const normalized = rows.map(r => ({ date: r['Fecha']||r['Date'], desc: r['Concepto']||r['Description'], amount: r['Importe']||r['Amount'] }));
    await BudgetLogic.processImport(normalized, "Manual", file.name); navigateTo('review');
  }; reader.readAsArrayBuffer(file);
}

function updateMonthSelector() { document.getElementById('month-display').textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`; }
function prevMonth() { AppState.prevMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }
function nextMonth() { AppState.nextMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }
async function initApp() { AppState.init(); try { AppState.config = await BudgetLogic.loadConfig(); navigateTo('dashboard'); } catch(e) { console.error(e); } }
updateMonthSelector();
