const BudgetLogic = {
  async loadConfig() {
    try {
      const cached = await DataCache.get('config'); 
      if (cached) return cached;
      const rows = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
      if (!rows || rows.length === 0) throw new Error("CONFIG_EMPTY");
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
    } catch (e) { console.error("Error loadConfig:", e); throw e; }
  },

  sniffAccount(rawText, accounts) {
    if (!rawText || !accounts) return null;
    const cleanText = rawText.replace(/[\s-]/g, '');
    for (const acc of accounts) { 
      const cleanID = String(acc[1] || '').replace(/[\s-]/g, '');
      if (cleanID && cleanText.includes(cleanID)) return acc; 
    }
    return null;
  },

  excelToDate(serial) {
    if (isNaN(serial) || serial < 40000) return serial;
    return new Date(Math.round((serial - 25569) * 86400 * 1000)).toISOString().split('T')[0];
  },

  async processImport(rawRows, rawText, fileName) {
    const config = await this.loadConfig();
    const accounts = await SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS);
    const bank = this.sniffAccount(rawText, accounts.slice(1));
    const alias = bank ? bank[0] : "Desconocido", dCasa = bank ? bank[2] : "", isCr = bank ? (bank[3] === 'Credit') : false;
    
    const g = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
    const i = await SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS);
    const r = await SheetsAPI.readSheet(CONFIG.SHEETS.RULES);
    const hs = new Set([...g.map(x => x[GASTOS_COLS.HASH]), ...i.map(x => x[INGRESOS_COLS.HASH])]);
    
    let st = { imported: 0, skipped: 0 };
    for (const row of rawRows) {
      let fD = row['Fecha'] || row['Date'] || row['Data'] || row['Fecha valor'] || row['F.Valor'];
      let fC = row['Movimiento'] || row['Description'] || row['Operazione'] || row['Concepto'];
      let valRaw = row['Importe'] || row['Amount'] || row['Importo'] || row['Value'];
      let fA = parseFloat(String(valRaw).replace(',','.'));
      
      if (!fD || isNaN(fA)) continue;
      fD = this.excelToDate(fD);
      const fAmt = isCr ? (fA * -1) : fA;
      const hash = this.generateHash(fD, fAmt, fC, alias);
      if (hs.has(hash)) { st.skipped++; continue; }

      const match = this.findRuleMatch(fC, r);
      const isInc = fAmt > 0;
      const dt = new Date(fD);
      
      if (isInc) {
        const nr = new Array(11).fill(""); // K=11
        nr[INGRESOS_COLS.AÑO] = dt.getFullYear(); nr[INGRESOS_COLS.MES] = dt.getMonth() + 1;
        nr[INGRESOS_COLS.FECHA] = fD; nr[INGRESOS_COLS.CONCEPTO] = fC;
        nr[INGRESOS_COLS.IMPORTE] = Math.abs(fAmt); nr[INGRESOS_COLS.CUENTA] = alias;
        nr[INGRESOS_COLS.CASA] = match.casa || dCasa; nr[INGRESOS_COLS.CATEGORIA] = match.category || '';
        nr[INGRESOS_COLS.ORIGEN] = fileName; nr[INGRESOS_COLS.HASH] = hash;
        await SheetsAPI.appendRow(CONFIG.SHEETS.INGRESOS, nr);
      } else {
        const nr = new Array(14).fill(""); // N=14
        nr[GASTOS_COLS.AÑO] = dt.getFullYear(); nr[GASTOS_COLS.MES] = dt.getMonth() + 1;
        nr[GASTOS_COLS.FECHA] = fD; nr[GASTOS_COLS.CONCEPTO] = fC;
        nr[GASTOS_COLS.IMPORTE] = Math.abs(fAmt); nr[GASTOS_COLS.CUENTA] = alias;
        nr[GASTOS_COLS.CASA] = match.casa || dCasa; nr[GASTOS_COLS.CATEGORIA] = match.category || '';
        nr[GASTOS_COLS.ORIGEN] = fileName; nr[GASTOS_COLS.HASH] = hash;
        nr[GASTOS_COLS.ESTADO] = match.category ? 'Categorizado' : 'Pendiente';
        await SheetsAPI.appendRow(CONFIG.SHEETS.GASTOS, nr);
      }
      st.imported++;
    }
    return { ...st, account: alias };
  },

  generateHash(d, a, c, acc) {
    const s = `${d}|${Math.abs(a).toFixed(2)}|${(c||'').toLowerCase().replace(/[^a-z0-9]/g,'')}|${acc}`;
    let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return 'h' + Math.abs(hash);
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
    const f = (arr, yr, mo) => arr.slice(1).filter(r => r[GASTOS_COLS.AÑO] == yr && r[GASTOS_COLS.MES] == mo);
    const actG = f(g, y, m), actI = f(i, y, m), planG = b.slice(1).filter(r => r[0] == y && r[1] == m);
    const funding = {};
    planG.forEach(p => {
      const isOneOff = p[8] === 'One-off';
      const isPaid = isOneOff && actG.some(a => a[GASTOS_COLS.CATEGORIA] === p[6] && Math.abs(parseFloat(a[GASTOS_COLS.IMPORTE]) - parseFloat(p[3])) < 10);
      if (!isPaid) { const acc = p[4] || 'Principal'; funding[acc] = (funding[acc] || 0) + parseFloat(p[3]); }
    });
    return {
      totalGastos: actG.reduce((a,b) => a + (parseFloat(b[GASTOS_COLS.IMPORTE]) || 0), 0),
      totalIngresos: actI.reduce((a,b) => a + (parseFloat(b[INGRESOS_COLS.IMPORTE]) || 0), 0),
      plannedGastos: planG.reduce((a,b) => a + (parseFloat(b[3]) || 0), 0),
      fundingPlan: funding,
      pendingCount: g.filter(r => r[GASTOS_COLS.ESTADO] === 'Pendiente').length
    };
  }
};
