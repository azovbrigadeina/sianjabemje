const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER_ERROR:', err.message));
  await page.goto('http://localhost:3000/dashboard/organisasi', { waitUntil: 'networkidle2' });
  console.log("Page loaded. Clicking first edit button...");
  
  const editButton = await page.$('button[title="Edit"]');
  if (editButton) {
    await editButton.click();
    console.log("Clicked edit button.");
    await new Promise(r => setTimeout(r, 2000));
    const modal = await page.$('h2');
    if (modal) {
      const modalText = await page.evaluate(el => el.textContent, modal);
      console.log("Modal is present with text:", modalText);
    } else {
      console.log("No modal found.");
    }
  } else {
    console.log("Edit button not found.");
  }
  await browser.close();
})();
