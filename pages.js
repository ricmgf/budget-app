/**
 * [ARCHIVO_MAESTRO_V2.0.2]
 * NO SIMPLIFICAR: CONTIENE TODA LA LÓGICA DE PASTILLAS, BANCOS Y D&D.
 */
const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard', settingsTab: 'bancos', sidebarCollapsed: false,
  initUI: function() {
    const el = document.getElementById('month-display');
    if (el) {
      const mNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      el.textContent = `${mNames[this.currentMonth]} ${this.currentYear}`;
    }
    const btn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('main-sidebar');
    if (btn && sidebar) {
      btn.onclick = () => {
        this.sidebarCollapsed = !this.sidebarCollapsed;
        sidebar.classList.toggle('collapsed');
        btn.innerHTML = this.sidebarCollapsed ? '›' : '‹';
      };
    }
  }
};

const Utils = { formatCurrency: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0) };

window.navigateTo = function(p) {
  AppState.currentPage = p;
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  document.getElementById(`page-${p}`).classList.add('active');
  const nav = document.querySelector(`[data-page="${p}"]`);
  if (nav) nav.classList.add('active');
  
  if (p === 'dashboard') loadDashboard();
  else if (p === 'settings') loadSettingsPage();
  else if (p === 'import') loadImportPage();
  else if (p === 'review') loadReviewPage();
  else if (p === 'balances') loadBalancesPage();
  else if (p === 'reporting') loadReportingPage();
  else if (p === 'rules') loadRulesPage();
};

window.nextMonth = () => { AppState.currentMonth === 12 ? (AppState.currentMonth = 1, AppState.currentYear++) : AppState.currentMonth++; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };
window.prevMonth = () => { AppState.currentMonth === 1 ? (AppState.currentMonth = 12, AppState.currentYear--) : AppState.currentMonth--; AppState.initUI(); if (AppState.currentPage === 'dashboard') loadDashboard(); };

async function loadDashboard() {
  const c = document.getElementById('dashboard-content');
  if (!c) return;
  c.innerHTML = 'Cargando...';
  try {
    const d = await BudgetLogic.getDashboardData(AppState.currentYear, AppState.currentMonth);
    const neto = d.resumen.totalIngresos - d.resumen.totalGastos;
    const netoColor = neto >= 0 ? 'var(--positive)' : 'var(--negative)';
    c.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;">
        <div class="card" onclick="navigateTo('review')" style="cursor:pointer">
          <h3 style="color:var(--text-secondary); font-size:14px; margin:0;">Queue</h3>
          <div class="metric-value" style="color:var(--accent);">${d.pendingCount || 0}</div>
        </div>
        <div class="card">
          <h3 style="color:var(--text-secondary); font-size:14px; margin:0;">Neto Mes</h3>
          <div class="metric-value" style="color:${netoColor};">${Utils.formatCurrency(neto)}</div>
        </div>
        <div class="card">
          <h3 style="color:var(--text-secondary); font-size:14px; margin:0;">Variación Plan</h3>
          <div class="metric-value">${Utils.formatCurrency((d.plannedGastos || 0) - d.resumen.totalGastos)}</div>
        </div>
      </div>`;
  } catch (e) { c.innerHTML = 'Error'; }
}

function loadImportPage() {
  const container = document.getElementById('import-content');
  container.innerHTML = `
    <div class="card" style="max-width: 800px; margin: 0 auto; text-align: center;">
      <h3 style="margin-bottom:24px;">Importar Extractos</h3>
      <div id="drop-zone" style="border: 2px dashed #cbd5e1; border-radius: 16px; padding: 60px; background: #f8fafc; cursor: pointer; transition: 0.2s;">
        <div style="font-size: 48px; margin-bottom: 16px;">📂</div>
        <p style="font-weight: 600;">Arrastra tus archivos aquí</p>
        <p style="color: #64748b; font-size: 13px;">o haz clic para seleccionar</p>
        <input type="file" id="file-import" style="display:none" multiple>
        <button class="btn-primary" style="margin-top:20px;" onclick="document.getElementById('file-import').click()">Seleccionar Archivos</button>
      </div>
    </div>`;
  const dz = document.getElementById('drop-zone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.background = '#eff6ff'; dz.style.borderColor = '#2563eb'; });
  dz.addEventListener('dragleave', () => { dz.style.background = '#f8fafc'; dz.style.borderColor = '#cbd5e1'; });
  dz.addEventListener('drop', (e) => { e.preventDefault(); alert("Archivos detectados"); });
}

async function loadSettingsPage() {
  const c = document.getElementById('settings-content');
  const header = `
    <div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
      ${['bancos', 'categorias', 'casas'].map(t => `
        <a href="#" onclick="setSettingsTab('${t}'); return false;" style="padding:12px 0; font-weight:700; text-decoration:none; color:${AppState.settingsTab === t ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === t ? 'var(--accent)' : 'transparent'}">${t.toUpperCase()}</a>
      `).join('')}
    </div>`;
  
  if (AppState.settingsTab === 'categorias') renderCategoriasTab(c, header, AppState.config.categorias);
  else if (AppState.settingsTab === 'casas') renderCasasTab(c, header, AppState.config.casas);
  else renderBancosTab(c, header, AppState.config.casas);
}

function renderBancosTab(container, header, casas) {
  SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS).then(accs => {
    container.innerHTML = `${header}
      <div class="card">
        <table style="width:100%; border-collapse:collapse;">
          <thead style="text-align:left; color:var(--text-secondary); font-size:13px; border-bottom:1px solid var(--border-light);">
            <tr><th style="padding:12px;">Nombre</th><th>IBAN</th><th>Tipo</th><th>Casa</th></tr>
          </thead>
          <tbody>
            ${accs.slice(1).map(a => `
              <tr style="border-bottom:1px solid #f8fafc;">
                <td style="padding:12px; font-weight:600;">${a[0]||''}</td>
                <td style="font-family:monospace;">${a[1]||''}</td>
                <td>${a[2]||''}</td> <td><span style="background:var(--accent-subtle); color:var(--accent); padding:2px 8px; border-radius:4px; font-size:12px;">${a[3]||'Global'}</span></td> </tr>`).join('')}
          </tbody>
        </table>
        <div style="margin-top:32px; padding:20px; background:#f8fafc; border-radius:12px;">
          <h4 style="margin:0 0 16px 0;">Añadir Banco</h4>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
            <input type="text" id="new-bank-name" placeholder="Nombre" style="padding:8px; border-radius:6px; border:1px solid #cbd5e1;">
            <input type="text" id="new-bank-iban" placeholder="IBAN" style="padding:8px; border-radius:6px; border:1px solid #cbd5e1;">
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
            <select id="new-bank-type" style="padding:8px; border-radius:6px;"><option>Corriente</option><option>Tarjeta</option></select>
            <select id="new-bank-casa" style="padding:8px; border-radius:6px;">${casas.map(c => `<option>${c.name}</option>`).join('')}</select>
            <button class="btn-primary" onclick="addNewBank()">Guardar</button>
          </div>
        </div>
      </div>`;
  });
}

function renderCategoriasTab(container, header, cats) {
  let html = `${header}<div class="card"><div class="flex-between mb-6"><h3>Categorías</h3><button class="btn-primary" onclick="addCategoryMaster()">+ Nueva</button></div>`;
  Object.keys(cats).forEach(cat => {
    html += `
      <div style="padding:24px; background:#fafafa; border-radius:12px; border:1px solid #f1f5f9; margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:16px;">
          <strong style="font-size:16px;">${cat}</strong>
          <div style="font-size:13px;"><a href="#" onclick="renameCategoryMaster('${cat}')" style="color:var(--accent); text-decoration:none;">Editar</a> | <a href="#" onclick="deleteCategoryMaster('${cat}')" style="color:var(--negative); text-decoration:none;">Eliminar</a></div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:10px;">
          ${cats[cat].map(sub => `
            <span style="display:inline-flex; align-items:center; background:white; border:1px solid #e2e8f0; padding:5px 12px; border-radius:20px; font-size:13px;">
              ${sub}<button onclick="deleteSubcategory('${cat}', '${sub}')" style="margin-left:8px; border:none; background:none; color:#cbd5e1; cursor:pointer; font-size:18px;">&times;</button>
            </span>`).join('')}
          <button onclick="addSubcategory('${cat}')" style="padding:5px 15px; font-size:13px; color:var(--accent); border:1px dashed var(--accent); border-radius:20px; background:none; cursor:pointer;">+ Añadir</button>
        </div>
      </div>`;
  });
  container.innerHTML = html + `</div>`;
}

function renderCasasTab(container, header, casas) {
  container.innerHTML = `${header}<div class="card"><div class="flex-between mb-6"><h3>Casas</h3><button class="btn-primary" onclick="addCasaMaster()">+ Nueva</button></div>
    ${casas.map(c => `
      <div style="background:#fff; border:1px solid #f1f5f9; border-radius:12px; padding:20px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 4px rgba(0,0,0,0.02); margin-bottom:12px;">
        <span style="font-weight:600; color:var(--accent);">${c.name}</span>
        <div style="font-size:13px;"><a href="#" onclick="renameCasaMaster(${c.row}, '${c.name}')" style="color:var(--accent); text-decoration:none;">Editar</a> | <a href="#" onclick="deleteCasaMaster(${c.row})" style="color:var(--negative); text-decoration:none;">Eliminar</a></div>
      </div>`).join('')}</div>`;
}

async function initApp() {
  try {
    await BudgetLogic.loadConfig();
    AppState.initUI();
    window.navigateTo('dashboard');
  } catch(e) { console.error(e); }
}

window.setSettingsTab = (t) => { AppState.settingsTab = t; loadSettingsPage(); };
window.addNewBank = async function() { 
  const n = document.getElementById('new-bank-name').value, i = document.getElementById('new-bank-iban').value, t = document.getElementById('new-bank-type').value, c = document.getElementById('new-bank-casa').value;
  if (n) { await SheetsAPI.appendRow(CONFIG.SHEETS.ACCOUNTS, [n, i, t, c]); loadSettingsPage(); }
};
function loadReviewPage() { document.getElementById('review-content').innerHTML = `<div class="card"><h3>Review</h3></div>`; }
function loadBalancesPage() { document.getElementById('balances-content').innerHTML = `<div class="card"><h3>Balances</h3></div>`; }
function loadReportingPage() { document.getElementById('reporting-content').innerHTML = `<div class="card"><h3>Reporting</h3></div>`; }
function loadRulesPage() { document.getElementById('rules-content').innerHTML = `<div class="card"><h3>Reglas</h3></div>`; }

initApp();
