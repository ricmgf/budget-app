// ============================================================
// Budget App — Master Logic Engine (v1.14 - Full Legacy)
// ============================================================

const BudgetLogic = {
  async loadConfig() {
    const cached = await DataCache.get('config'); 
    if (cached) return cached;
    const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    const cfg = { categorias: {}, cuentas: [], casas: [] };
    rows.slice(1).forEach(row => {
      if (row[0]) { 
        if (!cfg.categorias[row[0]]) cfg.categorias[row[0]] = []; 
        if (row[1]) cfg.categorias[row[0]].push(row[1]); 
      }
      if (row[2] && !cfg.cuentas.includes(row[2])) cfg.cuentas.push(row[2]);
      if (row[3] && !cfg.casas.includes(row[3])) cfg.casas.push(row[3]);
    });
    DataCache.set('config', cfg); 
    return cfg;
  },

  // Sniffer: Detecta el banco comparando el texto del archivo con tus IDs de Ajustes
  sniffAccount(rawText, accounts) {
    if (!rawText || !accounts) return null;
    const cleanText = rawText.replace(/[\s-]/g, '');
    for (const acc of accounts) { 
      const cleanID = String(acc[ACCOUNT_COLS.IDENTIFIER] || '').replace(/[\s-]/g, '');
      if (cleanID && cleanText.includes(cleanID)) return acc; 
    }
    return null;
  },

  // Legacy: Convierte fechas de Excel (46048.0) a YYYY-MM-DD
  excelToDate(serial) {
    if (isNaN(serial) || serial < 40000) return serial;
    return new Date(Math.round((serial - 25569) * 86400 * 1000)).toISOString().split('T')[0];
  },

  async processImport(rawRows, rawText, fileName) {
    const config = await this.loadConfig();
    const accounts = await SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS);
    const bank = this.sniffAccount(rawText, accounts.slice(1));
    
    const accountAlias = bank ? bank[ACCOUNT_COLS.ALIAS] : "Desconocido";
    const defaultCasa = bank ? bank[ACCOUNT_COLS.CASA] : "";
    const isCredit = bank ? (bank[ACCOUNT_COLS.TIPO] === 'Credit') : false;

    const gastos = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
    const ingresos = await SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS);
    const rules = await SheetsAPI.readSheet(CONFIG.SHEETS.RULES);
    
    // Legacy: Set de hashes para evitar duplicidad absoluta
    const hashes = new Set([...gastos.map(r => r[GASTOS_COLS.HASH]), ...ingresos.map(r => r[INGRESOS_COLS.HASH])]);

    let stats = { imported: 0, skipped: 0 };

    for (const row of rawRows) {
      let fDate = row['Fecha'] || row['Date'] || row['Data'] || row['F.Valor'];
      let fDesc = row['Movimiento'] || row['Description'] || row['Concepto'] || row['Operazione'];
      let valRaw = row['Importe'] || row['Amount'] || row['Importo'] || row['Value'];
      let fAmt = parseFloat(String(valRaw).replace(',','.'));

      if (!fDate || isNaN(fAmt)) continue;
      fDate = this.excelToDate(fDate);
      
      // Legacy: Si es tarjeta de crédito, invertimos el signo para que gasto sea positivo
      const finalAmt = isCredit ? (fAmt * -1) : fAmt;
      
      const hash = this.generateHash(fDate, finalAmt, fDesc, accountAlias);
      if (hashes.has(hash)) { stats.skipped++; continue; }

      const match = this.findRuleMatch(fDesc, rules);
      const d = new Date(fDate);
      const isInc = finalAmt > 0;

      if (isInc) {
        const nr = new Array(11).fill(""); // K=11 columnas para INGRESOS
        nr[INGRESOS_COLS.AÑO] = d.getFullYear(); 
        nr[INGRESOS_COLS.MES] = d.getMonth() + 1;
        nr[INGRESOS_COLS.FECHA] = fDate; 
        nr[INGRESOS_COLS.CONCEPTO] = fDesc;
        nr[INGRESOS_COLS.IMPORTE] = Math.abs(finalAmt); 
        nr[INGRESOS_COLS.CUENTA] = accountAlias;
        nr[INGRESOS_COLS.CASA] = match.casa || defaultCasa; 
        nr[INGRESOS_COLS.CATEGORIA] = match.category || '';
        nr[INGRESOS_COLS.ORIGEN] = fileName; 
        nr[INGRESOS_COLS.HASH] = hash;
        await SheetsAPI.appendRow(CONFIG.SHEETS.INGRESOS, nr);
      } else {
        const nr = new Array(14).fill(""); // N=14 columnas para GASTOS_TOTAL
        nr[GASTOS_COLS.AÑO] = d.getFullYear(); 
        nr[GASTOS_COLS.MES] = d.getMonth() + 1;
        nr[GASTOS_COLS.FECHA] = fDate; 
        nr[GASTOS_COLS.CONCEPTO] = fDesc;
        nr[GASTOS_COLS.IMPORTE] = Math.abs(finalAmt); 
        nr[GASTOS_COLS.CUENTA] = accountAlias;
        nr[GASTOS_COLS.CASA] = match.casa || defaultCasa; 
        nr[GASTOS_COLS.CATEGORIA] = match.category || '';
        nr[GASTOS_COLS.ORIGEN] = fileName; 
        nr[GASTOS_COLS.HASH] = hash;
        nr[GASTOS_COLS.ESTADO] = match.category ? 'Categorizado' : 'Pendiente';
        await SheetsAPI.appendRow(CONFIG.SHEETS.GASTOS, nr);
      }
      stats.imported++;
    }
    return { ...stats, account: accountAlias };
  },

  generateHash(d, a, c, acc) {
    const s = `${d}|${Math.abs(a).toFixed(2)}|${(c||'').toLowerCase().replace(/[^a-z0-9]/g,'')}|${acc}`;
    let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return 'h' + Math.abs(h);
  },

  async saveRuleAndApply(p, cat, sub, casa) {
    await SheetsAPI.appendRow(CONFIG.SHEETS.RULES, [Date.now(), "Contains", p, cat, sub, casa, "User"]);
    const d = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
    for (let j = 1; j < d.length; j++) {
      if (d[j][GASTOS_COLS.ESTADO] === 'Pendiente' && d[j][GASTOS_COLS.CONCEPTO].toLowerCase().includes(p.toLowerCase())) {
        await SheetsAPI.updateCell(CONFIG.SHEETS.GASTOS, j + 1, GASTOS_COLS.CATEGORIA + 1, cat);
        await SheetsAPI.updateCell(CONFIG.SHEETS.GASTOS, j + 1, GASTOS_COLS.CASA + 1, casa);
        await SheetsAPI.updateCell(CONFIG.SHEETS.GASTOS, j + 1, GASTOS_COLS.ESTADO + 1, 'Categorizado');
      }
    }
  },

  findRuleMatch(desc, rules) {
    const d = (desc || '').toLowerCase();
    for (const r of rules.slice(1)) { if (r[2] && d.includes(r[2].toLowerCase())) return { category: r[3], casa: r[5] }; }
    return { category: null };
  },

  async getDashboardData(y, m) {
    const g = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
    const i = await SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS);
    const b = await SheetsAPI.readSheet(CONFIG.SHEETS.BUDGET_PLAN);
    const f = (arr, yr, mo) => arr.slice(1).filter(r => r[1] == yr && r[2] == mo);
    const actG = f(g, y, m);
    const actI = f(i, y, m);
    const planG = b.slice(1).filter(r => r[0] == y && r[1] == m);
    
    const funding = {};
    planG.forEach(p => {
      // Legacy: Detección de One-off pagados para no pedirlos de nuevo en el Funding Plan
      const isOneOff = p[BUDGET_COLS.TIPO] === 'One-off';
      const isPaid = isOneOff && actG.some(a => a[GASTOS_COLS.CATEGORIA] === p[BUDGET_COLS.CATEGORIA] && Math.abs(parseFloat(a[GASTOS_COLS.IMPORTE]) - parseFloat(p[BUDGET_COLS.IMPORTE])) < 10);
      if (!isPaid) {
        const acc = p[BUDGET_COLS.CUENTA] || 'Principal';
        funding[acc] = (funding[acc] || 0) + parseFloat(p[BUDGET_COLS.IMPORTE]);
      }
    });

    return {
      totalGastos: actG.reduce((a,b) => a + (parseFloat(b[GASTOS_COLS.IMPORTE]) || 0), 0),
      totalIngresos: actI.reduce((a,b) => a + (parseFloat(b[INGRESOS_COLS.IMPORTE]) || 0), 0),
      plannedGastos: planG.reduce((a,b) => a + (parseFloat(b[BUDGET_COLS.IMPORTE]) || 0), 0),
      fundingPlan: funding,
      pendingCount: g.filter(r => r[GASTOS_COLS.ESTADO] === 'Pendiente').length
    };
  }
};
