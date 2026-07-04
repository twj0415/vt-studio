import { spawn } from 'node:child_process';
import { basename, join } from 'node:path';

const workspaceRoot = process.cwd();

const groups = {
  core: [
    'verify-opt-027-response.mjs',
    'verify-opt-028-dictionaries.mjs',
    'verify-opt-013-status-layers.mjs',
    'verify-opt-038-business-locks.mjs',
    'verify-opt-031-model-capabilities.mjs',
    'verify-opt-006-model-gateway.mjs',
    'verify-opt-052-adapter-security.mjs',
    'verify-opt-032-model-runtime.mjs',
    'verify-opt-014-model-observability.mjs',
    'verify-opt-033-comfyui-workflow.mjs',
    'verify-core-014-default-assets.mjs',
    'verify-opt-030-seed-modules.mjs',
    'verify-core-011.mjs',
    'verify-core-012.mjs',
  ],
  settings: [
    'verify-f-002-001.mjs',
    'verify-f-002-002.mjs',
    'verify-f-002-003.mjs',
    'verify-f-002-004.mjs',
    'verify-f-002-005.mjs',
    'verify-f-002-006.mjs',
    'verify-f-002-007.mjs',
    'verify-f-002-008.mjs',
    'verify-f-002-010.mjs',
    'verify-f-002-011.mjs',
    'verify-opt-017-runtime-diagnostics.mjs',
    'verify-f-002-012.mjs',
    'verify-f-002-013.mjs',
    'verify-opt-015-local-request-diagnostics.mjs',
    'verify-opt-035-secret-boundary.mjs',
    'verify-opt-040-renderer-request.mjs',
    'verify-opt-041-renderer-error-boundary.mjs',
    'verify-opt-047-i18n-foundation.mjs',
    'verify-opt-047-model-service-i18n.mjs',
    'verify-opt-047-vendor-config-i18n.mjs',
    'verify-opt-047-skill-management-i18n.mjs',
    'verify-opt-047-agent-config-i18n.mjs',
    'verify-opt-047-memory-config-i18n.mjs',
    'verify-opt-047-prompt-config-i18n.mjs',
    'verify-opt-047-model-prompt-config-i18n.mjs',
    'verify-opt-047-business-config-i18n.mjs',
    'verify-opt-047-database-management-i18n.mjs',
    'verify-opt-047-developer-config-i18n.mjs',
    'verify-opt-047-shared-foundation-i18n.mjs',
    'verify-opt-047-renderer-i18n-sweep.mjs',
    'verify-opt-022-settings-experience.mjs',
    'verify-opt-036-020-021-media-export-foundation.mjs',
    'verify-f-002-014.mjs',
    'verify-f-002-015.mjs',
    'verify-f-002-017.mjs',
    'verify-opt-053-model-connection-projection.mjs',
  ],
  project: [
    'verify-p2-shell.mjs',
    'verify-p3-projects.mjs',
    'verify-opt-047-project-i18n.mjs',
    'verify-opt-048-layout-governance.mjs',
    'verify-opt-049-first-batch-ui.mjs',
    'verify-opt-049-second-batch-ui.mjs',
    'verify-opt-049-login-ui.mjs',
    'verify-opt-049-fourth-batch-ui.mjs',
    'verify-opt-049-dialog-upload-ui.mjs',
    'verify-opt-049-final-ui.mjs',
    'verify-opt-024-scroll-stability.mjs',
    'verify-opt-051-project-flow-overview.mjs',
    'verify-opt-051-next-step-hints.mjs',
    'verify-opt-051-flow-stats.mjs',
    'verify-opt-051-task-failure-link.mjs',
    'verify-opt-055-recent-project.mjs',
    'verify-opt-037-project-package.mjs',
  ],
  content: [
    'verify-p4-task-center.mjs',
    'verify-p5-source.mjs',
    'verify-opt-047-source-i18n.mjs',
    'verify-p6-script-agent-phase1.mjs',
    'verify-p6-script-agent-phase2.mjs',
    'verify-p6-script-agent-phase3.mjs',
    'verify-p6-script-agent-phase4.mjs',
    'verify-p7-scripts.mjs',
    'verify-opt-047-script-i18n.mjs',
    'verify-opt-049-second-batch-ui.mjs',
    'verify-opt-049-dialog-upload-ui.mjs',
    'verify-opt-049-final-ui.mjs',
    'verify-opt-054-upstream-invalidations.mjs',
  ],
  assets: ['verify-p8-assets-corner.mjs', 'verify-opt-008-asset-image-rules.mjs', 'verify-opt-047-business-pages-i18n.mjs', 'verify-opt-049-second-batch-ui.mjs', 'verify-opt-049-dialog-upload-ui.mjs', 'verify-opt-054-upstream-invalidations.mjs', 'verify-opt-036-020-021-media-export-foundation.mjs'],
  production: ['verify-p9-production.mjs', 'verify-p12-real-generation.mjs', 'verify-p13-model-adapters.mjs', 'verify-opt-004-model-prompt-mode.mjs', 'verify-opt-009-manual-generation-chain.mjs', 'verify-opt-034-generation-snapshot.mjs', 'verify-opt-047-business-pages-i18n.mjs', 'verify-opt-049-fourth-batch-ui.mjs', 'verify-opt-049-dialog-upload-ui.mjs', 'verify-opt-054-upstream-invalidations.mjs', 'verify-opt-036-020-021-media-export-foundation.mjs'],
  export: ['verify-p10-export.mjs', 'verify-opt-050-export-center.mjs', 'verify-opt-056-export-history.mjs', 'verify-opt-054-upstream-invalidations.mjs', 'verify-opt-036-020-021-media-export-foundation.mjs'],
  acceptance: ['verify-p11-real-acceptance.mjs'],
  docs: ['verify-doc-status.mjs', 'verify-opt-019-build-artifacts.mjs', 'verify-opt-042-style-boundary.mjs', 'verify-opt-049-page-ui-checklist.mjs', 'verify-opt-049-second-batch-ui.mjs', 'verify-opt-049-login-ui.mjs', 'verify-opt-049-fourth-batch-plan.mjs', 'verify-opt-049-fourth-batch-ui.mjs', 'verify-opt-049-dialog-upload-ui.mjs', 'verify-opt-049-final-ui.mjs', 'verify-opt-054-upstream-invalidations.mjs', 'verify-opt-036-020-021-media-export-foundation.mjs'],
};

groups.all = [
  ...groups.core,
  ...groups.settings,
  ...groups.project,
  ...groups.content,
  ...groups.assets,
  ...groups.production,
  ...groups.export,
  ...groups.acceptance,
  ...groups.docs,
];

function printUsage() {
  const names = Object.keys(groups).join(', ');
  console.log(`Usage: node scripts/verify.mjs <${names}>`);
}

function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const scriptPath = join(workspaceRoot, 'scripts', scriptName);
    const child = spawn(process.execPath, [scriptPath], {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${scriptName} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`));
    });
  });
}

async function main() {
  const groupName = process.argv[2];

  if (!groupName || groupName === '--help' || groupName === '-h') {
    printUsage();
    process.exit(groupName ? 0 : 1);
  }

  const scripts = groups[groupName];
  if (!scripts) {
    console.error(`Unknown verify group: ${groupName}`);
    printUsage();
    process.exit(1);
  }

  console.log(`\n[verify:${groupName}] ${scripts.length} script(s)\n`);

  for (const scriptName of scripts) {
    console.log(`[verify:${groupName}] start ${basename(scriptName)}`);
    await runScript(scriptName);
    console.log(`[verify:${groupName}] done  ${basename(scriptName)}\n`);
  }

  console.log(`[verify:${groupName}] passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
