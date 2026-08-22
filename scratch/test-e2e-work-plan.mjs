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
  console.log('=== Web-Slinger Day 4 Block 1 E2E Work Plan Test ===\n');

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
  console.log(`[3] Discovered Candidate Issues: ${issues.length}`);

  if (issues.length === 0) {
    console.error('No candidate issues found to test.');
    process.exit(1);
  }

  // Find issue #69622 or first candidate
  const targetIssue = issues.find((i) => i.number === 69622) || issues[0];
  console.log(`[4] Selected Candidate Issue #${targetIssue.number}: "${targetIssue.title}" [Tier ${targetIssue.tier}]`);

  // 4. Generate Work Plan via POST /api/sessions/:sessionId/issues/:issueNumber/work-plan
  console.log(`\n[5] Calling POST /api/sessions/${sessionId}/issues/${targetIssue.number}/work-plan ...`);
  const startTime = Date.now();
  const planRes = await request({
    hostname: 'localhost',
    port: 8080,
    path: `/api/sessions/${sessionId}/issues/${targetIssue.number}/work-plan`,
    method: 'POST',
  });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n[6] Work Plan Response received in ${elapsed}s (HTTP ${planRes.status}):`);
  console.log('Status:', planRes.data.status);
  console.log('Model ID:', planRes.data.model_id);
  console.log('Generated At:', planRes.data.generated_at);
  console.log('File Evidence Count:', (planRes.data.file_evidence || []).length);
  console.log('Validation Errors:', planRes.data.validation_errors);

  if (planRes.data.plan) {
    console.log('\n--- Confirmed Problem ---');
    console.log(planRes.data.plan.confirmedProblem);

    console.log('\n--- Candidate & Reviewed Files ---');
    for (const f of planRes.data.plan.candidateFiles || []) {
      console.log(`  - [${f.confidence.toUpperCase()}] ${f.path}: ${f.rationale}`);
    }

    console.log('\n--- Smallest Change Plan ---');
    for (const step of planRes.data.plan.smallestChangePlan || []) {
      console.log(`  1. ${step}`);
    }

    console.log('\n--- Manual Verification Plan ---');
    for (const v of planRes.data.plan.manualVerificationPlan || []) {
      console.log(`  ✓ ${v}`);
    }

    console.log('\n--- Source Citations ---');
    for (const c of planRes.data.plan.sourceCitations || []) {
      console.log(`  [Citation] "${c.claim}" -> ${c.sourceUrl}`);
    }
  }

  // 5. Test GET retrieval endpoint
  console.log(`\n[7] Calling GET /api/sessions/${sessionId}/issues/${targetIssue.number}/work-plan ...`);
  const getRes = await request({
    hostname: 'localhost',
    port: 8080,
    path: `/api/sessions/${sessionId}/issues/${targetIssue.number}/work-plan`,
    method: 'GET',
  });
  console.log(`[8] GET Work Plan Response: HTTP ${getRes.status} (Status: ${getRes.data.status})`);
  console.log('\n=== E2E Test Completed Successfully ===');
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
