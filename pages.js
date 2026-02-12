// ============================================================
// Budget App — Master UI Controller (v1.14 - Full Legacy)
// ============================================================

const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard',
  init: function() { updateMonthSelector(); },
  getMonthName: (m) => ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][m],
  prevMonth: function() { this.currentMonth--; if(this.currentMonth < 1){ this.currentMonth=12; this.currentYear--; } },
  nextMonth: function() { this.currentMonth++; if(this.currentMonth > 12){ this.currentMonth=1; this.currentYear++; } }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

function navigateTo(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(`page-${p}`); if (target) target.classList.add('active');
  const nav = document.querySelector(`[data-page="${p}"]`); if (nav) nav.classList.add('active');
  document.getElementById('page-title').textContent = p.charAt(0).toUpperCase() + p.slice(1);
  
  if (p === 'dashboard') loadDashboard();
  else if (p === 'import') loadImportPage();
  else if (p === 'review') loadReviewPage();
  else if (p === 'settings') loadSettingsPage();
  else loadStubPage(p);
}

// --- DASHBOARD ---
async function loadDashboard() {
  const c = document.getElementById('dashboard-content');
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando datos...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    c.innerHTML = `
      <div class="metric-grid">
        <div class="card" onclick="navigateTo('review')" style="cursor:pointer"><h3>Queue</h3><h2 style="color:var(--accent)">${d.pendingCount} items</h2></div>
        <div class="card"><h3>Neto Mes</h3><h2 class="${(d.totalIngresos - d.totalGastos) >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(d.totalIngresos - d.totalGastos)}</h2></div>
        <div class="card"><h3>Variación</h3><h2 class="${(d.plannedGastos - d.totalGastos) >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(d.plannedGastos - d.totalGastos)}</h2></div>
      </div>
      <div class="two-col-equal">
        <div class="card"><h3>🏦 Funding Plan</h3>
          <div style="margin-top:10px;">
            ${Object.entries(d.fundingPlan).map(([acc, amt]) => `
              <div style="display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid var(--border-light);">
                <span>${acc}</span><strong>${Utils.formatCurrency(amt)}</strong>
              </div>`).join('')}
          </div>
        </div>
        <div class="card"><h3>📈 Status</h3><p>Gastos Real: ${Utils.formatCurrency(d.totalGastos)}</p><p>Presupuesto: ${Utils.formatCurrency(d.plannedGastos)}</p></div>
      </div>`;
  } catch(e) { c.innerHTML = '<div class="card">Error al sincronizar datos.</div>'; }
}

// --- SETTINGS (Gestián de Bancos CRUD) ---
async function loadSettingsPage() {
  const c = document.getElementById('settings-content');
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando datos...</div>';
  try {
    const accs = await SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS);
    const casas = AppState.config ? AppState.config.casas : [];
    c.innerHTML = `
      <div class="card">
        <h3>🏦 Bancos Registrados</h3>
        <table style="width:100%; text-align:left; border-collapse:collapse; margin-top:20px;">
          <thead><tr style="font-size:12px; border-bottom:1px solid #eee;"><th>ALIAS</th><th>IDENTIFICADOR</th><th>CASA</th><th>ACCIONES</th></tr></thead>
          <tbody>
            ${accs.slice(1).map((a, i) => `<tr><td style="padding:10px;"><strong>${a[0]}</strong></td><td>${a[1]}</td><td>${a[2]}</td><td><button onclick="deleteAccount(${i+2})">❌</button></td></tr>`).join('')}
          </tbody>
        </table>
        <div style="margin-top:30px; border-top:1px solid #eee; padding-top:20px;">
          <h4>Añadir nuevo banco</h4>
          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:10px; margin-top:10px;">
            <input type="text" id="n-alias" placeholder="Nombre (ej: Caixa)">
            <input type="text" id="n-id" placeholder="IBAN o fragmento">
            <select id="n-casa">${casas.map(cas => `<option value="${cas}">${cas}</option>`).join('')}</select>
            <select id="n-type"><option value="Current">Corriente</option><option value="Credit">Crédito</option></select>
          </div>
          <button onclick="saveAccount()" style="margin-top:15px; padding:10px 20px; background:var(--accent); color:white; border:none; border-radius:8px; cursor:pointer;">Guardar Banco</button>
        </div>
      </div>`;
  } catch (e) { c.innerHTML = '<div class="card">Error al cargar ACCOUNTS.</div>'; }
}

async function deleteAccount(row) { if(confirm("¿Eliminar este banco?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 2, "BORRADO"); loadSettingsPage(); } }
async function saveAccount() { 
  const a = document.getElementById('n-alias').value, id = document.getElementById('n-id').value; 
  if(a && id) { 
    await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [a, id, document.getElementById('n-casa').value, document.getElementById('n-type').value]); 
    loadSettingsPage(); 
  } 
}

// --- REVIEW (Legacy Decision Queue) ---
async function loadReviewPage() {
  const c = document.getElementById('review-content');
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando datos...</div>';
  const all = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
  const pending = all.filter(r => r[GASTOS_COLS.ESTADO] === 'Pendiente');
  if (pending.length === 0) { c.innerHTML = '<div class="card" style="text-align:center; padding:80px;"><h3>Inbox Zero 🎉</h3></div>'; return; }
  const item = pending[0];
  c.innerHTML = `
    <div class="decision-queue" style="max-width:550px; margin:auto;">
      <div class="card" style="border: 2px solid var(--accent);">
        <h3>${item[GASTOS_COLS.CONCEPTO]}</h3><h2>${Utils.formatCurrency(item[GASTOS_COLS.IMPORTE])}</h2>
        <div class="form-group"><label>Propiedad</label><div class="chip-group" id="casa-chips">${AppState.config.casas.map(cas => `<button class="chip" onclick="selectChip(this, 'casa')">${cas}</button>`).join('')}</div></div>
        <div class="form-group" style="margin-top:20px;"><label>Categoría</label><div class="chip-group" id="cat-chips">${Object.keys(AppState.config.categorias).map(cat => `<button class="chip" onclick="selectChip(this, 'cat')">${cat}</button>`).join('')}</div></div>
        <button style="width:100%; margin-top:30px; padding:20px; background:var(--accent); color:#fff; border:none; border-radius:12px; font-weight:700; cursor:pointer;" onclick="resolveItem('${item[GASTOS_COLS.CONCEPTO]}')">ENTRENAR REGLA</button>
      </div>
    </div>`;
}

async function resolveItem(p) {
  const casa = document.querySelector('#casa-chips .active')?.textContent, cat = document.querySelector('#cat-chips .active')?.textContent;
  if (casa && cat) { await BudgetLogic.saveRuleAndApply(p, cat, "", casa); loadReviewPage(); }
}

function selectChip(el, group) { document.querySelectorAll(`#${group}-chips .chip`).forEach(c => c.classList.remove('active')); el.classList.add('active'); }

// --- IMPORT & OTHERS ---
function loadImportPage() { 
  document.getElementById('import-content').innerHTML = `
    <div class="card"><div class="upload-zone" onclick="document.getElementById('f').click()" style="padding:80px; text-align:center; cursor:pointer; background:var(--bg-canvas); border-radius:24px; border:2px dashed #ddd;">
    <h3>📥 Importar Movimientos</h3><p>Detección automática por ID configurado</p></div><input type="file" id="f" style="display:none" onchange="handleFileImport(event)"></div>`; 
}

async function handleFileImport(e) {
  const file = e.target.files[0]; const reader = new FileReader();
  reader.onload = async (evt) => {
    const rawText = new TextDecoder().decode(evt.target.result);
    const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    const res = await BudgetLogic.processImport(rows, rawText, file.name);
    alert(`Banco Detectado: ${res.account}. Importados: ${res.imported}.`); navigateTo('review');
  }; reader.readAsArrayBuffer(file);
}

function loadStubPage(p) { const cont = document.getElementById(`${p}-content`); if (cont) cont.innerHTML = `<div class="card"><h3>${p}</h3><p>En desarrollo.</p></div>`; }
function updateMonthSelector() { const el = document.getElementById('month-display'); if (el) el.textContent = `${AppState.getMonthName(AppState.currentMonth)} ${AppState.currentYear}`; }
function prevMonth() { AppState.currentMonth--; if(AppState.currentMonth<1){ AppState.currentMonth=12; AppState.currentYear--; } updateMonthSelector(); if(AppState.currentPage === 'dashboard') loadDashboard(); }
function nextMonth() { AppState.currentMonth++; if(AppState.currentMonth>12){ AppState.currentMonth=1; AppState.currentYear++; } updateMonthSelector(); if(AppState.currentPage === 'dashboard') loadDashboard(); }

async function initApp() {
  AppState.init();
  try {
    AppState.config = await BudgetLogic.loadConfig();
    navigateTo('dashboard');
  } catch(e) { console.error("Fallo:", e); }
}
updateMonthSelector();
