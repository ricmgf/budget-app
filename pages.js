// ============================================================
// Budget App — Master UI Controller (v1.30 - FULL & FIXED)
// ============================================================

const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard', settingsTab: 'bancos',
  initUI: function() {
    const el = document.getElementById('month-display');
    if (el) {
      const monthName = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][this.currentMonth];
      el.textContent = `${monthName} ${this.currentYear}`;
    }
  },
  prevMonth: function() { this.currentMonth--; if(this.currentMonth < 1){ this.currentMonth=12; this.currentYear--; } this.initUI(); if(this.currentPage === 'dashboard') loadDashboard(); },
  nextMonth: function() { this.currentMonth++; if(this.currentMonth > 12){ this.currentMonth=1; this.currentYear++; } this.initUI(); if(this.currentPage === 'dashboard') loadDashboard(); }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

// --- 1. FUNCIONES CORE (Definidas antes de initApp) ---

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

async function loadDashboard() {
  const c = document.getElementById('dashboard-content');
  if (!c) return;
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando datos...</div>';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    c.innerHTML = `
      <div class="metric-grid">
        <div class="card" onclick="navigateTo('review')" style="cursor:pointer"><h3>Queue</h3><h2 style="color:var(--accent)">${d.pendingCount}</h2></div>
        <div class="card"><h3>Neto Mes</h3><h2 class="${(d.totalIngresos - d.totalGastos) >= 0 ? 'positive' : 'negative'}">${Utils.formatCurrency(d.totalIngresos - d.totalGastos)}</h2></div>
        <div class="card"><h3>Variación Plan</h3><h2>${Utils.formatCurrency(d.plannedGastos - d.totalGastos)}</h2></div>
      </div>
      <div class="two-col-equal">
        <div class="card"><h3>🏦 Funding Plan</h3>${Object.entries(d.fundingPlan).map(([acc, amt]) => `<div style="display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid var(--border-light);"><span>${acc}</span><strong>${Utils.formatCurrency(amt)}</strong></div>`).join('')}</div>
        <div class="card"><h3>📈 Status</h3><p>Real: ${Utils.formatCurrency(d.totalGastos)}</p></div>
      </div>`;
  } catch(e) { c.innerHTML = '<div class="card">Error en Dashboard.</div>'; }
}

async function loadSettingsPage() {
  const c = document.getElementById('settings-content');
  if (!c) return;
  c.innerHTML = '<div style="padding:40px; text-align:center;">Cargando configuración...</div>';
  await BudgetLogic.loadConfig();
  const tabHeader = `
    <div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
      <a href="#" onclick="setSettingsTab('bancos'); return false;" style="padding:12px 0; text-decoration:none; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'transparent'}">Bancos</a>
      <a href="#" onclick="setSettingsTab('categorias'); return false;" style="padding:12px 0; text-decoration:none; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'transparent'}">Categorías</a>
    </div>`;
  if (AppState.settingsTab === 'bancos') renderBancosTab(c, tabHeader);
  else renderCategoriasTab(c, tabHeader);
}

function renderCategoriasTab(container, header) {
  container.innerHTML = `
    ${header}
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:32px;">
        <h3 style="margin:0; font-weight:700; font-size:24px; color:var(--text-primary);">Categorías</h3>
        <button onclick="addCategory()" style="padding:10px 24px; background:var(--accent); color:white; border:none; border-radius:10px; font-weight:700; cursor:pointer;">+ Nueva Categoría</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${Object.entries(AppState.config.categorias).map(([cat, subs]) => `
          <div style="border:1px solid var(--border-light); padding:24px; border-radius:16px; background:#fff;">
            <div style="display:flex; justify-content:space-between; margin-bottom:20px; border-bottom:1px solid #f1f5f9; padding-bottom:12px;">
              <span style="font-weight:700; color:var(--accent); font-size:18px;">${cat}</span>
              <div style="font-size:13px;">
                <a href="#" onclick="renameCategory('${cat}');return false;" style="color:var(--text-secondary); text-decoration:none;">Editar</a> | 
                <a href="#" onclick="fullDeleteCategory('${cat}');return false;" style="color:var(--negative); text-decoration:none;">Eliminar</a>
              </div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:10px;">
              ${subs.map(s => `<div style="background:#f1f5f9; padding:8px 14px; border-radius:8px; font-size:14px;">${s} <a href="#" onclick="deleteSubcategory('${cat}','${s}');return false;" style="text-decoration:none; color:#94a3b8; font-weight:700; margin-left:8px;">✕</a></div>`).join('')}
              <button onclick="addSubcategory('${cat}')" style="background:none; border:1px dashed var(--accent); color:var(--accent); padding:8px 16px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer;">+ subcategoría</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderBancosTab(container, header) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    const casas = AppState.config.casas || [];
    container.innerHTML = `
      ${header}
      <div class="card">
        <h3 style="margin-bottom:24px; font-weight:700; font-size:20px;">Bancos</h3>
        <table style="width:100%; text-align:left; border-collapse:collapse;">
          <thead><tr style="color:var(--text-secondary); font-size:11px; text-transform:uppercase; border-bottom:1px solid var(--border-light);"><th style="padding:12px;">Alias</th><th style="padding:12px;">ID</th><th style="padding:12px;">Casa</th><th style="padding:12px; text-align:right;">Acciones</th></tr></thead>
          <tbody>
            ${accs.slice(1).filter(a => a[1] !== 'BORRADO').map((a, i) => `
              <tr style="border-bottom:1px solid #f8fafc;">
                <td style="padding:12px; font-weight:500;">${a[0]}</td><td style="padding:12px; font-family:monospace;">${a[1]}</td><td>${a[2]}</td>
                <td style="padding:12px; text-align:right; font-size:12px;">
                  <a href="#" onclick="editAccount(${i+2},'${a[0]}','${a[1]}','${a[2]}','${a[3]}');return false;" style="color:var(--accent); text-decoration:none;">Editar</a> | 
                  <a href="#" onclick="deleteAccount(${i+2});return false;" style="color:var(--negative); text-decoration:none;">Eliminar</a>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div style="margin-top:40px; padding:24px; background:#f8fafc; border-radius:16px;">
          <h4 style="font-weight:700; margin-bottom:16px;">Añadir cuenta</h4>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
            <input type="text" id="n-alias" placeholder="Alias"><input type="text" id="n-id" placeholder="IBAN">
            <select id="n-casa"><option value="">Seleccionar casa...</option>${casas.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
            <select id="n-type"><option value="Current">Corriente</option><option value="Credit">Crédito</option></select>
          </div>
          <button onclick="saveAccount()" style="margin-top:20px; padding:12px 32px; background:var(--accent); color:white; border:none; border-radius:12px; font-weight:700; cursor:pointer;">Guardar Banco</button>
        </div>
      </div>`;
  });
}

// --- 2. ACCIONES ---
async function addCategory() { const n = prompt("Nombre:"); if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [n, "", "", ""]); await loadSettingsPage(); } }
async function addSubcategory(cat) { const s = prompt(`Subcategoría para ${cat}:`); if (s) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [cat, s, "", ""]); await loadSettingsPage(); } }
async function deleteSubcategory(cat, sub) { if (confirm(`¿Eliminar ${sub}?`)) { const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG); const idx = rows.findIndex(r => r[0] === cat && r[1] === sub); if (idx !== -1) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, idx + 1, 5, 'DELETED'); await loadSettingsPage(); } } }
async function fullDeleteCategory(cat) { if (confirm(`¿Eliminar ${cat}?`)) { const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG); for (let i = 0; i < rows.length; i++) { if (rows[i][0] === cat) await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, i + 1, 5, 'DELETED'); } await loadSettingsPage(); } }

function setSettingsTab(t) { AppState.settingsTab = t; loadSettingsPage(); }
function selectChip(el, group) { document.querySelectorAll(`#${group}-chips .chip`).forEach(c => c.classList.remove('active')); el.classList.add('active'); }

// --- 3. ARRANQUE (Al final) ---
async function initApp() {
  try {
    AppState.config = await BudgetLogic.loadConfig();
    AppState.initUI();
    navigateTo('dashboard');
  } catch(e) { console.error("Error initApp:", e); }
}

function prevMonth() { AppState.prevMonth(); }
function nextMonth() { AppState.nextMonth(); }
