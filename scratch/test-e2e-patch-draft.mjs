import http from 'http';

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, text: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('=== Web-Slinger Day 4 Block 2 E2E Patch Draft & Verification Plan Test ===\n');

  // 1. Health check
  const health = await request({
    hostname: 'localhost',
    port: 8080,
    path: '/health',
    method: 'GET',
  });
  console.log(`[1] Backend Health: ${health.status} - ${JSON.stringify(health.data)}`);

  // 2. Create Session
  const sessionRes = await request(
    {
      hostname: 'localhost',
      port: 8080,
      path: '/api/sessions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { stack: ['JavaScript', 'Node.js', 'React'], goal: 'Fix curriculum documentation and challenge issues' }
  );

  const sessionId = sessionRes.data.session_id;
  console.log(`[2] Created Session ID: ${sessionId} (status: ${sessionRes.status})`);

  // 3. Fetch Discovered Issues
  const issuesRes = await request({
    hostname: 'localhost',
    port: 8080,
    path: `/api/sessions/${sessionId}/issues`,
    method: 'GET',
  });

  const issues = issuesRes.data.issues || [];
  const targetIssue = issues.find((i) => i.number === 69622) || issues[0];
  console.log(`[3] Target Issue #${targetIssue.number}: "${targetIssue.title}" [Tier ${targetIssue.tier}]`);

  // 4. Generate Work Plan first to ensure file evidence is retrieved & stored
  console.log(`\n[4] Generating Work Plan for Issue #${targetIssue.number} ...`);
  const planRes = await request({
    hostname: 'localhost',
    port: 8080,
    path: `/api/sessions/${sessionId}/issues/${targetIssue.number}/work-plan`,
    method: 'POST',
  });
  console.log(`[5] Work Plan status: ${planRes.data.status} | File evidence count: ${(planRes.data.file_evidence || []).length}`);

  const evidence = planRes.data.file_evidence || [];
  if (evidence.length === 0) {
    console.error('No file evidence retrieved in work plan.');
    process.exit(1);
  }

  const firstFile = evidence[0];
  console.log(`    Reviewed Source Candidate: ${firstFile.path} (SHA: ${firstFile.sha})`);

  // 5. Test Gating: Missing affirmation -> 409 Conflict
  console.log('\n[6] Testing Gate 1: Missing affirmation rejection ...');
  const gate1Res = await request(
    {
      hostname: 'localhost',
      port: 8080,
      path: `/api/sessions/${sessionId}/issues/${targetIssue.number}/patch-draft`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      reviewedSources: [{ path: firstFile.path, sha: firstFile.sha }],
      userAffirmation: false,
    }
  );
  console.log(`    HTTP ${gate1Res.status} -> ${gate1Res.data.error}`);

  // 6. Test Gating: Mismatched SHA -> 409 Conflict
  console.log('\n[7] Testing Gate 2: Mismatched SHA rejection ...');
  const gate2Res = await request(
    {
      hostname: 'localhost',
      port: 8080,
      path: `/api/sessions/${sessionId}/issues/${targetIssue.number}/patch-draft`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      reviewedSources: [{ path: firstFile.path, sha: 'wrong-sha-000000' }],
      userAffirmation: true,
    }
  );
  console.log(`    HTTP ${gate2Res.status} -> ${gate2Res.data.error}`);

  // 7. Valid Patch Draft Generation
  console.log('\n[8] Generating Patch Draft with valid reviewed sources & affirmation ...');
  const startTime = Date.now();
  const patchRes = await request(
    {
      hostname: 'localhost',
      port: 8080,
      path: `/api/sessions/${sessionId}/issues/${targetIssue.number}/patch-draft`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      reviewedSources: [{ path: firstFile.path, sha: firstFile.sha }],
      userAffirmation: true,
    }
  );
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n[9] Patch Draft Response in ${elapsed}s (HTTP ${patchRes.status}):`);
  console.log('Patch ID:', patchRes.data.patch_id);
  console.log('Status:', patchRes.data.status);
  console.log('User Affirmation:', patchRes.data.user_affirmation);
  console.log('Changed Files:', patchRes.data.changed_files);
  console.log('Total Changed Lines:', patchRes.data.total_changed_lines);
  console.log('Warnings:', patchRes.data.warnings);
  console.log('Validation Errors:', patchRes.data.validation_errors);
  console.log('\n--- Unified Diff Content ---');
  console.log(patchRes.data.diff_content);

  const patchId = patchRes.data.patch_id;

  // 8. Test GET Patch Draft
  console.log(`\n[10] Calling GET /api/sessions/${sessionId}/issues/${targetIssue.number}/patch-draft/${patchId} ...`);
  const getPatchRes = await request({
    hostname: 'localhost',
    port: 8080,
    path: `/api/sessions/${sessionId}/issues/${targetIssue.number}/patch-draft/${patchId}`,
    method: 'GET',
  });
  console.log(`[11] GET Response: HTTP ${getPatchRes.status} (Status: ${getPatchRes.data.status})`);

  // 9. Test PUT Patch Draft (User Edits)
  console.log(`\n[12] Calling PUT to edit patch diff content ...`);
  const editedDiff = `--- a/${firstFile.path}\n+++ b/${firstFile.path}\n@@ -1,3 +1,3 @@\n-Context line\n-Old text\n+New user-edited text\n`;
  const putPatchRes = await request(
    {
      hostname: 'localhost',
      port: 8080,
      path: `/api/sessions/${sessionId}/issues/${targetIssue.number}/patch-draft/${patchId}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
    },
    { diffContent: editedDiff }
  );
  console.log(`[13] PUT Response: HTTP ${putPatchRes.status} (is_user_edited: ${putPatchRes.data.is_user_edited})`);

  // 10. Generate Manual Verification Plan
  console.log(`\n[14] Calling POST /api/sessions/${sessionId}/issues/${targetIssue.number}/verification-plan ...`);
  const vPlanRes = await request({
    hostname: 'localhost',
    port: 8080,
    path: `/api/sessions/${sessionId}/issues/${targetIssue.number}/verification-plan`,
    method: 'POST',
  });
  console.log(`[15] Verification Plan Response (HTTP ${vPlanRes.status}):`);
  console.log('Disclaimer:', vPlanRes.data.plan?.disclaimer);
  console.log('Checklist Items:');
  for (const item of vPlanRes.data.plan?.checklist || []) {
    console.log(`  - [${item.status.toUpperCase()}] ${item.title} | command: ${item.suggestedCommand || 'none'}`);
  }

  console.log('\n=== E2E Test Completed Successfully ===');
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
