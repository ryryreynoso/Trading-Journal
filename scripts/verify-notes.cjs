const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errors = [];
        const dialogs = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
        await page.route('https://tj.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
        await page.addInitScript(() => {
            if (!localStorage.getItem('notesTestSeed')) {
                localStorage.setItem('tradingJournalNotes', JSON.stringify([{ id: 1, text: 'Existing note' }]));
                localStorage.setItem('notesTestSeed', 'true');
            }
        });
        await page.goto('https://tj.test/', { waitUntil: 'networkidle' });
        await page.evaluate(() => scrollToView(3));
        const editor = page.getByRole('textbox', { name: 'Note', exact: true });
        assert.equal(await editor.inputValue(), 'Existing note');
        await editor.fill('Air gaps work? Yes Nov 25th 7:55 5m');
        await editor.press('Shift+Enter');
        await editor.pressSequentially('Follow-up');
        const edited = await editor.inputValue();
        assert.match(edited, /\nFollow-up/);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('tradingJournalNotes'))[0].text), edited);
        await editor.press('Enter');
        assert.equal(await editor.evaluate(el => el === document.activeElement), false);
        await page.reload({ waitUntil: 'networkidle' });
        await page.evaluate(() => scrollToView(3));
        assert.equal(await editor.inputValue(), edited);
        await page.getByRole('textbox', { name: 'New note', exact: true }).fill('Another note');
        await page.getByRole('textbox', { name: 'New note', exact: true }).press('Enter');
        await page.waitForFunction(() => document.querySelectorAll('.note-content').length === 2);
        assert.equal(await editor.first().inputValue(), 'Another note');
        const before = await page.evaluate(() => localStorage.getItem('tradingJournalNotes'));
        await page.evaluate(() => {
            window.originalSetItem = Storage.prototype.setItem;
            Storage.prototype.setItem = function(key, value) {
                if (key === 'tradingJournalNotes') throw new DOMException('Full', 'QuotaExceededError');
                return originalSetItem.call(this, key, value);
            };
        });
        await editor.first().fill('Keep unsaved edit');
        assert.match(await page.locator('#notesSaveStatus').textContent(), /Not saved/);
        assert.equal(await page.evaluate(() => localStorage.getItem('tradingJournalNotes')), before);
        assert.equal(await editor.first().inputValue(), 'Keep unsaved edit');
        await page.evaluate(() => { Storage.prototype.setItem = originalSetItem; });
        await editor.first().press('Enter');
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('tradingJournalNotes'))[0].text), 'Keep unsaved edit');
        assert.deepEqual(dialogs, []);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: '/tmp/tj-inline-notes-mobile.png' });
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.evaluate(() => scrollToView(3));
        await page.screenshot({ path: '/tmp/tj-inline-notes-desktop.png' });
        console.log('PASS: inline edit without dialogs, multiline, Enter finishes, add, reload, quota draft preservation and retry.');
    } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
