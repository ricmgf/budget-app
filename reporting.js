/**
 * reporting.js — Módulo de Informes v1.0
 * Carga bajo demanda (solo al entrar en la pestaña Informes).
 * Una sola llamada batchGet → GASTOS_TOTAL + INGRESOS en memoria.
 * Todo el filtrado/agrupado ocurre en cliente, sin llamadas adicionales.
 */

const Reporting = (() => {

  /* ─────────────────────────────────────────────
     STATE
  ───────────────────────────────────────────── */
  let _loaded   = false;   // datos ya en memoria
  let _loading  = false;
  let _gastos   = [];      // filas raw GASTOS_TOTAL (sin cabecera)
  let _ingresos = [];      // filas raw INGRESOS (sin cabecera)
  let _config   = null;    // AppState.config

  let _tab      = 'casas'; // tab activo
  let _view     = 2;       // 2 | 12 meses
  let _catSel   = null;    // categoría seleccionada en tab Categorías
  let _hijosView= 'anual'; // 'anual' | 'mensual'
  let _dateFrom = null;    // Date
  let _dateTo   = null;    // Date

  // Columnas GASTOS_TOTAL (config.js)
  const G = { ID:0,AÑO:1,MES:2,FECHA:3,CONCEPTO:4,IMPORTE:5,CUENTA:6,CASA:7,CATEGORIA:8,SUBCATEGORIA:9,NOTAS:10,ORIGEN:11,ESTADO:12 };
  // Columnas INGRESOS
  const I = { ID:0,AÑO:1,MES:2,CUENTA:3,CONCEPTO:4,TIPO:5,IMPORTE:6,RECURRENTE:7,CATEGORIA:8,ORIGEN:9 };

  const MONTH_NAMES  = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const MONTH_LONG   = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const CASA_COLORS  = ['#2563eb','#0891b2','#7c3aed','#059669','#d97706','#dc2626','#64748b'];
  const HIJOS_CATS   = ['Sandra','Dani','Cris'];
  const HIJOS_COLORS = ['#2563eb','#0891b2','#059669'];

  /* ─────────────────────────────────────────────
     UTILS
  ───────────────────────────────────────────── */
  function toNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[^\d.,-]/g, '');
    if (s.includes(',') && s.includes('.')) {
      return s.lastIndexOf(',') > s.lastIndexOf('.') ? parseFloat(s.replace(/\./g,'').replace(',','.')) || 0 : parseFloat(s.replace(/,/g,'')) || 0;
    }
    return parseFloat(s.replace(',','.')) || 0;
  }

  function fmtNum(n) {
    if (!n || n === 0) return '<span class="rpt-nil">—</span>';
    return Math.round(n).toLocaleString('es-ES');
  }

  function fmtNumPlain(n) {
    if (!n || n === 0) return '—';
    return Math.round(n).toLocaleString('es-ES');
  }

  function e(tag, cls, html) {
    return `<${tag}${cls ? ` class="${cls}"` : ''}>${html || ''}</${tag}>`;
  }

  let _uid = 0;
  function uid() { return 'r' + (++_uid); }

  function xbtn(id, open) {
    return `<button class="rpt-xb" id="b${id}" onclick="event.stopPropagation();Reporting.toggle('${id}')">${open ? '−' : '+'}</button>`;
  }
  const xph = `<span class="rpt-xph"></span>`;

  /* ─────────────────────────────────────────────
     DATE HELPERS
  ───────────────────────────────────────────── */
  function initDates() {
    if (_dateFrom) return;
    const now = new Date();
    _dateTo   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    _dateFrom = new Date(now.getFullYear(), 0, 1); // 1 Ene año actual
  }

  function inRange(row) {
    // row has AÑO (col 1) and MES (col 2) — check month/year range
    const y = parseInt(row[G.AÑO]);
    const m = parseInt(row[G.MES]);
    if (!y || !m) return false;
    const rowDate = new Date(y, m - 1, 1);
    const from    = new Date(_dateFrom.getFullYear(), _dateFrom.getMonth(), 1);
    const to      = new Date(_dateTo.getFullYear(),   _dateTo.getMonth(),   1);
    return rowDate >= from && rowDate <= to;
  }

  function inRangeIng(row) {
    const y = parseInt(row[I.AÑO]);
    const m = parseInt(row[I.MES]);
    if (!y || !m) return false;
    const rowDate = new Date(y, m - 1, 1);
    const from    = new Date(_dateFrom.getFullYear(), _dateFrom.getMonth(), 1);
    const to      = new Date(_dateTo.getFullYear(),   _dateTo.getMonth(),   1);
    return rowDate >= from && rowDate <= to;
  }

  function activeMonths() {
    // Returns array of {year, month, label} for the current range
    const months = [];
    const from = new Date(_dateFrom.getFullYear(), _dateFrom.getMonth(), 1);
    const to   = new Date(_dateTo.getFullYear(),   _dateTo.getMonth(),   1);
    const cur  = new Date(from);
    while (cur <= to) {
      months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1, label: MONTH_NAMES[cur.getMonth() + 1] });
      cur.setMonth(cur.getMonth() + 1);
    }
    return months;
  }

  function displayMonths() {
    // In 2-month view show full names, else short
    const ms = activeMonths();
    if (_view === 2 && ms.length <= 3) {
      return ms.map(m => ({ ...m, label: MONTH_LONG[m.month] }));
    }
    return ms;
  }

  /* ─────────────────────────────────────────────
     DATA LOADING
  ───────────────────────────────────────────── */
  async function loadData(forceReload) {
    if (_loaded && !forceReload) return;
    if (_loading) return;
    _loading = true;
    setLoading(true);
    try {
      _config = AppState.config;
      if (!_config) {
        await BudgetLogic.loadConfig();
        _config = AppState.config;
      }
      const sheets = await SheetsAPI.batchGet([CONFIG.SHEETS.GASTOS, CONFIG.SHEETS.INGRESOS]);
      const gRows  = sheets[CONFIG.SHEETS.GASTOS]   || [];
      const iRows  = sheets[CONFIG.SHEETS.INGRESOS] || [];
      _gastos   = gRows.length  > 1 ? gRows.slice(1).filter(r  => r && r[G.ID])  : [];
      _ingresos = iRows.length  > 1 ? iRows.slice(1).filter(r  => r && r[I.ID])  : [];
      _loaded   = true;
      updateMeta();
    } catch(err) {
      console.error('Reporting loadData error:', err);
      setMsg('Error cargando datos. Comprueba la conexión y vuelve a intentarlo.');
    } finally {
      _loading = false;
      setLoading(false);
    }
  }

  function setLoading(on) {
    const el = document.getElementById('rpt-loading');
    if (el) el.style.display = on ? 'flex' : 'none';
    const content = document.getElementById('rpt-content');
    if (content) content.style.display = on ? 'none' : 'block';
  }

  function setMsg(msg) {
    const el = document.getElementById('rpt-loading');
    if (el) el.innerHTML = `<div class="rpt-load-text">${msg}</div>`;
  }

  function updateMeta() {
    // nothing shown per requirements
  }

  /* ─────────────────────────────────────────────
     AGGREGATION HELPERS
  ───────────────────────────────────────────── */
  function filteredGastos() {
    return _gastos.filter(r => inRange(r) && r[G.ESTADO] !== 'DELETED');
  }

  function filteredIngresos() {
    return _ingresos.filter(r => inRangeIng(r));
  }

  // Group gastos by any key function, returning Map<key, {total, rows}>
  function groupBy(rows, keyFn) {
    const map = new Map();
    rows.forEach(r => {
      const k = keyFn(r);
      if (!map.has(k)) map.set(k, { total: 0, rows: [] });
      const g = map.get(k);
      g.total += toNum(r[G.IMPORTE]);
      g.rows.push(r);
    });
    return map;
  }

  // Sum importe of rows matching condition
  function sumWhere(rows, cond) {
    return rows.filter(cond).reduce((s, r) => s + toNum(r[G.IMPORTE]), 0);
  }

  function sumIngWhere(rows, cond) {
    return rows.filter(cond).reduce((s, r) => s + toNum(r[I.IMPORTE]), 0);
  }

  /* ─────────────────────────────────────────────
     TABLE BUILDER HELPERS
  ───────────────────────────────────────────── */
  function thBar(color) {
    return `<div class="rpt-th-inner">{L}<div class="rpt-th-bar" style="background:${color}"></div></div>`;
  }

  function buildHeader(firstCol, colDefs) {
    // colDefs: [{label, color?}]
    let html = `<th class="rpt-th-first">${firstCol}</th>`;
    colDefs.forEach(c => {
      const inner = c.color
        ? `<div class="rpt-th-inner">${c.label}<div class="rpt-th-bar" style="background:${c.color}"></div></div>`
        : c.label;
      html += `<th class="rpt-th">${inner}</th>`;
    });
    html += `<th class="rpt-th rpt-th-total">Total</th>`;
    return `<thead><tr>${html}</tr></thead>`;
  }

  function totRow(label, vals, totalStyle) {
    let tds = vals.map(v => `<td class="rpt-td rpt-tot-num">${fmtNum(v)}</td>`).join('');
    const tot = vals.reduce((a,b) => a+(b||0), 0);
    tds += `<td class="rpt-td rpt-tot-num" style="${totalStyle||'color:#60a5fa'}">${fmtNum(tot)}</td>`;
    return `<tr class="rpt-tot-row"><td class="rpt-td rpt-tot-label">${label}</td>${tds}</tr>`;
  }

  function txnDetail(id, txns, colspan) {
    if (!txns || !txns.length) return '';
    const rows = txns.map(t => `
      <div class="rpt-dtx">
        <span class="rpt-dtx-d">${t.d}</span>
        <span class="rpt-dtx-c">${t.c}</span>
        <span class="rpt-dtx-a">${t.a}</span>
        <span class="rpt-dtx-m${t.income ? ' rpt-gn' : ''}">${t.income ? '+' : ''}${fmtNumPlain(t.m)}</span>
      </div>`).join('');
    return `<tr class="rpt-drow" id="${id}">
      <td class="rpt-dc" colspan="${colspan}">
        <div class="rpt-di">
          <div class="rpt-di-label">${txns.length} transacción${txns.length !== 1 ? 'es' : ''}</div>
          <div class="rpt-dtxns">${rows}</div>
        </div>
      </td>
    </tr>`;
  }

  // Convert raw gasto rows to txn objects for detail
  function rowsToTxns(rows) {
    return rows.map(r => ({
      d: MONTH_NAMES[parseInt(r[G.MES])] || r[G.MES],
      c: r[G.CONCEPTO] || '',
      a: r[G.CUENTA]   || '',
      m: toNum(r[G.IMPORTE]),
    })).sort((a,b) => a.d.localeCompare(b.d));
  }

  function rowsToTxnsIng(rows) {
    return rows.map(r => ({
      d: MONTH_NAMES[parseInt(r[I.MES])] || r[I.MES],
      c: r[I.CONCEPTO] || '',
      a: r[I.CUENTA]   || '',
      m: toNum(r[I.IMPORTE]),
      income: true,
    })).sort((a,b) => a.d.localeCompare(b.d));
  }

  /* ─────────────────────────────────────────────
     TAB: CASAS
  ───────────────────────────────────────────── */
  function renderCasas() {
    const gastos = filteredGastos();
    const ms     = displayMonths();
    const casas  = [...new Set(gastos.map(r => r[G.CASA]).filter(Boolean))].sort();

    // Use config casas if available, else derive from data
    const configCasas = (_config?.casas || []).map(c => c.name);
    const allCasas = configCasas.length ? configCasas.filter(c => casas.includes(c)) : casas;

    // All categories present in data
    const configCats = Object.keys(_config?.categorias || {});

    // Cols = casas
    const colDefs = allCasas.map((casa, i) => ({ label: casa, color: CASA_COLORS[i % CASA_COLORS.length] }));
    const COLSPAN  = allCasas.length + 2;

    // Build category → subcategory → casa → month breakdown
    // For casas view: rows = categories, cols = casas
    let tbody = '';

    const catTotals = new Array(allCasas.length).fill(0);

    configCats.forEach(cat => {
      const catRows = gastos.filter(r => r[G.CATEGORIA] === cat);
      if (!catRows.length) return;

      const catVals = allCasas.map(casa => sumWhere(catRows, r => r[G.CASA] === casa));
      if (catVals.every(v => v === 0)) return;
      catVals.forEach((v,i) => catTotals[i] += v);

      const catId = uid();
      let catTds = catVals.map(v => `<td class="rpt-td rpt-hi">${fmtNum(v)}</td>`).join('');
      catTds += `<td class="rpt-td rpt-hi">${fmtNum(catVals.reduce((a,b)=>a+b,0))}</td>`;
      tbody += `<tr class="rpt-cat-row" onclick="Reporting.toggleSec('${catId}')">
        <td class="rpt-td rpt-td-first">${xbtn(catId, false)}${cat}</td>${catTds}
      </tr>`;

      // Subcategories
      const subs = [...new Set(catRows.map(r => r[G.SUBCATEGORIA]).filter(Boolean))];
      subs.forEach(sub => {
        const subRows = catRows.filter(r => r[G.SUBCATEGORIA] === sub);
        const subVals = allCasas.map(casa => sumWhere(subRows, r => r[G.CASA] === casa));
        if (subVals.every(v => v === 0)) return;

        const subId  = uid();
        const txns   = rowsToTxns(subRows);
        let subTds   = subVals.map(v => `<td class="rpt-td">${fmtNum(v)}</td>`).join('');
        subTds += `<td class="rpt-td rpt-hi">${fmtNum(subVals.reduce((a,b)=>a+b,0))}</td>`;

        tbody += `<tr class="rpt-sub-row" data-g="${catId}" style="display:none"
          onclick="event.stopPropagation();Reporting.toggle('${subId}')">
          <td class="rpt-td rpt-td-sub">${xbtn(subId, false)}${sub}</td>${subTds}
        </tr>`;
        tbody += txnDetail(subId, txns, COLSPAN);
      });

      // Uncategorized sub items
      const uncat = catRows.filter(r => !r[G.SUBCATEGORIA] || r[G.SUBCATEGORIA] === '');
      if (uncat.length) {
        const subId  = uid();
        const uVals  = allCasas.map(casa => sumWhere(uncat, r => r[G.CASA] === casa));
        const txns   = rowsToTxns(uncat);
        let uTds = uVals.map(v => `<td class="rpt-td">${fmtNum(v)}</td>`).join('');
        uTds += `<td class="rpt-td rpt-hi">${fmtNum(uVals.reduce((a,b)=>a+b,0))}</td>`;
        tbody += `<tr class="rpt-sub-row" data-g="${catId}" style="display:none"
          onclick="event.stopPropagation();Reporting.toggle('${subId}')">
          <td class="rpt-td rpt-td-sub">${xbtn(subId, false)}Sin subcategoría</td>${uTds}
        </tr>`;
        tbody += txnDetail(subId, txns, COLSPAN);
      }
    });

    tbody += totRow('Total por casa', catTotals, 'color:#60a5fa');

    const thead = buildHeader('Concepto', colDefs);
    return `<table class="rpt-table">${thead}<tbody>${tbody}</tbody></table>`;
  }

  /* ─────────────────────────────────────────────
     TAB: CATEGORÍAS
  ───────────────────────────────────────────── */
  function renderCategorias() {
    const gastos = filteredGastos();
    const ms     = displayMonths();
    const COLSPAN = ms.length + 2;

    // Selector de categoría
    const cats = Object.keys(_config?.categorias || {}).filter(cat =>
      gastos.some(r => r[G.CATEGORIA] === cat)
    );

    if (!_catSel || !cats.includes(_catSel)) _catSel = cats[0] || null;

    const selectorHtml = `
      <div class="rpt-cat-sel">
        <label class="rpt-sel-label">Categoría</label>
        <select class="ctl rpt-select" onchange="Reporting.setCat(this.value)">
          ${cats.map(c => `<option value="${c}" ${c===_catSel?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>`;

    if (!_catSel) return selectorHtml + '<p class="rpt-empty">Sin datos en el período seleccionado.</p>';

    const catRows = gastos.filter(r => r[G.CATEGORIA] === _catSel);
    const colDefs = ms.map(m => ({ label: m.label }));
    const COLS    = ms.length;

    let tbody = '';
    const totals = new Array(COLS).fill(0);

    const subs = [...new Set(catRows.map(r => r[G.SUBCATEGORIA]).filter(Boolean))];

    subs.forEach(sub => {
      const subRows = catRows.filter(r => r[G.SUBCATEGORIA] === sub);
      const subId   = uid();
      const vals    = ms.map(m => sumWhere(subRows, r => parseInt(r[G.MES])===m.month && parseInt(r[G.AÑO])===m.year));
      vals.forEach((v,i) => totals[i] += v);
      const txns = rowsToTxns(subRows);

      let tds = vals.map(v => `<td class="rpt-td">${fmtNum(v)}</td>`).join('');
      tds += `<td class="rpt-td rpt-hi">${fmtNum(vals.reduce((a,b)=>a+b,0))}</td>`;
      tbody += `<tr class="rpt-sub-row" onclick="Reporting.toggle('${subId}')">
        <td class="rpt-td rpt-td-first">${xbtn(subId, false)}${sub}</td>${tds}
      </tr>`;
      tbody += txnDetail(subId, txns, COLSPAN);
    });

    // Rows with no subcategory
    const uncat = catRows.filter(r => !r[G.SUBCATEGORIA]);
    if (uncat.length) {
      const subId = uid();
      const vals  = ms.map(m => sumWhere(uncat, r => parseInt(r[G.MES])===m.month && parseInt(r[G.AÑO])===m.year));
      vals.forEach((v,i) => totals[i] += v);
      const txns  = rowsToTxns(uncat);
      let tds = vals.map(v => `<td class="rpt-td">${fmtNum(v)}</td>`).join('');
      tds += `<td class="rpt-td rpt-hi">${fmtNum(vals.reduce((a,b)=>a+b,0))}</td>`;
      tbody += `<tr class="rpt-sub-row" onclick="Reporting.toggle('${subId}')">
        <td class="rpt-td rpt-td-first">${xbtn(subId, false)}Sin subcategoría</td>${tds}
      </tr>`;
      tbody += txnDetail(subId, txns, COLSPAN);
    }

    tbody += totRow(`Total ${_catSel}`, totals);

    const thead = buildHeader('Subcategoría', colDefs);
    return selectorHtml + `<table class="rpt-table">${thead}<tbody>${tbody}</tbody></table>`;
  }

  /* ─────────────────────────────────────────────
     TAB: HIJOS
  ───────────────────────────────────────────── */
  function renderHijos() {
    const gastos = filteredGastos();
    const ms     = displayMonths();

    // Determine which hijos categories exist in config
    const hijoCats = HIJOS_CATS.filter(h => Object.keys(_config?.categorias || {}).includes(h));
    if (!hijoCats.length) return '<p class="rpt-empty">No se encontraron categorías de hijos en la configuración.</p>';

    let html = '';

    if (_hijosView === 'anual') {
      // Cols = hijos, rows = subcategorías
      const COLSPAN  = hijoCats.length + 2;
      const colDefs  = hijoCats.map((h,i) => ({ label: h, color: HIJOS_COLORS[i % HIJOS_COLORS.length] }));

      // All subcategories across all hijos
      const allSubs = [...new Set(
        gastos.filter(r => hijoCats.includes(r[G.CATEGORIA])).map(r => r[G.SUBCATEGORIA]).filter(Boolean)
      )];

      let tbody = '';
      const totals = new Array(hijoCats.length).fill(0);

      allSubs.forEach(sub => {
        const vals = hijoCats.map(h => sumWhere(gastos, r => r[G.CATEGORIA]===h && r[G.SUBCATEGORIA]===sub));
        if (vals.every(v=>v===0)) return;
        vals.forEach((v,i) => totals[i] += v);

        const subId = uid();
        const txns  = rowsToTxns(gastos.filter(r => hijoCats.includes(r[G.CATEGORIA]) && r[G.SUBCATEGORIA]===sub));
        let tds = vals.map(v => `<td class="rpt-td">${fmtNum(v)}</td>`).join('');
        tds += `<td class="rpt-td rpt-hi">${fmtNum(vals.reduce((a,b)=>a+b,0))}</td>`;
        tbody += `<tr class="rpt-sub-row" onclick="Reporting.toggle('${subId}')">
          <td class="rpt-td rpt-td-first">${xbtn(subId, false)}${sub}</td>${tds}
        </tr>`;
        tbody += txnDetail(subId, txns, COLSPAN);
      });

      totals.forEach((v,i) => totals[i] = v);
      tbody += totRow('Total por hijo', totals, 'color:#60a5fa');

      const thead = buildHeader('Concepto', colDefs);
      html = `<table class="rpt-table">${thead}<tbody>${tbody}</tbody></table>`;

    } else {
      // Vista mensual: rows = hijos, cols = meses
      // Each hijo row is expandable to show subcategory breakdown by month
      const COLSPAN = ms.length + 2;
      const colDefs = ms.map(m => ({ label: m.label }));

      let tbody = '';
      const totals = new Array(ms.length).fill(0);

      hijoCats.forEach((h, hi) => {
        const hijoRows = gastos.filter(r => r[G.CATEGORIA] === h);
        const hijoId   = uid();
        const vals     = ms.map(m => sumWhere(hijoRows, r => parseInt(r[G.MES])===m.month && parseInt(r[G.AÑO])===m.year));
        vals.forEach((v,i) => totals[i] += v);

        let tds = vals.map(v => `<td class="rpt-td rpt-hi">${fmtNum(v)}</td>`).join('');
        tds += `<td class="rpt-td rpt-hi" style="color:#60a5fa">${fmtNum(vals.reduce((a,b)=>a+b,0))}</td>`;

        tbody += `<tr class="rpt-cat-row" onclick="Reporting.toggleSec('${hijoId}')">
          <td class="rpt-td rpt-td-first">${xbtn(hijoId, false)}${h}</td>${tds}
        </tr>`;

        // Sub-rows: subcategorías x mes
        const subs = [...new Set(hijoRows.map(r => r[G.SUBCATEGORIA]).filter(Boolean))];
        subs.forEach(sub => {
          const subRows = hijoRows.filter(r => r[G.SUBCATEGORIA] === sub);
          const subId   = uid();
          const sVals   = ms.map(m => sumWhere(subRows, r => parseInt(r[G.MES])===m.month && parseInt(r[G.AÑO])===m.year));
          if (sVals.every(v=>v===0)) return;
          const txns  = rowsToTxns(subRows);
          let sTds = sVals.map(v => `<td class="rpt-td">${fmtNum(v)}</td>`).join('');
          sTds += `<td class="rpt-td rpt-hi">${fmtNum(sVals.reduce((a,b)=>a+b,0))}</td>`;
          tbody += `<tr class="rpt-sub-row" data-g="${hijoId}" style="display:none" onclick="event.stopPropagation();Reporting.toggle('${subId}')">
            <td class="rpt-td rpt-td-sub">${xbtn(subId, false)}${sub}</td>${sTds}
          </tr>`;
          tbody += txnDetail(subId, txns, COLSPAN);
        });
      });

      tbody += totRow('Total hijos', totals, 'color:#60a5fa');
      const thead = buildHeader('Hijo', colDefs);
      html = `<table class="rpt-table">${thead}<tbody>${tbody}</tbody></table>`;
    }

    return html;
  }

  /* ─────────────────────────────────────────────
     TAB: TARJETAS
  ───────────────────────────────────────────── */
  function renderTarjetas() {
    const gastos  = filteredGastos();
    const ms      = displayMonths();
    const COLSPAN = ms.length + 2;

    // Tarjetas = gastos cuyo ORIGEN contiene 'Visa','Amex','Master','Tarjeta', etc.
    // En la app el campo ORIGEN indica la tarjeta/extracto de origen
    const tarjetas = (_config?.tarjetas || []).map(t => t.name);
    // Fallback: derive from data
    const fromData = tarjetas.length ? tarjetas :
      [...new Set(gastos.map(r => r[G.CUENTA]).filter(Boolean))];

    const colDefs = ms.map(m => ({ label: m.label }));
    let tbody  = '';
    const totals = new Array(ms.length).fill(0);

    fromData.forEach(tar => {
      const tarRows = gastos.filter(r => r[G.CUENTA] === tar || r[G.ORIGEN] === tar);
      if (!tarRows.length) return;
      const tarId = uid();
      const vals  = ms.map(m => sumWhere(tarRows, r => parseInt(r[G.MES])===m.month && parseInt(r[G.AÑO])===m.year));
      if (vals.every(v=>v===0)) return;
      vals.forEach((v,i) => totals[i] += v);
      const txns  = rowsToTxns(tarRows);

      let tds = vals.map(v => `<td class="rpt-td">${fmtNum(v)}</td>`).join('');
      tds += `<td class="rpt-td rpt-hi">${fmtNum(vals.reduce((a,b)=>a+b,0))}</td>`;
      tbody += `<tr class="rpt-sub-row" onclick="Reporting.toggle('${tarId}')">
        <td class="rpt-td rpt-td-first">${xbtn(tarId, false)}${tar}</td>${tds}
      </tr>`;
      tbody += txnDetail(tarId, txns, COLSPAN);
    });

    if (!tbody) return '<p class="rpt-empty">Sin datos de tarjetas en el período seleccionado.</p>';
    tbody += totRow('Total Tarjetas', totals, 'color:#60a5fa');

    const thead = buildHeader('Tarjeta', colDefs);
    return `<table class="rpt-table">${thead}<tbody>${tbody}</tbody></table>`;
  }

  /* ─────────────────────────────────────────────
     TAB: INGRESOS
  ───────────────────────────────────────────── */
  function renderIngresos() {
    const ingresos = filteredIngresos();
    const ms       = displayMonths();
    const COLSPAN  = ms.length + 2;
    const colDefs  = ms.map(m => ({ label: m.label }));

    // Group by concepto
    const conceptos = [...new Set(ingresos.map(r => r[I.CONCEPTO]).filter(Boolean))];
    let tbody  = '';
    const totals = new Array(ms.length).fill(0);

    conceptos.forEach(con => {
      const conRows = ingresos.filter(r => r[I.CONCEPTO] === con);
      const conId   = uid();
      const vals    = ms.map(m => sumIngWhere(conRows, r => parseInt(r[I.MES])===m.month && parseInt(r[I.AÑO])===m.year));
      if (vals.every(v=>v===0)) return;
      vals.forEach((v,i) => totals[i] += v);
      const txns  = rowsToTxnsIng(conRows);

      let tds = vals.map(v => `<td class="rpt-td rpt-gn">${fmtNum(v)}</td>`).join('');
      tds += `<td class="rpt-td rpt-gn rpt-hi">${fmtNum(vals.reduce((a,b)=>a+b,0))}</td>`;
      tbody += `<tr class="rpt-sub-row" onclick="Reporting.toggle('${conId}')">
        <td class="rpt-td rpt-td-first">${xbtn(conId, false)}${con}</td>${tds}
      </tr>`;
      tbody += txnDetail(conId, txns, COLSPAN);
    });

    if (!tbody) return '<p class="rpt-empty">Sin datos de ingresos en el período seleccionado.</p>';

    // Total with green
    let totTds = totals.map(v => `<td class="rpt-td rpt-tot-num" style="color:#4ade80">${fmtNum(v)}</td>`).join('');
    totTds += `<td class="rpt-td rpt-tot-num" style="color:#4ade80">${fmtNum(totals.reduce((a,b)=>a+b,0))}</td>`;
    tbody += `<tr class="rpt-tot-row"><td class="rpt-td rpt-tot-label">Total Ingresos</td>${totTds}</tr>`;

    const thead = buildHeader('Concepto', colDefs);
    return `<table class="rpt-table">${thead}<tbody>${tbody}</tbody></table>`;
  }

  /* ─────────────────────────────────────────────
     TOOLBAR HTML
  ───────────────────────────────────────────── */
  function toolbarFor(tab) {
    const subLabel = {
      casas:       'Todas las categorías',
      categorias:  null,
      hijos:       null,
      tarjetas:    null,
      ingresos:    null,
    };
    const hint = {
      casas:      '+ amplía categoría · + en subcategoría muestra transacciones',
      categorias: '+ en subcategoría muestra transacciones individuales',
      hijos:      'Vista anual: columnas por hijo · Vista mensual: filas por hijo con desglose',
      tarjetas:   '+ muestra transacciones individuales',
      ingresos:   '+ muestra transacciones individuales',
    };
    const titles = {
      casas:      'Gastos por Casa y Categoría',
      categorias: 'Análisis por Categoría',
      hijos:      'Gasto por Hijo',
      tarjetas:   'Gasto por Tarjeta',
      ingresos:   'Ingresos por Concepto',
    };

    let rightHtml = '';

    if (tab === 'casas') {
      const cats = Object.keys(_config?.categorias || {});
      rightHtml += `<select class="ctl" onchange="Reporting.setCasasFilter(this.value)">
        <option value="">Todas las categorías</option>
        ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>`;
    }
    if (tab === 'hijos') {
      rightHtml += `<button class="ctl ${_hijosView==='anual'?'on':''}" onclick="Reporting.setHijosView('anual',this)">Vista anual</button>`;
      rightHtml += `<button class="ctl ${_hijosView==='mensual'?'on':''}" onclick="Reporting.setHijosView('mensual',this)">Vista mensual</button>`;
    }
    rightHtml += `<button class="ctl" onclick="Reporting.exportCSV()">↓ CSV</button>`;

    return `<div class="rpt-toolbar">
      <div>
        <div class="rpt-toolbar-title">${titles[tab]}</div>
        <div class="rpt-toolbar-sub">${hint[tab]}</div>
      </div>
      <div class="rpt-toolbar-right">${rightHtml}</div>
    </div>`;
  }

  /* ─────────────────────────────────────────────
     DATE DISPLAY
  ───────────────────────────────────────────── */
  function fmtDateRange() {
    const pad = n => String(n).padStart(2,'0');
    const f = _dateFrom, t = _dateTo;
    return `${pad(f.getDate())} ${MONTH_NAMES[f.getMonth()+1]} ${f.getFullYear()} → ${pad(t.getDate())} ${MONTH_NAMES[t.getMonth()+1]} ${t.getFullYear()}`;
  }

  /* ─────────────────────────────────────────────
     MAIN RENDER
  ───────────────────────────────────────────── */
  function render() {
    if (!_loaded) return;

    const tabsHtml = ['casas','categorias','hijos','tarjetas','ingresos']
      .map(t => {
        const labels = {casas:'Casas',categorias:'Categorías',hijos:'Hijos',tarjetas:'Tarjetas',ingresos:'Ingresos'};
        return `<button class="settings-tab ${_tab===t?'active':''}" onclick="Reporting.switchTab('${t}')">${labels[t]}</button>`;
      }).join('');

    let tableHtml = '';
    if      (_tab === 'casas')      tableHtml = renderCasas();
    else if (_tab === 'categorias') tableHtml = renderCategorias();
    else if (_tab === 'hijos')      tableHtml = renderHijos();
    else if (_tab === 'tarjetas')   tableHtml = renderTarjetas();
    else if (_tab === 'ingresos')   tableHtml = renderIngresos();

    const html = `
      <div class="rpt-sticky">

        <!-- Controls row -->
        <div class="rpt-controls-row">
          <div class="rpt-page-title">Informes</div>
          <div class="rpt-controls-right">
            <button class="date-range-btn" onclick="Reporting.openDatePicker()">
              📅 <span class="dv">${fmtDateRange()}</span> ▾
            </button>
            <div class="rpt-view-btns">
              <button class="ctl ${_view===2?'on':''}"  onclick="Reporting.setView(2)">2 meses</button>
              <button class="ctl ${_view===12?'on':''}" onclick="Reporting.setView(12)">12 meses</button>
            </div>
            <button class="btn btn-primary" onclick="Reporting.reload()">↺ Recargar</button>
          </div>
        </div>

        <!-- Date picker (hidden by default) -->
        <div class="rpt-datepicker" id="rpt-datepicker" style="display:none">
          <label class="rpt-dp-label">Desde</label>
          <input type="date" class="rpt-dp-input" id="rpt-from" value="${_dateFrom.toISOString().slice(0,10)}">
          <label class="rpt-dp-label">Hasta</label>
          <input type="date" class="rpt-dp-input" id="rpt-to" value="${_dateTo.toISOString().slice(0,10)}">
          <button class="btn btn-primary" style="padding:5px 14px" onclick="Reporting.applyDates()">Aplicar</button>
          <button class="ctl" onclick="Reporting.setPreset('ytd')">Año actual</button>
          <button class="ctl" onclick="Reporting.setPreset('last12')">Últimos 12m</button>
          <button class="ctl" onclick="Reporting.setPreset('prev')">Año anterior</button>
        </div>

        <!-- Settings-style tabs -->
        <div class="settings-tabs">${tabsHtml}</div>
      </div>

      <div class="rpt-content-gap"></div>

      <!-- Table area -->
      <div class="rpt-table-wrap">
        ${toolbarFor(_tab)}
        <div class="rpt-table-overflow">${tableHtml}</div>
      </div>
    `;

    document.getElementById('rpt-content').innerHTML = html;
  }

  /* ─────────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────────── */
  return {

    async init(forceReload) {
      initDates();
      const el = document.getElementById('reporting-content');
      if (!el) return;

      el.innerHTML = `
        <div id="rpt-loading" style="display:flex;align-items:center;justify-content:center;gap:14px;padding:60px 0;flex-direction:column;">
          <div class="spin"></div>
          <div class="rpt-load-text">Cargando datos desde Google Sheets...</div>
        </div>
        <div id="rpt-content" style="display:none"></div>
      `;

      await loadData(forceReload);
      if (_loaded) {
        setLoading(false);
        render();
      }
    },

    switchTab(tab) {
      _tab = tab;
      _uid = 0; // reset ids to keep DOM clean
      render();
    },

    setView(v) {
      _view = v;
      render();
    },

    setCat(cat) {
      _catSel = cat;
      render();
    },

    setCasasFilter(cat) {
      // future: filter casas table by category
      render();
    },

    setHijosView(v, el) {
      _hijosView = v;
      render();
    },

    toggleSec(id) {
      const rows = document.querySelectorAll(`[data-g="${id}"]`);
      const btn  = document.getElementById('b' + id);
      const open = btn && btn.textContent === '−';
      rows.forEach(r => { r.style.display = open ? 'none' : ''; });
      if (btn) btn.textContent = open ? '+' : '−';
    },

    toggle(id) {
      const row = document.getElementById(id);
      const btn = document.getElementById('b' + id);
      if (!row) return;
      const open = row.classList.contains('open');
      row.classList.toggle('open', !open);
      if (btn) btn.textContent = open ? '+' : '−';
    },

    openDatePicker() {
      const dp = document.getElementById('rpt-datepicker');
      if (dp) dp.style.display = dp.style.display === 'none' ? 'flex' : 'none';
    },

    applyDates() {
      const from = document.getElementById('rpt-from')?.value;
      const to   = document.getElementById('rpt-to')?.value;
      if (from) _dateFrom = new Date(from);
      if (to)   _dateTo   = new Date(to);
      render();
    },

    setPreset(preset) {
      const now = new Date();
      const y   = now.getFullYear();
      if (preset === 'ytd') {
        _dateFrom = new Date(y, 0, 1);
        _dateTo   = new Date(y, now.getMonth(), now.getDate());
      } else if (preset === 'last12') {
        _dateTo   = new Date(y, now.getMonth(), now.getDate());
        _dateFrom = new Date(y - 1, now.getMonth(), 1);
      } else if (preset === 'prev') {
        _dateFrom = new Date(y - 1, 0, 1);
        _dateTo   = new Date(y - 1, 11, 31);
      }
      // Update inputs
      const fi = document.getElementById('rpt-from');
      const ti = document.getElementById('rpt-to');
      if (fi) fi.value = _dateFrom.toISOString().slice(0,10);
      if (ti) ti.value = _dateTo.toISOString().slice(0,10);
      render();
    },

    async reload() {
      _loaded = false;
      await this.init(true);
    },

    exportCSV() {
      // Build CSV from current visible table
      const table = document.querySelector('.rpt-table');
      if (!table) return;
      const rows = [];
      table.querySelectorAll('tr').forEach(tr => {
        const cols = [];
        tr.querySelectorAll('th, td').forEach(td => {
          cols.push('"' + (td.innerText || td.textContent || '').replace(/"/g,'""').trim() + '"');
        });
        if (cols.length) rows.push(cols.join(','));
      });
      const csv  = rows.join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `informe_${_tab}_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  };

})();

// Reporting module loaded. Init is called by navigateTo('reporting') in pages.js.
