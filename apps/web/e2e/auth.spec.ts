import { type BrowserContext, expect, test } from '@playwright/test';

import { authErrorMessage } from '../src/components/auth/auth-errors';

import { adminClient, trackAccounts } from './support/accounts';
import { visit } from './support/navigation';

const accounts = trackAccounts();

// A failed assertion must not leave its account behind in the shared database.
test.afterEach(accounts.cleanup);

test.describe('signing up and creating the assistant', () => {
  test('a new visitor lands on onboarding, creates the one assistant and every way in leads to it', async ({
    page,
  }) => {
    const email = accounts.email('e2e');
    test.info().annotations.push({ type: 'account', description: email });

    await visit(page, '/signup');
    await expect(page.getByText('Create your account')).toBeVisible();

    await page.getByLabel(/full name/i).fill('E2E Tester');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password/i).fill('correct-horse-battery');
    await page.getByRole('button', { name: /create account|sign up|start/i }).click();

    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create your assistant');

    // Every account-level screen puts its title in the same place, so moving between them does not jump.
    const titleX = async () =>
      (await page.getByRole('heading', { level: 1 }).first().boundingBox())!.x;
    const titles = [await titleX()];

    await page.getByLabel('Name', { exact: true }).fill('Acme Docs');
    await page.getByRole('button', { name: /create/i }).click();

    await expect(page).toHaveURL(/\/a\/[0-9a-f-]{36}\/knowledge/);

    const overview = new URL(page.url()).pathname.replace(/\/knowledge$/, '');
    const sidebar = page.getByRole('complementary');

    // The sidebar names the assistant as a label and lists its sections; there is nothing to switch.
    await expect(sidebar.getByTestId('sidebar-assistant')).toContainText('Acme Docs');
    await expect(
      sidebar.getByRole('navigation', { name: 'Assistant' }).getByRole('link'),
    ).toHaveText(['Overview', 'Chat', 'Knowledge', 'Inbox', 'Widget', 'Settings']);
    await expect(sidebar.getByRole('button', { name: /switch assistant/i })).toHaveCount(0);
    await expect(page.getByText(/all assistants|new assistant/i)).toHaveCount(0);

    // The old list of assistants and onboarding both lead to the one there is.
    await visit(page, '/dashboard');
    await expect(page).toHaveURL(new RegExp(`${overview}$`));
    await visit(page, '/onboarding');
    await expect(page).toHaveURL(new RegExp(`${overview}$`));

    for (const path of ['/account', '/billing']) {
      await visit(page, path);
      titles.push(await titleX());
    }

    expect(new Set(titles).size).toBe(1);

    // Billing meters what a plan limits, which no longer includes assistants.
    await expect(page.getByTestId('meter-indexed-pages')).toBeVisible();
    await expect(page.getByTestId('meter-answers-this-month')).toBeVisible();
    await expect(page.getByTestId('meter-assistants')).toHaveCount(0);

    // Signing in again lands on the assistant, not on a list.
    await page.getByRole('complementary').getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password/i).fill('correct-horse-battery');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(new RegExp(`${overview}$`));
  });

  test('signing out ends this browser only, not the same account signed in elsewhere', async ({
    browser,
  }) => {
    // The demo account is shared: a reviewer signing out must not end the presenter's session.
    const email = accounts.email('sign-out');
    const password = 'correct-horse-battery';
    const admin = adminClient();

    test.skip(!admin, 'Needs SUPABASE_SERVICE_ROLE_KEY to create the account.');

    const { error } = await admin!.auth.admin.createUser({ email, password, email_confirm: true });
    expect(error).toBeNull();

    const [here, elsewhere] = await Promise.all([browser.newContext(), browser.newContext()]);

    try {
      const signIn = async (context: BrowserContext) => {
        const page = await context.newPage();

        await visit(page, `/login?next=${encodeURIComponent('/account')}`);
        await page.getByLabel(/email/i).fill(email);
        await page.getByLabel(/^password/i).fill(password);
        await page.getByRole('button', { name: /sign in/i }).click();
        await expect(page).toHaveURL(/\/account$/);

        return page;
      };

      const [page, other] = [await signIn(here), await signIn(elsewhere)];

      await page.getByRole('complementary').getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/login/);

      // This browser is signed out.
      await visit(page, '/account');
      await expect(page).toHaveURL(/\/login\?next=%2Faccount/);

      // The other one still is not: its next server render still knows who it is.
      await visit(other, '/account');
      await expect(other).toHaveURL(/\/account$/);
      await expect(other.getByRole('heading', { level: 1 })).toHaveText('Account');
    } finally {
      await Promise.all([here.close(), elsewhere.close()]);
    }
  });

  test('guarded routes bounce to login and keep the destination', async ({ page }) => {
    await visit(page, '/billing');
    await expect(page).toHaveURL(/\/login\?next=%2Fbilling/);
  });

  test('a wrong password is explained inline', async ({ page }) => {
    const message = authErrorMessage({ code: 'invalid_credentials' });

    await visit(page, '/login');
    await expect(page.getByText(message)).toHaveCount(0);

    await page.getByLabel(/email/i).fill('demo@parbot.dev');
    await page.getByLabel(/^password/i).fill('not-the-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    // The form's own alert, not a label that is on the page before anything is sent.
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeEnabled();
    await expect(page).toHaveURL(/\/login/);
  });
});
