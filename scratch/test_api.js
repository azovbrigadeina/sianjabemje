const dotenv = require('dotenv');
const path = require('path');
// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const API_BASE = process.env.NEXT_PUBLIC_GAS_DEPLOYMENT_URL;

async function testFetch(entity) {
  const url = `${API_BASE}?action=readAll&entity=${entity}&tahun=2026`;
  console.log(`[TEST] Fetching ${entity} from ${url}`);
  try {
    const res = await fetch(url, { redirect: 'follow' });
    console.log(`[TEST] Response status for ${entity}: ${res.status}`);
    const text = await res.text();
    console.log(`[TEST] Content length: ${text.length}`);
    try {
      const json = JSON.parse(text);
      console.log(`[TEST] Success: ${json.success}`);
      if (!json.success) {
        console.log(`[TEST] Error info: ${json.error}`);
      } else {
        console.log(`[TEST] Data count: ${Array.isArray(json.data) ? json.data.length : typeof json.data}`);
      }
    } catch (pe) {
      console.error(`[TEST] JSON Parse Error: ${pe.message}. Raw text preview: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.error(`[TEST] Fetch Error for ${entity}:`, err);
  }
}

async function run() {
  console.log("=== SEQUENTIAL TEST ===");
  await testFetch('unitKerja');
  await testFetch('abk');
  await testFetch('jabatan');

  console.log("\n=== CONCURRENT TEST ===");
  await Promise.all([
    testFetch('unitKerja'),
    testFetch('abk'),
    testFetch('jabatan')
  ]);
}

run();
