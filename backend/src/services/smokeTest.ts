import { config } from '../config.js';
import { createDefaultResearchAdapter } from './researchAdapter.js';

async function runSmokeTest() {
  console.log('=== Web-Slinger Bright Data Adapter Smoke Test ===');
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Demo Mode: ${config.demoMode}`);
  console.log(`Seed URLs configured: ${config.researchSeedUrls.length}`);
  console.log(`Collector ID configured: ${Boolean(config.brightDataJobCollectorId)}`);

  const adapter = createDefaultResearchAdapter();
  const testSessionId = 'smoke-test-session-' + Date.now();
  const testStack = ['TypeScript', 'React'];
  const testGoal = 'Manual smoke verification';

  console.log('\nExecuting research adapter...');
  const start = Date.now();
  const result = await adapter.executeResearch(testSessionId, testStack, testGoal);
  const durationMs = Date.now() - start;

  console.log(`\nExecution completed in ${durationMs}ms:`);
  console.log(`- Status: ${result.status}`);
  console.log(`- Message: ${result.message}`);
  console.log(`- Health State: ${result.health.status} (${result.health.message})`);
  console.log(`- Results Count: ${result.results.length}`);

  if (result.results.length > 0) {
    const sample = result.results[0];
    console.log('\nSample Result:');
    console.log(`  Company: ${sample.company_name}`);
    console.log(`  Role: ${sample.role_title}`);
    console.log(`  Location: ${sample.location ?? 'N/A'}`);
    console.log(`  Source URL: ${sample.source_url}`);
    console.log(`  Is Fixture: ${sample.is_fixture}`);
  }

  console.log('\n=== Smoke Test Passed ===');
}

runSmokeTest().catch((err) => {
  console.error('\nSmoke test encountered an error:', err.message);
  process.exit(1);
});
