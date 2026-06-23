const https = require('https');
const url = 'https://YOUR_FIREBASE_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app/.json?auth=YOUR_FIREBASE_SECRET';
https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    const db = JSON.parse(data);
    const jabatans = db.jabatan;
    const unitKerjas = db.unitKerja;
    
    // Find Bagian Umum
    const bagianUmum = Object.values(unitKerjas).find(u => u.nama === 'Bagian Umum');
    if (!bagianUmum) { console.log("Bagian Umum not found"); return; }
    const bagianUmumId = Object.keys(unitKerjas).find(k=>unitKerjas[k]===bagianUmum);
    console.log("Bagian Umum ID:", bagianUmumId, "Parent:", bagianUmum.parentId);
    
    // Find Kepala Bagian Umum in Bagian Umum
    const kabag = Object.values(jabatans).find(j => j.unitKerjaId === bagianUmumId && j.namaJabatan.includes('Kepala Bagian'));
    if (!kabag) { console.log("Kabag in Bagian Umum not found"); return; }
    
    const kabagId = Object.keys(jabatans).find(k=>jabatans[k]===kabag);
    console.log("Kabag ID:", kabagId, "Parent ID:", kabag.parentId);
    
    // Find its parent Jabatan
    const parentJbt = jabatans[kabag.parentId];
    if (parentJbt) {
      console.log("Parent Jbt:", parentJbt.namaJabatan, "UnitKerjaId:", parentJbt.unitKerjaId);
    } else {
      console.log("Parent Jbt not found for id", kabag.parentId);
    }
  });
});
