'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

test('full E2E: register, upload, request, sign, audit, completion', async () => {
  // Create isolated temp environment
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maac-sign-test-'));
  const srcRoot = path.join(__dirname, '..');

  // Copy src tree
  const copyDir = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'database' || entry.name === 'storage') continue;
        copyDir(s, d);
      } else {
        fs.copyFileSync(s, d);
      }
    }
  };

  copyDir(path.join(srcRoot, 'src'), path.join(tmp, 'src'));

  // Write minimal package.json so express etc. can be resolved from original node_modules
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
    name: 'test-tmp',
    type: 'commonjs',
    dependencies: {},
  }));

  const port = 31000 + Math.floor(Math.random() * 15000);

  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: tmp,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      COOKIE_SECURE: '0',
      PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
      FRONTEND_URL: `http://127.0.0.1:${port}`,
      SESSION_MAX_AGE_MS: '3600000',
      MONGODB_URI: process.env.MONGODB_URI || `mongodb://127.0.0.1:27017/maac-sign-test-${Date.now()}`,
      // Let Node resolve modules from original project
      NODE_PATH: path.join(srcRoot, 'node_modules'),
    },
  });

  let childErr = '';
  child.stderr?.on('data', (d) => { childErr += d.toString(); });
  child.stdout?.on('data', (d) => { if (process.env.DEBUG) console.log(d.toString()); });

  // Override require to use parent node_modules
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/me`);
        if (r.status === 401) { ready = true; break; }
      } catch { /* wait */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, 'Server should start within 8s: ' + childErr);

    let sessionCookie = '';

    async function req(url, method = 'GET', body, withSession = true) {
      const headers = {};
      if (body) headers['Content-Type'] = 'application/json';
      if (withSession && sessionCookie) headers['Cookie'] = sessionCookie;

      const response = await fetch(`http://127.0.0.1:${port}${url}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const setCookie = response.headers.get('set-cookie');
      if (setCookie) sessionCookie = setCookie.split(';')[0];

      return { status: response.status, data: await response.json() };
    }

    // 1. Register
    let r = await req('/api/register', 'POST', {
      name: 'Test User',
      email: 'test@maac.example.com',
      password: 'SecurePass12345!',
    });
    assert.equal(r.status, 201, 'Registration should succeed');
    assert.equal(r.data.email, 'test@maac.example.com');

    // 2. Duplicate registration
    r = await req('/api/register', 'POST', {
      name: 'Dup',
      email: 'test@maac.example.com',
      password: 'SecurePass12345!',
    });
    assert.equal(r.status, 409, 'Duplicate email should fail');

    // 3. Upload PDF
    r = await req('/api/documents', 'POST', {
      name: 'Test Agreement',
      base64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64'),
    });
    assert.equal(r.status, 201, 'Document upload should succeed');
    const docId = r.data.id;

    // 4. List documents
    r = await req('/api/documents');
    assert.equal(r.status, 200);
    assert.ok(r.data.some((d) => d.id === docId), 'Document should appear in list');

    // 5. Create signing request
    r = await req('/api/requests', 'POST', {
      documentId: docId,
      email: 'recipient@example.com',
      recipientName: 'Jane Recipient',
      subject: 'Please review and sign',
    });
    assert.equal(r.status, 201, 'Signing request creation should succeed');
    const invitation = r.data.invitation;
    const token = r.data.token || new URL(invitation).searchParams.get('sign') || new URL(invitation).pathname.split('/').pop();
    assert.ok(token, 'Invitation token should be present');

    // 6. Recipient fetches signing info (unauthenticated)
    r = await req(`/api/sign/${token}`, 'GET', null, false);
    assert.equal(r.status, 200, 'Recipient can view signing info');
    assert.equal(r.data.recipient, 'Jane Recipient');

    // 7. Recipient submits signature (unauthenticated)
    r = await req(`/api/sign/${token}`, 'POST', { signature: 'Jane Recipient', consent: true }, false);
    assert.equal(r.status, 200, 'Signature submission should succeed: ' + JSON.stringify(r.data));
    assert.equal(r.data.complete, true, 'Single recipient should complete the request');

    // 8. Document status should be completed
    r = await req('/api/documents');
    assert.equal(r.status, 200);
    const doc = r.data.find((d) => d.id === docId);
    assert.equal(doc.status, 'completed', 'Document should be marked completed');

    // 9. Audit trail should have signing events
    r = await req(`/api/documents/${docId}/audit`);
    assert.equal(r.status, 200);
    assert.ok(r.data.some((e) => e.action === 'recipient_signed'), 'Audit trail should include signing event');
    assert.ok(r.data.some((e) => e.action === 'request_completed'), 'Audit trail should include completion event');

    // 10. Reports endpoint
    r = await req('/api/reports');
    assert.equal(r.status, 200);
    assert.ok(typeof r.data.total === 'number', 'Reports should return total count');

    // 11. Logout
    r = await req('/api/logout', 'POST');
    assert.equal(r.status, 200);

    // 12. Protected endpoint should return 401 after logout
    r = await req('/api/documents');
    assert.equal(r.status, 401, 'Protected routes should require auth');

  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
