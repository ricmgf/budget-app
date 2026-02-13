// ============================================================
// Budget App — Master UI Controller (v1.22 - Enterprise)
// ============================================================

const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard', settingsTab: 'bancos',
  init: function() { 
    const el = document.getElementById('month-display');
    if (el) el.textContent = `${this.getMonthName(this.currentMonth)} ${this.currentYear}`;
  },
  getMonthName: (m) => ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][m],
  prevMonth: function() { this.currentMonth--; if(this.currentMonth < 1){ this.currentMonth=12; this.currentYear--; } },
  nextMonth: function() { this.currentMonth++; if(this.currentMonth > 12){ this.currentMonth=1; this.currentYear++; } }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

function navigateTo(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const target = document.getElementById(`page-${p}`); 
  if (target) target.classList.add('active');
  const nav = document.querySelector(`[data-page="${p}"]`); 
  if (nav) nav.classList.add('active');
  
  const title = document.getElementById('page-title');
  if (title) title.textContent = p.charAt(0).toUpperCase() + p.slice(1);
  
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
  else if (p === 'review') loadReviewPage();
  else if (p === 'import') loadImportPage();
}

// --- SETTINGS TABS ---
function setSettingsTab(tab) {
  AppState.settingsTab = tab;
  loadSettingsPage();
}

async function loadSettingsPage() {
  const c = document.getElementById('settings-content');
  if (!c) return;
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando datos...</div>';
  
  // RECARGA CRÍTICA: Aseguramos que los datos de Madrid, Mallorca, etc existan antes de pintar
  const freshConfig = await BudgetLogic.loadConfig();

  const tabHeader = `
    <div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
      <a href="#" onclick="setSettingsTab('bancos'); return false;" style="padding:12px 0; text-decoration:none; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'transparent'}">Bancos</a>
      <a href="#" onclick="setSettingsTab('categorias'); return false;" style="padding:12px 0; text-decoration:none; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'transparent'}">Categorías</a>
    </div>`;

  if (AppState.settingsTab === 'bancos') renderBancosTab(c, tabHeader, freshConfig.casas);
  else renderCategoriasTab(c, tabHeader, freshConfig.categorias);
}

function renderBancosTab(container, header, casas) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    container.innerHTML = `
      ${header}
      <div class="card">
        <table style="width:100%; text-align:left; border-collapse:collapse;">
          <thead><tr style="color:var(--text-secondary); font-size:11px; text-transform:uppercase; border-bottom:1px solid var(--border-light);"><th style="padding:12px;">Alias</th><th style="padding:12px;">ID</th><th style="padding:12px;">Casa</th><th style="padding:12px; text-align:right;">Acciones</th></tr></thead>
          <tbody>
            ${accs.slice(1).filter(a => a[1] !== 'BORRADO').map((a, i) => `
              <tr style="border-bottom:1px solid #f8fafc;">
                <td style="padding:12px; font-weight:500;">${a[0]}</td>
                <td style="padding:12px; font-family:monospace;">${a[1]}</td>
                <td style="padding:12px;">${a[2]}</td>
                <td style="padding:12px; text-align:right; font-size:12px;">
                  <a href="#" onclick="editAccount(${i+2},'${a[0]}','${a[1]}','${a[2]}','${a[3]}');return false;" style="color:var(--accent); text-decoration:none;">Editar</a>
                  <span style="margin:0 8px; color:#ddd;">|</span>
                  <a href="#" onclick="deleteAccount(${i+2});return false;" style="color:var(--negative); text-decoration:none;">Eliminar</a>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div id="acc-form" style="margin-top:40px; padding:24px; background:#f8fafc; border-radius:16px;">
          <h4 id="form-title">Gestionar Cuenta</h4>
          <input type="hidden" id="edit-row-idx" value="">
          <div style="display:grid; grid-template-columns: repeat(2,1fr); gap:16px; margin-top:16px;">
            <input type="text" id="n-alias" placeholder="Alias">
            <input type="text" id="n-id" placeholder="IBAN">
            <select id="n-casa">
              <option value="">Seleccionar casa...</option>
              ${casas.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
            <select id="n-type"><option value="Current">Corriente</option><option value="Credit">Crédito</option></select>
          </div>
          <button onclick="saveAccount()" style="margin-top:20px; padding:12px 32px; background:var(--accent); color:white; border:none; border-radius:12px; font-weight:700; cursor:pointer;">Guardar Banco</button>
        </div>
      </div>`;
  });
}

function renderCategoriasTab(container, header, cats) {
  container.innerHTML = `
    ${header}
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h3>Configuración de Categorías</h3>
        <button onclick="addCategory()" style="padding:8px 16px; background:var(--accent); color:white; border:none; border-radius:8px; cursor:pointer;">+ Nueva Categoría</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${Object.entries(cats).map(([cat, subs]) => `
          <div style="background:#fff; border:1px solid var(--border-light); border-radius:12px; padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; padding-bottom:12px; margin-bottom:12px;">
              <span style="font-weight:700; color:var(--accent);">${cat}</span>
              <div style="font-size:12px;">
                <a href="#" onclick="renameCategory('${cat}'); return false;" style="color:var(--text-secondary); text-decoration:none;">Editar</a>
                <span style="margin:0 8px; color:#ddd;">|</span>
                <a href="#" onclick="fullDeleteCategory('${cat}'); return false;" style="color:var(--negative); text-decoration:none;">Eliminar</a>
              </div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
              ${subs.map(sub => `
                <div style="background:#f1f5f9; padding:4px 10px; border-radius:6px; display:flex; align-items:center; gap:8px; font-size:12px;">
                  ${sub} <a href="#" onclick="deleteSubcategory('${cat}', '${sub}'); return false;" style="color:#94a3b8; text-decoration:none;">✕</a>
                </div>`).join('')}
              <button onclick="addSubcategory('${cat}')" style="background:none; border:1px dashed var(--accent); color:var(--accent); padding:4px 8px; border-radius:6px; font-size:11px; cursor:pointer;">+ Sub</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

// --- CATEGORY ACTIONS ---
async function addCategory() {
  const n = prompt("Nombre categoría:");
  if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [n, "", "", ""]); loadSettingsPage(); }
}
async function addSubcategory(cat) {
  const s = prompt(`Subcategoría para ${cat}:`);
  if (s) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [cat, s, "", ""]); loadSettingsPage(); }
}
async function deleteSubcategory(cat, sub) {
  if (confirm(`¿Eliminar ${sub}?`)) {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    const idx = rows.findIndex(r => r[0] === cat && r[1] === sub);
    if (idx !== -1) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, idx + 1, 5, 'DELETED'); loadSettingsPage(); }
  }
}
async function fullDeleteCategory(cat) {
  if (confirm(`¿Eliminar ${cat} completo?`)) {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    for (let i = 0; i < rows.length; i++) { if (rows[i][0] === cat) await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, i + 1, 5, 'DELETED'); }
    loadSettingsPage();
  }
}

// --- BANK ACTIONS ---
function editAccount(row, alias, id, casa, type) {
  document.getElementById('form-title').textContent = "Editar: " + alias;
  document.getElementById('edit-row-idx').value = row;
  document.getElementById('n-alias').value = alias;
  document.getElementById('n-id').value = id;
  document.getElementById('n-casa').value = casa;
  document.getElementById('n-type').value = type;
}
async function saveAccount() {
  const row = document.getElementById('edit-row-idx').value;
  const data = [document.getElementById('n-alias').value, document.getElementById('n-id').value, document.getElementById('n-casa').value, document.getElementById('n-type').value];
  if(row) {
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 1, data[0]);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 2, data[1]);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 3, data[2]);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 4, data[3]);
  } else { await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, data); }
  loadSettingsPage();
}
async function deleteAccount(r) { if(confirm("¿Eliminar?")) { await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, r, 2, "BORRADO"); loadSettingsPage(); } }

// --- DASHBOARD (Legacy Fix) ---
async function loadDashboard() {
  const c = document.getElementById('dashboard-content');
  if (!c) return;
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando datos...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    c.innerHTML = `
      <div class="metric-grid">
        <div class="card" onclick="navigateTo('review')" style="cursor:pointer"><h3>Queue</h3><h2 style="color:var(--accent)">${d.pendingCount}</h2></div>
        <div class="card"><h3>Neto</h3><h2 class="${(d.totalIngresos - d.totalGastos) >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(d.totalIngresos - d.totalGastos)}</h2></div>
        <div class="card"><h3>Variación</h3><h2>${Utils.formatCurrency(d.plannedGastos - d.totalGastos)}</h2></div>
      </div>
      <div class="two-col-equal">
        <div class="card"><h3>🏦 Funding Plan</h3>${Object.entries(d.fundingPlan).map(([acc, amt]) => `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-light);"><span>${acc}</span><strong>${Utils.formatCurrency(amt)}</strong></div>`).join('')}</div>
        <div class="card"><h3>📈 Status</h3><p>Real: ${Utils.formatCurrency(d.totalGastos)}</p></div>
      </div>`;
  } catch(e) { c.innerHTML = '<div class="card">Error al cargar datos.</div>'; }
}

// --- REVIEW, IMPORT, STUBS (Legacy) ---
async function loadReviewPage() {
  const c = document.getElementById('review-content');
  const all = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
  const pending = all.filter(r => r[12] === 'Pendiente');
  if (pending.length === 0) { c.innerHTML = '<div class="card" style="text-align:center; padding:80px;"><h3>Inbox Zero 🎉</h3></div>'; return; }
  const item = pending[0];
  c.innerHTML = `<div class="decision-queue" style="max-width:550px; margin:auto;"><div class="card" style="border: 2px solid var(--accent);"><h3>${item[4]}</h3><h2>${Utils.formatCurrency(item[5])}</h2><div class="form-group"><label>Casa</label><div class="chip-group" id="casa-chips">${AppState.config.casas.map(cas => `<button class="chip" onclick="selectChip(this, 'casa')">${cas}</button>`).join('')}</div></div><div class="form-group" style="margin-top:20px;"><label>Categoría</label><div class="chip-group" id="cat-chips">${Object.keys(AppState.config.categorias).map(cat => `<button class="chip" onclick="selectChip(this, 'cat')">${cat}</button>`).join('')}</div></div><button style="width:100%; margin-top:30px; padding:20px; background:var(--accent); color:#fff; border:none; border-radius:12px; font-weight:700; cursor:pointer;" onclick="resolveItem('${item[4]}')">ENTRENAR REGLA</button></div></div>`;
}
async function resolveItem(p) {
  const casa = document.querySelector('#casa-chips .active')?.textContent, cat = document.querySelector('#cat-chips .active')?.textContent;
  if (casa && cat) { await BudgetLogic.saveRuleAndApply(p, cat, "", casa); loadReviewPage(); }
}
function selectChip(el, group) { document.querySelectorAll(`#${group}-chips .chip`).forEach(c => c.classList.remove('active')); el.classList.add('active'); }
function loadImportPage() { document.getElementById('import-content').innerHTML = `<div class="card"><div class="upload-zone" onclick="document.getElementById('f').click()" style="padding:80px; text-align:center; cursor:pointer; background:var(--bg-canvas); border-radius:24px; border:2px dashed #ddd;"><h3>📥 Importar</h3></div><input type="file" id="f" style="display:none" onchange="handleFileImport(event)"></div>`; }
async function handleFileImport(e) {
  const file = e.target.files[0]; const reader = new FileReader();
  reader.onload = async (evt) => {
    const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    await BudgetLogic.processImport(rows, new TextDecoder().decode(evt.target.result), file.name); navigateTo('review');
  }; reader.readAsArrayBuffer(file);
}
function loadStubPage(p) { const cont = document.getElementById(`${p}-content`); if (cont) cont.innerHTML = `<div class="card"><h3>${p}</h3><p>Sección en desarrollo.</p></div>`; }
function prevMonth() { AppState.prevMonth(); AppState.init(); if(AppState.currentPage === 'dashboard') loadDashboard(); }
function nextMonth() { AppState.nextMonth(); AppState.init(); if(AppState.currentPage === 'dashboard') loadDashboard(); }

// --- ARRANQUE SEGURO ---
async function initApp() {
  try {
    AppState.config = await BudgetLogic.loadConfig(); // Primero datos
    AppState.init(); // Luego UI del mes
    navigateTo('dashboard'); // Finalmente navegación
  } catch(e) { console.error("Error crítico en initApp:", e); }
}
