/**
 * [BLOQUE_ACTUALIZADO_V1.6] - API DE GOOGLE SHEETS
 */
var SheetsAPI = {
  readSheet: async (s) => (await gapi.client.sheets.spreadsheets.values.get({spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!A:Z`})).result.values || [],
  
  // Nuevo método: Append con generación de metadatos
  appendRow: async (s, data) => {
    // data[0] es el ID, si viene vacío lo generamos aquí
    if (!data[0]) data[0] = 'tx_' + Date.now() + Math.random().toString(36).substr(2, 5);
    const now = new Date().toISOString();
    
    // Rellenamos timestamps según el tipo de hoja
    if (s === CONFIG.SHEETS.GASTOS) {
      data[12] = now; // created_at
      data[13] = now; // updated_at
    } else if (s === CONFIG.SHEETS.INGRESOS) {
      data[9] = now;  // created_at
      data[10] = now; // updated_at
    }

    return gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!A1`, valueInputOption: 'USER_ENTERED', resource: {values: [data]}
    });
  },

  updateCell: async (s, r, c, v) => gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SPREADSHEET_ID, range: `${s}!${String.fromCharCode(64 + c)}${r}`, valueInputOption: 'USER_ENTERED', resource: {values: [[v]]}
  }),

  // Nuevo método: Borrado por ID (Escalabilidad)
  deleteRowById: async (sheetName, id) => {
    const rows = await SheetsAPI.readSheet(sheetName);
    const index = rows.findIndex(r => r[0] === id);
    if (index === -1) return;
    
    // Marcamos como DELETED en la columna correspondiente (Soft Delete)
    // Para Gastos es la columna 11 (indice 10)
    const colIndex = (sheetName === CONFIG.SHEETS.GASTOS) ? 11 : 8; 
    return SheetsAPI.updateCell(sheetName, index + 1, colIndex + 1, 'DELETED');
  }
};
