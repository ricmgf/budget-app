const BudgetLogic = {
  // Sniffer logic to auto-identify bank from raw CSV text
  sniffAccount(rawText, accounts) {
    for (const acc of accounts) {
      if (acc[1] && rawText.includes(acc[1])) return acc;
    }
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
    
    const accountAlias = bank ? bank[0] : "Desconocido";
    const defaultCasa = bank ? bank[2] : "";
    const isCredit = bank ? (bank[3] === 'Credit') : false;

    const gastos = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
    const ingresos = await SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS);
    const rules = await SheetsAPI.readSheet(CONFIG.SHEETS.RULES);
    const hashes = new Set([...gastos.map(r => r[13]), ...ingresos.map(r => r[10])]);

    let stats = { imported: 0, skipped: 0 };

    for (const r of rawRows) {
      let fDate = r['Fecha'] || r['Date'] || r['Fecha valor'] || r['Data'];
      let fDesc = r['Movimiento'] || r['Description'] || r['Concepto'] || r['Operazione'];
      let fAmt = parseFloat(String(r['Importe'] || r['Amount'] || r['Importo']).replace(',','.'));

      if (!fDate || isNaN(fAmt)) continue;
      fDate = this.excelToDate(fDate);
      
      const finalAmt = isCredit ? (fAmt * -1) : fAmt;
      const hash = this.generateHash(fDate, finalAmt, fDesc, accountAlias);
      if (hashes.has(hash)) { stats.skipped++; continue; }

      const match = this.findRuleMatch(fDesc, rules);
      const isInc = finalAmt > 0;
      const d = new Date(fDate);
      
      const row = [];
      row[GASTOS_COLS.AÑO] = d.getFullYear();
      row[GASTOS_COLS.MES] = d.getMonth() + 1;
      row[GASTOS_COLS.FECHA] = fDate;
      row[GASTOS_COLS.CONCEPTO] = fDesc;
      row[GASTOS_COLS.IMPORTE] = Math.abs(finalAmt);
      row[GASTOS_COLS.CUENTA] = accountAlias;
      row[GASTOS_COLS.CASA] = match.casa || defaultCasa;
      row[GASTOS_COLS.CATEGORIA] = match.category || '';
      row[GASTOS_COLS.HASH] = hash;

      if (isInc) {
        await SheetsAPI.appendRow(CONFIG.SHEETS.INGRESOS, row);
      } else {
        row[12] = match.category ? 'Categorizado' : 'Pendiente';
        await SheetsAPI.appendRow(CONFIG.SHEETS.GASTOS, row);
      }
      stats.imported++;
    }
    return { ...stats, account: accountAlias };
  },

  generateHash(date, amount, desc, account) {
    const clean = (desc || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const str = `${date}|${Math.abs(amount).toFixed(2)}|${clean}|${account}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    return 'h' + Math.abs(hash);
  },

  async getDashboardData(y, m) {
    const g = await SheetsAPI.readSheet(CONFIG.SHEETS.GASTOS);
    const i = await SheetsAPI.readSheet(CONFIG.SHEETS.INGRESOS);
    const b = await SheetsAPI.readSheet(CONFIG.SHEETS.BUDGET_PLAN);
    const filter = (arr, yr, mo) => arr.slice(1).filter(r => r[1] == yr && r[2] == mo);
    const actG = filter(g, y, m);
    const actI = filter(i, y, m);
    const planG = b.slice(1).filter(r => r[0] == y && r[1] == m);

    const funding = {};
    planG.forEach(p => {
      const isOneOff = p[8] === 'One-off';
      const isPaid = isOneOff && actG.some(a => a[8] === p[6] && Math.abs(parseFloat(a[5]) - parseFloat(p[3])) < 10);
      if (!isPaid) {
        const acc = p[4] || 'Principal';
        funding[acc] = (funding[acc] || 0) + parseFloat(p[3]);
      }
    });

    return {
      totalGastos: actG.reduce((a,b) => a + (parseFloat(b[5]) || 0), 0),
      totalIngresos: actI.reduce((a,b) => a + (parseFloat(b[5]) || 0), 0),
      plannedGastos: planG.reduce((a,b) => a + (parseFloat(b[3]) || 0), 0),
      fundingPlan: funding,
      pendingCount: g.filter(r => r[12] === 'Pendiente').length
    };
  }
};
