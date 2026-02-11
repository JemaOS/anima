import { test, expect } from "@playwright/test";

test.describe("Room Creation Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Grant permissions for camera and microphone
    await page.context().grantPermissions(["camera", "microphone"]);
  });

  test("can create and join a room", async ({ page }) => {
    await page.goto("/");

    // 1. Click "Nouvelle réunion"
    await page.getByRole("button", { name: /Nouvelle réunion/i }).click();

    // 2. Verify we are on PreJoin page
    await expect(page).toHaveURL(/\/prejoin\//);

    // 3. Enter name
    const nameInput = page.getByPlaceholder("Entrez votre nom");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Test User");

    // 4. Click "Démarrer" (since we are host)
    const joinButton = page.getByRole("button", { name: /Démarrer/i });
    await expect(joinButton).toBeEnabled();
    await joinButton.click();

    // 5. Verify we are on Room page
    await expect(page).toHaveURL(/\/room\//);

    // 6. Check for room elements (e.g., control bar)
    // Note: Depending on implementation, we might need to wait for connection
    // For now, just checking the URL is a good start.
  });
});
