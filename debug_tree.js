const https = require('https');
const url = 'https://YOUR_FIREBASE_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app/jabatan.json?auth=YOUR_FIREBASE_SECRET';
https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    const jabatans = JSON.parse(data);
    const kabag = Object.values(jabatans).find(j => j.namaJabatan && j.namaJabatan.includes('Kepala Bagian Umum'));
    const asisten = Object.values(jabatans).find(j => j.namaJabatan && j.namaJabatan.includes('Asisten Administrasi Umum'));
    console.log("Kabag Umum:", kabag ? { id: Object.keys(jabatans).find(k=>jabatans[k]===kabag), parentId: kabag.parentId, unitKerjaId: kabag.unitKerjaId } : "Not found");
    console.log("Asisten:", asisten ? { id: Object.keys(jabatans).find(k=>jabatans[k]===asisten), parentId: asisten.parentId, unitKerjaId: asisten.unitKerjaId } : "Not found");
  });
});
