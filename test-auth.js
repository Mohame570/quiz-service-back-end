const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { hostname: 'localhost', port: 3002, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const req = http.request({ hostname: 'localhost', port: 3002, path, method: 'GET', headers }, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    req.end();
  });
}

const CLOSED_QUIZ_ID = 'analytics-mock-quiz-closed';
const OPEN_QUIZ_ID = 'analytics-mock-quiz-open';
const UNASSIGNED_QUIZ_ID = 'analytics-mock-quiz-unassigned';

(async () => {
  console.log('--- Admin login ---');
  const adminLogin = await post('/api/auth/login', { email: 'admin1@example.com', password: 'Password123!' });
  const adminToken = adminLogin.body.tokens.accessToken;
  console.log('Admin login status:', adminLogin.status);

  console.log('\n=== Guard checks (existing endpoints) ===');

  console.log('\n--- GET /api/analytics with admin token ---');
  console.log(await get('/api/analytics', adminToken));

  console.log('\n--- GET /api/analytics with no token ---');
  console.log(await get('/api/analytics'));

  console.log('\n--- Student login ---');
  const studentLogin = await post('/api/auth/login', { email: 'student1@example.com', password: 'Password123!' });
  const studentToken = studentLogin.body.tokens.accessToken;

  console.log('\n--- GET /api/analytics with student token ---');
  console.log(await get('/api/analytics', studentToken));

  console.log('\n=== Per-quiz metric endpoints (docs/analytics-contract.md §6/§7) ===');

  console.log('\n--- GET quiz-level metric summary (closed window quiz) ---');
  console.log(await get(`/api/analytics/quizzes/${CLOSED_QUIZ_ID}/metrics`, adminToken));

  console.log('\n--- GET per-student metrics (closed window quiz) ---');
  console.log(await get(`/api/analytics/quizzes/${CLOSED_QUIZ_ID}/student-metrics`, adminToken));

  console.log('\n--- GET quiz-level metric summary (open window quiz — NOT_STARTED contrast) ---');
  console.log(await get(`/api/analytics/quizzes/${OPEN_QUIZ_ID}/metrics`, adminToken));

  console.log('\n--- GET per-student metrics (open window quiz) ---');
  console.log(await get(`/api/analytics/quizzes/${OPEN_QUIZ_ID}/student-metrics`, adminToken));

  console.log('\n--- GET quiz-level metric summary (zero-assignment quiz) ---');
  console.log(await get(`/api/analytics/quizzes/${UNASSIGNED_QUIZ_ID}/metrics`, adminToken));

  console.log('\n--- GET new endpoints with student token (should be 403) ---');
  console.log(await get(`/api/analytics/quizzes/${CLOSED_QUIZ_ID}/metrics`, studentToken));

  console.log('\n=== NEW: Org-wide dashboard endpoint (Sprint 2) ===');

  console.log('\n--- GET /api/analytics/dashboard with admin token ---');
  console.log(await get('/api/analytics/dashboard', adminToken));

  console.log('\n--- GET /api/analytics/dashboard with student token (should be 403) ---');
  console.log(await get('/api/analytics/dashboard', studentToken));

  console.log('\n--- GET /api/analytics/dashboard with no token (should be 401) ---');
  console.log(await get('/api/analytics/dashboard'));
})();