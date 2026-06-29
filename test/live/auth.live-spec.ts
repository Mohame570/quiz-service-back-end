import { LIVE_API_BASE_URL, waitForApi } from './helpers/live-client';
import {
  waitForMailToRecipient,
  extractVerificationToken,
} from './helpers/mailhog-extra';
 
const runLiveTests = process.env.LIVE_TESTS === '1';
 
(runLiveTests ? describe : describe.skip)('Live server — auth verification', () => {
  let registeredEmail: string;
 
  beforeAll(async () => {
    await waitForApi();
  }, 90_000);
 
  it('logs in with the seeded verified student', async () => {
    const response = await fetch(`${LIVE_API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'student@live-test.example',
        password: 'Password123!',
      }),
    });
    const body = (await response.json()) as any;
 
    expect(response.status).toBe(201);
    expect(body.user.emailVerified).toBe(true);
    expect(body.tokens.accessToken).toBeDefined();
  });

    it('blocks login for an inactive account with 401', async () => {
    const response = await fetch(`${LIVE_API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'inactive@live-test.example',
        password: 'Password123!',
      }),
    });

    expect(response.status).toBe(401);
  });
 
  it('registers a new user as unverified', async () => {
    registeredEmail = `live-test-${Date.now()}@example.com`;
 
    const response = await fetch(`${LIVE_API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Live Test User',
        email: registeredEmail,
        password: 'StrongPass123!',
      }),
    });
 
    const body = (await response.json()) as any;
 
    expect(response.status).toBe(201);
    expect(body.user.emailVerified).toBe(false);
  });

  it('registered user always gets STUDENT role', async () => {
    const response = await fetch(`${LIVE_API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Role Test User',
        email: `role-test-${Date.now()}@example.com`,
        password: 'StrongPass123!',
    }),
  });

  const body = (await response.json()) as any;

  expect(response.status).toBe(201);
  expect(body.user.role).toBe('STUDENT');
});
 
  it('sends a real verification email containing a working token', async () => {
    const message = await waitForMailToRecipient(registeredEmail);
    const token = extractVerificationToken(message);
 
    const response = await fetch(`${LIVE_API_BASE_URL}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
 
    const body = (await response.json()) as any;
 
    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
  });
 
  it('reflects emailVerified=true on login after verification', async () => {
    const response = await fetch(`${LIVE_API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: registeredEmail,
        password: 'StrongPass123!',
      }),
    });
 
    const body = (await response.json()) as any;
 
    expect(response.status).toBe(201);
    expect(body.user.emailVerified).toBe(true);
  });
 
  it('fails to verify with an invalid token', async () => {
    const response = await fetch(`${LIVE_API_BASE_URL}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'not-a-real-token' }),
    });
 
    expect(response.status).toBe(401);
  });
 
  it('resend-verification on an unknown email returns 404', async () => {
    const response = await fetch(`${LIVE_API_BASE_URL}/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'definitely-not-registered@example.com' }),
    });
 
    expect(response.status).toBe(404);
  });
});