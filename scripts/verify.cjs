const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
    try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.dismiss());
        await context.route('https://tj.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
        await page.addInitScript(() => {
            localStorage.setItem('trading-journal-authenticated', 'true');
            if (localStorage.getItem('testSeeded')) return;
            const canvas = document.createElement('canvas');
            canvas.width = 10;
            canvas.height = 10;
            canvas.getContext('2d').fillRect(0, 0, 10, 10);
            localStorage.setItem('tradingJournal', JSON.stringify([
                { id: 1, date: '2026-10-01', time: '09:00', balance: 1000, symbol: 'ES', images: [canvas.toDataURL()], fvgTimeframe: '5m', analysisResult: 'Correct' },
                { id: 2, date: '2026-10-02', time: '09:00', balance: 1100, symbol: 'ES', fvgTimeframe: '5m', analysisResult: 'Wrong' },
                { id: 3, date: '2026-10-03', time: '09:00', balance: 1050, symbol: 'NQ', fvgTimeframe: '1m', analysisResult: 'Correct' },
                { id: 4, date: '2026-10-04', time: '09:00', balance: 1050, symbol: 'ES', analysisResult: 'None' }
            ]));
            localStorage.setItem('testSeeded', 'true');
        });
        await page.goto('https://tj.test/', { waitUntil: 'networkidle' });
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('tradingJournal')).find(e => e.id === 1).images[0].storage === 'indexedDB');
        assert.equal(await page.evaluate(async () => (await resolveEntryImage(entries.find(e => e.id === 1).images[0])).startsWith('data:image/')), true);
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForFunction(() => entries.length === 4);
        assert.equal(await page.evaluate(async () => (await resolveEntryImage(entries.find(e => e.id === 1).images[0])).startsWith('data:image/')), true);
        assert.equal(await page.locator('#reportNet').textContent(), '$50.00');
        assert.equal(await page.locator('#reportFactor').textContent(), '2.00');
        assert.equal(await page.locator('#reportDrawdown').textContent(), '$50.00');
        assert.equal(await page.locator('#statsAvgDaily').textContent(), '$16.67');
        await page.locator('#reportFrom').fill('2026-10-03');
        await page.locator('#reportFrom').dispatchEvent('change');
        assert.equal(await page.locator('#reportNet').textContent(), '-$50.00');
        await page.selectOption('#reportSymbol', 'NQ');
        assert.equal(await page.locator('#reportDays tr').count(), 1);
        await page.evaluate(() => scrollToView(5));
        await page.locator('#reportDays button').click();
        assert.match(await page.locator('#calendarDayEntries').textContent(), /NQ/);
        assert.equal(await page.locator('#calendarDayEntries .entry-card').count(), 1);
        await page.evaluate(() => closeCalendarDay());
        await page.evaluate(() => { document.getElementById('statisticsView').scrollTop = 0; });
        await page.waitForFunction(() => Math.abs(document.getElementById('statisticsView').getBoundingClientRect().left) < 1);
        await page.screenshot({ path: '/tmp/tj-reports-mobile.png' });
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.evaluate(() => scrollToView(5));
        await page.waitForFunction(() => Math.abs(document.getElementById('statisticsView').getBoundingClientRect().left) < 1);
        await page.screenshot({ path: '/tmp/tj-reports-desktop.png' });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => { scrollToView(0); openModal(); });
        await page.locator('#notes').fill('Persistence check');
        await page.locator('#imageInput').setInputFiles(path.join(__dirname, '..', 'apple-touch-icon.png'));
        await page.waitForFunction(() => uploadedImages.length === 1);
        await page.locator('#entryForm button[type="submit"]').click();
        await page.waitForFunction(() => !document.getElementById('entryModal').classList.contains('active'));
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForFunction(() => entries.some(e => e.notes === 'Persistence check'));
        assert.equal(await page.evaluate(async () => !!(await resolveEntryImage(entries.find(e => e.notes === 'Persistence check').images[0]))), true);
        assert.equal(await page.evaluate(async () => {
            const db = await openEntryImageDb();
            const originalTransaction = db.transaction.bind(db);
            db.transaction = function(...args) {
                const transaction = originalTransaction(...args);
                const originalStore = transaction.objectStore.bind(transaction);
                transaction.objectStore = function(...storeArgs) {
                    const store = originalStore(...storeArgs);
                    const originalPut = store.put.bind(store);
                    store.put = function(...putArgs) {
                        const request = originalPut(...putArgs);
                        request.addEventListener('success', () => transaction.abort());
                        return request;
                    };
                    return store;
                };
                return transaction;
            };
            try {
                await storeEntryImages(999, ['data:image/png;base64,test']);
                return false;
            } catch { return true; }
            finally { db.transaction = originalTransaction; }
        }), true, 'An aborted image transaction must reject');
        // A rejected local commit must preserve the old journal and the open draft.
        const storedBefore = await page.evaluate(() => localStorage.getItem('tradingJournal'));
        await page.evaluate(() => {
            scrollToView(0);
            openModal();
            window.originalStorageSetItem = Storage.prototype.setItem;
            Storage.prototype.setItem = function(key, value) {
                if (key === 'tradingJournal') throw new DOMException('Test quota', 'QuotaExceededError');
                return window.originalStorageSetItem.call(this, key, value);
            };
        });
        await page.locator('#notes').fill('Keep this draft');
        await page.locator('#entryForm button[type="submit"]').click();
        await page.waitForFunction(() => !document.querySelector('#entryForm button[type="submit"]').disabled);
        assert.equal(await page.locator('#notes').inputValue(), 'Keep this draft');
        assert.equal(await page.locator('#entryModal').evaluate(el => el.classList.contains('active')), true);
        assert.equal(await page.evaluate(() => localStorage.getItem('tradingJournal')), storedBefore);
        assert.equal(await page.evaluate(() => entries.some(e => e.notes === 'Keep this draft')), false);
        assert.deepEqual(errors, []);
        console.log('PASS: legacy screenshot migration, reload, new screenshot save, quota failure preservation, date/symbol filters, daily calculations, and day drilldown.');
    } finally {
        await browser.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
