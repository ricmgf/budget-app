/**
 * Budget Grid v9.0 — All fixes
 * UTC date fix, envío modal fix, Iberia parser fix, alias, note tooltips,
 * exclusion patterns, ingresos green in resumen, bimensual cadence
 */
const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTHS_FULL = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Exclusion patterns per bank — movements matching these are skipped during import
const EXCLUSION_PATTERNS = {
  'Caixa Perso': ['IBERIA CARDS'],
  'Caixa IR': ['IBERIA CARDS'],
  'Caixa Sandra': ['IBERIA CARDS'],
  'Intessa': ['AMERICAN EXPRESS', 'AMEX', 'ADDEBITO SALDO']
};

const BudgetGrid = {
  accounts: [], lines: [], summaries: [], activeBank: null,
  bankMeta: {},
  _collapsed: {},

  async init() {
    this.accounts = await BudgetLogic.loadAccounts();
    this.lines = await BudgetLogic.loadBudgetLines(AppState.currentYear);
    this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
    await BudgetLogic.loadRules();
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

  async changeYear(delta) {
    AppState.currentYear += delta;
    document.getElementById('year-display').textContent = AppState.currentYear;
    await this.refresh();
  },

  _buildMeta() {
    this.bankMeta = {};
    this.accounts.forEach(a => {
      const buf = new Array(12).fill(0), sal = new Array(12).fill(0), closed = new Array(12).fill(false);
      this.summaries.filter(s => s.bank === a.name).forEach(s => {
        buf[s.month - 1] = s.buffer || 0;
        sal[s.month - 1] = s.saldoCuenta || 0;
        closed[s.month - 1] = !!s.mesCerrado;
      });
      this.bankMeta[a.name] = { buffer: buf, saldo: sal, closed };
    });
  },

  // ══════════ RENDER ══════════

  render() {
    const ct = document.getElementById('budget-content');
    if (!ct) return;
    const wrap = ct.querySelector('.budget-grid-wrap');
    const sT = wrap ? wrap.scrollTop : 0, sL = wrap ? wrap.scrollLeft : 0;

    if (!this.accounts.length) { ct.innerHTML = '<div style="padding:60px;text-align:center;"><p style="font-size:18px;font-weight:600;">No hay bancos configurados</p></div>'; return; }

    const bk = this.lines.filter(l => l.bank === this.activeBank);
    const G = bk.filter(l => l.section === 'GASTOS').sort((a,b) => a.sortOrder - b.sortOrder);
    const T = bk.filter(l => l.section === 'TARJETAS').sort((a,b) => a.sortOrder - b.sortOrder);
    const I = bk.filter(l => l.section === 'INGRESOS').sort((a,b) => a.sortOrder - b.sortOrder);
    const cm = AppState.currentMonth - 1;
    const acc = this.accounts.find(a => a.name === this.activeBank);
    const unc = [...G,...T,...I].filter(l => !l.casa && !l.categoria).length;

    let h = this._yearNav();
    h += this._tabs(unc);
    h += '<div class="budget-grid-wrap"><table class="budget-grid">';
    h += this._thead(cm);
    h += '<tbody>';
    h += this._secHdr('GASTOS', `<span class="sec-actions"><a onclick="BudgetGrid.addLine('GASTOS')">+ gasto</a> <a onclick="BudgetGrid.openImportDrawer('banco')">+ extracto</a></span>`);
    h += this._rows(G, cm);
    h += this._totRow('Total Gastos', G, cm);
    h += this._secHdr('TARJETAS', `<span class="sec-actions"><a onclick="BudgetGrid.addLine('TARJETAS')">+ manual</a> <a onclick="BudgetGrid.openImportDrawer('tarjeta')">+ extracto</a></span>`);
    h += this._tarjetaRows(T, cm);
    h += this._totRow('Total Tarjetas', T, cm);
    h += this._secHdr('INGRESOS', `<span class="sec-actions"><a onclick="BudgetGrid.addLine('INGRESOS')">+ ingreso</a></span>`);
    h += this._rows(I, cm);
    h += this._totRow('Total Ingresos', I, cm);
    h += this._summaryBlock(G, T, I, cm, acc);
    h += '</tbody></table></div>';
    ct.innerHTML = h;

    requestAnimationFrame(() => {
      const nw = ct.querySelector('.budget-grid-wrap');
      if (nw) { nw.scrollTop = sT; nw.scrollLeft = sL; }
    });
  },

  _yearNav() {
    return `<div style="display:flex;justify-content:center;margin-bottom:12px;"><div style="display:inline-flex;align-items:center;gap:12px;background:var(--bg-tertiary);border-radius:20px;padding:4px 16px;">
      <button onclick="BudgetGrid.changeYear(-1)" style="background:none;border:none;font-size:16px;cursor:pointer;padding:4px 8px;color:var(--text-secondary);">◀</button>
      <span id="year-display" style="font-weight:700;font-size:14px;min-width:40px;text-align:center;">${AppState.currentYear}</span>
      <button onclick="BudgetGrid.changeYear(1)" style="background:none;border:none;font-size:16px;cursor:pointer;padding:4px 8px;color:var(--text-secondary);">▶</button>
    </div></div>`;
  },

  _tabs(unc) {
    let h = '<div class="budget-bank-tabs">';
    this.accounts.forEach(a => { h += `<button class="budget-bank-tab ${a.name===this.activeBank?'active':''}" onclick="BudgetGrid.switchBank('${this._e(a.name)}')">${a.name}</button>`; });
    if (unc > 0) h += `<span class="uncat-badge" onclick="BudgetGrid._scrollUncat()">${unc} sin categorizar</span>`;
    return h + '</div>';
  },

  _thead(cm) {
    const meta = this.bankMeta[this.activeBank] || { closed: new Array(12).fill(false) };
    let r1 = '<thead><tr><th class="th-left"></th>';
    let r2 = '<tr class="sub-hdr"><th class="th-left"></th>';
    for (let m = 0; m < 12; m++) {
      const cur = m === cm, closed = meta.closed[m], past = m < cm;
      let cls = cur ? 'cur-hdr' : (closed ? 'closed-hdr' : (past && !closed ? 'unclosed-hdr' : ''));
      const icon = closed ? ' 🔒' : (past && !closed ? ' ⚠' : '');
      const click = past || cur ? ` onclick="BudgetGrid.toggleClose(${m+1})" style="cursor:pointer;"` : '';
      r1 += `<th class="th-month ${cls}" colspan="2"${click}>${MONTHS[m]}${icon}</th>`;
      const subCls = cur ? 'cur-hdr' : (closed ? 'closed-hdr' : '');
      r2 += `<th class="${subCls}">Plan</th><th class="${subCls}">Real</th>`;
    }
    return r1 + '</tr>' + r2 + '</tr></thead>';
  },

  _secHdr(name, actions) {
    return `<tr class="bg-section-hdr"><td class="frozen"><span class="sec-name">${name}</span>${actions||''}</td>${this._ec('sec-cell')}</tr>`;
  },

  // Display name: alias if exists, else concepto
  _displayName(line) {
    return line.alias ? line.alias : line.concepto;
  },

  _noteTriangle(notes, color) {
    if (!notes) return '';
    const cls = color === 'grey' ? 'note-indicator grey' : 'note-indicator';
    return `<span class="${cls}" onmouseenter="BudgetGrid._showTip(this)" onmouseleave="BudgetGrid._hideTip()" data-tip="${this._e(notes)}">◥</span>`;
  },

  _showTip(el) {
    let tip = document.getElementById('bg-tip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'bg-tip'; tip.className = 'bg-tooltip'; document.body.appendChild(tip); }
    tip.textContent = el.dataset.tip;
    const r = el.getBoundingClientRect();
    tip.style.display = 'block';
    tip.style.left = Math.min(r.left, window.innerWidth - 320) + 'px';
    tip.style.top = (r.bottom + 6) + 'px';
  },

  _hideTip() {
    const tip = document.getElementById('bg-tip');
    if (tip) tip.style.display = 'none';
  },

  _rows(lines, cm) {
    const meta = this.bankMeta[this.activeBank] || { closed: new Array(12).fill(false) };
    let h = '';
    lines.forEach(line => {
      const uc = !line.casa && !line.categoria;
      const autoTag = (!uc && line.cadence === 'one-off' && BudgetLogic.findRule(line.concepto, this.activeBank)) ? '<span class="auto-tag">⚡</span>' : '';
      const name = this._displayName(line);
      const noteTip = this._noteTriangle(line.notas, 'blue');
      // Parse per-month breakdowns
      let bdMap = null;
      if (line.breakdown) { try { bdMap = JSON.parse(line.breakdown); } catch(e) { bdMap = null; } }
      h += `<tr class="${uc?'uncat':''}" data-lid="${line.id}">`;
      h += `<td class="frozen" ondblclick="BudgetGrid.openDrawer('${line.id}')">${autoTag}${this._e(name)||'(vacío)'}${noteTip}</td>`;
      for (let m = 0; m < 12; m++) {
        const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
        const pv = line.plan[m], rv = line.real[m];
        const bdTip = (bdMap && bdMap[m] && bdMap[m].length > 1) ? this._noteTriangle(bdMap[m].map(b => `${b.d} · ${b.c ? b.c + ' · ' : ''}${this._f(b.a,1)}`).join('\n'), 'grey') : '';
        h += `<td class="editable ${c}" data-lid="${line.id}" data-t="plan" data-m="${m}" onclick="BudgetGrid.editCell(this)">${this._f(pv)}</td>`;
        h += `<td class="editable ${c}" data-lid="${line.id}" data-t="real" data-m="${m}" onclick="BudgetGrid.editCell(this)">${this._f(rv)}${bdTip}</td>`;
      }
      h += '</tr>';
    });
    return h;
  },

  _tarjetaRows(lines, cm) {
    const meta = this.bankMeta[this.activeBank] || { closed: new Array(12).fill(false) };
    const parents = lines.filter(l => !l.parentId);
    const children = lines.filter(l => l.parentId);
    let h = '';
    parents.forEach(line => {
      const kids = children.filter(c => c.parentId === line.id);
      const isParent = kids.length > 0;
      const collapsed = this._collapsed[line.id] !== false;
      if (isParent) {
        h += `<tr class="tarjeta-parent" data-lid="${line.id}">`;
        h += `<td class="frozen" ondblclick="BudgetGrid.openDrawer('${line.id}')"><span class="collapse-toggle" onclick="BudgetGrid.toggleCollapse('${line.id}')">${collapsed ? '▸' : '▾'}</span><strong>${this._e(this._displayName(line))}</strong></td>`;
        for (let m = 0; m < 12; m++) {
          const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
          const pSum = kids.reduce((s,k)=>s+(k.plan[m]||0),0) + (line.plan[m]||0);
          const rSum = kids.reduce((s,k)=>s+(k.real[m]||0),0) + (line.real[m]||0);
          h += `<td class="editable ${c}" data-lid="${line.id}" data-t="plan" data-m="${m}" onclick="BudgetGrid.editCell(this)">${this._f(pSum)}</td>`;
          h += `<td class="${c}" style="font-weight:600;">${this._f(rSum)}</td>`;
        }
        h += '</tr>';
        if (!collapsed) {
          kids.forEach(kid => {
            const ucK = !kid.casa && !kid.categoria;
            const noteT = this._noteTriangle(kid.notas, 'blue');
            h += `<tr class="tarjeta-child ${ucK?'uncat':''}" data-lid="${kid.id}">`;
            h += `<td class="frozen" ondblclick="BudgetGrid.openDrawer('${kid.id}')" style="padding-left:28px;font-size:11px;color:var(--text-secondary);">${this._e(this._displayName(kid))}${noteT}</td>`;
            for (let m = 0; m < 12; m++) {
              const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
              h += `<td class="${c}" style="font-size:11px;">${this._f(kid.plan[m])}</td>`;
              h += `<td class="editable ${c}" data-lid="${kid.id}" data-t="real" data-m="${m}" onclick="BudgetGrid.editCell(this)" style="font-size:11px;">${this._f(kid.real[m])}</td>`;
            }
            h += '</tr>';
          });
        }
      } else {
        h += this._rows([line], cm);
      }
    });
    return h;
  },

  toggleCollapse(lineId) { this._collapsed[lineId] = this._collapsed[lineId] === false ? true : false; this.render(); },

  _totRow(label, lines, cm) {
    const meta = this.bankMeta[this.activeBank] || { closed: new Array(12).fill(false) };
    let h = `<tr class="bg-total"><td class="frozen"><strong>${label}</strong></td>`;
    for (let m = 0; m < 12; m++) {
      const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
      h += `<td class="${c}">${this._f(lines.reduce((s,l)=>s+(l.plan[m]||0),0),1)}</td>`;
      h += `<td class="${c}">${this._f(lines.reduce((s,l)=>s+(l.real[m]||0),0),1)}</td>`;
    }
    return h + '</tr>';
  },

  // ══════════ SUMMARY + ENVÍO ══════════

  _summaryBlock(G, T, I, cm, acc) {
    const meta = this.bankMeta[this.activeBank] || { buffer: new Array(12).fill(0), saldo: new Array(12).fill(0), closed: new Array(12).fill(false) };
    let h = `<tr class="bg-section-hdr"><td class="frozen" style="border-left-color:#0ea5e9;">RESUMEN</td>${this._ec('sec-cell')}</tr>`;

    const d = [];
    for (let m = 0; m < 12; m++) {
      const gasP = G.reduce((s,l)=>s+(l.plan[m]||0),0);
      const gasR = G.reduce((s,l)=>s+(l.real[m]||0),0);
      const tarP = T.reduce((s,l)=>s+(l.plan[m]||0),0);
      const tarR = T.reduce((s,l)=>s+(l.real[m]||0),0);
      const totP = gasP + tarP, totR = gasR + tarR;
      const iP = I.reduce((s,l)=>s+(l.plan[m]||0),0);
      const iR = I.reduce((s,l)=>s+(l.real[m]||0),0);
      const cf = iP - totP, cfR = iR - totR;
      const buf = meta.buffer[m] || 0, sal = meta.saldo[m] || 0;
      d.push({ gasP, gasR, tarP, tarR, totP, totR, iP, iR, cf, cfR, buf, sal });
    }
    this._envioData = d;

    const sRow = (label, kP, kR, opts={}) => {
      const { sign, bold, negOnly, cls, greenVal } = opts;
      let r = `<tr class="bg-summ ${cls||''}"><td class="frozen">${sign?`<span class="formula-sign">${sign}</span>`:''}${bold?`<strong>${label}</strong>`:label}</td>`;
      for (let m = 0; m < 12; m++) {
        const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
        const pv = d[m][kP], rv = d[m][kR];
        let sP = '', sR = '';
        if (negOnly) { sP = pv < 0 ? 'val-neg' : ''; sR = rv < 0 ? 'val-neg' : ''; }
        if (greenVal) { sP = 'val-pos'; sR = 'val-pos'; }
        r += `<td class="${c} ${sP}">${this._f(pv,1)}</td><td class="${c} ${sR}">${this._f(rv,1)}</td>`;
      }
      return r + '</tr>';
    };

    h += sRow('Gastos', 'gasP', 'gasR');
    h += sRow('Tarjetas', 'tarP', 'tarR', { sign: '+' });
    h += sRow('Total Gastos', 'totP', 'totR', { bold: true, sign: '=', cls: 'row-total' });
    h += sRow('Ingresos', 'iP', 'iR', { cls: 'row-income', greenVal: true });
    h += sRow('Cashflow', 'cf', 'cfR', { bold: true, sign: '=', negOnly: true, cls: 'row-cashflow' });

    // Buffer
    h += `<tr class="bg-summ row-meta"><td class="frozen"><span class="formula-sign">+</span>Buffer</td>`;
    for (let m = 0; m < 12; m++) {
      const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
      const v = d[m].buf, disp = v ? this._f(v,1) : '—';
      h += `<td class="editable ${c}" data-meta="buffer" data-m="${m}" onclick="BudgetGrid.editMeta(this)">${disp}</td>`;
      h += `<td class="${c}">${disp}</td>`;
    }
    h += '</tr>';

    // Saldo en Cuenta
    h += `<tr class="bg-summ row-meta"><td class="frozen"><span class="formula-sign">−</span>Saldo en Cuenta</td>`;
    for (let m = 0; m < 12; m++) {
      const c = cm === m ? 'cur' : (meta.closed[m] ? 'closed' : '');
      const v = d[m].sal, disp = v ? this._f(v,1) : '—';
      h += `<td class="${c}">${disp}</td>`;
      h += `<td class="editable ${c}" data-meta="saldo" data-m="${m}" onclick="BudgetGrid.editMeta(this)">${disp}</td>`;
    }
    h += '</tr>';

    // Envío Necesario — shown in PLAN column of month m (the current month being closed)
    // Envío for month m = Gastos_Plan(m+1) + Tarjetas_Real(m) + Buffer(m+1) - Ingresos_Plan(m+1) - Saldo(m)
    h += `<tr class="bg-envio"><td class="frozen">💰 ENVÍO NECESARIO</td>`;
    for (let m = 0; m < 12; m++) {
      const c = cm === m ? 'cur' : '';
      let envDisplay = '';
      if (m < 11) {
        const nextM = m + 1;
        const envRaw = d[nextM].gasP + d[m].tarR + d[nextM].buf - d[nextM].iP - d[m].sal;
        envDisplay = this._f(Math.max(0, envRaw), 1);
      }
      h += `<td class="${c}" style="font-weight:800;${m < 11 ? 'cursor:pointer;' : ''}" ${m < 11 ? `onclick="BudgetGrid.showEnvioModal(${m})"` : ''}>${envDisplay}</td>`;
      h += `<td class="${c}"></td>`;
    }
    h += '</tr>';
    return h;
  },

  showEnvioModal(srcMonth) {
    // srcMonth = the current month (where envío is displayed in PLAN column)
    // target = srcMonth + 1 (the month we need to cover)
    const d = this._envioData;
    if (!d) return;
    const tgtM = srcMonth + 1;
    if (tgtM > 11) return;

    const gastosPlan = d[tgtM].gasP;
    const tarjetasReal = d[srcMonth].tarR;
    const bufferPlan = d[tgtM].buf;
    const ingresosPlan = d[tgtM].iP;
    const saldo = d[srcMonth].sal;
    const raw = gastosPlan + tarjetasReal + bufferPlan - ingresosPlan - saldo;
    const isNeg = raw <= 0;
    const color = isNeg ? '#10b981' : '#0f172a';
    const srcName = MONTHS_FULL[srcMonth + 1] || MONTHS[srcMonth];
    const tgtName = MONTHS_FULL[tgtM + 1] || MONTHS[tgtM];

    const row = (label, value, sign) => {
      const vf = this._f(Math.abs(value), 1);
      return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f3f5;">
        <span style="color:#64748b;">${sign ? `<span style="display:inline-block;width:16px;font-weight:700;color:#94a3b8;">${sign}</span>` : '<span style="width:16px;display:inline-block;"></span>'}${label}</span>
        <span style="font-weight:600;font-variant-numeric:tabular-nums;">${vf}</span>
      </div>`;
    };

    const ov = document.createElement('div');
    ov.className = 'budget-drawer-overlay';
    ov.style.cssText += 'justify-content:center;align-items:center;';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `<div style="background:white;border-radius:16px;padding:28px;width:400px;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="margin:0;font-size:16px;">💰 Envío Necesario — ${tgtName}</h3>
        <button onclick="this.closest('.budget-drawer-overlay').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text-secondary);">✕</button>
      </div>
      <div style="font-size:13px;">
        ${row(`Gastos previstos ${tgtName}`, gastosPlan, '')}
        ${row(`Recibo tarjetas ${srcName}`, tarjetasReal, '+')}
        ${row(`Buffer ${tgtName}`, bufferPlan, '+')}
        ${row(`Ingresos previstos ${tgtName}`, ingresosPlan, '−')}
        ${row(`Saldo en cuenta`, saldo, '−')}
      </div>
      <div style="border-top:2px solid #0f172a;margin-top:4px;padding-top:12px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:800;font-size:15px;">ENVÍO NECESARIO</span>
        <span style="font-weight:800;font-size:18px;color:${color};">${this._f(isNeg ? raw : Math.max(0, raw), 1)}</span>
      </div>
      ${isNeg ? '<div style="margin-top:8px;padding:8px 12px;background:#ecfdf5;border-radius:8px;color:#065f46;font-size:12px;font-weight:600;text-align:center;">✅ Sobra dinero, no hace falta que envíes nada</div>' : ''}
    </div>`;
    document.body.appendChild(ov);
  },

  // ══════════ FORMAT / UTIL ══════════

  _f(v, force) {
    if (v == null || v === '') return '';
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (isNaN(n)) return '';
    if (n === 0 && !force) return '';
    const parts = Math.abs(n).toFixed(2).split('.');
    const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (n < 0 ? '-' : '') + int + ',' + parts[1];
  },
  _e(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') : ''; },
  _ec(cls) { let h=''; for(let i=0;i<24;i++) h+=`<td class="${cls}"></td>`; return h; },
  _norm(s) { return String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); },

  // ══════════ CELL EDITING ══════════

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
    const field = td.dataset.meta, m = parseInt(td.dataset.m);
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
      if (field === 'buffer') meta.buffer[m] = nv; else meta.saldo[m] = nv;
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
    const summ = this.summaries.find(s => s.bank === this.activeBank && s.month === month + 1);
    if (summ) {
      const col = field === 'buffer' ? 16 : 17;
      await SheetsAPI.updateCell(CONFIG.SHEETS.BANK_SUMMARY, summ.sheetRow, col, value);
    } else {
      const id = BudgetLogic.generateId('BMS');
      const now = new Date().toISOString();
      const row = [id, this.activeBank, AppState.currentYear, month + 1, 0,0,0,0,0,0,0,0,0, 'FALSE', now, field==='buffer'?value:0, field==='saldo'?value:0];
      await SheetsAPI.appendRow(CONFIG.SHEETS.BANK_SUMMARY, row);
      await this.refresh();
    }
  },

  _nav(td, dir) {
    setTimeout(() => {
      let sel = null;
      if (dir === 'down') { const tr = td.closest('tr'), next = tr?.nextElementSibling; if (next) { sel = next.children[Array.from(tr.children).indexOf(td)]; } }
      else if (dir === 'right') { sel = td.nextElementSibling; if (sel && !sel.classList.contains('editable')) sel = sel.nextElementSibling; }
      else if (dir === 'left') { sel = td.previousElementSibling; if (sel && !sel.classList.contains('editable')) sel = sel.previousElementSibling; }
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
    if (row) { row.scrollIntoView({ behavior:'smooth', block:'center' }); row.style.outline = '2px solid var(--danger)'; setTimeout(() => row.style.outline = '', 2000); }
  },

  async toggleClose(month) {
    const newVal = await BudgetLogic.toggleCloseMonth(this.activeBank, month);
    this.summaries = await BudgetLogic.loadBankSummary(AppState.currentYear);
    this._buildMeta(); this.render();
    this._toast(newVal ? `${MONTHS_FULL[month]} cerrado 🔒` : `${MONTHS_FULL[month]} reabierto`);
  },

  _toast(msg) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fbbf24;padding:10px 24px;border-radius:8px;font-weight:600;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.2);';
    t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2000);
  },

  // ══════════ DRAWER ══════════

  openDrawer(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    const cats = AppState.config?.categorias || {}, casas = AppState.config?.casas || [];
    const catKeys = Object.keys(cats).sort((a,b) => a.localeCompare(b, 'es'));
    const subcats = (line.categoria && cats[line.categoria] ? cats[line.categoria] : []).sort((a,b) => a.localeCompare(b, 'es'));
    const notes = line.notas || '';
    const alias = line.alias || '';
    const ov = document.createElement('div');
    ov.className = 'budget-drawer-overlay';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `<div class="budget-drawer">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;"><h3 style="margin:0;">Editar Línea</h3><button onclick="this.closest('.budget-drawer-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary);">✕</button></div>
      <label>Concepto original</label><input value="${this._e(line.concepto)}" readonly style="background:#f8fafc;color:var(--text-tertiary);">
      <label>Nombre en grilla</label><input id="dw-alias" value="${this._e(alias || line.concepto)}" placeholder="${this._e(line.concepto)}">
      ${notes ? `<label>Detalles</label><textarea readonly style="width:100%;height:50px;padding:8px;border-radius:8px;border:1px solid var(--border-light);font-size:12px;color:var(--text-secondary);resize:vertical;background:#f8fafc;">${this._e(notes)}</textarea>` : ''}
      <label>Casa</label><select id="dw-cas"><option value="">— Sin asignar —</option>${casas.map(c=>`<option value="${c.name}" ${line.casa===c.name?'selected':''}>${c.name}</option>`).join('')}</select>
      <div style="display:flex;align-items:center;gap:8px;margin-top:16px;"><label style="margin:0;flex:1;">Categoría</label><a onclick="BudgetGrid._addNewCat()" style="font-size:11px;color:var(--accent);cursor:pointer;font-weight:600;">+ nueva</a></div>
      <select id="dw-cat" onchange="BudgetGrid._updSub()"><option value="">— Sin asignar —</option>${catKeys.map(c=>`<option value="${c}" ${line.categoria===c?'selected':''}>${c}</option>`).join('')}</select>
      <div style="display:flex;align-items:center;gap:8px;margin-top:16px;"><label style="margin:0;flex:1;">Subcategoría</label><a onclick="BudgetGrid._addNewSub()" style="font-size:11px;color:var(--accent);cursor:pointer;font-weight:600;">+ nueva</a></div>
      <select id="dw-sub"><option value="">— Sin asignar —</option>${subcats.map(s=>`<option value="${s}" ${line.subcategoria===s?'selected':''}>${s}</option>`).join('')}</select>
      <label>Cadencia</label><select id="dw-cad">${['variable','monthly','bimonthly','quarterly','annual','one-off'].map(c=>`<option value="${c}" ${line.cadence===c?'selected':''}>${c === 'bimonthly' ? 'bimensual' : c}</option>`).join('')}</select>
      <div class="drawer-actions"><button class="btn-cancel" onclick="this.closest('.budget-drawer-overlay').remove()">Cancelar</button><button class="btn-save" onclick="BudgetGrid.saveDrawer('${line.id}')">Guardar</button></div>
      <button class="btn-delete" onclick="BudgetGrid.deleteLine('${line.id}')">Eliminar línea</button>
    </div>`;
    document.body.appendChild(ov);
  },

  async _addNewCat() {
    const name = prompt('Nueva categoría:');
    if (!name?.trim()) return;
    const cats = AppState.config?.categorias || {};
    if (cats[name.trim()]) { alert(`"${name.trim()}" ya existe.`); return; }
    await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [name.trim(), '', '', '', '', '']);
    cats[name.trim()] = [];
    const sel = document.getElementById('dw-cat');
    if (sel) { const opt = document.createElement('option'); opt.value = name.trim(); opt.textContent = name.trim(); opt.selected = true; sel.appendChild(opt); }
    this._toast(`Categoría "${name.trim()}" creada`);
  },

  async _addNewSub() {
    const cat = document.getElementById('dw-cat')?.value;
    if (!cat) { alert('Selecciona primero una categoría.'); return; }
    const name = prompt(`Nueva subcategoría para "${cat}":`);
    if (!name?.trim()) return;
    const cats = AppState.config?.categorias || {};
    const subs = cats[cat] || [];
    if (subs.includes(name.trim())) { alert(`"${name.trim()}" ya existe.`); return; }
    await SheetsAPI.appendRow(CONFIG.SHEETS.CONFIG, [cat, name.trim(), '', '', '', '']);
    subs.push(name.trim()); cats[cat] = subs;
    const sel = document.getElementById('dw-sub');
    if (sel) { const opt = document.createElement('option'); opt.value = name.trim(); opt.textContent = name.trim(); opt.selected = true; sel.appendChild(opt); }
    this._toast(`Subcategoría "${name.trim()}" creada`);
  },

  _updSub() {
    const c = document.getElementById('dw-cat'), s = document.getElementById('dw-sub');
    if (!c||!s) return;
    const subs = ((AppState.config?.categorias||{})[c.value]||[]).slice().sort((a,b) => a.localeCompare(b, 'es'));
    s.innerHTML = '<option value="">— Sin asignar —</option>' + subs.map(o=>`<option value="${o}">${o}</option>`).join('');
  },

  async saveDrawer(lineId) {
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return;
    const alias = document.getElementById('dw-alias').value.trim();
    const cas = document.getElementById('dw-cas').value;
    const cat = document.getElementById('dw-cat').value, sub = document.getElementById('dw-sub').value;
    const cad = document.getElementById('dw-cad').value;
    // Save alias in col 41 (0-indexed 40)
    const aliasVal = (alias && alias !== line.concepto) ? alias : '';
    await SheetsAPI.batchUpdate(CONFIG.SHEETS.BUDGET_LINES, [
      { row: line.sheetRow, col: 6, value: cas },
      { row: line.sheetRow, col: 7, value: cat }, { row: line.sheetRow, col: 8, value: sub },
      { row: line.sheetRow, col: 9, value: cad }, { row: line.sheetRow, col: 38, value: new Date().toISOString() },
      { row: line.sheetRow, col: 41, value: aliasVal }
    ]);
    if (cat && line.concepto.trim()) {
      const notes = line.notas || '';
      await BudgetLogic.createRule(line.concepto + (notes ? '|||' + notes : ''), this.activeBank, cas, cat, sub);
    }
    document.querySelector('.budget-drawer-overlay')?.remove();
    await this.refresh();
  },

  // ══════════ IMPORT DRAWER ══════════

  openImportDrawer(type) {
    const tarjetas = AppState.config?.tarjetas || [];
    const isTarjeta = type === 'tarjeta';
    const ov = document.createElement('div');
    ov.className = 'budget-drawer-overlay';
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `<div class="budget-drawer">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="margin:0;">Importar ${isTarjeta ? 'Extracto Tarjeta' : 'Extracto Banco'}</h3>
        <button onclick="this.closest('.budget-drawer-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary);">✕</button>
      </div>
      ${isTarjeta ? `<label>Tarjeta</label><select id="imp-card">${tarjetas.length ? tarjetas.map(t=>`<option value="${t.name}">${t.name}</option>`).join('') : '<option value="">— Sin tarjetas —</option>'}</select>` : ''}
      <label>${isTarjeta ? 'Mes del extracto' : 'Mes'} <span style="font-weight:400;color:var(--text-tertiary);text-transform:none;">${isTarjeta ? '(cargos irán al mes anterior)' : '(si el archivo no tiene fechas)'}</span></label><select id="imp-month">${MONTHS_FULL.slice(1).map((m,i)=>`<option value="${i+1}" ${i+1===AppState.currentMonth?'selected':''}>${m} ${AppState.currentYear}</option>`).join('')}</select>
      <label style="margin-top:16px;">Archivo</label>
      <div class="import-dropzone" id="imp-dz" style="padding:24px 16px;margin-top:8px;cursor:pointer;">
        <div style="font-size:28px;margin-bottom:6px;">📁</div>
        <div style="font-size:13px;font-weight:600;">Arrastra o haz clic</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">CSV · XLSX · XLS · PDF</div>
        <input type="file" id="imp-fi" accept=".csv,.html,.htm,.xls,.xlsx,.pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="display:none" onchange="BudgetGrid._impFile(this,'${type}')">
      </div>
      <div id="imp-pv" style="margin-top:16px;"></div>
      <div id="imp-act" style="display:none;margin-top:16px;"><button class="btn-save" onclick="BudgetGrid._impConfirm('${type}')" style="width:100%;">Importar movimientos</button></div>
    </div>`;
    document.body.appendChild(ov);
    const dz = document.getElementById('imp-dz');
    if (dz) {
      dz.onclick = (e) => { e.stopPropagation(); document.getElementById('imp-fi').click(); };
      dz.ondragover = e => { e.preventDefault(); dz.classList.add('dragover'); };
      dz.ondragleave = () => dz.classList.remove('dragover');
      dz.ondrop = e => { e.preventDefault(); dz.classList.remove('dragover'); if(e.dataTransfer.files.length) this._impProcess(e.dataTransfer.files[0], type); };
    }
  },

  _impMovements: [], _impSaldo: null,
  _impFile(input, type) { if (input.files.length) this._impProcess(input.files[0], type); },

  async _impProcess(file, type) {
    const ext = file.name.split('.').pop().toLowerCase();
    const pv = document.getElementById('imp-pv'), act = document.getElementById('imp-act');
    pv.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;">Procesando archivo...</div>';
    this._impSaldo = null;
    try {
      let movements = [];
      if (ext === 'xlsx' || ext === 'xls') movements = await this._parseSmartXLSX(file);
      else if (ext === 'csv') movements = await this._parseCSV(file);
      else if (ext === 'html' || ext === 'htm') movements = await this._parseGenericHTML(file);
      else if (ext === 'pdf') movements = await this._parsePDF(file);
      else { pv.innerHTML = '<div style="color:var(--danger);">Formato no soportado.</div>'; return; }

      // Apply exclusion patterns (only for bank imports — not for tarjeta extracts)
      if (type !== 'tarjeta') {
        const excl = EXCLUSION_PATTERNS[this.activeBank] || [];
        if (excl.length) {
          const before = movements.length;
          movements = movements.filter(mv => {
            const searchText = (String(mv.concepto) + ' ' + String(mv.notes || '')).toUpperCase();
            return !excl.some(p => searchText.includes(p));
          });
          if (before !== movements.length) console.log(`Excluded ${before - movements.length} movements by bank rules`);
        }
      }

      this._impMovements = movements;
      if (!movements.length) { pv.innerHTML = '<div style="color:var(--text-secondary);">No se encontraron movimientos.</div>'; return; }

      const TARJETA_PV = ['IBERIA CARDS','VISA ','MASTERCARD','AMEX','AMERICAN EXPRESS'];
      const preview = movements.slice(0, 12);
      const nInc = movements.filter(m => m.originalSign > 0).length;
      let tbl = `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">${movements.length} movimientos${nInc ? ` (${nInc} ingresos)` : ''}${this._impSaldo ? ` · Saldo: ${this._f(this._impSaldo.value,1)}` : ''}</div>`;
      tbl += `<div style="overflow-x:auto;border:1px solid var(--border-light);border-radius:6px;max-height:200px;overflow-y:auto;"><table class="import-preview-table"><thead><tr><th>Concepto</th><th style="text-align:right;">Importe</th><th>Tipo</th></tr></thead><tbody>`;
      preview.forEach(mv => {
        const isTar = TARJETA_PV.some(p => String(mv.concepto).toUpperCase().includes(p));
        const tipo = type === 'tarjeta' ? (mv.titular || 'Tarj.') : (isTar ? '<span style="color:#7c3aed;">Tarj.</span>' : (mv.originalSign > 0 ? '<span style="color:#10b981;">Ingr.</span>' : 'Gasto'));
        tbl += `<tr><td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this._e(mv.concepto)}</td><td style="text-align:right;white-space:nowrap;">${this._f(mv.amount,1)}</td><td style="font-size:10px;">${tipo}</td></tr>`;
      });
      if (movements.length > 12) tbl += `<tr><td colspan="3" style="text-align:center;color:var(--text-secondary);font-size:11px;">... y ${movements.length-12} más</td></tr>`;
      tbl += '</tbody></table></div>';
      pv.innerHTML = tbl;
      if (act) act.style.display = 'block';
    } catch (e) {
      console.error('Import error:', e);
      pv.innerHTML = `<div style="color:var(--danger);padding:8px;background:#fef2f2;border-radius:6px;">❌ Error: ${e.message}</div>`;
    }
  },

  // ══════════ SMART PARSERS ══════════

  async _parseSmartXLSX(file) {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      for (let i = 0; i < Math.min(rows.length, 40); i++) {
        const row = rows[i]; if (!row) continue;
        // Check each cell individually — avoid false matches from long text paragraphs
        const cells = row.map(c => String(c||'').toUpperCase().trim()).filter(c => c.length > 0 && c.length < 50);
        const cellJoined = cells.join('|');
        // Amex Excel: "Fecha|Descripción|Titular de la Tarjeta|Cuenta|Importe"
        if (cellJoined.includes('TITULAR DE LA TARJETA') && cellJoined.includes('IMPORTE')) return this._parseAmexXLSX(rows);
        // Intessa V1 (app export): "Data|Operazione|Dettagli|...Importo"
        if (cellJoined.includes('OPERAZIONE') && cellJoined.includes('IMPORTO')) return this._parseIntessa(rows);
        // Visa Intesa card (check BEFORE V2 — has "ACCREDITI IN VALUTA" or "ADDEBITI IN VALUTA")
        if (cellJoined.includes('DATA CONTABILE') && cellJoined.includes('DESCRIZIONE') && (cellJoined.includes('IN VALUTA') || cellJoined.includes('ADDEBITI IN'))) return this._parseVisaIntesa(rows);
        // Intessa V2 (bank statement with saldo): "Data contabile|Data valuta|Descrizione|Accrediti|Addebiti|Descrizione estesa"
        if (cellJoined.includes('DATA CONTABILE') && cellJoined.includes('DESCRIZIONE') && cellJoined.includes('DESCRIZIONE ESTESA')) return this._parseIntessaV2(rows);
        if (cellJoined.includes('FECHA OPERACIÓN') || (cellJoined.includes('COMERCIO') && cellJoined.includes('IMPORTE EUROS'))) return this._parseIberia(rows);
        if (cellJoined.includes('MOVIMIENTO') && (cellJoined.includes('MÁS DATOS') || cellJoined.includes('MAS DATOS') || cellJoined.includes('IMPORTE'))) return this._parseCaixa(rows);
        if (cellJoined.includes('MESSAGE') && (cellJoined.includes('DEBIT') || cellJoined.includes('CREDIT'))) return this._parseCIC(rows);
      }
      // Also check for Intessa V2 / Visa by scanning for saldo line patterns
      for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const row = rows[i]; if (!row) continue;
        const joined = row.map(c => String(c||'').toUpperCase()).join('|');
        if (joined.includes('SALDO CONTABILE') && joined.includes('FINALE')) return this._parseIntessaV2(rows);
        if (joined.includes('SBILANCIO ALLA DATA')) return this._parseVisaIntesa(rows);
      }
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    return this._parseGenericRows(XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }));
  },

  _parseAmexXLSX(rows) {
    console.log('[Amex XLSX] Starting parse, rows:', rows.length);
    let hdrRow = -1, cFecha = -1, cDesc = -1, cTitular = -1, cImporte = -1;
    const SKIP = ['RECIBO ENVIADO'];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      for (let j = 0; j < r.length; j++) {
        const v = String(r[j] || '').toUpperCase().trim();
        if (v === 'FECHA') cFecha = j;
        if (v.includes('DESCRIPCI')) cDesc = j;
        if (v.includes('TITULAR')) cTitular = j;
        if (v === 'IMPORTE') cImporte = j;
      }
      if (cDesc >= 0 && cImporte >= 0) { hdrRow = i; break; }
    }
    if (hdrRow < 0) { console.log('[Amex XLSX] Header not found'); return []; }
    console.log(`[Amex XLSX] Header at row ${hdrRow}: cFecha=${cFecha} cDesc=${cDesc} cTitular=${cTitular} cImporte=${cImporte}`);

    const mvs = [];
    for (let i = hdrRow + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const desc = String(r[cDesc] || '').trim();
      const amount = parseFloat(r[cImporte]);
      if (!desc || isNaN(amount) || amount === 0) continue;
      const cUp = desc.toUpperCase();
      if (SKIP.some(s => cUp.includes(s))) { console.log(`[Amex XLSX] Skip: '${desc}'`); continue; }
      const fecha = r[cFecha] || '';
      const titular = String(r[cTitular] || '').trim();
      // Extract first name from titular
      const parts = titular.split(/\s+/);
      let firstName = parts[0] || 'Principal';
      // "R M GARCIA FERREIRA" → "RICARDO", "SYLVIA C BORNHOLT" → "SYLVIA"
      if (firstName.length <= 2 && parts.length > 2) firstName = parts[2]; // skip initials
      if (firstName.length <= 2) firstName = titular;
      mvs.push({
        concepto: desc.substring(0, 80),
        amount: amount, // keep sign: positive = charge, negative = credit/refund
        originalSign: amount >= 0 ? -1 : 1,
        date: fecha,
        notes: '',
        titular: firstName
      });
    }
    console.log(`[Amex XLSX] Parsed ${mvs.length} movements`);
    return mvs;
  },

  _parseIntessaV2(rows) {
    console.log('[Intessa V2] Starting parse, rows:', rows.length);
    // Find header: "Data contabile|Data valuta|Descrizione|Accrediti|Addebiti|Descrizione estesa"
    let hdrRow = -1, cDate = -1, cDesc = -1, cCredit = -1, cDebit = -1, cDescExt = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      for (let j = 0; j < r.length; j++) {
        const v = String(r[j] || '').toUpperCase().trim();
        if (v === 'DATA CONTABILE') cDate = j;
        if (v === 'DESCRIZIONE' && cDesc < 0) cDesc = j;
        if (v === 'DESCRIZIONE ESTESA') cDescExt = j;
        if (v === 'ACCREDITI' && !v.includes('VALUTA')) cCredit = j;
        if (v === 'ADDEBITI' && !v.includes('VALUTA')) cDebit = j;
      }
      if (cDesc >= 0 && (cCredit >= 0 || cDebit >= 0)) { hdrRow = i; break; }
    }
    if (hdrRow < 0) { console.log('[Intessa V2] Header not found'); return []; }
    console.log(`[Intessa V2] Header at row ${hdrRow}: cDate=${cDate} cDesc=${cDesc} cCredit=${cCredit} cDebit=${cDebit} cDescExt=${cDescExt}`);

    // Extract saldo finale
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const joined = r.map(c => String(c||'').toUpperCase()).join('|');
      if (joined.includes('SALDO CONTABILE FINALE')) {
        // Find the numeric value in this row
        for (let j = 0; j < r.length; j++) {
          const v = parseFloat(r[j]);
          if (!isNaN(v) && v !== 0) {
            this._impSaldo = { value: v, date: '' };
            console.log(`[Intessa V2] Saldo finale: ${v}`);
            break;
          }
        }
      }
    }

    const FEE_PATTERNS = ['COMMISSIONI E SPESE', 'COMMISSIONE DISPOSIZIONE', 'COMMISSIONE PAGAMENTO', 'COSTO BONIFICO'];
    const rawMvs = [];
    for (let i = hdrRow + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const desc = String(r[cDesc] || '').trim();
      if (!desc) continue;
      // Skip saldo lines
      if (desc.toUpperCase().includes('SALDO CONTABILE')) continue;
      const credit = parseFloat(r[cCredit]) || 0;
      const debit = parseFloat(r[cDebit]) || 0;
      const rawAmount = credit + debit; // debit is already negative
      if (rawAmount === 0) continue;
      const descExt = cDescExt >= 0 ? String(r[cDescExt] || '').trim() : '';
      const date = r[cDate] || '';
      rawMvs.push({ concepto: desc.substring(0, 80), amount: Math.abs(rawAmount), originalSign: rawAmount > 0 ? 1 : -1, date, notes: descExt.substring(0, 200), _rawAmount: rawAmount });
    }
    console.log(`[Intessa V2] Raw movements: ${rawMvs.length}`);

    // Consolidate fees with parent operations
    return this._consolidateIntessaFees(rawMvs, FEE_PATTERNS, 'Intessa V2');
  },

  _parseVisaIntesa(rows) {
    console.log('[Visa Intesa] Starting parse, rows:', rows.length);
    // Header: "Data contabile|Data valuta|Descrizione|Accrediti in valuta|Accrediti|Addebiti in valuta|Addebiti"
    let hdrRow = -1, cDate = -1, cDesc = -1, cCreditEur = -1, cDebitEur = -1, cCreditFx = -1, cDebitFx = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      for (let j = 0; j < r.length; j++) {
        const v = String(r[j] || '').toUpperCase().trim();
        if (v === 'DATA CONTABILE') cDate = j;
        if (v === 'DESCRIZIONE') cDesc = j;
        if (v === 'ACCREDITI IN VALUTA') cCreditFx = j;
        if (v === 'ACCREDITI' && !v.includes('VALUTA')) cCreditEur = j;
        if (v === 'ADDEBITI IN VALUTA') cDebitFx = j;
        if (v === 'ADDEBITI' && !v.includes('VALUTA')) cDebitEur = j;
      }
      if (cDesc >= 0 && (cCreditEur >= 0 || cDebitEur >= 0 || cCreditFx >= 0 || cDebitFx >= 0)) { hdrRow = i; break; }
    }
    if (hdrRow < 0) { console.log('[Visa Intesa] Header not found'); return []; }
    console.log(`[Visa Intesa] Header at row ${hdrRow}: cDate=${cDate} cDesc=${cDesc} cCreditEur=${cCreditEur} cDebitEur=${cDebitEur}`);

    const mvs = [];
    for (let i = hdrRow + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const desc = String(r[cDesc] || '').trim();
      if (!desc) continue;
      if (desc.toUpperCase().includes('IMPORTO TOTALE')) continue;
      // Get amount: prefer EUR columns, fallback to FX
      let amount = 0;
      for (const col of [cDebitEur, cCreditEur, cDebitFx, cCreditFx]) {
        if (col < 0) continue;
        const v = r[col];
        if (v == null) continue;
        const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.').split(/\s/)[0]);
        if (!isNaN(n) && n !== 0) { amount = Math.abs(n); break; }
      }
      if (amount === 0) continue;
      mvs.push({
        concepto: desc.substring(0, 80),
        amount: amount,
        originalSign: -1, // card charges are expenses
        date: r[cDate] || '',
        notes: '',
        titular: 'Sylvia'
      });
    }
    console.log(`[Visa Intesa] Parsed ${mvs.length} movements`);
    return mvs;
  },

  // Shared fee consolidation logic for Intessa parsers
  _consolidateIntessaFees(rawMvs, FEE_PATTERNS, label) {
    const consolidated = [];
    const used = new Set();
    for (let i = 0; i < rawMvs.length; i++) {
      if (used.has(i)) continue;
      const mv = rawMvs[i];
      const cUp = mv.concepto.toUpperCase();
      if (FEE_PATTERNS.some(p => cUp.includes(p))) continue; // skip standalone fees
      const children = [];
      for (let j = i + 1; j < rawMvs.length && j <= i + 2; j++) {
        if (used.has(j)) continue;
        const cand = rawMvs[j];
        const candUp = cand.concepto.toUpperCase();
        if (FEE_PATTERNS.some(p => candUp.includes(p)) && cand._rawAmount < 0) {
          children.push(cand); used.add(j);
        } else break;
      }
      if (children.length > 0) {
        const totalAmount = mv.amount + children.reduce((s, c) => s + c.amount, 0);
        const feeDetail = children.map(c => c.concepto.substring(0, 30) + ': ' + c.amount.toFixed(2)).join(', ');
        consolidated.push({
          concepto: mv.concepto, amount: totalAmount, originalSign: mv.originalSign,
          date: mv.date, notes: mv.notes + (mv.notes ? ' | ' : '') + 'Incl. ' + feeDetail
        });
        console.log(`[${label}] Consolidated: '${mv.concepto.substring(0,40)}' + ${children.length} fees → ${totalAmount.toFixed(2)}`);
      } else {
        consolidated.push({ concepto: mv.concepto, amount: mv.amount, originalSign: mv.originalSign, date: mv.date, notes: mv.notes });
      }
    }
    console.log(`[${label}] Final: ${consolidated.length} movements (from ${rawMvs.length} raw)`);
    return consolidated;
  },

  _parseIntessa(rows) {
    console.log('[Intessa] Starting parse, rows:', rows.length);
    // Find header row with "Operazione" AND "Importo" on the SAME row
    let hdrRow = -1, cOp = -1, cDett = -1, cCat = -1, cImporto = -1, cDate = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      let foundOp = -1, foundImp = -1;
      for (let j = 0; j < r.length; j++) {
        const v = String(r[j] || '').toUpperCase().trim();
        // Must be a short header cell (not "Tipo operazione: Tutti")
        if (v.length > 30) continue;
        if (v === 'OPERAZIONE' || v === 'OPERAZIONE ') foundOp = j;
        if (v === 'IMPORTO' || v === 'IMPORTO ') foundImp = j;
        if (v.includes('DETTAGLI')) cDett = j;
        if (v.includes('CATEGORIA')) cCat = j;
        if (v === 'DATA' || v === 'DATA ') cDate = j;
      }
      if (foundOp >= 0 && foundImp >= 0) {
        hdrRow = i; cOp = foundOp; cImporto = foundImp;
        break;
      }
    }
    console.log(`[Intessa] Header at row ${hdrRow}: cDate=${cDate} cOp=${cOp} cDett=${cDett} cCat=${cCat} cImporto=${cImporto}`);
    if (hdrRow < 0 || cImporto < 0) {
      console.log('[Intessa] Header not found, trying fallback');
      return [];
    }

    if (cDett < 0) cDett = cOp + 1;
    if (cCat < 0) cCat = 5;
    if (cDate < 0) cDate = 0;

    const mvs = [];
    for (let i = hdrRow + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const concepto = String(r[cOp] || '').trim();
      if (!concepto) continue;
      // Try primary column, then scan for amount if not found
      let rawAmount = parseFloat(r[cImporto]);
      if (isNaN(rawAmount) || rawAmount === 0) {
        // Scan row for a numeric value that could be the amount
        for (let j = r.length - 1; j >= 0; j--) {
          if (j === cOp || j === cDett || j === cCat || j === cDate) continue;
          const v = r[j];
          if (typeof v === 'number' && v !== 0) { rawAmount = v; break; }
          const n = parseFloat(v);
          if (!isNaN(n) && n !== 0) { rawAmount = n; break; }
        }
      }
      if (!rawAmount || rawAmount === 0) continue;
      const dettagli = String(r[cDett] || '').trim();
      const categoria = String(r[cCat] || '').trim();
      const notes = [dettagli, categoria].filter(Boolean).join(' | ');
      mvs.push({ concepto: concepto.substring(0, 80), amount: Math.abs(rawAmount), originalSign: rawAmount > 0 ? 1 : -1, date: r[cDate] || '', notes, _rawAmount: rawAmount });
    }
    console.log(`[Intessa] Parsed ${mvs.length} raw movements`);
    const FEE_PATTERNS = ['COMMISSIONI E SPESE', 'COMMISSIONE DISPOSIZIONE', 'COMMISSIONE PAGAMENTO', 'COSTO BONIFICO'];
    return this._consolidateIntessaFees(mvs, FEE_PATTERNS, 'Intessa V1');
  },

  _parseIberia(rows) {
    console.log('[Iberia] Starting parse, rows:', rows.length);
    const mvs = [];
    let currentTitular = '';
    const SKIP_CONCEPTO = ['TOTAL','CARGAR','COMISION','IMPORTE','DEUDA','EXTRACTO','PUNTOS','INTERESES','TAE','FORMA DE PAGO','PAGO APLAZADO','CAJEROS'];

    // Step 1: Find header row and detect column indices dynamically
    let hdrRow = -1, cNum = -1, cFecha = -1, cComercio = -1, cDivisa = -1, cEuros = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      for (let j = 0; j < r.length; j++) {
        const v = String(r[j] || '').toUpperCase().trim();
        if (v.includes('COMERCIO')) { cComercio = j; hdrRow = i; }
        if (v.includes('IMPORTE EUROS') || v === 'IMPORTE EUR') cEuros = j;
        if (v.includes('IMPORTE DIVISA') || v === 'IMPORTE DIV') cDivisa = j;
        if (v.includes('FECHA OPERACIÓN') || v === 'FECHA OPERACION') cFecha = j;
        if (v === 'Nº' || v === 'N°' || v === 'NO') cNum = j;
      }
      if (cComercio >= 0) break;
    }
    console.log(`[Iberia] Header at row ${hdrRow}: cNum=${cNum} cFecha=${cFecha} cComercio=${cComercio} cDivisa=${cDivisa} cEuros=${cEuros}`);
    if (cComercio < 0) { console.log('[Iberia] No COMERCIO column found'); return []; }
    // Fallback: if IMPORTE EUROS not found, use last numeric column
    if (cEuros < 0) cEuros = cDivisa >= 0 ? cDivisa : cComercio + 2;

    // Step 2: Find titular rows (above header sections, contain "IBERIA")
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;

      // Titular detection: any cell contains "IBERIA" and another cell has a name
      let hasIberia = false, name = '';
      for (let j = 0; j < r.length; j++) {
        const v = String(r[j] || '').trim();
        if (v.toUpperCase().includes('IBERIA') && v.length < 80) hasIberia = true;
        // Name is typically a cell with text that's not a number and not IBERIA-related
        if (v.length > 5 && !/IBERIA|ICON|VISA|MASTER|CARD|Nº|FECHA|COMERCIO|IMPORTE|TOTAL/i.test(v) && isNaN(parseFloat(v))) {
          name = v;
        }
      }
      if (hasIberia && name) {
        // Use first name only (e.g. "Daniel Garcia Bornholt" → "Daniel")
        const firstName = name.split(/\s+/)[0];
        // Exclude false positives like "Comisiones"
        if (/^(comision|total|importe|extracto|deuda|interese|puntos)/i.test(firstName)) continue;
        currentTitular = firstName;
        console.log(`[Iberia] Titular: '${currentTitular}' at row ${i}`);
        continue;
      }

      // Skip rows before/at header
      if (i <= hdrRow) continue;

      // Data row: must have a sequential number in cNum column
      const numVal = cNum >= 0 ? r[cNum] : r[0];
      const num = typeof numVal === 'number' ? numVal : parseFloat(numVal);
      if (isNaN(num) || num < 1 || num > 999 || num !== Math.floor(num)) continue;

      const concepto = String(r[cComercio] || '').trim();
      const amount = parseFloat(r[cEuros]) || 0;
      const fecha = cFecha >= 0 ? String(r[cFecha] || '') : '';

      if (!concepto || Math.abs(amount) < 0.01) continue;
      if (!currentTitular) continue;

      const cUp = concepto.toUpperCase();
      if (SKIP_CONCEPTO.some(w => cUp.includes(w))) {
        console.log(`[Iberia] Skip keyword: '${concepto}'`);
        continue;
      }

      mvs.push({
        concepto: concepto.substring(0, 80),
        amount: amount,  // keep original sign (negative = refund/bonification)
        originalSign: amount >= 0 ? -1 : 1,
        date: fecha,
        notes: '',
        titular: currentTitular
      });
    }
    console.log(`[Iberia] Parsed ${mvs.length} movements`);
    return mvs;
  },

  _parseCaixa(rows) {
    let hdr = -1, colMap = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]; if (!row) continue;
      const joined = row.map(c => String(c||'').toUpperCase()).join('|');
      if (joined.includes('MOVIMIENTO') && (joined.includes('IMPORTE') || joined.includes('SALDO'))) {
        hdr = i;
        row.forEach((c, j) => {
          const val = String(c||'').toUpperCase().trim();
          if (val === 'FECHA') colMap.fecha = j;
          if (val === 'MOVIMIENTO') colMap.movimiento = j;
          if (val.includes('MÁS DATOS') || val.includes('MAS DATOS')) colMap.masDatos = j;
          if (val === 'IMPORTE') colMap.importe = j;
          if (val === 'SALDO') colMap.saldo = j;
        });
        break;
      }
    }
    if (hdr < 0) return [];
    const cF = colMap.fecha ?? 0, cM = colMap.movimiento ?? 2, cD = colMap.masDatos ?? 3, cI = colMap.importe ?? 4, cS = colMap.saldo ?? 5;
    const mvs = [];
    let lastSaldo = null, lastDate = null;
    for (let i = hdr + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const mov = String(r[cM] || '').trim();
      const rawImp = parseFloat(r[cI]) || 0;
      if (!mov || rawImp === 0) continue;
      const masDatos = String(r[cD] || '').trim();
      const date = r[cF] || '';
      const saldo = parseFloat(r[cS]);
      if (!isNaN(saldo)) { lastSaldo = saldo; lastDate = date; }
      mvs.push({ concepto: mov.substring(0, 80), amount: Math.abs(rawImp), originalSign: rawImp > 0 ? 1 : -1, date, notes: masDatos.substring(0, 200) });
    }
    if (lastSaldo !== null) this._impSaldo = { value: lastSaldo, date: lastDate };
    return mvs;
  },

  _parseCIC(rows) {
    let hdr = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]; if (!row) continue;
      const joined = row.map(c => String(c||'').toUpperCase()).join('|');
      if (joined.includes('MESSAGE') && (joined.includes('DEBIT') || joined.includes('CREDIT'))) { hdr = i; break; }
    }
    if (hdr < 0) return [];
    const mvs = [];
    let lastSaldo = null, lastDate = null;
    for (let i = hdr + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const date = r[0] || '';
      const message = String(r[2] || '').trim();
      const debit = parseFloat(r[3]) || 0;
      const credit = parseFloat(r[4]) || 0;
      if (!message || (debit === 0 && credit === 0)) continue;
      const amount = debit !== 0 ? Math.abs(debit) : credit;
      const sign = credit > 0 ? 1 : -1;
      if (typeof r[5] === 'number') { lastSaldo = r[5]; lastDate = date; }
      mvs.push({ concepto: message.substring(0, 80), amount, originalSign: sign, date, notes: '' });
    }
    for (let i = rows.length - 1; i > hdr; i--) {
      const r = rows[i]; if (!r) continue;
      if (String(r[3]||'').toUpperCase().includes('BALANCE') && typeof r[5] === 'number') { lastSaldo = r[5]; break; }
    }
    if (lastSaldo !== null) this._impSaldo = { value: lastSaldo, date: lastDate };
    return mvs;
  },

  async _parseCSV(file) {
    const text = await file.text();
    const firstLine = text.split('\n')[0] || '';
    if (firstLine.toUpperCase().includes('TITULAR') || firstLine.toUpperCase().includes('CARD')) return this._parseAmexCSV(text);
    const lines = text.split('\n').map(l => l.split(/[,;\t]/).map(c => c.trim().replace(/^"(.*)"$/, '$1')));
    return this._parseGenericRows(lines.map(l => l.map(c => { const n = parseFloat(String(c).replace(/\./g,'').replace(',', '.')); return isNaN(n) ? c : n; })));
  },

  _parseAmexCSV(text) {
    const lines = text.split('\n');
    const mvs = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim(); if (!line) continue;
      const parts = []; let cur = '', inQ = false;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === ',' && !inQ) { parts.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      parts.push(cur.trim());
      if (parts.length < 5) continue;
      const amount = parseFloat(parts[4].replace(/\./g,'').replace(',','.')) || 0;
      if (!parts[1] || amount === 0) continue;
      mvs.push({ concepto: parts[1].substring(0, 80), amount: Math.abs(amount), originalSign: -1, date: parts[0], notes: '', titular: parts[2] || '' });
    }
    return mvs;
  },

  // ══════════ PDF PARSING ══════════

  async _parsePDF(file) {
    // Load pdf.js if not already loaded
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    let allText = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // Join items with spaces, but add newline between page sections
      const pageText = content.items.map(i => i.str).join(' ');
      allText += pageText + ' \n ';
    }
    console.log('[PDF] Pages:', pdf.numPages, 'Text length:', allText.length);
    // Detect Amex format
    if (allText.toUpperCase().includes('AMERICAN EXPRESS') || allText.toUpperCase().includes('TARJETA PLATINUM')) {
      return this._parseAmexPDF(allText);
    }
    console.log('[PDF] Unknown format, no parser matched');
    return [];
  },

  _parseAmexPDF(text) {
    console.log('[Amex PDF] Starting parse, text length:', text.length);
    const mvs = [];
    let currentTitular = '';

    // Lines to skip entirely
    const SKIP = ['RECIBO ENVIADO','TOTAL DE TRANSAC','TRANSACCIONES FINANC','SALDO ANTERIOR',
      'PAGOS Y/O','NUEVAS COMPRAS','SALDO ACTUAL','IMPORTE A PAGAR','MEMBERSHIP','PUNTOS',
      'INFORME ANUAL','CUOTAS Y OTROS','INFORMACIÓN AJENA'];

    // ── Step 1: Detect titulares and their positions ──
    const titularMap = [];
    const titRe = /cargos y abonos del Titular\s+(?:SR[A]?\.\s+)?([A-ZÁÉÍÓÚÑ]+)/gi;
    let tm;
    while ((tm = titRe.exec(text)) !== null) {
      titularMap.push({ pos: tm.index, name: tm[1] });
      console.log(`[Amex PDF] Titular: '${tm[1]}' at pos ${tm.index}`);
    }
    // Also detect TRANSACCIONES FINANCIERAS section
    const finIdx = text.toUpperCase().indexOf('TRANSACCIONES FINANCIERAS');
    if (finIdx >= 0) titularMap.push({ pos: finIdx, name: '_FINANCIERAS' });

    // ── Step 2: Find all DD.MM.YY DD.MM.YY anchors (transaction starts) ──
    const txRe = /(\d{2}\.\d{2}\.\d{2})\s+(\d{2}\.\d{2}\.\d{2})\s+/g;
    const anchors = [];
    let am;
    while ((am = txRe.exec(text)) !== null) {
      anchors.push({ pos: am.index, date1: am[1], date2: am[2], afterPos: am.index + am[0].length });
    }
    console.log(`[Amex PDF] Found ${anchors.length} date anchors, ${titularMap.length} titulares`);

    // ── Step 3: Process each anchor ──
    for (let idx = 0; idx < anchors.length; idx++) {
      const a = anchors[idx];
      const nextPos = idx + 1 < anchors.length ? anchors[idx + 1].pos : text.length;
      let block = text.substring(a.afterPos, nextPos).trim();

      // Determine titular for this position
      let tit = 'Principal';
      for (let t = titularMap.length - 1; t >= 0; t--) {
        if (titularMap[t].pos < a.pos) { tit = titularMap[t].name; break; }
      }
      currentTitular = tit;

      // Cut at section boundaries
      const STOP = ['Total de transac','Nuevos cargos','Tarjeta Platinum','Número de Cuenta',
        'TRANSACCIONES FINANC','Información ajena','Informe anual','Membership Rewards',
        'American Express Europe'];
      for (const stop of STOP) {
        const si = block.toLowerCase().indexOf(stop.toLowerCase());
        if (si >= 0) block = block.substring(0, si).trim();
      }
      if (!block) continue;

      // ── Step 4: Clean block — remove metadata BEFORE extracting amounts ──
      // Cut at "Cambio aplicado" (FX detail), "Itinerario", "Llegada", "Nº de billete"
      // These lines contain EUR-format numbers that would confuse amount extraction
      let cleanBlock = block;
      cleanBlock = cleanBlock.replace(/Cambio aplicado.*/i, '').trim();
      cleanBlock = cleanBlock.replace(/Itinerario.*/i, '').trim();
      cleanBlock = cleanBlock.replace(/Llegada.*/i, '').trim();
      cleanBlock = cleanBlock.replace(/Nº de billete.*/i, '').trim();
      if (!cleanBlock) continue;

      // ── Step 5: Extract EUR amount from clean block ──
      // Find ALL amounts in European format: "329,00" or "6.270,40" or "9.864,70"
      const amtMatches = [...cleanBlock.matchAll(/([\d.]+,\d{2})\s*(CR)?/g)];
      if (!amtMatches.length) continue;

      // The LAST EUR-format amount in the block is always the EUR importe
      const lastAmt = amtMatches[amtMatches.length - 1];
      const amtStr = lastAmt[1].replace(/\./g, '').replace(',', '.');
      const amount = parseFloat(amtStr) || 0;
      const isCR = !!lastAmt[2];

      // ── Step 6: Extract concepto from clean block ──
      let concepto = cleanBlock;

      // Remove foreign currency amounts and labels
      concepto = concepto.replace(/[\d.,]+\s*(Dólar|Libra|Dong|Euro|U\.S\.A\.|Esterlina|Vietnamita)[^\n]*/gi, '').trim();
      // Remove standalone decimal amounts (foreign amounts like "279.39", "745.27")
      concepto = concepto.replace(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/g, '').trim();
      // Remove EUR amounts that leaked in
      concepto = concepto.replace(/[\d.]+,\d{2}\s*(CR)?/g, '').trim();
      // Clean up card fee reference numbers
      concepto = concepto.replace(/\d{15,}/g, '').trim();
      // Collapse whitespace
      concepto = concepto.replace(/\s{2,}/g, ' ').trim();

      if (!concepto || amount < 0.01) continue;

      // Check skip list
      const cUp = concepto.toUpperCase();
      if (SKIP.some(s => cUp.includes(s))) {
        console.log(`[Amex PDF] Skip: '${concepto}'`);
        continue;
      }

      // Convert DD.MM.YY to DD/MM/YYYY
      const [d, m, y] = a.date1.split('.');
      const fullDate = `${d}/${m}/20${y}`;

      // For FINANCIERAS section, use titular = 'Financiero'
      const titular = currentTitular === '_FINANCIERAS' ? 'Financiero' : currentTitular;

      mvs.push({
        concepto: concepto.substring(0, 80),
        amount: isCR ? -amount : amount,
        originalSign: isCR ? 1 : -1,
        date: fullDate,
        notes: '',
        titular: titular || 'Principal'
      });
    }

    console.log(`[Amex PDF] Parsed ${mvs.length} movements`);
    // Debug: log first 10
    mvs.slice(0, 10).forEach((m, i) => console.log(`  [${i}] ${m.date} ${m.titular} ${m.concepto} → ${m.amount}`));
    return mvs;
  },

  _parseGenericRows(rows) {
    const mvs = [];
    const HDR = ['FECHA','CONCEPTO','IMPORTE','SALDO','VALOR','DATE','AMOUNT','DESCRIPTION','OPERAZIONE','COMERCIO','BALANCE','MOVIMIENTO'];
    for (const r of rows) {
      if (!r) continue;
      const txt = r.map(c => String(c||'').toUpperCase()).join(' ');
      if (HDR.filter(w => txt.includes(w)).length >= 2) continue;
      let concepto = '', amount = 0, notes = '';
      for (const v of r) {
        if (v && typeof v === 'string' && v.trim().length > 2 && !concepto) concepto = v.trim();
        else if (v && typeof v === 'string' && v.trim().length > 10 && concepto && !notes) notes = v.trim();
        if (typeof v === 'number' && Math.abs(v) > 0.01 && !amount) amount = v;
      }
      if (concepto && amount) mvs.push({ concepto: concepto.substring(0, 80), amount: Math.abs(amount), originalSign: amount > 0 ? 1 : -1, date: '', notes: notes.substring(0, 200) });
    }
    return mvs;
  },

  async _parseGenericHTML(file) {
    const text = await file.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const rows = [];
    doc.querySelectorAll('tr').forEach(tr => {
      const cells = [];
      tr.querySelectorAll('td,th').forEach(td => { const t = td.textContent.trim(); const n = parseFloat(t.replace(/\./g,'').replace(',','.')); cells.push(isNaN(n) ? t : n); });
      if (cells.length) rows.push(cells);
    });
    return this._parseGenericRows(rows);
  },

  // ══════════ IMPORT CONFIRM ══════════

  async _impConfirm(type) {
    const movements = this._impMovements;
    if (!movements || !movements.length) return;
    const fallbackMonth = parseInt(document.getElementById('imp-month').value);
    const card = type === 'tarjeta' ? (document.getElementById('imp-card')?.value || '') : '';
    const pv = document.getElementById('imp-pv');
    if (type === 'tarjeta' && !card) { alert('Selecciona una tarjeta'); return; }

    const TARJETA_PATTERNS = ['IBERIA CARDS','VISA ','MASTERCARD','AMEX','AMERICAN EXPRESS'];
    const now = new Date().toISOString();
    const year = AppState.currentYear;
    let tarIdx = 0;

    // Consolidate: for BANK imports, group same concepto+notes into one row per month
    // For TARJETA imports, do NOT consolidate — each movement stays as child of titular
    // EXCEPT for consolidation groups (KINDLE, APPLE.COM) which get merged with breakdown
    const TARJETA_CONSOLIDATION_GROUPS = [
      { pattern: 'KINDLE SVCS', label: 'Kindle' },
      { pattern: 'APPLE.COM/BILL', label: 'Apple.com/Bill' }
    ];
    const consolidated = new Map();
    const breakdowns = new Map(); // key → { monthIndex: [{d: date, a: amount}] }

    for (const mv of movements) {
      const rawC = String(mv.concepto || '').substring(0, 80);
      const notes = mv.notes ? String(mv.notes).substring(0, 200) : '';
      const titular = mv.titular || '';

      // For tarjeta: ALL charges go to month BEFORE the combo (extracto month)
      // For bank: use date from movement, fallback to combo month
      let mi, mvYear;
      if (type === 'tarjeta') {
        mi = fallbackMonth - 2; // combo is 1-based, we need 0-based AND minus 1 month
        if (mi < 0) mi = 11; // Jan extracto → Dec previous year
        mvYear = mi === 11 && fallbackMonth === 1 ? year - 1 : year;
      } else {
        const extracted = this._extractDate(mv.date, fallbackMonth - 1);
        mi = extracted.month;
        mvYear = extracted.year;
      }

      if (mvYear !== null && mvYear !== year) continue;

      let section;
      if (type === 'tarjeta') { section = 'TARJETAS'; }
      else {
        const isTar = TARJETA_PATTERNS.some(p => rawC.toUpperCase().includes(p));
        section = isTar ? 'TARJETAS' : (mv.originalSign > 0 ? 'INGRESOS' : 'GASTOS');
      }

      const dateStr = mv.date instanceof Date ? mv.date.toLocaleDateString('es') : String(mv.date || '').substring(0, 10);

      if (type === 'tarjeta') {
        // Check if this movement matches a consolidation group
        const cUp = rawC.toUpperCase();
        const group = TARJETA_CONSOLIDATION_GROUPS.find(g => cUp.includes(g.pattern));

        if (group) {
          // Consolidate into a single row per titular+group+month
          const groupKey = `grp_${titular}_${group.label}`;
          const dateStr = mv.date instanceof Date ? mv.date.toLocaleDateString('es') : String(mv.date || '').substring(0, 10);

          if (consolidated.has(groupKey)) {
            consolidated.get(groupKey).amounts[mi] = (consolidated.get(groupKey).amounts[mi] || 0) + mv.amount;
            if (!breakdowns.get(groupKey)[mi]) breakdowns.get(groupKey)[mi] = [];
            breakdowns.get(groupKey)[mi].push({ d: dateStr, a: mv.amount, c: rawC.substring(0, 50) });
          } else {
            const amounts = new Array(12).fill(0);
            amounts[mi] = mv.amount;
            const rule = BudgetLogic.findRuleWithNotes ? BudgetLogic.findRuleWithNotes(group.label, '', this.activeBank) : BudgetLogic.findRule(group.label, this.activeBank);
            consolidated.set(groupKey, { concepto: group.label, section, notes: '', titular, amounts, rule });
            const bd = {};
            bd[mi] = [{ d: dateStr, a: mv.amount, c: rawC.substring(0, 50) }];
            breakdowns.set(groupKey, bd);
          }
        } else {
          // No consolidation — each row is individual child of titular
          // Keep original sign so refunds (BON. COMI.CAMBIO DIV) reduce the total
          const uid = `tar_${tarIdx++}_${Math.random().toString(36).substring(2,6)}`;
          const amounts = new Array(12).fill(0);
          amounts[mi] = mv.amount; // keep sign
          const rule = BudgetLogic.findRuleWithNotes ? BudgetLogic.findRuleWithNotes(rawC, notes, this.activeBank) : BudgetLogic.findRule(rawC, this.activeBank);
          consolidated.set(uid, { concepto: rawC, section, notes, titular, amounts, rule });
        }
      } else {
        // Bank imports: consolidate same concepto+notes
        const normKey = this._norm(rawC) + '|||' + this._norm(notes) + '|||' + section;
        if (consolidated.has(normKey)) {
          consolidated.get(normKey).amounts[mi] = (consolidated.get(normKey).amounts[mi] || 0) + Math.abs(mv.amount);
          if (!breakdowns.get(normKey)[mi]) breakdowns.get(normKey)[mi] = [];
          breakdowns.get(normKey)[mi].push({ d: dateStr, a: Math.abs(mv.amount) });
        } else {
          const amounts = new Array(12).fill(0);
          amounts[mi] = Math.abs(mv.amount);
          const rule = BudgetLogic.findRuleWithNotes ? BudgetLogic.findRuleWithNotes(rawC, notes, this.activeBank) : BudgetLogic.findRule(rawC, this.activeBank);
          consolidated.set(normKey, { concepto: rawC, section, notes, titular: '', amounts, rule });
          const bd = {};
          bd[mi] = [{ d: dateStr, a: Math.abs(mv.amount) }];
          breakdowns.set(normKey, bd);
        }
      }
    }

    const existingLines = this.lines.filter(l => l.bank === this.activeBank);
    const total = consolidated.size;
    let count = 0, merged = 0, autoCat = 0;

    const showProg = () => {
      pv.innerHTML = `<div style="padding:8px;"><div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">Importando ${count}/${total}...</div><div style="background:#e2e8f0;border-radius:4px;height:6px;"><div style="background:var(--accent);height:100%;width:${Math.round(count/total*100)}%;transition:width .2s;border-radius:4px;"></div></div></div>`;
    };
    showProg();

    const titularParents = new Map();
    // Check existing parent lines in BUDGET_LINES for this bank
    existingLines.filter(l => l.section === 'TARJETAS' && !l.parentId).forEach(l => {
      // If the concepto matches a known titular name exactly, use it as parent
      titularParents.set(l.concepto.trim(), l.id);
    });

    for (const [key, entry] of consolidated) {
      const { concepto, section, notes, amounts, rule, titular } = entry;
      const normLabel = this._norm(concepto);
      const existing = existingLines.find(l => this._norm(l.concepto) === normLabel && l.section === section);

      // Build breakdown JSON for consolidated rows (bank OR tarjeta groups)
      const bd = breakdowns.get(key);
      let breakdownJson = '';
      if (bd) {
        const hasMulti = Object.values(bd).some(arr => arr && arr.length > 1);
        if (hasMulti) breakdownJson = JSON.stringify(bd);
      }

      if (existing) {
        let updated = false;
        for (let m = 0; m < 12; m++) {
          if (amounts[m] > 0 && !existing.real[m]) {
            existing.real[m] = amounts[m];
            await BudgetLogic.updateBudgetCell(existing.sheetRow, BudgetLogic.getRealCol(m), amounts[m]);
            updated = true;
          }
        }
        if (updated) merged++;
      } else {
        const casa = rule ? rule.casa : '', cat = rule ? rule.categoria : '', subcat = rule ? rule.subcategoria : '';
        if (rule) autoCat++;
        let parentId = '';
        if (titular && type === 'tarjeta') {
          if (!titularParents.has(titular)) {
            const pid = BudgetLogic.generateId('BL');
            titularParents.set(titular, pid);
            await SheetsAPI.appendRow(CONFIG.SHEETS.BUDGET_LINES, [pid, this.activeBank, year, section, titular, '', '', '', 'variable', ...new Array(24).fill(0), 'FALSE', 0, 'ACTIVE', now, now, '', '', '']);
          }
          parentId = titularParents.get(titular);
        }
        const id = BudgetLogic.generateId('BL');
        const plan = new Array(12).fill(0);
        await SheetsAPI.appendRow(CONFIG.SHEETS.BUDGET_LINES, [id, this.activeBank, year, section, concepto, casa, cat, subcat, 'one-off', ...plan, ...amounts, 'FALSE', 999, 'ACTIVE', now, now, notes, parentId, '', breakdownJson]);
      }
      count++;
      if (count % 3 === 0) showProg();
    }

    // Auto-import saldo
    if (this._impSaldo) {
      const { month: sm } = this._extractDate(this._impSaldo.date, fallbackMonth - 1);
      const meta = this.bankMeta[this.activeBank];
      if (meta) { meta.saldo[sm] = this._impSaldo.value; await this._saveBankMeta(sm, 'saldo', this._impSaldo.value); }
    }

    let msg = `✅ ${count} conceptos importados`;
    if (merged > 0) msg += `<br><span style="color:#64748b;">🔄 ${merged} fusionados</span>`;
    if (autoCat > 0) msg += `<br><span style="color:var(--accent);">⚡ ${autoCat} auto-categorizados</span>`;
    if (this._impSaldo) msg += `<br><span style="color:#0ea5e9;">💰 Saldo: ${this._f(this._impSaldo.value,1)}</span>`;
    pv.innerHTML = `<div style="font-weight:600;padding:12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;color:#065f46;">${msg}</div>`;
    document.getElementById('imp-act').style.display = 'none';
    this._impMovements = [];
    setTimeout(() => { document.querySelector('.budget-drawer-overlay')?.remove(); this.refresh(); }, 1500);
  },

  // Fixed date extraction with UTC and year
  _extractDate(dateVal, fallbackMonth) {
    if (!dateVal) return { month: fallbackMonth, year: AppState.currentYear };
    if (dateVal instanceof Date) {
      return { month: dateVal.getUTCMonth(), year: dateVal.getUTCFullYear() };
    }
    const s = String(dateVal);
    let match = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (match) return { month: parseInt(match[2]) - 1, year: parseInt(match[3]) };
    match = s.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (match) return { month: parseInt(match[2]) - 1, year: parseInt(match[1]) };
    return { month: fallbackMonth, year: AppState.currentYear };
  }
};
