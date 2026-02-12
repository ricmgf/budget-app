// ============================================================
// Budget App — Master UI Controller (v1.17 - FULL LEGACY)
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

// --- AJUSTES: GESTIÓN DE BANCOS (CRUD REAL + UI MINIMALISTA) ---
async function loadSettingsPage() {
  const c = document.getElementById('settings-content');
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando datos...</div>';
  try {
    const accs = await SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS);
    const casas = AppState.config ? AppState.config.casas : [];
    
    c.innerHTML = `
      <div class="card">
        <h3 style="margin-bottom:8px;">Bancos e Identificadores</h3>
        <p style="color:var(--text-secondary); font-size:14px; margin-bottom:24px;">Configuración de reconocimiento automático para extractos bancarios.</p>
        <table style="width:100%; text-align:left; border-collapse:collapse;">
          <thead>
            <tr style="color:var(--text-secondary); font-size:11px; text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid var(--border-light);">
              <th style="padding:12px;">Alias</th>
              <th style="padding:12px;">ID (IBAN/Card)</th>
              <th style="padding:12px;">Propiedad</th>
              <th style="padding:12px; text-align:right;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${accs.slice(1).map((a, i) => `
              <tr style="border-bottom:1px solid #f8fafc;">
                <td style="padding:12px; font-weight:500;">${a[0]}</td>
                <td style="padding:12px; font-family:monospace; color:var(--text-secondary); font-size:13px;">${a[1]}</td>
                <td style="padding:12px; font-size:13px;">${a[2]}</td>
                <td style="padding:12px; text-align:right; font-size:12px;">
                  <a href="#" onclick="editAccount(${i + 2}, '${a[0]}', '${a[1]}', '${a[2]}', '${a[3]}'); return false;" style="color:var(--accent); text-decoration:none;">Editar</a>
                  <span style="color:var(--border-light); margin:0 8px;">|</span>
                  <a href="#" onclick="deleteAccount(${i + 2}); return false;" style="color:var(--negative); text-decoration:none;">Eliminar</a>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        
        <div id="account-form-container" style="margin-top:40px; padding:24px; background:#f8fafc; border-radius:16px;">
          <h4 id="form-title" style="margin-top:0; margin-bottom:16px;">Añadir nueva cuenta</h4>
          <input type="hidden" id="edit-row-idx" value="">
          <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:16px;">
            <div>
              <label style="display:block; font-size:12px; font-weight:700; margin-bottom:4px; color:var(--text-secondary);">ALIAS</label>
              <input type="text" id="n-alias" placeholder="Ej: Caixa Principal" style="width:100%; padding:10px; border:1px solid var(--border-light); border-radius:8px;">
            </div>
            <div>
              <label style="display:block; font-size:12px; font-weight:700; margin-bottom:4px; color:var(--text-secondary);">IDENTIFICADOR (IBAN)</label>
              <input type="text" id="n-id" placeholder="ES76..." style="width:100%; padding:10px; border:1px solid var(--border-light); border-radius:8px;">
            </div>
            <div>
              <label style="display:block; font-size:12px; font-weight:700; margin-bottom:4px; color:var(--text-secondary);">CASA POR DEFECTO</label>
              <select id="n-casa" style="width:100%; padding:10px; border:1px solid var(--border-light); border-radius:8px;">
                ${casas.map(cas => `<option value="${cas}">${cas}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="display:block; font-size:12px; font-weight:700; margin-bottom:4px; color:var(--text-secondary);">TIPO DE CUENTA</label>
              <select id="n-type" style="width:100%; padding:10px; border:1px solid var(--border-light); border-radius:8px;">
                <option value="Current">Corriente (Nómina)</option>
                <option value="Credit">Crédito (Tarjeta)</option>
              </select>
            </div>
          </div>
          <div style="margin-top:20px;">
            <button id="btn-save-acc" onclick="saveAccount()" style="padding:12px 24px; background:var(--accent); color:white; border:none; border-radius:10px; font-weight:700; cursor:pointer;">Guardar Banco</button>
            <button id="btn-cancel-acc" onclick="resetAccForm()" style="display:none; margin-left:12px; background:none; border:none; color:var(--text-secondary); cursor:pointer; font-weight:500;">Cancelar</button>
          </div>
        </div>
      </div>`;
  } catch (e) { c.innerHTML = '<div class="card">Error al cargar la configuración de cuentas.</div>'; }
}

function editAccount(row, alias, id, casa, type) {
  document.getElementById('form-title').textContent = "Editar: " + alias;
  document.getElementById('edit-row-idx').value = row;
  document.getElementById('n-alias').value = alias;
  document.getElementById('n-id').value = id;
  document.getElementById('n-casa').value = casa;
  document.getElementById('n-type').value = type;
  document.getElementById('btn-save-acc').textContent = "Actualizar Cuenta";
  document.getElementById('btn-cancel-acc').style.display = "inline-block";
  document.getElementById('account-form-container').scrollIntoView({ behavior: 'smooth' });
}

function resetAccForm() {
  document.getElementById('form-title').textContent = "Añadir nueva cuenta";
  document.getElementById('edit-row-idx').value = "";
  document.getElementById('n-alias').value = "";
  document.getElementById('n-id').value = "";
  document.getElementById('btn-save-acc').textContent = "Guardar Banco";
  document.getElementById('btn-cancel-acc').style.display = "none";
}

async function saveAccount() {
  const row = document.getElementById('edit-row-idx').value;
  const alias = document.getElementById('n-alias').value;
  const id = document.getElementById('n-id').value;
  const casa = document.getElementById('n-casa').value;
  const type = document.getElementById('n-type').value;

  if(!alias || !id) return alert("Por favor, completa los campos requeridos.");

  if(row) {
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 1, alias);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 2, id);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 3, casa);
    await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 4, type);
  } else {
    await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [alias, id, casa, type]);
  }
  resetAccForm();
  loadSettingsPage();
}

async function deleteAccount(row) {
  if(!confirm("¿Deseas eliminar este identificador bancario?")) return;
  await SheetsAPI.updateCell(CONFIG.SHEETS.ACCOUNTS, row, 2, "BORRADO_" + Date.now());
  loadSettingsPage();
}

// --- DASHBOARD (LEGACY FUNDING PLAN) ---
async function loadDashboard() {
  const c = document.getElementById('dashboard-content');
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando datos...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    c.innerHTML = `
      <div class="metric-grid">
        <div class="card" onclick="navigateTo('review')" style="cursor:pointer">
          <h3>Inbox Exceptions</h3>
          <h2 style="color:var(--accent)">${d.pendingCount} items</h2>
        </div>
        <div class="card">
          <h3>Neto Mes</h3>
          <h2 class="${(d.totalIngresos - d.totalGastos) >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(d.totalIngresos - d.totalGastos)}</h2>
        </div>
        <div class="card">
          <h3>Variación Plan</h3>
          <h2 class="${(d.plannedGastos - d.totalGastos) >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(d.plannedGastos - d.totalGastos)}</h2>
        </div>
      </div>
      <div class="two-col-equal">
        <div class="card">
          <h3>🏦 Funding Plan</h3>
          <div style="margin-top:10px;">
            ${Object.entries(d.fundingPlan).map(([acc, amt]) => `
              <div style="display:flex; justify-content:space-between
