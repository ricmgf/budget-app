// ============================================================
// Budget App — Master UI Controller (v1.25 - UI Hierarchy Fix)
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
  }
};

async function loadSettingsPage() {
  const c = document.getElementById('settings-content');
  if (!c) return;
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando datos con el backend...</div>';
  
  // Garantizamos que los datos de Casas/Categorías están cargados
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
        <h3 style="margin-bottom:24px; font-weight:700; font-size:18px;">Gestión de Cuentas Bancarias</h3>
        <table style="width:100%; text-align:left; border-collapse:collapse;">
          <thead><tr style="color:var(--text-secondary); font-size:11px; text-transform:uppercase; border-bottom:1px solid var(--border-light);"><th style="padding:12px;">Alias</th><th style="padding:12px;">Identificador</th><th style="padding:12px;">Casa</th><th style="padding:12px; text-align:right;">Acciones</th></tr></thead>
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
          <h4 id="form-title" style="font-weight:700; margin-bottom:16px;">Añadir nueva cuenta</h4>
          <div style="display:grid; grid-template-columns: repeat(2,1fr); gap:16px;">
            <input type="text" id="n-alias" placeholder="Alias (Ej: Caixa Nómina)" style="padding:10px; border-radius:8px; border:1px solid #ddd;">
            <input type="text" id="n-id" placeholder="IBAN o Identificador" style="padding:10px; border-radius:8px; border:1px solid #ddd;">
            <select id="n-casa" style="padding:10px; border-radius:8px; border:1px solid #ddd;">
              <option value="">Seleccionar casa...</option>
              ${casas.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
            <select id="n-type" style="padding:10px; border-radius:8px; border:1px solid #ddd;"><option value="Current">Corriente</option><option value="Credit">Crédito</option></select>
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
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:32px;">
        <h3 style="margin:0; font-weight:700; font-size:22px; color:var(--text-primary);">Categorías y Subcategorías</h3>
        <button onclick="addCategory()" style="padding:10px 20px; background:var(--accent); color:white; border:none; border-radius:10px; font-weight:700; cursor:pointer;">+ Nueva Categoría</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${Object.entries(cats).map(([cat, subs]) => `
          <div style="background:#fff; border:1px solid var(--border-light); border-radius:16px; padding:24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; padding-bottom:16px; margin-bottom:16px;">
              <span style="font-weight:700; font-size:18px; color:var(--accent);">${cat}</span>
              <div style="font-size:13px;">
                <a href="#" onclick="renameCategory('${cat}'); return false;" style="color:var(--text-secondary); text-decoration:none;">Editar</a>
                <span style="margin:0 8px; color:#ddd;">|</span>
                <a href="#" onclick="fullDeleteCategory('${cat}'); return false;" style="color:var(--negative); text-decoration:none;">Eliminar</a>
              </div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:10px;">
              ${subs.map(sub => `
                <div style="background:#f1f5f9; padding:8px 14px; border-radius:8px; display:flex; align-items:center; gap:10px; font-size:14px; color:var(--text-primary);">
                  ${sub} <a href="#" onclick="deleteSubcategory('${cat}', '${sub}'); return false;" style="color:#94a3b8; text-decoration:none; font-weight:700;">✕</a>
                </div>`).join('')}
              <button onclick="addSubcategory('${cat}')" style="background:none; border:1px dashed var(--accent); color:var(--accent); padding:6px 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer;">+ subcategoría</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

// --- ARRANQUE SEGURO ---
async function initApp() {
  try {
    // 1. Cargamos configuración (Backend)
    AppState.config = await BudgetLogic.loadConfig(); 
    // 2. Iniciamos UI (Mes)
    AppState.initUI(); 
    // 3. Navegamos (Solo cuando hay datos)
    navigateTo('dashboard'); 
  } catch(e) { 
    console.error("Fallo crítico en el arranque:", e); 
  }
}
