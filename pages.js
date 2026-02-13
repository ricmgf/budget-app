// ============================================================
// Budget App — Master UI Controller (v1.35 - FULL LEGACY)
// ============================================================

const AppState = {
  config: null, currentYear: new Date().getFullYear(), currentMonth: new Date().getMonth() + 1,
  currentPage: 'dashboard', settingsTab: 'bancos',
  initUI: function() {
    const el = document.getElementById('month-display');
    if (el) {
      const mName = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][this.currentMonth];
      el.textContent = `${mName} ${this.currentYear}`;
    }
  }
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

async function loadSettingsPage() {
  const c = document.getElementById('settings-content');
  if (!c) return;
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando...</div>';
  const freshConfig = await BudgetLogic.loadConfig();

  const tabHeader = `
    <div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
      <a href="#" onclick="setSettingsTab('bancos'); return false;" style="padding:12px 0; text-decoration:none; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'transparent'}">Bancos</a>
      <a href="#" onclick="setSettingsTab('categorias'); return false;" style="padding:12px 0; text-decoration:none; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'transparent'}">Categorías</a>
      <a href="#" onclick="setSettingsTab('casas'); return false;" style="padding:12px 0; text-decoration:none; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'casas' ? 'var(--accent)' : 'transparent'}">Casas</a>
    </div>`;

  if (AppState.settingsTab === 'bancos') renderBancosTab(c, tabHeader, freshConfig.casas);
  else if (AppState.settingsTab === 'categorias') renderCategoriasTab(c, tabHeader, freshConfig.categorias);
  else renderCasasTab(c, tabHeader, freshConfig.casas);
}

function renderCategoriasTab(container, header, cats) {
  container.innerHTML = `
    ${header}
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:32px;">
        <h3 style="margin:0; font-weight:600; font-size:24px; color:var(--text-primary);">Categorías</h3>
        <button onclick="addCategory()" style="padding:10px 24px; background:var(--accent); color:white; border:none; border-radius:10px; font-weight:700; cursor:pointer;">+ Nueva Categoría</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${Object.entries(cats).map(([cat, subs]) => `
          <div style="background:#fff; border:1px solid var(--border-light); border-radius:16px; padding:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid #f1f5f9; padding-bottom:12px;">
              <span style="font-weight:700; font-size:18px; color:var(--accent);">${cat}</span>
              <div style="font-size:13px;"><a href="#" onclick="renameCategory('${cat}');return false;" style="color:var(--text-secondary); text-decoration:none;">Editar</a> | <a href="#" onclick="fullDeleteCategory('${cat}');return false;" style="color:var(--negative); text-decoration:none;">Eliminar</a></div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:10px;">
              ${subs.map(s => `<div style="background:#f1f5f9; padding:8px 14px; border-radius:8px; font-size:14px;">${s} <a href="#" onclick="deleteSubcategory('${cat}','${s}');return false;" style="text-decoration:none; color:#94a3b8; font-weight:700; margin-left:8px;">✕</a></div>`).join('')}
              <button onclick="addSubcategory('${cat}')" style="background:none; border:1px dashed var(--accent); color:var(--accent); padding:8px 16px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer;">+ subcategoría</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderCasasTab(container, header, casas) {
  container.innerHTML = `
    ${header}
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:32px;">
        <h3 style="margin:0; font-weight:600; font-size:24px; color:var(--text-primary);">Casas</h3>
        <button onclick="addCasaMaster()" style="padding:10px 24px; background:var(--accent); color:white; border:none; border-radius:10px; font-weight:700; cursor:pointer;">+ Nueva Casa</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${casas.map(casa => `
          <div style="background:#fff; border:1px solid var(--border-light); border-radius:16px; padding:24px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; font-size:18px; color:var(--accent);">${casa.name}</span>
            <div style="font-size:13px;"><a href="#" onclick="renameCasa('${casa.row}');return false;" style="color:var(--text-secondary); text-decoration:none;">Editar</a> | <a href="#" onclick="deleteCasaMaster('${casa.row}');return false;" style="color:var(--negative); text-decoration:none;">Eliminar</a></div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ARRANQUE SEGURO
async function initApp() {
  try {
    AppState.config = await BudgetLogic.loadConfig();
    AppState.initUI();
    navigateTo('dashboard');
  } catch(e) { console.error("Fallo:", e); }
}
