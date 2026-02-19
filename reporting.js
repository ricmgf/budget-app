/**
 * reporting.js — Módulo de Informes v2.0
 * - Usa GASTOS_COLS e INGRESOS_COLS de config.js (índices correctos)
 * - Carga bajo demanda con un único batchGet
 * - Todo el filtrado/agrupado en cliente, sin llamadas adicionales
 */

const Reporting = (() => {

  /* ─────────────────────────────────────────────
     STATE
  ───────────────────────────────────────────── */
  let _loaded  = false;
  let _loading = false;
  let _gastos  = [];   // filas raw GASTOS_TOTAL sin cabecera
  let _ing     = [];   // filas raw INGRESOS sin cabecera

  let _tab       = 'casas';
  let _view      = 2;        // 2 | 12
  let _catSel    = null;
  let _hijosView = 'anual';  // 'anual' | 'mensual'
  let _dateFrom  = null;
  let _dateTo    = null;

  // Usa los índices ya definidos en config.js
  // GASTOS_COLS: ID=0,AÑO=1,MES=2,FECHA=3,CONCEPTO=4,IMPORTE=5,CUENTA=6,CASA=7,CATEGORIA=8,SUBCATEGORIA=9,NOTAS=10,ORIGEN=11,ESTADO=12,HASH=13
  // INGRESOS_COLS: ID=0,AÑO=1,MES=2,FECHA=3,CONCEPTO=4,IMPORTE=5,CUENTA=6,CASA=7,CATEGORIA=8,ORIGEN=9,HASH=10
  const G = GASTOS_COLS;
  const I = INGRESOS_COLS;

  const MONTH_SHORT = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const MONTH_LONG  = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const CASA_COLORS  = ['#2563eb','#0891b2','#7c3aed','#059669','#d97706','#dc2626','#64748b','#b45309'];
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
      return s.lastIndexOf(',') > s.lastIndexOf('.')
        ? parseFloat(s.replace(/\./g,'').replace(',','.')) || 0
        : parseFloat(s.replace(/,/g,'')) || 0;
    }
    return parseFloat(s.replace(',','.')) || 0;
  }

  // Formato con punto separador de miles (es-ES)
  function fmt(n) {
    if (!n || n === 0) return '<span class="rpt-nil">—</span>';
    return Math.round(Math.abs(n)).toLocaleString('es-ES');
  }
  function fmtPlain(n) {
    if (!n || n === 0) return '—';
    return Math.round(Math.abs(n)).toLocaleString('es-ES');
  }

  let _uid = 0;
  function uid() { return 'u' + (++_uid); }

  function xbtn(id) {
    return `<button class="rpt-xb" id="b${id}" onclick="event.stopPropagation();Reporting.toggle('${id}')">+</button>`;
  }
  const xph = `<span class="rpt-xph"></span>`;

  /* ─────────────────────────────────────────────
     DATE SETUP
  ───────────────────────────────────────────── */
  function initDates() {
    if (_dateFrom) return;
    const now = new Date();
    _dateFrom = new Date(now.getFullYear(), 0, 1);          // 1 Ene año actual
    _dateTo   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  // Returns array of {year, month} objects covered by current date range
  function activeMonths() {
    const result = [];
    const cur = new Date(_dateFrom.getFullYear(), _dateFrom.getMonth(), 1);
    const end = new Date(_dateTo.getFullYear(), _dateTo.getMonth(), 1);
    while (cur <= end) {
      result.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
      cur.setMonth(cur.getMonth() + 1);
    }
    return result;
  }

  function monthLabel(m) {
    const ms = activeMonths();
    return (ms.length <= 3) ? MONTH_LONG[m.month] : MONTH_SHORT[m.month];
  }

  function fmtDateRange() {
    const f = _dateFrom, t = _dateTo;
    return `${f.getDate()} ${MONTH_SHORT[f.getMonth()+1]} ${f.getFullYear()} → ${t.getDate()} ${MONTH_SHORT[t.getMonth()+1]} ${t.getFullYear()}`;
  }

  /* ─────────────────────────────────────────────
     DATA LOADING
  ───────────────────────────────────────────── */
  async function loadData(force) {
    if (_loaded && !force) return;
    if (_loading) return;
    _loading = true;
    showLoading(true);

    try {
      // Asegura config cargada
      if (!AppState.config) await BudgetLogic.loadConfig();

      const sheets = await SheetsAPI.batchGet([CONFIG.SHEETS.GASTOS, CONFIG.SHEETS.INGRESOS]);

      const gRaw = sheets[CONFIG.SHEETS.GASTOS]   || [];
      const iRaw = sheets[CONFIG.SHEETS.INGRESOS] || [];

      console.log(`[Reporting] gRaw filas: ${gRaw.length}, iRaw filas: ${iRaw.length}`);
      if (gRaw.length > 0) console.log('[Reporting] Cabecera GASTOS:', gRaw[0]);
      if (gRaw.length > 1) console.log('[Reporting] Primera fila GASTOS:', gRaw[1]);

      // Saltar cabecera (fila 0) y filas vacías (ID puede ser número o string)
      _gastos = gRaw.length > 1 ? gRaw.slice(1).filter(r => r && r.length > 0 && (r[G.ID] !== undefined && r[G.ID] !== '')) : [];
      _ing    = iRaw.length > 1 ? iRaw.slice(1).filter(r => r && r.length > 0 && (r[I.ID] !== undefined && r[I.ID] !== '')) : [];

      console.log(`[Reporting] Después de filtrar: ${_gastos.length} gastos, ${_ing.length} ingresos`);
      if (_gastos.length > 0) {
        const sample = _gastos[0];
        console.log(`[Reporting] Muestra gasto[0]: AÑO=${sample[G.AÑO]}, MES=${sample[G.MES]}, CAT=${sample[G.CATEGORIA]}, CASA=${sample[G.CASA]}, IMP=${sample[G.IMPORTE]}`);
      }
      if (_gastos.length > 0) {
        const ms = activeMonths();
        console.log('[Reporting] Meses activos:', ms);
        const match = _gastos.filter(r => ms.some(m => m.year == r[G.AÑO] && m.month == r[G.MES]));
        console.log(`[Reporting] Gastos en rango de fechas: ${match.length}`);
      }
      _loaded = true;

    } catch (err) {
      console.error('[Reporting] Error en loadData:', err);
      document.getElementById('rpt-wrap').innerHTML =
        `<div class="rpt-empty">Error cargando datos: ${err.message || err}. Recarga e inténtalo de nuevo.</div>`;
    } finally {
      _loading = false;
      showLoading(false);
    }
  }

  function showLoading(on) {
    const lo = document.getElementById('rpt-loading');
    const ct = document.getElementById('rpt-wrap');
    if (lo) lo.style.display = on ? 'flex' : 'none';
    if (ct) ct.style.display = on ? 'none' : 'block';
  }

  /* ─────────────────────────────────────────────
     FILTERS
  ───────────────────────────────────────────── */
  function gastosFiltrados() {
    const ms = activeMonths();
    // Usamos == (no ===) porque Sheets devuelve números, no strings
    return _gastos.filter(r => {
      const y = r[G.AÑO];
      const m = r[G.MES];
      return ms.some(mo => mo.year == y && mo.month == m);
    });
  }

  function ingresosFiltrados() {
    const ms = activeMonths();
    return _ing.filter(r => {
      const y = r[I.AÑO];
      const m = r[I.MES];
      return ms.some(mo => mo.year == y && mo.month == m);
    });
  }

  function sumG(rows, cond) {
    return rows.filter(cond).reduce((s, r) => s + toNum(r[G.IMPORTE]), 0);
  }
  function sumI(rows, cond) {
    return rows.filter(cond).reduce((s, r) => s + toNum(r[I.IMPORTE]), 0);
  }

  /* ─────────────────────────────────────────────
     TABLE HELPERS
  ───────────────────────────────────────────── */
  function buildThead(firstLabel, colDefs) {
    // colDefs: [{label, color?}]
    let ths = `<th class="rpt-th-first">${firstLabel}</th>`;
    colDefs.forEach(c => {
      const inner = c.color
        ? `<div class="rpt-th-inner">${c.label}<div class="rpt-th-bar" style="background:${c.color}"></div></div>`
        : c.label;
      ths += `<th class="rpt-th">${inner}</th>`;
    });
    ths += `<th class="rpt-th rpt-th-total">Total</th>`;
    return `<thead><tr>${ths}</tr></thead>`;
  }

  function totRow(label, vals, totalColor) {
    const tot = vals.reduce((a,b) => a+(b||0), 0);
    let tds = vals.map(v => `<td class="rpt-td rpt-tot-num">${fmt(v)}</td>`).join('');
    tds += `<td class="rpt-td rpt-tot-num" style="color:${totalColor||'#60a5fa'}">${fmt(tot)}</td>`;
    return `<tr class="rpt-tot-row"><td class="rpt-td rpt-tot-label">${label}</td>${tds}</tr>`;
  }

  function detailRows(id, txns, colspan) {
    if (!txns || !txns.length) return '';
    const inner = txns.map(t =>
      `<div class="rpt-dtx">
        <span class="rpt-dtx-d">${t.mes}</span>
        <span class="rpt-dtx-c">${t.concepto}</span>
        <span class="rpt-dtx-a">${t.cuenta}</span>
        <span class="rpt-dtx-m${t.income?' rpt-gn':''}">${t.income?'+':''}${fmtPlain(t.importe)}</span>
      </div>`
    ).join('');
    return `<tr class="rpt-drow" id="${id}">
      <td class="rpt-dc" colspan="${colspan}">
        <div class="rpt-di">
          <div class="rpt-di-label">${txns.length} transacción${txns.length!==1?'es':''}</div>
          <div class="rpt-dtxns">${inner}</div>
        </div>
      </td>
    </tr>`;
  }

  function toTxns(rows) {
    return rows
      .map(r => ({ mes: MONTH_SHORT[parseInt(r[G.MES])||0]||'', concepto: r[G.CONCEPTO]||'', cuenta: r[G.CUENTA]||'', importe: toNum(r[G.IMPORTE]) }))
      .sort((a,b) => a.mes.localeCompare(b.mes));
  }
  function toTxnsIng(rows) {
    return rows
      .map(r => ({ mes: MONTH_SHORT[parseInt(r[I.MES])||0]||'', concepto: r[I.CONCEPTO]||'', cuenta: r[I.CUENTA]||'', importe: toNum(r[I.IMPORTE]), income: true }))
      .sort((a,b) => a.mes.localeCompare(b.mes));
  }

  /* ─────────────────────────────────────────────
     TAB: CASAS
  ───────────────────────────────────────────── */
  function renderCasas() {
    const gastos = gastosFiltrados();

    if (!gastos.length) return '<p class="rpt-empty">Sin datos de gastos en el período seleccionado.</p>';

    // Casas presentes en datos, ordenadas por config si existe
    const configCasas = (AppState.config?.casas || []).map(c => c.name);
    const dataCasas   = [...new Set(gastos.map(r => r[G.CASA]).filter(Boolean))];
    const casas = configCasas.length
      ? configCasas.filter(c => dataCasas.includes(c))
      : dataCasas.sort();

    if (!casas.length) return '<p class="rpt-empty">No hay gastos con "Casa" asignada en el período.</p>';

    const COLSPAN  = casas.length + 2;
    const colDefs  = casas.map((c, i) => ({ label: c, color: CASA_COLORS[i % CASA_COLORS.length] }));
    const configCats = Object.keys(AppState.config?.categorias || {});
    // Categorías presentes en datos (orden de config, luego las que no están en config)
    const dataCats  = [...new Set(gastos.map(r => r[G.CATEGORIA]).filter(Boolean))];
    const orderedCats = [
      ...configCats.filter(c => dataCats.includes(c)),
      ...dataCats.filter(c => !configCats.includes(c)),
    ];

    let tbody = '';
    const grandTotals = new Array(casas.length).fill(0);

    orderedCats.forEach(cat => {
      const catRows = gastos.filter(r => r[G.CATEGORIA] === cat);
      if (!catRows.length) return;

      const catVals = casas.map(casa => sumG(catRows, r => r[G.CASA] === casa));
      if (catVals.every(v => v === 0)) return;
      catVals.forEach((v, i) => grandTotals[i] += v);

      const catId  = uid();
      let catTds   = catVals.map(v => `<td class="rpt-td rpt-hi">${fmt(v)}</td>`).join('');
      catTds += `<td class="rpt-td rpt-hi">${fmt(catVals.reduce((a,b)=>a+b,0))}</td>`;

      tbody += `<tr class="rpt-cat-row" onclick="Reporting.toggleSec('${catId}')">
        <td class="rpt-td rpt-td-first">${xbtn(catId)}${cat}</td>${catTds}
      </tr>`;

      // Subcategorías
      const subs = [...new Set(catRows.map(r => r[G.SUBCATEGORIA]).filter(Boolean))];
      subs.forEach(sub => {
        const subRows = catRows.filter(r => r[G.SUBCATEGORIA] === sub);
        const subVals = casas.map(casa => sumG(subRows, r => r[G.CASA] === casa));
        if (subVals.every(v => v === 0)) return;

        const subId = uid();
        const txns  = toTxns(subRows);
        let subTds  = subVals.map(v => `<td class="rpt-td">${fmt(v)}</td>`).join('');
        subTds += `<td class="rpt-td rpt-hi">${fmt(subVals.reduce((a,b)=>a+b,0))}</td>`;

        tbody += `<tr class="rpt-sub-row" data-g="${catId}" style="display:none"
          onclick="event.stopPropagation();Reporting.toggle('${subId}')">
          <td class="rpt-td rpt-td-sub">${xbtn(subId)}${sub}</td>${subTds}
        </tr>`;
        tbody += detailRows(subId, txns, COLSPAN);
      });

      // Sin subcategoría
      const uncat = catRows.filter(r => !r[G.SUBCATEGORIA] || r[G.SUBCATEGORIA] === '');
      if (uncat.length) {
        const subId = uid();
        const uVals = casas.map(casa => sumG(uncat, r => r[G.CASA] === casa));
        const txns  = toTxns(uncat);
        let uTds = uVals.map(v => `<td class="rpt-td">${fmt(v)}</td>`).join('');
        uTds += `<td class="rpt-td rpt-hi">${fmt(uVals.reduce((a,b)=>a+b,0))}</td>`;
        tbody += `<tr class="rpt-sub-row" data-g="${catId}" style="display:none"
          onclick="event.stopPropagation();Reporting.toggle('${subId}')">
          <td class="rpt-td rpt-td-sub">${xbtn(subId)}Sin subcategoría</td>${uTds}
        </tr>`;
        tbody += detailRows(subId, txns, COLSPAN);
      }
    });

    tbody += totRow('Total por casa', grandTotals, '#60a5fa');
    return `<table class="rpt-table">${buildThead('Concepto', colDefs)}<tbody>${tbody}</tbody></table>`;
  }

  /* ─────────────────────────────────────────────
     TAB: CATEGORÍAS
  ───────────────────────────────────────────── */
  function renderCategorias() {
    const gastos = gastosFiltrados();
    const ms     = activeMonths();
    const COLSPAN = ms.length + 2;

    const configCats = Object.keys(AppState.config?.categorias || {});
    const dataCats   = [...new Set(gastos.map(r => r[G.CATEGORIA]).filter(Boolean))];
    const cats = [
      ...configCats.filter(c => dataCats.includes(c)),
      ...dataCats.filter(c => !configCats.includes(c)),
    ];

    if (!_catSel || !cats.includes(_catSel)) _catSel = cats[0] || null;

    const selHtml = `<div class="rpt-cat-sel">
      <label class="rpt-sel-label">Categoría</label>
      <select class="ctl rpt-select" onchange="Reporting.setCat(this.value)">
        ${cats.map(c => `<option value="${c}"${c===_catSel?' selected':''}>${c}</option>`).join('')}
      </select>
    </div>`;

    if (!_catSel) return selHtml + '<p class="rpt-empty">Sin datos en el período.</p>';

    const catRows = gastos.filter(r => r[G.CATEGORIA] === _catSel);
    if (!catRows.length) return selHtml + '<p class="rpt-empty">Sin transacciones para esta categoría en el período.</p>';

    const colDefs = ms.map(m => ({ label: monthLabel(m) }));
    const totals  = new Array(ms.length).fill(0);
    let tbody = '';

    const subs = [...new Set(catRows.map(r => r[G.SUBCATEGORIA]).filter(Boolean))];
    subs.forEach(sub => {
      const subRows = catRows.filter(r => r[G.SUBCATEGORIA] === sub);
      const vals    = ms.map(m => sumG(subRows, r => r[G.AÑO]==m.year && r[G.MES]==m.month));
      if (vals.every(v => v === 0)) return;
      vals.forEach((v,i) => totals[i] += v);
      const subId = uid();
      const txns  = toTxns(subRows);
      let tds = vals.map(v => `<td class="rpt-td">${fmt(v)}</td>`).join('');
      tds += `<td class="rpt-td rpt-hi">${fmt(vals.reduce((a,b)=>a+b,0))}</td>`;
      tbody += `<tr class="rpt-sub-row" onclick="Reporting.toggle('${subId}')">
        <td class="rpt-td rpt-td-first">${xbtn(subId)}${sub}</td>${tds}
      </tr>`;
      tbody += detailRows(subId, txns, COLSPAN);
    });

    // Sin subcategoría
    const uncat = catRows.filter(r => !r[G.SUBCATEGORIA] || r[G.SUBCATEGORIA] === '');
    if (uncat.length) {
      const vals  = ms.map(m => sumG(uncat, r => r[G.AÑO]==m.year && r[G.MES]==m.month));
      if (vals.some(v => v > 0)) {
        vals.forEach((v,i) => totals[i] += v);
        const subId = uid();
        const txns  = toTxns(uncat);
        let tds = vals.map(v => `<td class="rpt-td">${fmt(v)}</td>`).join('');
        tds += `<td class="rpt-td rpt-hi">${fmt(vals.reduce((a,b)=>a+b,0))}</td>`;
        tbody += `<tr class="rpt-sub-row" onclick="Reporting.toggle('${subId}')">
          <td class="rpt-td rpt-td-first">${xbtn(subId)}Sin subcategoría</td>${tds}
        </tr>`;
        tbody += detailRows(subId, txns, COLSPAN);
      }
    }

    tbody += totRow(`Total ${_catSel}`, totals);
    return selHtml + `<table class="rpt-table">${buildThead('Subcategoría', colDefs)}<tbody>${tbody}</tbody></table>`;
  }

  /* ─────────────────────────────────────────────
     TAB: HIJOS
  ───────────────────────────────────────────── */
  function renderHijos() {
    const gastos   = gastosFiltrados();
    const ms       = activeMonths();

    const hijoCats = HIJOS_CATS.filter(h =>
      Object.keys(AppState.config?.categorias || {}).includes(h) ||
      gastos.some(r => r[G.CATEGORIA] === h)
    );

    if (!hijoCats.length) return '<p class="rpt-empty">No se encontraron categorías de hijos (Sandra, Dani, Cris) en los datos.</p>';

    if (_hijosView === 'anual') {
      // Columnas = hijos, filas = subcategorías
      const COLSPAN = hijoCats.length + 2;
      const colDefs = hijoCats.map((h,i) => ({ label: h, color: HIJOS_COLORS[i % HIJOS_COLORS.length] }));

      const hijoRows  = gastos.filter(r => hijoCats.includes(r[G.CATEGORIA]));
      const allSubs   = [...new Set(hijoRows.map(r => r[G.SUBCATEGORIA]).filter(Boolean))];
      const totals    = new Array(hijoCats.length).fill(0);
      let tbody = '';

      allSubs.forEach(sub => {
        const vals = hijoCats.map(h => sumG(hijoRows, r => r[G.CATEGORIA]===h && r[G.SUBCATEGORIA]===sub));
        if (vals.every(v => v === 0)) return;
        vals.forEach((v,i) => totals[i] += v);
        const subId = uid();
        const txns  = toTxns(hijoRows.filter(r => r[G.SUBCATEGORIA]===sub));
        let tds = vals.map(v => `<td class="rpt-td">${fmt(v)}</td>`).join('');
        tds += `<td class="rpt-td rpt-hi">${fmt(vals.reduce((a,b)=>a+b,0))}</td>`;
        tbody += `<tr class="rpt-sub-row" onclick="Reporting.toggle('${subId}')">
          <td class="rpt-td rpt-td-first">${xbtn(subId)}${sub}</td>${tds}
        </tr>`;
        tbody += detailRows(subId, txns, COLSPAN);
      });

      // Sin subcategoría
      const uncat = hijoRows.filter(r => !r[G.SUBCATEGORIA]);
      if (uncat.length) {
        const vals = hijoCats.map(h => sumG(uncat, r => r[G.CATEGORIA]===h));
        if (vals.some(v=>v>0)) {
          vals.forEach((v,i) => totals[i] += v);
          const subId = uid();
          let tds = vals.map(v=>`<td class="rpt-td">${fmt(v)}</td>`).join('');
          tds += `<td class="rpt-td rpt-hi">${fmt(vals.reduce((a,b)=>a+b,0))}</td>`;
          tbody += `<tr class="rpt-sub-row"><td class="rpt-td rpt-td-first">${xph}Sin subcategoría</td>${tds}</tr>`;
        }
      }

      totals.forEach((v,i) => totals[i] = v); // noop, clarity
      tbody += totRow('Total por hijo', totals, '#60a5fa');
      return `<table class="rpt-table">${buildThead('Concepto', colDefs)}<tbody>${tbody}</tbody></table>`;

    } else {
      // Vista mensual: filas = hijos, columnas = meses, expandible a subcategorías
      const COLSPAN = ms.length + 2;
      const colDefs = ms.map(m => ({ label: monthLabel(m) }));
      const totals  = new Array(ms.length).fill(0);
      let tbody = '';

      hijoCats.forEach((h, hi) => {
        const hRows = gastos.filter(r => r[G.CATEGORIA] === h);
        const hijoId = uid();
        const vals   = ms.map(m => sumG(hRows, r => r[G.AÑO]==m.year && r[G.MES]==m.month));
        vals.forEach((v,i) => totals[i] += v);

        let tds = vals.map(v => `<td class="rpt-td rpt-hi">${fmt(v)}</td>`).join('');
        tds += `<td class="rpt-td rpt-hi" style="color:#60a5fa">${fmt(vals.reduce((a,b)=>a+b,0))}</td>`;

        tbody += `<tr class="rpt-cat-row" onclick="Reporting.toggleSec('${hijoId}')">
          <td class="rpt-td rpt-td-first">${xbtn(hijoId)}${h}</td>${tds}
        </tr>`;

        // Subcategorías desglosadas por mes
        const subs = [...new Set(hRows.map(r => r[G.SUBCATEGORIA]).filter(Boolean))];
        subs.forEach(sub => {
          const subRows = hRows.filter(r => r[G.SUBCATEGORIA] === sub);
          const sVals   = ms.map(m => sumG(subRows, r => r[G.AÑO]==m.year && r[G.MES]==m.month));
          if (sVals.every(v => v === 0)) return;
          const subId = uid();
          const txns  = toTxns(subRows);
          let sTds = sVals.map(v => `<td class="rpt-td">${fmt(v)}</td>`).join('');
          sTds += `<td class="rpt-td rpt-hi">${fmt(sVals.reduce((a,b)=>a+b,0))}</td>`;
          tbody += `<tr class="rpt-sub-row" data-g="${hijoId}" style="display:none"
            onclick="event.stopPropagation();Reporting.toggle('${subId}')">
            <td class="rpt-td rpt-td-sub">${xbtn(subId)}${sub}</td>${sTds}
          </tr>`;
          tbody += detailRows(subId, txns, COLSPAN);
        });
      });

      tbody += totRow('Total hijos', totals, '#60a5fa');
      return `<table class="rpt-table">${buildThead('Hijo', colDefs)}<tbody>${tbody}</tbody></table>`;
    }
  }

  /* ─────────────────────────────────────────────
     TAB: TARJETAS
  ───────────────────────────────────────────── */
  function renderTarjetas() {
    const gastos  = gastosFiltrados();
    const ms      = activeMonths();
    const COLSPAN = ms.length + 2;
    const colDefs = ms.map(m => ({ label: monthLabel(m) }));

    // Tarjetas desde config, filtradas a las que tienen datos
    const configTar = (AppState.config?.tarjetas || []).map(t => t.name);
    // También incluir las que aparecen en CUENTA o ORIGEN aunque no estén en config
    const dataTar   = [...new Set(gastos.map(r => r[G.ORIGEN]).filter(Boolean))];
    const tarjetas  = configTar.length
      ? configTar.filter(t => dataTar.includes(t) || gastos.some(r => r[G.CUENTA]===t || r[G.ORIGEN]===t))
      : dataTar.sort();

    if (!tarjetas.length) return '<p class="rpt-empty">Sin datos de tarjetas en el período. Verifica que los gastos tengan la tarjeta en el campo ORIGEN.</p>';

    const totals = new Array(ms.length).fill(0);
    let tbody = '';
    let hasData = false;

    tarjetas.forEach(tar => {
      // Match por ORIGEN (nombre de extracto/tarjeta) o CUENTA
      const tarRows = gastos.filter(r => r[G.ORIGEN] === tar || r[G.CUENTA] === tar);
      const vals    = ms.map(m => sumG(tarRows, r => r[G.AÑO]==m.year && r[G.MES]==m.month));
      if (vals.every(v => v === 0)) return;
      hasData = true;
      vals.forEach((v,i) => totals[i] += v);
      const tarId = uid();
      const txns  = toTxns(tarRows);
      let tds = vals.map(v => `<td class="rpt-td">${fmt(v)}</td>`).join('');
      tds += `<td class="rpt-td rpt-hi">${fmt(vals.reduce((a,b)=>a+b,0))}</td>`;
      tbody += `<tr class="rpt-sub-row" onclick="Reporting.toggle('${tarId}')">
        <td class="rpt-td rpt-td-first">${xbtn(tarId)}${tar}</td>${tds}
      </tr>`;
      tbody += detailRows(tarId, txns, COLSPAN);
    });

    if (!hasData) return '<p class="rpt-empty">Sin datos de tarjetas en el período.</p>';
    tbody += totRow('Total Tarjetas', totals, '#60a5fa');
    return `<table class="rpt-table">${buildThead('Tarjeta', colDefs)}<tbody>${tbody}</tbody></table>`;
  }

  /* ─────────────────────────────────────────────
     TAB: INGRESOS
  ───────────────────────────────────────────── */
  function renderIngresos() {
    const ing     = ingresosFiltrados();
    const ms      = activeMonths();
    const COLSPAN = ms.length + 2;
    const colDefs = ms.map(m => ({ label: monthLabel(m) }));

    if (!ing.length) return '<p class="rpt-empty">Sin ingresos en el período seleccionado.</p>';

    const conceptos = [...new Set(ing.map(r => r[I.CONCEPTO]).filter(Boolean))].sort();
    const totals    = new Array(ms.length).fill(0);
    let tbody = '';

    conceptos.forEach(con => {
      const conRows = ing.filter(r => r[I.CONCEPTO] === con);
      const vals    = ms.map(m => sumI(conRows, r => r[I.AÑO]==m.year && r[I.MES]==m.month));
      if (vals.every(v => v === 0)) return;
      vals.forEach((v,i) => totals[i] += v);
      const conId = uid();
      const txns  = toTxnsIng(conRows);
      let tds = vals.map(v => `<td class="rpt-td rpt-gn">${fmt(v)}</td>`).join('');
      tds += `<td class="rpt-td rpt-gn rpt-hi">${fmt(vals.reduce((a,b)=>a+b,0))}</td>`;
      tbody += `<tr class="rpt-sub-row" onclick="Reporting.toggle('${conId}')">
        <td class="rpt-td rpt-td-first">${xbtn(conId)}${con}</td>${tds}
      </tr>`;
      tbody += detailRows(conId, txns, COLSPAN);
    });

    // Total ingresos en verde
    const tot = totals.reduce((a,b)=>a+b,0);
    let totTds = totals.map(v => `<td class="rpt-td rpt-tot-num" style="color:#4ade80">${fmt(v)}</td>`).join('');
    totTds += `<td class="rpt-td rpt-tot-num" style="color:#4ade80">${fmt(tot)}</td>`;
    tbody += `<tr class="rpt-tot-row"><td class="rpt-td rpt-tot-label">Total Ingresos</td>${totTds}</tr>`;

    return `<table class="rpt-table">${buildThead('Concepto', colDefs)}<tbody>${tbody}</tbody></table>`;
  }

  /* ─────────────────────────────────────────────
     RENDER SHELL
  ───────────────────────────────────────────── */
  function tabLabel(t) {
    return {casas:'Casas',categorias:'Categorías',hijos:'Hijos',tarjetas:'Tarjetas',ingresos:'Ingresos'}[t];
  }

  function toolbarHtml() {
    const hints = {
      casas:      '+ amplía categoría · + en subcategoría muestra transacciones',
      categorias: '+ en subcategoría muestra transacciones individuales',
      hijos:      'Vista anual: columnas por hijo · Vista mensual: fila por hijo expandible',
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

    let right = '';
    if (_tab === 'hijos') {
      right += `<button class="ctl${_hijosView==='anual'?' on':''}" onclick="Reporting.setHijosView('anual')">Vista anual</button>`;
      right += `<button class="ctl${_hijosView==='mensual'?' on':''}" onclick="Reporting.setHijosView('mensual')">Vista mensual</button>`;
    }
    right += `<button class="ctl" onclick="Reporting.exportCSV()">↓ CSV</button>`;

    return `<div class="rpt-toolbar">
      <div>
        <div class="rpt-toolbar-title">${titles[_tab]}</div>
        <div class="rpt-toolbar-sub">${hints[_tab]}</div>
      </div>
      <div class="rpt-toolbar-right">${right}</div>
    </div>`;
  }

  function render() {
    if (!_loaded) return;
    _uid = 0; // reset ids on every render

    const tabs = ['casas','categorias','hijos','tarjetas','ingresos'];
    const tabsHtml = tabs.map(t =>
      `<button class="settings-tab${_tab===t?' active':''}" onclick="Reporting.switchTab('${t}')">${tabLabel(t)}</button>`
    ).join('');

    let tableHtml = '';
    if      (_tab === 'casas')      tableHtml = renderCasas();
    else if (_tab === 'categorias') tableHtml = renderCategorias();
    else if (_tab === 'hijos')      tableHtml = renderHijos();
    else if (_tab === 'tarjetas')   tableHtml = renderTarjetas();
    else if (_tab === 'ingresos')   tableHtml = renderIngresos();

    document.getElementById('rpt-wrap').innerHTML = `
      <div class="rpt-sticky">

        <div class="rpt-controls-row">
          <div class="rpt-page-title">Informes</div>
          <div class="rpt-controls-right">
            <button class="date-range-btn" onclick="Reporting.toggleDatePicker()">
              📅 <span class="dv">${fmtDateRange()}</span> ▾
            </button>
            <button class="ctl${_view===2?' on':''}"  onclick="Reporting.setView(2)">2 meses</button>
            <button class="ctl${_view===12?' on':''}" onclick="Reporting.setView(12)">12 meses</button>
            <button class="btn btn-primary" onclick="Reporting.reload()">↺ Recargar</button>
          </div>
        </div>

        <div class="rpt-datepicker" id="rpt-dp" style="display:none">
          <label class="rpt-dp-label">Desde</label>
          <input type="date" class="rpt-dp-input" id="rpt-from" value="${_dateFrom.toISOString().slice(0,10)}">
          <label class="rpt-dp-label">Hasta</label>
          <input type="date" class="rpt-dp-input" id="rpt-to"   value="${_dateTo.toISOString().slice(0,10)}">
          <button class="btn btn-primary" style="padding:5px 14px" onclick="Reporting.applyDates()">Aplicar</button>
          <button class="ctl" onclick="Reporting.preset('ytd')">Año actual</button>
          <button class="ctl" onclick="Reporting.preset('12m')">Últimos 12m</button>
          <button class="ctl" onclick="Reporting.preset('prev')">Año anterior</button>
        </div>

        <div class="settings-tabs" style="background:var(--bg-canvas,#f1f5f9)">${tabsHtml}</div>
      </div>

      <div style="height:18px"></div>

      <div class="rpt-table-wrap">
        ${toolbarHtml()}
        <div class="rpt-table-overflow">${tableHtml}</div>
      </div>
    `;
  }

  /* ─────────────────────────────────────────────
     PUBLIC
  ───────────────────────────────────────────── */
  return {

    async init(force) {
      initDates();
      const root = document.getElementById('reporting-content');
      if (!root) return;

      root.innerHTML = `
        <div id="rpt-loading" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;padding:80px 0">
          <div class="spin"></div>
          <div class="rpt-load-text">Cargando datos desde Google Sheets...</div>
        </div>
        <div id="rpt-wrap" style="display:none;padding:0 0 40px"></div>
      `;

      await loadData(force);
      if (_loaded) render();
    },

    switchTab(tab) { _tab = tab; render(); },
    setView(v)     { _view = v; render(); },
    setCat(cat)    { _catSel = cat; render(); },
    setHijosView(v){ _hijosView = v; render(); },

    toggleSec(id) {
      const rows = document.querySelectorAll(`[data-g="${id}"]`);
      const btn  = document.getElementById('b' + id);
      const open = btn && btn.textContent === '−';
      rows.forEach(r => r.style.display = open ? 'none' : '');
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

    toggleDatePicker() {
      const dp = document.getElementById('rpt-dp');
      if (dp) dp.style.display = dp.style.display === 'none' ? 'flex' : 'none';
    },

    applyDates() {
      const f = document.getElementById('rpt-from')?.value;
      const t = document.getElementById('rpt-to')?.value;
      if (f) _dateFrom = new Date(f);
      if (t) _dateTo   = new Date(t);
      render();
    },

    preset(p) {
      const now = new Date();
      const y   = now.getFullYear();
      if (p === 'ytd')  { _dateFrom = new Date(y,0,1); _dateTo = new Date(now); }
      if (p === '12m')  { _dateTo = new Date(now); _dateFrom = new Date(y-1, now.getMonth(), 1); }
      if (p === 'prev') { _dateFrom = new Date(y-1,0,1); _dateTo = new Date(y-1,11,31); }
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
      const table = document.querySelector('.rpt-table');
      if (!table) return;
      const rows = [];
      table.querySelectorAll('tr').forEach(tr => {
        // Skip detail rows
        if (tr.classList.contains('rpt-drow')) return;
        const cols = [];
        tr.querySelectorAll('th,td').forEach(td => {
          cols.push('"' + (td.innerText||'').replace(/"/g,'""').trim() + '"');
        });
        if (cols.length) rows.push(cols.join(','));
      });
      const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a    = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `informe_${_tab}_${new Date().toISOString().slice(0,10)}.csv` });
      a.click();
      URL.revokeObjectURL(a.href);
    },
  };

})();
