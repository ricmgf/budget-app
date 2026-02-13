// ============================================================
// Budget App — Master UI Controller (v1.20 - Enterprise UX)
// ============================================================

async function loadSettingsPage() {
  const c = document.getElementById('settings-content');
  c.innerHTML = '<div style="padding:40px; text-align:center;">Sincronizando datos...</div>';
  
  // Garantizamos carga de datos para los desplegables de Casa
  if (!AppState.config) await BudgetLogic.loadConfig();

  const tabHeader = `
    <div style="display:flex; gap:32px; border-bottom:1px solid var(--border-light); margin-bottom:32px;">
      <a href="#" onclick="setSettingsTab('bancos'); return false;" style="padding:12px 0; text-decoration:none; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'bancos' ? 'var(--accent)' : 'transparent'}">Bancos</a>
      <a href="#" onclick="setSettingsTab('categorias'); return false;" style="padding:12px 0; text-decoration:none; font-weight:700; font-size:15px; color:${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${AppState.settingsTab === 'categorias' ? 'var(--accent)' : 'transparent'}">Categorías</a>
    </div>`;

  if (AppState.settingsTab === 'bancos') await renderBancosTab(c, tabHeader);
  else await renderCategoriasTab(c, tabHeader);
}

async function renderBancosTab(container, header) {
  const accs = await SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS);
  const casas = AppState.config ? AppState.config.casas : [];
  
  container.innerHTML = `
    ${header}
    <div class="card">
      <table style="width:100%; text-align:left; border-collapse:collapse;">
        <thead><tr style="color:var(--text-secondary); font-size:11px; text-transform:uppercase; border-bottom:1px solid var(--border-light);"><th style="padding:12px;">Alias</th><th style="padding:12px;">Identificador</th><th style="padding:12px;">Casa</th><th style="padding:12px; text-align:right;">Acciones</th></tr></thead>
        <tbody>
          ${accs.slice(1).filter(a => a[1] !== 'BORRADO').map((a, i) => `
            <tr style="border-bottom:1px solid #f8fafc;">
              <td style="padding:12px; font-weight:500;">${a[0]}</td>
              <td style="padding:12px; font-family:monospace; font-size:13px;">${a[1]}</td>
              <td style="padding:12px; font-size:13px;">${a[2]}</td>
              <td style="padding:12px; text-align:right; font-size:12px;">
                <a href="#" onclick="editAccount(${i+2},'${a[0]}','${a[1]}','${a[2]}','${a[3]}');return false;" style="color:var(--accent); text-decoration:none;">Editar</a>
                <span style="margin:0 8px; color:#ddd;">|</span>
                <a href="#" onclick="deleteAccount(${i+2});return false;" style="color:var(--negative); text-decoration:none;">Eliminar</a>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div id="acc-form" style="margin-top:40px; padding:24px; background:#f8fafc; border-radius:16px;">
        <h4 id="form-title">Añadir cuenta</h4>
        <div style="display:grid; grid-template-columns: repeat(2,1fr); gap:16px; margin-top:16px;">
          <input type="text" id="n-alias" placeholder="Nombre (Ej: Caixa Nomina)" style="padding:10px; border-radius:8px; border:1px solid #ddd;">
          <input type="text" id="n-id" placeholder="IBAN o fragmento" style="padding:10px; border-radius:8px; border:1px solid #ddd;">
          <select id="n-casa" style="padding:10px; border-radius:8px; border:1px solid #ddd;">
            <option value="">Seleccionar casa...</option>
            ${casas.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <select id="n-type" style="padding:10px; border-radius:8px; border:1px solid #ddd;"><option value="Current">Corriente</option><option value="Credit">Crédito</option></select>
        </div>
        <button onclick="saveAccount()" style="margin-top:20px; padding:12px 32px; background:var(--accent); color:white; border:none; border-radius:12px; font-weight:700; cursor:pointer;">Guardar Banco</button>
      </div>
    </div>`;
}



async function renderCategoriasTab(container, header) {
  const cats = AppState.config.categorias;
  container.innerHTML = `
    ${header}
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h3>Categorías</h3>
        <button onclick="addCategory()" style="padding:8px 16px; background:var(--accent); color:white; border:none; border-radius:8px; cursor:pointer;">+ Nueva Categoría</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${Object.entries(cats).map(([cat, subs]) => `
          <div style="background:#fff; border:1px solid var(--border-light); border-radius:12px; padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; padding-bottom:12px; margin-bottom:12px;">
              <span style="font-weight:700; font-size:16px; color:var(--accent);">${cat}</span>
              <div style="font-size:12px;">
                <a href="#" onclick="renameCategory('${cat}'); return false;" style="color:var(--text-secondary); text-decoration:none;">Editar</a>
                <span style="margin:0 8px; color:#ddd;">|</span>
                <a href="#" onclick="fullDeleteCategory('${cat}'); return false;" style="color:var(--negative); text-decoration:none;">Eliminar</a>
              </div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
              ${subs.map(sub => `
                <div style="background:#f1f5f9; padding:6px 12px; border-radius:6px; display:flex; align-items:center; gap:8px; font-size:13px;">
                  ${sub}
                  <a href="#" onclick="deleteSubcategory('${cat}', '${sub}'); return false;" style="text-decoration:none; color:#94a3b8; font-size:12px;">✕</a>
                </div>
              `).join('')}
              <button onclick="addSubcategory('${cat}')" style="background:none; border:1px dashed var(--accent); color:var(--accent); padding:4px 10px; border-radius:6px; font-size:12px; cursor:pointer;">+ Subcategoría</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

// --- CATEGORY CRUD ACTIONS ---
async function addCategory() {
  const name = prompt("Nombre de la categoría:");
  if (name) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [name, "", "", ""]); await BudgetLogic.loadConfig(); loadSettingsPage(); }
}

async function addSubcategory(cat) {
  const sub = prompt(`Añadir subcategoría a ${cat}:`);
  if (sub) { await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [cat, sub, "", ""]); await BudgetLogic.loadConfig(); loadSettingsPage(); }
}

async function deleteSubcategory(cat, sub) {
  if (confirm(`¿Eliminar subcategoría ${sub}?`)) {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    const idx = rows.findIndex(r => r[0] === cat && r[1] === sub);
    if (idx !== -1) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, idx + 1, 5, 'DELETED'); await BudgetLogic.loadConfig(); loadSettingsPage(); }
  }
}

async function fullDeleteCategory(cat) {
  if (confirm(`¿Eliminar ${cat} y todas sus subcategorías?`)) {
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === cat) { await SheetsAPI.updateCell(CONFIG.SHEETS.CONFIG, i + 1, 5, 'DELETED'); }
    }
    await BudgetLogic.loadConfig(); loadSettingsPage();
  }
}

// ... (Resto del legacy dashboard/review/import se mantiene idéntico a v1.19)
