const fs = require('fs');
const file = 'src/app/dashboard/organisasi/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Find the section where map is populated and tree is built
const searchStr = `
      opds.forEach(opd => {
        if (opd.parentId && map[opd.parentId]) {
          map[opd.parentId].children.push(map[opd.id]);
        } else {
          roots.push(map[opd.id]);
        }
      });

      jabatans.forEach(jbt => {
        if (jbt.parentId && map[jbt.parentId]) {
          map[jbt.parentId].children.push(map[jbt.id]);
        } else if (jbt.unitKerjaId && map[jbt.unitKerjaId]) {
          map[jbt.unitKerjaId].children.push(map[jbt.id]);
        } else {
          roots.push(map[jbt.id]);
        }
      });
`;

const replaceStr = `
      // --- TIPUAN VISUAL UNTUK SUB-UNIT (BAGIAN/UPTD) ---
      // Jika ada Jabatan di Sub-Unit yang atasannya ada di Unit Kerja lain (misal: Kabag di bawah Asisten),
      // maka secara visual kita pindahkan Node OPD Sub-Unit tersebut ke bawah Jabatan Asisten.
      const opdToExternalParentJbt: Record<string, string> = {};
      const jbtToReroute: Record<string, boolean> = {};

      jabatans.forEach(jbt => {
        if (jbt.parentId && jbt.unitKerjaId) {
          const parentJbt = jabatansRaw.find((p: any) => p.id === jbt.parentId);
          if (parentJbt && parentJbt.unitKerjaId && parentJbt.unitKerjaId !== jbt.unitKerjaId) {
            // Ditemukan cross-unit reporting!
            opdToExternalParentJbt[jbt.unitKerjaId] = jbt.parentId;
            jbtToReroute[jbt.id] = true; // Jabatan ini dimunculkan di bawah OPD-nya, bukan menduplikasi di bawah parent aslinya
          }
        }
      });

      opds.forEach(opd => {
        if (opdToExternalParentJbt[opd.id] && map[opdToExternalParentJbt[opd.id]]) {
          // Visual Trick: OPD Sub-Unit nempel di bawah Jabatan Atasannya
          map[opdToExternalParentJbt[opd.id]].children.push(map[opd.id]);
        } else if (opd.parentId && map[opd.parentId]) {
          map[opd.parentId].children.push(map[opd.id]);
        } else {
          roots.push(map[opd.id]);
        }
      });

      jabatans.forEach(jbt => {
        if (jbt.parentId && map[jbt.parentId] && !jbtToReroute[jbt.id]) {
          map[jbt.parentId].children.push(map[jbt.id]);
        } else if (jbt.unitKerjaId && map[jbt.unitKerjaId]) {
          map[jbt.unitKerjaId].children.push(map[jbt.id]);
        } else {
          roots.push(map[jbt.id]);
        }
      });
`;

if (content.includes(searchStr.trim())) {
    content = content.replace(searchStr.trim(), replaceStr.trim());
    fs.writeFileSync(file, content);
    console.log("Patch applied successfully!");
} else {
    console.log("Could not find the target string.");
}
