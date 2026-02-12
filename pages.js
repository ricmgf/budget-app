// ============================================================
// Budget App — Master UI Controller (Complete Phase 1-3)
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
  const target = document.getElementById(`page-${p}`); if (target) target.classList.add('active');
  const nav = document.querySelector(`[data-page="${p}"]`); if (nav) nav.classList.add('active');
  document.getElementById('page-title').textContent = p.charAt(0).toUpperCase() + p.slice(1);
  if (p === 'dashboard') loadDashboard();
  else if (p === 'import') loadImportPage();
  else if (p === 'review') loadReviewPage();
  else loadStubPage(p);
}

async function loadDashboard() {
  const c = document.getElementById('dashboard-content');
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando patrimonio...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const varAmount = d.plannedGastos - d.totalGastos;
    c.innerHTML = `
      <div class="metric-grid">
        <div class="card" onclick="navigateTo('review')" style="cursor:pointer">
          <h3>Inbox Exceptions</h3>
          <h2 style="color:var(--accent)">${d.pendingCount} <span style="font-size:14px; font-weight:400;">items</span></h2>
        </div>
        <div class="card">
          <h3>Neto (Cash Flow)</h3>
          <h2 class="${d.cashFlow >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(d.cashFlow)}</h2>
        </div>
        <div class="card">
          <h3>Variación Plan</h3>
          <h2 class="${varAmount >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(varAmount)}</h2>
        </div>
      </div>
      <div class="two-col-equal">
        <div class="card">
          <h3>🏦 Funding Plan (Transfers)</h3>
          <div style="margin-top:10px;">
            ${Object.entries(d.fundingPlan).length > 0 ? Object.entries(d.fundingPlan).map(([acc, amt]) => `
              <div style="display:flex; justify-content:space-between; padding:14px 0; border-bottom:1px solid var(--border-light);">
                <span style="font-size:14px; font-weight:500;">Fondeo a <strong>${acc}</strong></span>
                <span style="font-weight:700;">${Utils.formatCurrency(amt)}</span>
              </div>`).join('') : '<p style="color:var(--text-secondary); font-size:13px;">No hay transferencias requeridas.</p>'}
          </div>
        </div>
        <div class="card">
          <h3>📈 Forecast Mensual</h3>
          <div style="margin-top:20px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
              <span style="color:var(--text-secondary);">Ingresos Previstos</span>
              <strong>${Utils.formatCurrency(d.plannedIngresos)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:var(--text-secondary);">Gastos Previstos</span>
              <strong>${Utils.formatCurrency(d.plannedGastos)}</strong>
            </div>
          </div>
        </div>
      </div>`;
  } catch(e) { c.innerHTML = `<div class="card" style="color:var(--negative)">Error: ${e.message}</div>`; }
}

async function loadReviewPage() {
  const c = document.getElementById('review-content');
  const all = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
  const pending = all.filter(r => r[GASTOS_COLS.ESTADO] === 'Pendiente');
  if (pending.length === 0) { c.innerHTML = '<div class="card" style="text-align:center; padding:80px;"><h3>Inbox Zero 🎉</h3></div>'; return; }
  const item = pending[0];
  c.innerHTML = `
    <div class="decision-queue" style="max-width:550px; margin:auto;">
      <div class="card" style="border: 2px solid var(--accent);">
        <h2 style="margin:0 0 10px 0; font-size:24px;">${item[GASTOS_COLS.CONCEPTO]}</h2>
        <h1 style="margin:0 0 24px 0;">${Utils.formatCurrency(item[GASTOS_COLS.IMPORTE])}</h1>
        <div class="form-group"><label>Casa</label><div class="chip-group" id="casa-chips">${AppState.config.casas.map(cas => `<button class="chip" onclick="selectChip(this, 'casa')">${cas}</button>`).join('')}</div></div>
        <div class="form-group" style="margin-top:24px;"><label>Categoría</label><div class="chip-group" id="cat-chips">${Object.keys(AppState.config.categorias).map(cat => `<button class="chip" onclick="selectChip(this, 'cat')">${cat}</button>`).join('')}</div></div>
        <button id="resolve-btn" style="width:100%; margin-top:36px; padding:20px; background:var(--accent); color:#fff; border:none; border-radius:14px; font-weight:700; cursor:pointer;" onclick="resolveItem('${item[GASTOS_COLS.CONCEPTO]}')">ENTRENAR REGLA</button>
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
function loadImportPage() { document.getElementById('import-content').innerHTML = `<div class="card"><div class="upload-zone" onclick="document.getElementById('f').click()" style="padding:100px 40px; text-align:center; cursor:pointer; background:var(--bg-canvas); border-radius:24px; border:2px dashed var(--border-light);"><h3>📥 Importar XLSX/CSV</h3></div><input type="file" id="f" style="display:none" onchange="handleFileImport(event)"></div>`; }
async function handleFileImport(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      const normalized = rows.map(r => ({ date: r['Fecha']||r['Date'], desc: r['Concepto']||r['Description'], amount: r['Importe']||r['Amount'] }));
      await BudgetLogic.processImport(normalized, "Manual", file.name); navigateTo('review');
    } catch(err) { alert("Error: " + err.message); }
  }; reader.readAsArrayBuffer(file);
}

function loadStubPage(p) { document.getElementById(`${p}-content`).innerHTML = `<div class="card"><h3>${p}</h3><p style="color:var(--text-secondary);">Módulo en desarrollo.</p></div>`; }
function updateMonthSelector() { document.getElementById('month-display').textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`; }
function prevMonth() { AppState.prevMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }
function nextMonth() { AppState.nextMonth(); updateMonthSelector(); navigateTo(AppState.currentPage); }
async function initApp() { AppState.init(); try { AppState.config = await BudgetLogic.loadConfig(); navigateTo('dashboard'); } catch(e) { console.error(e); } }
updateMonthSelector();
