const https = require('https');
const url = 'https://YOUR_FIREBASE_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app/jabatan/jbt_6f3cd366.json?auth=YOUR_FIREBASE_SECRET';
const payload = JSON.stringify({ parentId: 'jbt_64aee36c' });

const req = https.request(url, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': payload.length
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log("Response:", data);
  });
});

req.write(payload);
req.end();
