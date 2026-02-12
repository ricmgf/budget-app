const BudgetLogic = {
  sniffAccount(rawText, accounts) {
    for (const acc of accounts) { if (acc[1] && rawText.includes(acc[1])) return acc; }
    return null;
  },
  excelToDate(serial) {
    if (isNaN(serial) || serial < 40000) return serial;
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  },
  async processImport(rawRows, rawText, fileName) {
    const config = await this.loadConfig();
    const accounts = await SheetsAPI.readSheet(CONFIG.SHEETS.ACCOUNTS);
    const bank = this.sniffAccount(rawText, accounts.slice(1));
    const alias = bank ? bank[0] : "Desconocido", dCasa = bank ? bank[2] : "", isCr = bank ? (bank[3] === 'Credit') : false;
    const g = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS), i = await SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS), r = await SheetsAPI.readSheet(CONFIG.SHEETS.RULES);
    const hs = new Set([...g.map(x => x[13]), ...i.map(x => x[10])]);
    let st = { imported: 0, skipped: 0 };
    for (const row of rawRows) {
      let fD = row['Fecha'] || row['Date'] || row['Data'] || row['Fecha valor'];
      let fC = row['Movimiento'] || row['Description'] || row['Operazione'] || row['Concepto'];
      let fA = parseFloat(String(row['Importe'] || row['Amount'] || row['Importo']).replace(',','.'));
      if (!fD || isNaN(fA)) continue;
      fD = this.excelToDate(fD);
      const fAmt = isCr ? (fA * -1) : fA;
      const hash = this.generateHash(fD, fAmt, fC, alias);
      if (hs.has(hash)) { st.skipped++; continue; }
      const m = this.findRuleMatch(fC, r), isInc = fAmt > 0, dt = new Date(fD);
      const nr = [];
      nr[GASTOS_COLS.AÑO] = dt.getFullYear(); nr[GASTOS_COLS.MES] = dt.getMonth() + 1;
      nr[GASTOS_COLS.FECHA] = fD; nr[GASTOS_COLS.CONCEPTO] = fC;
      nr[GASTOS_COLS.IMPORTE] = Math.abs(fAmt); nr[GASTOS_COLS.CUENTA] = alias;
      nr[GASTOS_COLS.CASA] = m.casa || dCasa; nr[GASTOS_COLS.CATEGORIA] = m.category || '';
      nr[GASTOS_COLS.HASH] = hash;
      if (isInc) await SheetsAPI.appendRow(CONFIG.SHEETS.INGRESOS, nr);
      else { nr[12] = m.category ? 'Categorizado' : 'Pendiente'; await SheetsAPI.appendRow(CONFIG.SHEETS.GASTOS, nr); }
      st.imported++;
    }
    return { ...st, account: alias };
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
      if (d[j][12] === 'Pendiente' && d[j][4].toLowerCase().includes(p.toLowerCase())) {
        await SheetsAPI.updateCell(CONFIG.SHEETS.GASTOS, j + 1, 9, cat);
        await SheetsAPI.updateCell(CONFIG.SHEETS.GASTOS, j + 1, 8, casa);
        await SheetsAPI.updateCell(CONFIG.SHEETS.GASTOS, j + 1, 13, 'Categorizado');
      }
    }
  },
  findRuleMatch(desc, rules) {
    const d = (desc || '').toLowerCase();
    for (const r of rules.slice(1)) { if (r[2] && d.includes(r[2].toLowerCase())) return { category: r[3], casa: r[5] }; }
    return { category: null };
  },
  async getDashboardData(y, m) {
    const g = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS), i = await SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS), b = await SheetsAPI.readSheet(CONFIG.SHEETS.BUDGET_PLAN);
    const f = (arr, yr, mo) => arr.slice(1).filter(r => r[1] == yr && r[2] == mo);
    const actG = f(g, y, m), actI = f(i, y, m), planG = b.slice(1).filter(r => r[0] == y && r[1] == m);
    const funding = {};
    planG.forEach(p => {
      const isOneOff = p[8] === 'One-off';
      const isPaid = isOneOff && actG.some(a => a[8] === p[6] && Math.abs(parseFloat(a[5]) - parseFloat(p[3])) < 10);
      if (!isPaid) { const acc = p[4] || 'Principal'; funding[acc] = (funding[acc] || 0) + parseFloat(p[3]); }
    });
    return {
      totalGastos: actG.reduce((a,b) => a + (parseFloat(b[5]) || 0), 0),
      totalIngresos: actI.reduce((a,b) => a + (parseFloat(b[5]) || 0), 0),
      plannedGastos: planG.reduce((a,b) => a + (parseFloat(b[3]) || 0), 0),
      fundingPlan: funding,
      pendingCount: g.filter(r => r[12] === 'Pendiente').length
    };
  },
  async loadConfig() {
    const c = await DataCache.get('config'); if (c) return c;
    const r = await SheetsAPI.readSheet(CONFIG.SHEETS.CONFIG);
    const cfg = { categorias: {}, cuentas: [], casas: [] };
    r.slice(1).forEach(row => {
      if (row[0]) { if (!cfg.categorias[row[0]]) cfg.categorias[row[0]] = []; if (row[1]) cfg.categorias[row[0]].push(row[1]); }
      if (row[2] && !cfg.cuentas.includes(row[2])) cfg.cuentas.push(row[2]);
      if (row[3] && !cfg.casas.includes(row[3])) cfg.casas.push(row[3]);
    });
    DataCache.set('config', cfg); return cfg;
  }
};
