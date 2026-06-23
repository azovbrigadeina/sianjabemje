const XLSX = require('xlsx');
const wb = XLSX.readFile('siasn_export.xlsx');
console.log("Sheet names:", wb.SheetNames);

wb.SheetNames.forEach(sheetName => {
  console.log(`\n--- Sheet: ${sheetName} ---`);
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, {header: 1, defval: ''});
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    console.log(`Row ${i}:`, rows[i]);
  }
});
