/**
 * Budget Grid Engine v2.1 — Hotfix
 *
 * Fixes from v2.0:
 * - Add/Extract buttons now render in frozen left concept column (always visible)
 * - Number formatting: 1.000,00 (es-ES locale with 2 decimals)
 * - sheetRow bug fixed in logic.js (was using post-filter index)
 * - readSheet now uses UNFORMATTED_VALUE (fixes 1000→1 bug)
 * - No right-side actions column (delete via drawer only)
 * - Tab/Enter/Escape cell navigation
 */

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTHS_FULL = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const NUM_COLS = 24; // 12 months × 2 (plan+real)

const BudgetGrid = {
  accounts: [],
  lines: [],
  summaries: [],
  activeBank: null,

  async init() {
    this.accounts = await BudgetLogic.loadAccounts();
    this.lines = await BudgetLogic.loadBudgetLines(AppState.currentYear);
    this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
    if (this.accounts.length > 0 && !this.activeBank) {
      this.activeBank = this.accounts[0].name;
    }
    this.render();
  },

  async refresh() {
    this.lines = await BudgetLogic.loadBudgetLines(AppState.currentYear);
    this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
    this.render();
  },

  render() {
    const ct = document.getElementById('budget-content');
    if (!ct) return;
    if (this.accounts.length === 0) {
      ct.innerHTML = '<div style="padding:60px; text-align:center;"><p style="font-size:18px; font-weight:600;">No hay bancos configurados</p><p style="color:var(--text-secondary);">Ve a <a href="#" onclick="navigateTo(\'settings\');return false;" style="color:var(--accent);">Ajustes → Bancos</a> para añadir uno.</p></div>';
      return;
    }
    const bk = this.lines.filter(l => l.bank === this.activeBank);
    const G = bk.filter(l => l.section === 'GASTOS').sort((a,b) => a.sortOrder - b.sortOrder);
    const T = bk.filter(l => l.section === 'TARJETAS').sort((a,b) => a.sortOrder - b.sortOrder);
    const I = bk.filter(l => l.section === 'INGRESOS').sort((a,b) => a.sortOrder - b.sortOrder);
    const cm = AppState.currentMonth - 1;
    const acc = this.accounts.find(a => a.name === this.activeBank);
    const sl = this.summaries.filter(s => s.bank === this.activeBank);
    const uncat = [...G,...T,...I].filter(l => !l.casa && !l.categoria).length;

    let h = this._bankTabs(uncat);
    h += '<div class="budget-grid-wrap"><table class="budget-grid">';
    h += this._thead(cm, sl);
    h += '<tbody>';
    h += this._sectionHeader('GASTOS');
    h += this._dataRows(G, cm, sl);
    h += this._addBtn('GASTOS', '+ Añadir gasto');
    h += this._totalRow('Total Gastos', G, cm);
    h += this._sectionHeader('TARJETAS');
    h += this._dataRows(T, cm, sl);
    h += this._addBtn('TARJETAS', '+ Añadir movimiento');
    h += this._actionBtn('+ Importar extracto tarjeta', 'BudgetGrid.openImportCardDrawer()', '#6366f1');
    h += this._totalRow('Total Tarjetas', T, cm);
    h += this._sectionHeader('INGRESOS');
    h += this._dataRows(I, cm, sl);
    h += this._addBtn('INGRESOS', '+ Añadir ingreso');
    h += this._totalRow('Total Ingresos', I, cm);
    h += this._summaryBlock(G, T, I, cm, acc, sl);
    h += '</tbody></table></div>';
    ct.innerHTML = h;
  },

  // ─── RENDER HELPERS ─────────────────────────────────────────

  _bankTabs(uncat) {
    let h = '<div class="budget-bank-tabs">';
    this.accounts.forEach(a => {
      h += `<button class="budget-bank-tab ${a.name===this.activeBank?'active':''}" onclick="BudgetGrid.switchBank('${this._esc(a.name)}')">${a.name}</button>`;
    });
    if (uncat > 0) h += `<span style="margin-left:auto;padding:6px 14px;font-size:12px;font-weight:600;color:var(--danger);background:var(--danger-light);border-radius:20px;">${uncat} sin categorizar</span>`;
    return h + '</div>';
  },

  _thead(cm, sl) {
    let r1 = '<thead><tr><th class="th-concept">Concepto</th>';
    let r2 = '<tr class="sub-header"><th class="th-concept"></th>';
    for (let m = 0; m < 12; m++) {
      const cur = m === cm, closed = this._isClosed(sl, m);
      const c = cur ? 'th-current-month' : (closed ? 'th-closed-month' : '');
      r1 += `<th class="th-month ${c}" colspan="2">${MONTHS[m]}</th>`;
      r2 += `<th class="th-plan ${c}">Plan</th><th class="th-real ${c}">Real</th>`;
    }
    return r1 + '</tr>' + r2 + '</tr></thead>';
  },

  _sectionHeader(name) {
    return `<tr class="bg-section-header"><td class="td-concept td-section-label">${name}</td>${this._emptyCells('bg-section-cell')}</tr>`;
  },

  _dataRows(lines, cm, sl) {
    if (!lines.length) return '';
    let h = '';
    lines.forEach(line => {
      const uc = !line.casa && !line.categoria;
      h += `<tr class="${uc?'uncategorized':''}" data-lid="${line.id}">`;
      h += `<td class="td-concept" ondblclick="BudgetGrid.openDrawer('${line.id}')" title="${this._esc(line.concepto)}${uc?'\n⚠ Sin categorizar — doble clic':''}">${this._esc(line.concepto)||'(vacío)'}</td>`;
      for (let m = 0; m < 12; m++) {
        const cur = m === cm, closed = this._isClosed(sl, m);
        const cls = cur ? 'td-current-month' : (closed ? 'td-closed-month' : '');
        const pv = line.plan[m], rv = line.real[m];
        const rc = rv > 0 && pv > 0 ? (rv > pv ? 'val-over' : (rv < pv ? 'val-under' : '')) : '';
        h += `<td class="editable ${cls}" data-lid="${line.id}" data-type="plan" data-m="${m}" onclick="BudgetGrid.editCell(this)">${this._fmt(pv)}</td>`;
        h += `<td class="editable ${cls} ${rc}" data-lid="${line.id}" data-type="real" data-m="${m}" onclick="BudgetGrid.editCell(this)">${this._fmt(rv)}</td>`;
      }
      h += '</tr>';
    });
    return h;
  },

  _addBtn(section, label) {
    return `<tr class="bg-add-row"><td class="td-concept td-add-btn" onclick="BudgetGrid.addLine('${section}')"><span class="add-row-label">${label}</span></td>${this._emptyCells('')}</tr>`;
  },

  _actionBtn(label, onclick, color) {
    return `<tr class="bg-add-row"><td class="td-concept td-add-btn" onclick="${onclick}"><span class="add-row-label" style="color:${color};">${label}</span></td>${this._emptyCells('')}</tr>`;
  },

  _totalRow(label, lines, cm) {
    let h = `<tr class="bg-total-row"><td class="td-concept td-total-label">${label}</td>`;
    for (let m = 0; m < 12; m++) {
      const cls = m === cm ? 'td-current-month' : '';
      h += `<td class="td-total ${cls}">${this._fmt(lines.reduce((s,l)=>s+(l.plan[m]||0),0), true)}</td>`;
      h += `<td class="td-total ${cls}">${this._fmt(lines.reduce((s,l)=>s+(l.real[m]||0),0), true)}</td>`;
    }
    return h + '</tr>';
  },

  _summaryBlock(G, T, I, cm, acc, sl) {
    const tMin = acc ? acc.targetMinBalance : 0;
    let h = `<tr class="bg-section-header"><td class="td-concept td-section-label" style="border-left-color:#0ea5e9;">RESUMEN${tMin>0?' · Mín: '+this._fmt(tMin,true)+'':''}</td>${this._emptyCells('bg-section-cell')}</tr>`;

    const data = [];
    let prev = 0;
    const fs = sl.find(s => s.month === 1);
    if (fs) prev = fs.saldoInicio;

    for (let m = 0; m < 12; m++) {
      const gP = G.reduce((s,l)=>s+(l.plan[m]||0),0) + T.reduce((s,l)=>s+(l.plan[m]||0),0);
      const gR = G.reduce((s,l)=>s+(l.real[m]||0),0) + T.reduce((s,l)=>s+(l.real[m]||0),0);
      const iP = I.reduce((s,l)=>s+(l.plan[m]||0),0);
      const iR = I.reduce((s,l)=>s+(l.real[m]||0),0);
      data.push({ gP, gR, iP, iR, cfP: iP-gP, cfR: iR-gR, eP: Math.max(0, gP-iP-prev+tMin), eR: Math.max(0, gR-iR-prev+tMin) });
    }

    const defs = [
      { label: 'Total Gastos+Tarjetas', k: 'gP', kr: 'gR' },
      { label: 'Total Ingresos', k: 'iP', kr: 'iR' },
      { label: 'Cashflow Neto', k: 'cfP', kr: 'cfR', color: true },
      { label: 'Envío Necesario', k: 'eP', kr: 'eR', warn: true }
    ];

    defs.forEach(d => {
      h += `<tr class="bg-summary-row"><td class="td-concept td-summary-label">${d.label}</td>`;
      for (let m = 0; m < 12; m++) {
        const cls = m === cm ? 'td-current-month' : '';
        const p = data[m][d.k], r = data[m][d.kr];
        let st = '';
        if (d.color) st = p < 0 ? 'color:var(--danger);' : 'color:var(--success);';
        if (d.warn && p > 0) st = 'color:var(--danger);font-weight:700;';
        h += `<td class="td-summary ${cls}" style="${st}">${p ? this._fmt(p,true) : '-'}</td>`;
        h += `<td class="td-summary ${cls}">${r ? this._fmt(r,true) : '-'}</td>`;
      }
      h += '</tr>';
    });
    return h;
  },

  // ─── FORMAT & UTIL ──────────────────────────────────────────

  _fmt(v, force2) {
    if (!v && v !== 0) return '';
    if (v === 0 && !force2) return '';
    return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  },

  _emptyCells(cls) {
    let h = '';
    for (let i = 0; i < NUM_COLS; i++) h += `<td class="${cls}"></td>`;
    return h;
  },

  _isClosed(sl, m) {
    const s = sl.find(x => x.month === m + 1);
    return s && s.mesCerrado;
  },

  // ─── INTERACTIONS ───────────────────────────────────────────

  switchBank(name) { this.activeBank = name; this.render(); },

  editCell(td) {
    if (td.classList.contains('editing')) return;
    const lid = td.dataset.lid, type = td.dataset.type, m = parseInt(td.dataset.m);
    const line = this.lines.find(l => l.id === lid);
    if (!line) return;

    const val = type === 'plan' ? line.plan[m] : line.real[m];
    td.classList.add('editing');
    td.innerHTML = `<input type="number" step="0.01" value="${val || ''}">`;
    const inp = td.querySelector('input');
    inp.focus(); inp.select();

    const commit = () => this._commitCell(td, inp, lid, type, m);
    inp.addEventListener('blur', commit, { once: true });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); inp.removeEventListener('blur', commit); this._commitCell(td, inp, lid, type, m).then(() => this._nav(td, 'down')); }
      else if (e.key === 'Tab') { e.preventDefault(); inp.removeEventListener('blur', commit); this._commitCell(td, inp, lid, type, m).then(() => this._nav(td, e.shiftKey ? 'left' : 'right')); }
      else if (e.key === 'Escape') { e.preventDefault(); inp.dataset.cancel = '1'; inp.blur(); }
    });
  },

  async _commitCell(td, inp, lid, type, m) {
    if (inp.dataset.cancel === '1') { this.render(); return; }
    const nv = parseFloat(inp.value) || 0;
    const line = this.lines.find(l => l.id === lid);
    if (!line) return;

    if (type === 'plan') {
      line.plan[m] = nv;
      await BudgetLogic.updateBudgetCell(line.sheetRow, BudgetLogic.getPlanCol(m), nv);
    } else {
      line.real[m] = nv;
      await BudgetLogic.updateBudgetCell(line.sheetRow, BudgetLogic.getRealCol(m), nv);
    }
    this.render();
  },

  _nav(td, dir) {
    const tr = td.closest('tr');
    const cells = Array.from(tr.querySelectorAll('td.editable'));
    const idx = cells.indexOf(td);

    setTimeout(() => {
      let target = null;
      if (dir === 'right' && idx + 1 < cells.length) target = cells[idx + 1];
      else if (dir === 'left' && idx - 1 >= 0) target = cells[idx - 1];
      else if (dir === 'down') {
        let next = tr.nextElementSibling;
        while (next && !next.querySelector('td.editable')) next = next.nextElementSibling;
        if (next) {
          const colIdx = Array.from(tr.children).indexOf(td);
          target = next.children[colIdx];
        }
      }
      // After render(), find cell by data attributes
      if (!target || !target.classList.contains('editable')) {
        const lid = td.dataset.lid, type = td.dataset.type, m = td.dataset.m;
        if (dir === 'right') {
          const nm = parseInt(m) + (type === 'plan' ? 0 : 1);
          const nt = type === 'plan' ? 'real' : 'plan';
          target = document.querySelector(`td[data-lid="${lid}"][data-type="${nt}"][data-m="${nm < 12 ? nm : m}"]`);
        }
      }
      if (target && target.classList.contains('editable')) target.click();
    }, 60);
  },

  async addLine(section) {
    const concepto = prompt(`Nuevo concepto (${section}):`);
    if (!concepto || !concepto.trim()) return;
    await BudgetLogic.addBudgetLine(this.activeBank, AppState.currentYear, section, concepto.trim());
    await this.refresh();
  },

  async deleteLine(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    if (!confirm(`¿Eliminar "${line.concepto}"?`)) return;
    await BudgetLogic.deleteBudgetLine(line.sheetRow);
    document.querySelector('.budget-drawer-overlay')?.remove();
    await this.refresh();
  },

  // ─── DRAWER: Edit line ──────────────────────────────────────

  openDrawer(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    const cats = AppState.config ? AppState.config.categorias : {};
    const casas = AppState.config ? AppState.config.casas : [];
    const catKeys = Object.keys(cats);
    const subcats = line.categoria && cats[line.categoria] ? cats[line.categoria] : [];

    const ov = document.createElement('div');
    ov.className = 'budget-drawer-overlay';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };

    ov.innerHTML = `<div class="budget-drawer">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="margin:0;">Editar Línea</h3>
        <button onclick="this.closest('.budget-drawer-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary);">✕</button>
      </div>
      <label>Concepto</label>
      <input id="drawer-concepto" value="${this._esc(line.concepto)}">
      <label>Casa</label>
      <select id="drawer-casa">
        <option value="">— Sin asignar —</option>
        ${casas.map(c=>`<option value="${c.name}" ${line.casa===c.name?'selected':''}>${c.name}</option>`).join('')}
      </select>
      <label>Categoría</label>
      <select id="drawer-cat" onchange="BudgetGrid._updateSubcats()">
        <option value="">— Sin asignar —</option>
        ${catKeys.map(c=>`<option value="${c}" ${line.categoria===c?'selected':''}>${c}</option>`).join('')}
      </select>
      <label>Subcategoría</label>
      <select id="drawer-subcat">
        <option value="">— Sin asignar —</option>
        ${subcats.map(s=>`<option value="${s}" ${line.subcategoria===s?'selected':''}>${s}</option>`).join('')}
      </select>
      <label>Cadencia</label>
      <select id="drawer-cadence">
        ${['variable','monthly','quarterly','annual','one-off'].map(c=>`<option value="${c}" ${line.cadence===c?'selected':''}>${c}</option>`).join('')}
      </select>
      <div class="drawer-actions">
        <button class="btn-cancel" onclick="this.closest('.budget-drawer-overlay').remove()">Cancelar</button>
        <button class="btn-save" onclick="BudgetGrid.saveDrawer('${line.id}')">Guardar</button>
      </div>
      <button class="btn-delete" onclick="BudgetGrid.deleteLine('${line.id}')">Eliminar esta línea</button>
    </div>`;
    document.body.appendChild(ov);
  },

  _updateSubcats() {
    const c = document.getElementById('drawer-cat');
    const s = document.getElementById('drawer-subcat');
    if (!c || !s) return;
    const cats = AppState.config ? AppState.config.categorias : {};
    const opts = cats[c.value] || [];
    s.innerHTML = '<option value="">— Sin asignar —</option>' + opts.map(o => `<option value="${o}">${o}</option>`).join('');
  },

  async saveDrawer(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    const now = new Date().toISOString();
    await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, [
      { row: line.sheetRow, col: 5, value: document.getElementById('drawer-concepto').value },
      { row: line.sheetRow, col: 6, value: document.getElementById('drawer-casa').value },
      { row: line.sheetRow, col: 7, value: document.getElementById('drawer-cat').value },
      { row: line.sheetRow, col: 8, value: document.getElementById('drawer-subcat').value },
      { row: line.sheetRow, col: 9, value: document.getElementById('drawer-cadence').value },
      { row: line.sheetRow, col: 38, value: now }
    ]);
    document.querySelector('.budget-drawer-overlay')?.remove();
    await this.refresh();
  },

  // ─── DRAWER: Import card extract ───────────────────────────

  openImportCardDrawer() {
    const tarjetas = AppState.config ? AppState.config.tarjetas : [];
    const ov = document.createElement('div');
    ov.className = 'budget-drawer-overlay';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };

    ov.innerHTML = `<div class="budget-drawer">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="margin:0;">Importar Extracto Tarjeta</h3>
        <button onclick="this.closest('.budget-drawer-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary);">✕</button>
      </div>
      <label>Tarjeta</label>
      <select id="import-card-name">
        ${tarjetas.length ? tarjetas.map(t => `<option value="${t.name}">${t.name}</option>`).join('') : '<option value="">— No hay tarjetas en CONFIG —</option>'}
      </select>
      <label>Mes</label>
      <select id="import-card-month">
        ${MONTHS_FULL.slice(1).map((m,i) => `<option value="${i+1}" ${i+1===AppState.currentMonth?'selected':''}>${m} ${AppState.currentYear}</option>`).join('')}
      </select>
      <label style="margin-top:20px;">Archivo</label>
      <div class="import-dropzone" id="card-dropzone" onclick="document.getElementById('card-file-input').click()" style="padding:24px 16px;margin-top:8px;">
        <div style="font-size:32px;margin-bottom:8px;">📁</div>
        <div style="font-size:13px;font-weight:600;">Arrastra o haz clic</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">CSV · HTML · XLSX</div>
        <input type="file" id="card-file-input" accept=".csv,.html,.htm,.xls,.xlsx" style="display:none" onchange="BudgetGrid._handleCardFile(this)">
      </div>
      <div id="card-preview" style="margin-top:16px;"></div>
      <div id="card-actions" style="display:none;margin-top:16px;">
        <button class="btn-save" onclick="BudgetGrid._confirmCardImport()" style="width:100%;">Importar movimientos</button>
      </div>
    </div>`;
    document.body.appendChild(ov);

    const dz = document.getElementById('card-dropzone');
    if (dz) {
      dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('dragover'); };
      dz.ondragleave = () => dz.classList.remove('dragover');
      dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('dragover'); if (e.dataTransfer.files.length) this._processCardFile(e.dataTransfer.files[0]); };
    }
  },

  _cardRows: [],

  _handleCardFile(input) { if (input.files.length) this._processCardFile(input.files[0]); },

  async _processCardFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const pv = document.getElementById('card-preview');
    const act = document.getElementById('card-actions');
    pv.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;">Procesando...</div>';

    try {
      let rows = [];
      if (ext === 'csv') rows = await parseCSV(file);
      else if (ext === 'html' || ext === 'htm') rows = await parseHTML(file);
      else if (ext === 'xlsx' || ext === 'xls') rows = await parseXLSX(file);
      else { pv.innerHTML = '<div style="color:var(--danger);">Formato no soportado</div>'; return; }

      this._cardRows = rows;
      if (rows.length <= 1) { pv.innerHTML = '<div style="color:var(--text-secondary);">Sin datos</div>'; return; }

      const hdr = rows[0], data = rows.slice(1, 8);
      pv.innerHTML = `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">${rows.length-1} movimientos</div>
        <div style="overflow-x:auto;border:1px solid var(--border-light);border-radius:6px;max-height:200px;overflow-y:auto;">
        <table class="import-preview-table"><thead><tr>${hdr.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${data.map(r=>`<tr>${r.map(c=>`<td>${c||''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      if (act) act.style.display = 'block';
    } catch (e) {
      pv.innerHTML = `<div style="color:var(--danger);">Error: ${e.message}</div>`;
    }
  },

  async _confirmCardImport() {
    const rows = this._cardRows;
    if (!rows || rows.length <= 1) return;
    const card = document.getElementById('import-card-name').value;
    const month = parseInt(document.getElementById('import-card-month').value);
    const pv = document.getElementById('card-preview');
    if (!card) { alert('Selecciona una tarjeta'); return; }

    pv.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;">Importando...</div>';
    const now = new Date().toISOString();
    const mi = month - 1;
    let count = 0;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      let concepto = '', amount = 0;
      if (r.length >= 3) {
        concepto = r[1] || r[0] || '';
        for (let j = r.length-1; j >= 0; j--) {
          const p = parseFloat(String(r[j]).replace(',','.').replace(/[^\d.-]/g,''));
          if (!isNaN(p) && p !== 0) { amount = Math.abs(p); break; }
        }
      } else if (r.length === 2) {
        concepto = r[0] || '';
        amount = Math.abs(parseFloat(String(r[1]).replace(',','.').replace(/[^\d.-]/g,'')) || 0);
      }
      if (!concepto && !amount) continue;

      const id = BudgetLogic.generateId('BL');
      const plan = new Array(12).fill(0), real = new Array(12).fill(0);
      real[mi] = amount;
      await SheetsAPI.appendRow(CONFIG.SHEETS.BUDGET_LINES, [
        id, this.activeBank, AppState.currentYear, 'TARJETAS', `${card}: ${concepto}`.substring(0,80),
        '', '', '', 'one-off', ...plan, ...real, 'FALSE', 999, 'ACTIVE', now, now
      ]);
      count++;
    }

    pv.innerHTML = `<div style="color:var(--success);font-weight:600;padding:8px;background:var(--success-light);border-radius:6px;">✅ ${count} movimientos importados</div>`;
    document.getElementById('card-actions').style.display = 'none';
    this._cardRows = [];
    setTimeout(() => { document.querySelector('.budget-drawer-overlay')?.remove(); this.refresh(); }, 1200);
  }
};
