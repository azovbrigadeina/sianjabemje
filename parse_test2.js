const XLSX = require('xlsx');
const wb = XLSX.readFile('siasn_export.xlsx');
const ws1 = wb.Sheets['INFOJAB I'];
const rows = XLSX.utils.sheet_to_json(ws1, {header: 1, defval: ''});

console.log("Nama Jabatan:", rows[1][1]);
console.log("Kode Jabatan:", rows[2][1]);
console.log("Ikhtisar Jabatan:", rows[3][1]);

console.log("\nKualifikasi Pendidikan:", rows[1][5]);
console.log("Kualifikasi Diklat:", rows[2][5]);
console.log("Kualifikasi Pengalaman:", rows[3][5]);

console.log("\nSyarat Jabatan:");
for(let i=0; i<10; i++) {
   console.log(`Row ${i}: Bakat=${rows[i][7]}, Minat=${rows[i][8]}, Temperamen=${rows[i][9]}, Upaya Fisik=${rows[i][10]}`);
}
