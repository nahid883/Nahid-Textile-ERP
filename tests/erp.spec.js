import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Nahid Textile ERP E2E Tests', () => {
  const mainFilePath = path.join(__dirname, 'fixtures_main.xlsx');
  const newFilePath = path.join(__dirname, 'fixtures_new.xlsx');
  const catFilePath = path.join(__dirname, 'fixtures_delivery.xlsx');
  const wipFilePath = path.join(__dirname, 'fixtures_wip.xlsx');
  const wipFormulaFilePath = path.join(__dirname, 'fixtures_wip_formula.xlsx');

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

    const wbWip = XLSX.utils.book_new();
    const wsWip = XLSX.utils.aoa_to_sheet([
      ['Running WIP Report'],
      ['PI Number', 'Color', 'Construction', 'Order Qty (Yds)', 'Delivery Status'],
      ['PI-1001', 'Black', '100% Cotton 40x40', 10000, 'In Dyeing / Printing']
    ]);
    XLSX.utils.book_append_sheet(wbWip, wsWip, 'WIP_Status');
    XLSX.writeFile(wbWip, wipFilePath);

    const wbWipFormula = XLSX.utils.book_new();
    const wsWipFormula = {};
    wsWipFormula['!ref'] = 'A1:E3';
    wsWipFormula['A1'] = { t: 's', v: 'Running WIP With Formulas' };
    wsWipFormula['A2'] = { t: 's', v: 'PI Number' };
    wsWipFormula['B2'] = { t: 's', v: 'Color' };
    wsWipFormula['C2'] = { t: 's', v: 'Construction' };
    wsWipFormula['D2'] = { t: 's', v: 'Order Qty' };
    wsWipFormula['E2'] = { t: 's', v: 'Delivery status' };

    wsWipFormula['A3'] = { t: 's', v: 'PI-FORMULA-99' };
    wsWipFormula['B3'] = { t: 's', v: 'Olive Green' };
    wsWipFormula['C3'] = { t: 's', v: 'Cotton Twill' };
    wsWipFormula['D3'] = { t: 'n', v: 25000 };
    // Formula cell with evaluated value and formatted text
    wsWipFormula['E3'] = {
      t: 's',
      f: '=VLOOKUP(A3, Delivery!A:E, 5, FALSE)',
      v: 'Ready for Shipment',
      w: 'Ready for Shipment'
    };
    XLSX.utils.book_append_sheet(wbWipFormula, wsWipFormula, 'WIP_Formula_Sheet');
    XLSX.writeFile(wbWipFormula, wipFormulaFilePath);
  });

  test.afterAll(async () => {
    if (fs.existsSync(mainFilePath)) fs.unlinkSync(mainFilePath);
    if (fs.existsSync(newFilePath)) fs.unlinkSync(newFilePath);
    if (fs.existsSync(catFilePath)) fs.unlinkSync(catFilePath);
    if (fs.existsSync(wipFilePath)) fs.unlinkSync(wipFilePath);
    if (fs.existsSync(wipFormulaFilePath)) fs.unlinkSync(wipFormulaFilePath);
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

  test('WIP Upload and Order Qty / Delivery Status Rendering', async ({ page }) => {
    await page.goto('http://localhost:8080');

    // Switch to Order Update page
    await page.click('button[data-page="update"]');

    // Select WIP category
    const wipCard = page.locator('#categoryList .category-card', { hasText: 'WIP' });
    await wipCard.locator('button', { hasText: /Select/ }).click();
    await expect(page.locator('#categoryTitle')).toHaveText('WIP');

    // Upload WIP file
    await page.setInputFiles('#categoryFile', wipFilePath);
    await page.click('#uploadCategoryBtn');
    await page.waitForTimeout(800);

    // Verify sheet loaded in update section
    await expect(page.locator('#sheetSelect')).toContainText('WIP_Status');

    // Go to Global Search
    await page.click('button[data-page="search"]');
    await page.fill('#globalInput', 'PI-1001');
    await page.waitForTimeout(500);

    // Click View Details
    await page.click('text=⚡ View Details');

    // Verify 3. WIP section has correct Order Qty and Delivery Status
    const wipSection = page.locator('.detail-section', { hasText: '3. WIP' });
    await expect(wipSection).toBeVisible();
    await expect(wipSection).toContainText('10000');
    await expect(wipSection).toContainText('In Dyeing / Printing');
  });

  test('WIP Upload with formula in Delivery status renders update correctly', async ({ page }) => {
    await page.goto('http://localhost:8080');

    // Switch to Order Update page
    await page.click('button[data-page="update"]');

    // Select WIP category
    const wipCard = page.locator('#categoryList .category-card', { hasText: 'WIP' });
    await wipCard.locator('button', { hasText: /Select/ }).click();
    await expect(page.locator('#categoryTitle')).toHaveText('WIP');

    // Upload WIP file containing formula in Delivery status column
    await page.setInputFiles('#categoryFile', wipFormulaFilePath);
    await page.click('#uploadCategoryBtn');
    await page.waitForTimeout(800);

    // Verify sheet loaded in update section
    await expect(page.locator('#sheetSelect')).toContainText('WIP_Formula_Sheet');

    // Verify Step 2 & 3 in Order Update
    const piButton = page.locator('#piResults button', { hasText: 'PI-FORMULA-99' });
    await expect(piButton).toBeVisible();
    await piButton.click();

    const colorButton = page.locator('#colorResults button', { hasText: 'Olive Green' });
    await expect(colorButton).toBeVisible();
    await colorButton.click();

    // Verify detail table shows formula-evaluated Delivery status
    await expect(page.locator('#detailBody')).toContainText('Ready for Shipment');

    // Go to Global Search
    await page.click('button[data-page="search"]');
    await page.fill('#globalInput', 'PI-FORMULA-99');
    await page.waitForTimeout(500);

    // Click View Details
    await page.click('text=⚡ View Details');

    // Verify 3. WIP section has correct Order Qty and Delivery Status
    const wipSection = page.locator('.detail-section', { hasText: '3. WIP' });
    await expect(wipSection).toBeVisible();
    await expect(wipSection).toContainText('25000');
    await expect(wipSection).toContainText('Ready for Shipment');
  });

  test('3 Dedicated Slots, Header Mapping, Tab View Switching and Sheet Deletion', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.click('button[data-page="update"]');

    // 1. Upload Delivery Status
    await page.setInputFiles('#deliveryFileInput', catFilePath);
    await page.click('#uploadDeliveryBtn');
    await page.waitForTimeout(600);
    await expect(page.locator('#badgeDeliveryFile')).toContainText('Active');

    // 2. Upload Order Status
    const wbOrder = XLSX.utils.book_new();
    const wsOrder = XLSX.utils.aoa_to_sheet([
      ['Orders'],
      ['PI Number', 'PI Received Date', 'Greige Date', 'Deli Date', 'Buyer', 'Construction', 'Color', 'Order Qty', 'Remarks'],
      ['PI-1001', '01/10/2026', '05/10/2026', '25/10/2026', 'H&M', '100% Cotton 40x40', 'Black', 10000, 'Urgent']
    ]);
    XLSX.utils.book_append_sheet(wbOrder, wsOrder, 'Order Status');
    const orderTestPath = path.join(__dirname, 'fixtures_order_custom.xlsx');
    XLSX.writeFile(wbOrder, orderTestPath);

    await page.setInputFiles('#orderStatusFileInput', orderTestPath);
    await page.click('#uploadOrderStatusBtn');
    await page.waitForTimeout(600);
    await expect(page.locator('#badgeOrderStatusFile')).toContainText('Active');

    // 3. Verify Dashboard counts (1 order, 10,000 qty)
    await page.click('button[data-page="dashboard"]');
    await expect(page.locator('#totalOrders')).toHaveText('1');
    await expect(page.locator('#totalQty')).toHaveText('10,000');

    // 4. Return to Order Update tab
    await page.click('button[data-page="update"]');
    await page.fill('#updatePiSearch', 'PI-1001');
    const piBtn = page.locator('#piResults button', { hasText: 'PI-1001' });
    await expect(piBtn).toBeVisible();
    await piBtn.click();

    const colorBtn = page.locator('#colorResults button', { hasText: 'Black' });
    await expect(colorBtn).toBeVisible();
    await colorBtn.click();

    // 5. Check Delivery View
    await expect(page.locator('#detailHead')).toContainText('P.I');
    await expect(page.locator('#detailHead')).toContainText('Buyer Name');
    await expect(page.locator('#detailHead')).toContainText('Good Rcvd');
    await expect(page.locator('#detailHead')).toContainText('Present Status');

    // 6. Switch to Order Status View
    await page.click('#tabOrderStatusView');
    await expect(page.locator('#detailHead')).toContainText('Greige Date');
    await expect(page.locator('#detailHead')).toContainText('Remarks');
    await expect(page.locator('#detailBody')).toContainText('05/10/2026');
    await expect(page.locator('#detailBody')).toContainText('Urgent');

    // 7. Delete Delivery sheet independently
    page.on('dialog', async dialog => await dialog.accept());
    await page.click('#deleteDeliveryBtn');
    await page.waitForTimeout(600);
    await expect(page.locator('#badgeDeliveryFile')).toContainText('Not Uploaded');
    await expect(page.locator('#badgeOrderStatusFile')).toContainText('Active');

    if (fs.existsSync(orderTestPath)) fs.unlinkSync(orderTestPath);
  });
});
