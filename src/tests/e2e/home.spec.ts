import { test, expect } from '@playwright/test';

test('homepage has title and create button', async ({ page }) => {
  await page.goto('/');

  // Check title
  await expect(page).toHaveTitle(/Anima/);

  // Check for "Nouvelle réunion" button
  const createButton = page.getByRole('button', { name: /Nouvelle réunion/i });
  await expect(createButton).toBeVisible();

  // Check for "Rejoindre" button
  const joinButton = page.getByRole('button', { name: /Rejoindre/i });
  await expect(joinButton).toBeVisible();
});

test('can navigate to prejoin page', async ({ page }) => {
  await page.goto('/');
  
  const createButton = page.getByRole('button', { name: /Nouvelle réunion/i });
  await createButton.click();

  // Should navigate to /prejoin/xxx-yyy-zzz
  await expect(page).toHaveURL(/\/prejoin\/[a-z]{3}-[a-z]{3}-[a-z]{3}/);
});
