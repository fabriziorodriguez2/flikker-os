import { expect, test } from '@playwright/test';

const DEMO_EMAIL = 'admin@flikker.dev';
const DEMO_PASSWORD = 'Flikker2026!';
const BUSINESS_NAME = 'Gains Montevideo';
const REVIEW_TEXT = 'Buenas clases grupales';

test('main MVP flow', async ({ page }) => {
  const widgetName = `Widget MVP ${Date.now()}`;

  await page.goto('/login');

  await page.locator('#email').fill(DEMO_EMAIL);
  await page.locator('#password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();

  await expect(page.getByText(/Seleccion/i)).toBeVisible();
  await page.getByRole('button', { name: new RegExp(BUSINESS_NAME, 'i') }).click();

  await page.waitForURL('**/dashboard');
  await expect(
    page.getByRole('heading', { name: BUSINESS_NAME }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Campanas' }).click();

  await expect(page).toHaveURL(/\/dashboard\/campaigns/);
  await expect(
    page.getByRole('heading', { name: 'Campanas' }),
  ).toBeVisible();

  const campaignRow = page.locator('tr').filter({
    hasText: 'QR Mostrador',
  });

  await expect(campaignRow).toBeVisible();
  await expect(campaignRow).toContainText('ACTIVE');
  await expect(campaignRow).toContainText('qr-mostrador');
  await expect(campaignRow).toContainText('2');

  await campaignRow.getByRole('link', { name: 'Ver stats' }).click();

  await expect(page).toHaveURL(/\/dashboard\/campaigns\/.+/);
  await expect(
    page.getByRole('heading', { name: /QR Mostrador/i }),
  ).toBeVisible();
  await expect(page.getByText('Scans totales')).toBeVisible();
  await expect(page.getByText('Rendimiento por QR')).toBeVisible();

  await page.getByRole('link', { name: 'Reviews' }).click();

  await expect(page).toHaveURL(/\/dashboard\/reviews/);
  await expect(
    page.getByRole('heading', { name: 'Reviews' }),
  ).toBeVisible();

  const reviewRow = page.locator('tr').filter({
    hasText: REVIEW_TEXT,
  });

  await expect(reviewRow).toBeVisible();
  await reviewRow.getByRole('link', { name: 'Ver detalle' }).click();

  await expect(page).toHaveURL(/\/dashboard\/reviews\/.+/);
  await expect(page.getByText(REVIEW_TEXT)).toBeVisible();
  await expect(page.getByText('Respuesta manual')).toBeVisible();

  await page.locator('#response-content').fill(
    'Gracias por entrenar con nosotros. Nos alegra que las clases grupales te sirvan.',
  );
  await page
    .getByRole('button', { name: /Guardar respuesta|Actualizar respuesta/ })
    .click();

  await expect(page.getByText('Texto guardado')).toBeVisible();
  await expect(page.getByText('Respondida')).toBeVisible();

  const highlightToggle = page.getByRole('button', {
    name: /Highlight|Quitar highlight/,
  });
  const currentHighlightLabel = await highlightToggle.innerText();
  if (currentHighlightLabel.includes('Highlight')) {
    await highlightToggle.click();
    await expect(
      page.getByRole('button', { name: 'Quitar highlight' }),
    ).toBeVisible();
  }

  await page.getByRole('link', { name: 'Widgets' }).click();

  await expect(page).toHaveURL(/\/dashboard\/widgets/);
  await expect(
    page.getByRole('heading', { name: 'Widgets' }),
  ).toBeVisible();
  await expect(page.getByText('Fuente del widget')).toBeVisible();

  await page.getByPlaceholder('Badge home').fill(widgetName);
  await page.locator('select').first().selectOption('REVIEW_LIST');
  await page
    .getByPlaceholder('Lo que dicen nuestros clientes')
    .fill('Lo que dicen nuestros clientes');
  await page.locator('input[type="number"]').first().fill('3');
  await page.getByRole('button', { name: 'Crear widget' }).click();

  await expect(page.getByText('Widget creado en borrador')).toBeVisible();

  const widgetCard = page.locator('div.rounded-xl').filter({
    hasText: widgetName,
  });

  await expect(widgetCard).toBeVisible();
  await expect(widgetCard).toContainText('DRAFT');
  await expect(widgetCard).toContainText('REVIEW_LIST');
  await expect(widgetCard).toContainText('Lo que dicen nuestros clientes');
  await expect(widgetCard.getByText(REVIEW_TEXT)).toBeVisible();
});
