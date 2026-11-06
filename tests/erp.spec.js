import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Nahid Textile ERP E2E Tests', () => {
  const mainFilePath = path.join(__dirname, 'fixtures_main.xlsx');
  const newFilePath = path.join(__dirname, 'fixtures_new.xlsx');
  const catFilePath = path.join(__dirname, 'fixtures_delivery.xlsx');

  test.beforeAll(async () => {
    // Generate test Excel files
    const wbMain = XLSX.utils.book_new();
    const wsMain = XLSX.utils.aoa_to_sheet([
      ['Report: Main Orders'],
      ['P.I. NO', 'Buyer / Brand', 'Shade / Color', 'Construction', 'Order Quantity'],
      ['PI-1001', 'H&M', 'Black', '100% Cotton 40x40', 10000],
      ['PI-1002', 'Zara', 'White', 'Poly Cotton 50x50', 20000]
    ]);
    XLSX.utils.book_append_sheet(wbMain, wsMain, 'Orders');
    XLSX.writeFile(wbMain, mainFilePath);

    const wbNew = XLSX.utils.book_new();
    const wsNew = XLSX.utils.aoa_to_sheet([
      ['Updated Orders'],
      ['PI Number', 'Customer', 'Color', 'Fabric Quality', 'Order Qty'],
      ['PI-1001', 'H&M', 'Black', '100% Cotton 40x40', 10000],
      ['PI-1003', 'Marks & Spencer', 'Blue', 'Twill 20x16', 15000]
    ]);
    XLSX.utils.book_append_sheet(wbNew, wsNew, 'Sheet1');
    XLSX.writeFile(wbNew, newFilePath);

    const wbCat = XLSX.utils.book_new();
    const wsCat = XLSX.utils.aoa_to_sheet([
      ['Delivery Status'],
      ['PI', 'Buyer', 'Color', 'Construction', 'Order Qty', 'Good Received Qty', 'Shortage Qty', 'Delivery Condition'],
      ['PI-1001', 'H&M', 'Black', '100% Cotton 40x40', 10000, 9500, 500, 'Partial Delivered']
    ]);
    XLSX.utils.book_append_sheet(wbCat, wsCat, 'DeliveryReport');
    XLSX.writeFile(wbCat, catFilePath);
  });

  test.afterAll(async () => {
    if (fs.existsSync(mainFilePath)) fs.unlinkSync(mainFilePath);
    if (fs.existsSync(newFilePath)) fs.unlinkSync(newFilePath);
    if (fs.existsSync(catFilePath)) fs.unlinkSync(catFilePath);
  });

  test('Manual Order Entry and Persistence', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.click('button[data-page="entry"]');

    // Add manual order
    await page.fill('#piInput', 'PI-MANUAL-1');
    await page.fill('#buyerInput', 'Test Corp');
    await page.fill('#colorInput', 'Navy');
    await page.fill('#constructionInput', 'Poplin 50s');
    await page.fill('#qtyInput', '8000');
    await page.click('#saveOrderBtn');

    await expect(page.locator('#orderTable')).toContainText('PI-MANUAL-1');
    await expect(page.locator('#orderTable')).toContainText('8,000');

    // Reload and check IndexedDB persistence
    await page.reload();
    await page.click('button[data-page="entry"]');
    await expect(page.locator('#orderTable')).toContainText('PI-MANUAL-1');
  });

  test('Excel Import and Matching Workflow', async ({ page }) => {
    await page.goto('http://localhost:8080');

    // Import Main File
    await page.click('button[data-page="entry"]');
    await page.setInputFiles('#mainFile', mainFilePath);
    await page.click('#importMainBtn');
    await page.waitForTimeout(600);
    await expect(page.locator('#orderTable')).toContainText('PI-1001');
    await expect(page.locator('#orderTable')).toContainText('PI-1002');

    // Switch to Matching and import new file
    await page.click('button[data-page="matching"]');
    await page.setInputFiles('#newFile', newFilePath);
    await page.click('#importNewBtn');
    await page.waitForTimeout(600);

    // PI-1001 is matched in both, PI-1002 is unmatched in main, PI-1003 is unmatched in new
    await expect(page.locator('#mainMatchTable')).toContainText('Matched');
    await expect(page.locator('#mainMatchTable')).toContainText('Unmatched');

    // Test Match View Filters
    await page.click('#filterMatchMatched');
    const mainHtml = await page.innerHTML('#mainMatchTable');
    expect(mainHtml).toContain('PI-1001');
    expect(mainHtml).not.toContain('PI-1002');
  });

  test('Order Update Upload and Global Instant Search', async ({ page }) => {
    await page.goto('http://localhost:8080');

    // Upload category delivery file
    await page.click('button[data-page="update"]');
    await page.setInputFiles('#categoryFile', catFilePath);
    await page.click('#uploadCategoryBtn');
    await page.waitForTimeout(800);

    // Verify sheet loaded
    await expect(page.locator('#sheetSelect')).toContainText('DeliveryReport');

    // Go to Global Search
    await page.click('button[data-page="search"]');
    await page.fill('#globalInput', 'PI-1001');
    await page.waitForTimeout(500);

    // Verify found results
    await expect(page.locator('#globalResults')).toContainText('PI: PI-1001');
    await expect(page.locator('#globalResults')).toContainText('Black');

    // Check detail view
    await page.click('text=⚡ View Details');
    await expect(page.locator('#globalDetails')).toContainText('2. DELIVERY STATUS');
    await expect(page.locator('#globalDetails')).toContainText('9,500');
    await expect(page.locator('#globalDetails')).toContainText('500');
    await expect(page.locator('#globalDetails')).toContainText('Partial Delivered');
  });
});
