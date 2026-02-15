/**
 * Budget Grid v3.0 — Option C Premium Dark + Yellow Column
 * All bugs fixed, Buffer + Saldo en Cuenta + Envío Necesario formula
 * ⚠ Does NOT touch bootstrap/auth
 */
const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTHS_FULL = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const BudgetGrid = {
  accounts: [], lines: [], summaries: [], activeBank: null,
  // Buffer & Saldo stored per bank per month in BANK_MONTHLY_SUMMARY
  bankMeta: {}, // { bankName: { buffer: [12], saldo: [12] } }

  async init() {
    this.accounts = await BudgetLogic.loadAccounts();
    this.lines = await BudgetLogic.loadBudgetLines(AppState.currentYear);
    this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
    this._buildMeta();
    if (this.accounts.length > 0 && !this.activeBank) this.activeBank = this.accounts[0].name;
    this.render();
  },

  async refresh() {
    this.lines = await BudgetLogic.loadBudgetLines(AppState.currentYear);
    this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
    this._buildMeta();
    this.render();
  },

  _buildMeta() {
    this.bankMeta = {};
    this.accounts.forEach(a => {
      const buf = new Array(12).fill(0), sal = new Array(12).fill(0);
      this.summaries.filter(s => s.bank === a.name).forEach(s => {
        buf[s.month - 1] = s.buffer || 0;
        sal[s.month - 1] = s.saldoCuenta || 0;
      });
      this.bankMeta[a.name] = { buffer: buf, saldo: sal };
    });
  },

  render() {
    const ct = document.getElementById('budget-content');
    if (!ct) return;
    if (!this.accounts.length) { ct.innerHTML = '<div style="padding:60px;text-align:center;"><p style="font-size:18px;font-weight:600;">No hay bancos configurados</p><p style="color:var(--text-secondary);">Ve a <a href="#" onclick="navigateTo(\'settings\');return false;" style="color:var(--accent);">Ajustes → Bancos</a></p></div>'; return; }

    const bk = this.lines.filter(l => l.bank === this.activeBank);
    const G = bk.filter(l => l.section === 'GASTOS').sort((a,b) => a.sortOrder - b.sortOrder);
    const T = bk.filter(l => l.section === 'TARJETAS').sort((a,b) => a.sortOrder - b.sortOrder);
    const I = bk.filter(l => l.section === 'INGRESOS').sort((a,b) => a.sortOrder - b.sortOrder);
    const cm = AppState.currentMonth - 1;
    const acc = this.accounts.find(a => a.name === this.activeBank);
    const sl = this.summaries.filter(s => s.bank === this.activeBank);
    const unc = [...G,...T,...I].filter(l => !l.casa && !l.categoria).length;

    let h = this._tabs(unc);
    h += '<div class="budget-grid-wrap"><table class="budget-grid">';
    h += this._thead(cm, sl);
    h += '<tbody>';
    h += this._secHdr('GASTOS');
    h += this._rows(G, cm, sl);
    h += this._addBtn('GASTOS', '+ Añadir gasto', '');
    h += this._addBtn('_EXTRACT_BANK', '+ Importar extracto banco', 'purple');
    h += this._totRow('Total Gastos', G, cm);
    h += this._secHdr('TARJETAS');
    h += this._rows(T, cm, sl);
    h += this._addBtn('TARJETAS', '+ Balance manual', '');
    h += this._addBtn('_EXTRACT_CARD', '+ Importar extracto tarjeta', 'purple');
    h += this._totRow('Total Tarjetas', T, cm);
    h += this._secHdr('INGRESOS');
    h += this._rows(I, cm, sl);
    h += this._addBtn('INGRESOS', '+ Añadir ingreso', '');
    h += this._totRow('Total Ingresos', I, cm);
    h += this._summaryBlock(G, T, I, cm, acc, sl);
    h += '</tbody></table></div>';
    ct.innerHTML = h;
  },

  // ══════════ RENDER PARTS ══════════

  _tabs(unc) {
    let h = '<div class="budget-bank-tabs">';
    this.accounts.forEach(a => { h += `<button class="budget-bank-tab ${a.name===this.activeBank?'active':''}" onclick="BudgetGrid.switchBank('${this._e(a.name)}')">${a.name}</button>`; });
    if (unc > 0) h += `<span class="uncat-badge" onclick="BudgetGrid._scrollUncat()">${unc} sin categorizar</span>`;
    return h + '</div>';
  },

  _thead(cm, sl) {
    let r1 = '<thead><tr><th class="th-left"></th>';
    let r2 = '<tr class="sub-hdr"><th class="th-left"></th>';
    for (let m = 0; m < 12; m++) {
      const cur = m === cm, cls = cur ? 'cur-hdr' : '';
      r1 += `<th class="th-month ${cls}" colspan="2">${MONTHS[m]}</th>`;
      r2 += `<th class="${cls}">Plan</th><th class="${cls}">Real</th>`;
    }
    return r1 + '</tr>' + r2 + '</tr></thead>';
  },

  _secHdr(name) {
    return `<tr class="bg-section-hdr"><td class="frozen">${name}</td>${this._ec('sec-cell')}</tr>`;
  },

  _rows(lines, cm, sl) {
    let h = '';
    lines.forEach(line => {
      const uc = !line.casa && !line.categoria;
      h += `<tr class="${uc?'uncat':''}" data-lid="${line.id}">`;
      h += `<td class="frozen" ondblclick="BudgetGrid.openDrawer('${line.id}')" title="${this._e(line.concepto)}${uc?'\n⚠ Sin categorizar':''}">${this._e(line.concepto)||'(vacío)'}</td>`;
      for (let m = 0; m < 12; m++) {
        const c = m === cm ? 'cur' : '';
        const pv = line.plan[m], rv = line.real[m];
        const rc = rv > 0 && pv > 0 ? (rv > pv ? 'val-neg' : (rv < pv ? 'val-pos' : '')) : '';
        h += `<td class="editable ${c}" data-lid="${line.id}" data-t="plan" data-m="${m}" onclick="BudgetGrid.editCell(this)">${this._f(pv)}</td>`;
        h += `<td class="editable ${c} ${rc}" data-lid="${line.id}" data-t="real" data-m="${m}" onclick="BudgetGrid.editCell(this)">${this._f(rv)}</td>`;
      }
      h += '</tr>';
    });
    return h;
  },

  _addBtn(action, label, cls) {
    let onclick = '';
    if (action === '_EXTRACT_BANK') onclick = 'BudgetGrid.openImportDrawer("banco")';
    else if (action === '_EXTRACT_CARD') onclick = 'BudgetGrid.openImportDrawer("tarjeta")';
    else onclick = `BudgetGrid.addLine('${action}')`;
    return `<tr class="bg-add-row"><td class="frozen" onclick="${onclick}"><span class="add-lbl ${cls}">${label}</span></td>${this._ec('')}</tr>`;
  },

  _totRow(label, lines, cm) {
    let h = `<tr class="bg-total"><td class="frozen">${label}</td>`;
    for (let m = 0; m < 12; m++) {
      const c = m === cm ? 'cur' : '';
      h += `<td class="${c}">${this._f(lines.reduce((s,l)=>s+(l.plan[m]||0),0),1)}</td>`;
      h += `<td class="${c}">${this._f(lines.reduce((s,l)=>s+(l.real[m]||0),0),1)}</td>`;
    }
    return h + '</tr>';
  },

  _summaryBlock(G, T, I, cm, acc, sl) {
    const meta = this.bankMeta[this.activeBank] || { buffer: new Array(12).fill(0), saldo: new Array(12).fill(0) };

    let h = `<tr class="bg-section-hdr"><td class="frozen" style="border-left-color:#0ea5e9;">RESUMEN</td>${this._ec('sec-cell')}</tr>`;

    // Precompute
    const d = [];
    for (let m = 0; m < 12; m++) {
      const gP = G.reduce((s,l)=>s+(l.plan[m]||0),0) + T.reduce((s,l)=>s+(l.plan[m]||0),0);
      const gR = G.reduce((s,l)=>s+(l.real[m]||0),0) + T.reduce((s,l)=>s+(l.real[m]||0),0);
      const iP = I.reduce((s,l)=>s+(l.plan[m]||0),0);
      const iR = I.reduce((s,l)=>s+(l.real[m]||0),0);
      const buf = meta.buffer[m] || 0;
      const sal = meta.saldo[m] || 0;
      // Envío = Gastos plan mes SIGUIENTE + Tarjetas real mes actual + Buffer - Saldo Cuenta
      const nextGP = m < 11 ? (G.reduce((s,l)=>s+(l.plan[m+1]||0),0) + T.reduce((s,l)=>s+(l.plan[m+1]||0),0)) : 0;
      const tarjetasReal = T.reduce((s,l)=>s+(l.real[m]||0),0);
      const envio = Math.max(0, nextGP + tarjetasReal + buf - sal);
      d.push({ gP, gR, iP, iR, cf: iP - gP, cfR: iR - gR, buf, sal, envio });
    }

    // Summary rows
    const sumRows = [
      { label: 'Total Gastos+Tarjetas', k: 'gP', kr: 'gR' },
      { label: 'Total Ingresos', k: 'iP', kr: 'iR' },
      { label: 'Cashflow', k: 'cf', kr: 'cfR', color: true },
    ];
    sumRows.forEach(r => {
      h += `<tr class="bg-summ"><td class="frozen">${r.label}</td>`;
      for (let m = 0; m < 12; m++) {
        const c = m === cm ? 'cur' : '';
        const p = d[m][r.k], rv = d[m][r.kr];
        let st = ''; if (r.color) st = p < 0 ? 'val-neg' : 'val-pos';
        h += `<td class="${c} ${st}">${this._f(p,1)}</td>`;
        h += `<td class="${c}">${this._f(rv,1)}</td>`;
      }
      h += '</tr>';
    });

    // Buffer (editable)
    h += `<tr class="bg-summ"><td class="frozen">Buffer</td>`;
    for (let m = 0; m < 12; m++) {
      const c = m === cm ? 'cur' : '';
      h += `<td class="editable ${c}" data-meta="buffer" data-m="${m}" onclick="BudgetGrid.editMeta(this)">${this._f(d[m].buf,1)}</td><td class="${c}"></td>`;
    }
    h += '</tr>';

    // Saldo en Cuenta (editable)
    h += `<tr class="bg-summ"><td class="frozen">Saldo en Cuenta</td>`;
    for (let m = 0; m < 12; m++) {
      const c = m === cm ? 'cur' : '';
      h += `<td class="${c}"></td><td class="editable ${c}" data-meta="saldo" data-m="${m}" onclick="BudgetGrid.editMeta(this)">${this._f(d[m].sal,1)}</td>`;
    }
    h += '</tr>';

    // Envío Necesario (dark band)
    h += `<tr class="bg-envio"><td class="frozen">💰 ENVÍO NECESARIO</td>`;
    for (let m = 0; m < 12; m++) {
      const c = m === cm ? 'cur' : '';
      h += `<td class="${c}">${this._f(d[m].envio,1)}</td><td class="${c}">-</td>`;
    }
    h += '</tr>';

    return h;
  },

  // ══════════ FORMAT / UTIL ══════════

  _f(v, force) { if (!v && v !== 0) return ''; if (v === 0 && !force) return ''; return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
  _e(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') : ''; },
  _ec(cls) { let h=''; for(let i=0;i<24;i++) h+=`<td class="${cls}"></td>`; return h; },

  // ══════════ CELL EDITING (bug-free) ══════════

  editCell(td) {
    if (td.classList.contains('editing')) return;
    const lid = td.dataset.lid, type = td.dataset.t, m = parseInt(td.dataset.m);
    const line = this.lines.find(l => l.id === lid);
    if (!line) return;
    const val = type === 'plan' ? line.plan[m] : line.real[m];

    td.classList.add('editing');
    td.innerHTML = `<input type="number" step="0.01" value="${val || ''}">`;
    const inp = td.querySelector('input');
    inp.focus(); inp.select();

    let committed = false;
    const doCommit = async () => {
      if (committed) return; committed = true;
      if (inp.dataset.cancel === '1') { this.render(); return; }
      const nv = parseFloat(inp.value) || 0;
      if (type === 'plan') { line.plan[m] = nv; await BudgetLogic.updateBudgetCell(line.sheetRow, BudgetLogic.getPlanCol(m), nv); }
      else { line.real[m] = nv; await BudgetLogic.updateBudgetCell(line.sheetRow, BudgetLogic.getRealCol(m), nv); }
      this.render();
    };

    inp.addEventListener('blur', doCommit);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doCommit().then(() => this._nav(td, 'down')); }
      else if (e.key === 'Tab') { e.preventDefault(); doCommit().then(() => this._nav(td, e.shiftKey ? 'left' : 'right')); }
      else if (e.key === 'Escape') { e.preventDefault(); inp.dataset.cancel = '1'; inp.blur(); }
    });
  },

  editMeta(td) {
    if (td.classList.contains('editing')) return;
    const field = td.dataset.meta; // 'buffer' or 'saldo'
    const m = parseInt(td.dataset.m);
    const meta = this.bankMeta[this.activeBank];
    const val = field === 'buffer' ? meta.buffer[m] : meta.saldo[m];

    td.classList.add('editing');
    td.innerHTML = `<input type="number" step="0.01" value="${val || ''}">`;
    const inp = td.querySelector('input');
    inp.focus(); inp.select();

    let committed = false;
    const doCommit = async () => {
      if (committed) return; committed = true;
      if (inp.dataset.cancel === '1') { this.render(); return; }
      const nv = parseFloat(inp.value) || 0;
      if (field === 'buffer') meta.buffer[m] = nv;
      else meta.saldo[m] = nv;
      await this._saveBankMeta(m, field, nv);
      this.render();
    };

    inp.addEventListener('blur', doCommit);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); doCommit(); }
      else if (e.key === 'Escape') { e.preventDefault(); inp.dataset.cancel = '1'; inp.blur(); }
    });
  },

  async _saveBankMeta(month, field, value) {
    // Find or create BANK_MONTHLY_SUMMARY row for this bank+month
    const summ = this.summaries.find(s => s.bank === this.activeBank && s.month === month + 1);
    if (summ) {
      // buffer = col P (16), saldoCuenta = col Q (17)
      const col = field === 'buffer' ? 16 : 17;
      await SheetsAPI.updateCell(CONFIG.SHEETS.BANK_SUMMARY, summ.sheetRow, col, value);
    } else {
      // Create new row
      const id = BudgetLogic.generateId('BMS');
      const now = new Date().toISOString();
      // Cols: id, bank, year, month, saldo_inicio, F-M (totals), mes_cerrado, updated_at, buffer, saldoCuenta
      const row = [id, this.activeBank, AppState.currentYear, month + 1,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 'FALSE', now,
        field === 'buffer' ? value : 0,
        field === 'saldo' ? value : 0
      ];
      await SheetsAPI.appendRow(CONFIG.SHEETS.BANK_SUMMARY, row);
      await this.refresh();
    }
  },

  _nav(td, dir) {
    setTimeout(() => {
      const lid = td.dataset.lid || td.dataset.meta;
      const type = td.dataset.t || td.dataset.meta;
      const m = parseInt(td.dataset.m);
      let sel = null;
      if (dir === 'down') {
        const tr = td.closest('tr'), next = tr?.nextElementSibling;
        if (next) { const ci = Array.from(tr.children).indexOf(td); sel = next.children[ci]; }
      } else if (dir === 'right') {
        sel = td.nextElementSibling;
        if (sel && !sel.classList.contains('editable')) sel = sel.nextElementSibling;
      } else if (dir === 'left') {
        sel = td.previousElementSibling;
        if (sel && !sel.classList.contains('editable')) sel = sel.previousElementSibling;
      }
      if (sel && sel.classList.contains('editable')) sel.click();
    }, 80);
  },

  // ══════════ ACTIONS ══════════

  switchBank(name) { this.activeBank = name; this.render(); },

  async addLine(section) {
    const concepto = prompt(`Nuevo concepto (${section}):`);
    if (!concepto?.trim()) return;
    await BudgetLogic.addBudgetLine(this.activeBank, AppState.currentYear, section, concepto.trim());
    await this.refresh();
  },

  async deleteLine(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line || !confirm(`¿Eliminar "${line.concepto}"?`)) return;
    await BudgetLogic.deleteBudgetLine(line.sheetRow);
    document.querySelector('.budget-drawer-overlay')?.remove();
    await this.refresh();
  },

  _scrollUncat() {
    const row = document.querySelector('tr.uncat');
    if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.style.outline = '2px solid var(--danger)'; setTimeout(() => row.style.outline = '', 2000); }
  },

  // ══════════ DRAWER: Edit line ══════════

  openDrawer(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    const cats = AppState.config?.categorias || {};
    const casas = AppState.config?.casas || [];
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
      <label>Concepto</label><input id="dw-con" value="${this._e(line.concepto)}">
      <label>Casa</label><select id="dw-cas"><option value="">— Sin asignar —</option>${casas.map(c=>`<option value="${c.name}" ${line.casa===c.name?'selected':''}>${c.name}</option>`).join('')}</select>
      <label>Categoría</label><select id="dw-cat" onchange="BudgetGrid._updSub()"><option value="">— Sin asignar —</option>${catKeys.map(c=>`<option value="${c}" ${line.categoria===c?'selected':''}>${c}</option>`).join('')}</select>
      <label>Subcategoría</label><select id="dw-sub"><option value="">— Sin asignar —</option>${subcats.map(s=>`<option value="${s}" ${line.subcategoria===s?'selected':''}>${s}</option>`).join('')}</select>
      <label>Cadencia</label><select id="dw-cad">${['variable','monthly','quarterly','annual','one-off'].map(c=>`<option value="${c}" ${line.cadence===c?'selected':''}>${c}</option>`).join('')}</select>
      <div class="drawer-actions"><button class="btn-cancel" onclick="this.closest('.budget-drawer-overlay').remove()">Cancelar</button><button class="btn-save" onclick="BudgetGrid.saveDrawer('${line.id}')">Guardar</button></div>
      <button class="btn-delete" onclick="BudgetGrid.deleteLine('${line.id}')">Eliminar línea</button>
    </div>`;
    document.body.appendChild(ov);
  },

  _updSub() {
    const c = document.getElementById('dw-cat'), s = document.getElementById('dw-sub');
    if (!c||!s) return;
    const subs = (AppState.config?.categorias || {})[c.value] || [];
    s.innerHTML = '<option value="">— Sin asignar —</option>' + subs.map(o=>`<option value="${o}">${o}</option>`).join('');
  },

  async saveDrawer(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, [
      { row: line.sheetRow, col: 5, value: document.getElementById('dw-con').value },
      { row: line.sheetRow, col: 6, value: document.getElementById('dw-cas').value },
      { row: line.sheetRow, col: 7, value: document.getElementById('dw-cat').value },
      { row: line.sheetRow, col: 8, value: document.getElementById('dw-sub').value },
      { row: line.sheetRow, col: 9, value: document.getElementById('dw-cad').value },
      { row: line.sheetRow, col: 38, value: new Date().toISOString() }
    ]);
    document.querySelector('.budget-drawer-overlay')?.remove();
    await this.refresh();
  },

  // ══════════ DRAWER: Import extract (banco or tarjeta) ══════════

  openImportDrawer(type) {
    const tarjetas = AppState.config?.tarjetas || [];
    const isTarjeta = type === 'tarjeta';
    const ov = document.createElement('div');
    ov.className = 'budget-drawer-overlay';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `<div class="budget-drawer">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="margin:0;">Importar Extracto ${isTarjeta ? 'Tarjeta' : 'Banco'}</h3>
        <button onclick="this.closest('.budget-drawer-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary);">✕</button>
      </div>
      ${isTarjeta ? `<label>Tarjeta</label><select id="imp-card">${tarjetas.length ? tarjetas.map(t=>`<option value="${t.name}">${t.name}</option>`).join('') : '<option value="">— Sin tarjetas —</option>'}</select>` : ''}
      <label>Mes</label><select id="imp-month">${MONTHS_FULL.slice(1).map((m,i)=>`<option value="${i+1}" ${i+1===AppState.currentMonth?'selected':''}>${m} ${AppState.currentYear}</option>`).join('')}</select>
      <label style="margin-top:20px;">Archivo</label>
      <div class="import-dropzone" id="imp-dz" onclick="document.getElementById('imp-fi').click()" style="padding:24px 16px;margin-top:8px;">
        <div style="font-size:32px;margin-bottom:8px;">📁</div>
        <div style="font-size:13px;font-weight:600;">Arrastra o haz clic</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">CSV · HTML · XLSX</div>
        <input type="file" id="imp-fi" accept=".csv,.html,.htm,.xls,.xlsx" style="display:none" onchange="BudgetGrid._impFile(this,'${type}')">
      </div>
      <div id="imp-pv" style="margin-top:16px;"></div>
      <div id="imp-act" style="display:none;margin-top:16px;"><button class="btn-save" onclick="BudgetGrid._impConfirm('${type}')" style="width:100%;">Importar movimientos</button></div>
    </div>`;
    document.body.appendChild(ov);
    const dz = document.getElementById('imp-dz');
    if (dz) { dz.ondragover=(e)=>{e.preventDefault();dz.classList.add('dragover');}; dz.ondragleave=()=>dz.classList.remove('dragover'); dz.ondrop=(e)=>{e.preventDefault();dz.classList.remove('dragover');if(e.dataTransfer.files.length)this._impProcess(e.dataTransfer.files[0],type);}; }
  },

  _impRows: [],
  _impFile(input, type) { if (input.files.length) this._impProcess(input.files[0], type); },

  async _impProcess(file, type) {
    const ext = file.name.split('.').pop().toLowerCase();
    const pv = document.getElementById('imp-pv'), act = document.getElementById('imp-act');
    pv.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;">Procesando...</div>';
    try {
      let rows = [];
      if (ext === 'csv') rows = await parseCSV(file);
      else if (ext === 'html' || ext === 'htm') rows = await parseHTML(file);
      else if (ext === 'xlsx' || ext === 'xls') rows = await parseXLSX(file);
      else { pv.innerHTML = '<div style="color:var(--danger);">Formato no soportado</div>'; return; }
      this._impRows = rows;
      if (rows.length <= 1) { pv.innerHTML = '<div style="color:var(--text-secondary);">Sin datos</div>'; return; }
      const hdr = rows[0], data = rows.slice(1, 8);
      pv.innerHTML = `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">${rows.length-1} movimientos</div><div style="overflow-x:auto;border:1px solid var(--border-light);border-radius:6px;max-height:200px;overflow-y:auto;"><table class="import-preview-table"><thead><tr>${hdr.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${data.map(r=>`<tr>${r.map(c=>`<td>${c||''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      if (act) act.style.display = 'block';
    } catch (e) { pv.innerHTML = `<div style="color:var(--danger);">Error: ${e.message}</div>`; }
  },

  async _impConfirm(type) {
    const rows = this._impRows;
    if (!rows || rows.length <= 1) return;
    const month = parseInt(document.getElementById('imp-month').value);
    const card = type === 'tarjeta' ? (document.getElementById('imp-card')?.value || '') : '';
    const section = type === 'tarjeta' ? 'TARJETAS' : 'GASTOS';
    const pv = document.getElementById('imp-pv');
    if (type === 'tarjeta' && !card) { alert('Selecciona una tarjeta'); return; }
    pv.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;">Importando...</div>';
    const now = new Date().toISOString(), mi = month - 1;
    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]; let concepto = '', amount = 0;
      if (r.length >= 3) { concepto = r[1]||r[0]||''; for(let j=r.length-1;j>=0;j--){const p=parseFloat(String(r[j]).replace(',','.').replace(/[^\d.-]/g,''));if(!isNaN(p)&&p!==0){amount=Math.abs(p);break;}} }
      else if (r.length===2) { concepto=r[0]||''; amount=Math.abs(parseFloat(String(r[1]).replace(',','.').replace(/[^\d.-]/g,''))||0); }
      if (!concepto && !amount) continue;
      const label = card ? `${card}: ${concepto}`.substring(0,80) : concepto.substring(0,80);
      const id = BudgetLogic.generateId('BL'), plan = new Array(12).fill(0), real = new Array(12).fill(0);
      real[mi] = amount;
      await SheetsAPI.appendRow(CONFIG.SHEETS.BUDGET_LINES, [id, this.activeBank, AppState.currentYear, section, label, '','','','one-off', ...plan, ...real, 'FALSE', 999, 'ACTIVE', now, now]);
      count++;
    }
    pv.innerHTML = `<div style="color:var(--success);font-weight:600;padding:8px;background:var(--success-light);border-radius:6px;">✅ ${count} movimientos importados</div>`;
    document.getElementById('imp-act').style.display = 'none';
    this._impRows = [];
    setTimeout(() => { document.querySelector('.budget-drawer-overlay')?.remove(); this.refresh(); }, 1200);
  }
};
