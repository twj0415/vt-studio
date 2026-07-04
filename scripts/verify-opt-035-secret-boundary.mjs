import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const workspaceRoot = process.cwd();

function read(relativePath) {
  return readFileSync(join(workspaceRoot, relativePath), 'utf-8');
}

function assertIncludes(relativePath, expected) {
  const content = read(relativePath);
  if (!content.includes(expected)) {
    throw new Error(`${relativePath} 缺少关键内容：${expected}`);
  }
}

function assertNotIncludes(relativePath, unexpected) {
  const content = read(relativePath);
  if (content.includes(unexpected)) {
    throw new Error(`${relativePath} 不应包含：${unexpected}`);
  }
}

async function importSharedSecurity() {
  const tempDir = mkdtempSync(join(tmpdir(), 'vt-secret-boundary-'));
  const outputPath = join(tempDir, 'secrets.mjs');
  await build({
    entryPoints: [join(workspaceRoot, 'src/shared/security/secrets.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: outputPath,
    logLevel: 'silent',
  });

  try {
    return await import(pathToFileURL(outputPath).href);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function verifySanitizer() {
  const { sanitizeSensitiveText, redactSensitiveValue, isSensitiveKey } = await importSharedSecurity();
  const secret = 'sk-test-secret-1234567890';
  const token = 'token-secret-1234567890';
  const bearer = 'bearer-secret-1234567890';
  const input = `apiKey=${secret} token=${token} Authorization: Bearer ${bearer} https://example.test/api?token=${token}&ok=1 C:\\Users\\Twj\\secret.txt`;
  const sanitized = sanitizeSensitiveText(input);

  for (const value of [secret, token, bearer, 'Twj']) {
    if (sanitized.includes(value)) {
      throw new Error(`脱敏文本仍包含敏感内容：${value}`);
    }
  }

  const redacted = JSON.stringify(
    redactSensitiveValue({
      apiKey: secret,
      nested: {
        message: `failed with Bearer ${bearer}`,
      },
    }),
  );

  for (const value of [secret, bearer]) {
    if (redacted.includes(value)) {
      throw new Error(`递归脱敏仍包含敏感内容：${value}`);
    }
  }

  if (!isSensitiveKey('apiKey') || !isSensitiveKey('authorization') || !isSensitiveKey('refresh_token')) {
    throw new Error('敏感 key 判断不完整');
  }
}

function verifyModelConnectionBoundary() {
  assertIncludes('src/shared/types/model-config.ts', 'apiKeyConfigured?: boolean');
  assertIncludes('src/shared/types/model-config.ts', 'apiKeyMasked?: string');
  assertIncludes('src/main/services/settings/model-config.ts', 'function toPublicConnection');
  assertIncludes('src/main/services/settings/model-config.ts', "apiKey: ''");
  assertIncludes('src/main/services/settings/model-config.ts', 'apiKeyConfigured: apiKeyState.configured');
  assertIncludes('src/main/services/settings/model-config.ts', "draft.apiKey.trim() || previous?.apiKey || ''");
  assertIncludes('src/renderer/src/features/settings/components/ModelServiceConfig.vue', 'serviceForm.apiKey = \'\';');
  assertIncludes('src/renderer/src/features/settings/components/ModelServiceConfig.vue', 'apiKeyConfigured');
  assertIncludes('src/renderer/src/features/settings/components/ModelServiceConfig.vue', 'settings.modelService.form.apiKeySavedHint');
  assertIncludes('src/renderer/src/i18n/messages.ts', '留空表示不修改');
}

function verifyVendorBoundary() {
  assertIncludes('src/shared/types/vendor.ts', 'inputConfigured?: Record<string, boolean>');
  assertIncludes('src/shared/types/vendor.ts', 'inputMasked?: Record<string, string>');
  assertIncludes('src/main/services/settings/vendor.ts', 'isSensitiveInput(input)');
  assertIncludes('src/main/services/settings/vendor.ts', 'publicInputValues[input.key] = \'\';');
  assertIncludes('src/main/services/settings/vendor.ts', "value.trim() === '' && hasConfiguredSecret");
  assertIncludes('src/renderer/src/features/settings/components/VendorConfig.vue', 'isMissingRequiredInput');
  assertIncludes('src/renderer/src/features/settings/components/VendorConfig.vue', 'inputConfigured');
  assertIncludes('src/renderer/src/features/settings/components/VendorConfig.vue', 'settings.vendorConfig.secretSavedHint');
}

function verifyDiagnosticsAndLogs() {
  assertIncludes('src/main/services/logger.ts', 'redactSensitiveValue');
  assertIncludes('src/main/services/model/request-diagnostics.ts', 'sanitizeSensitiveText');
  assertIncludes('src/main/services/task/service.ts', 'sanitizeSensitiveText');
  assertNotIncludes('src/main/services/logger.ts', "const SENSITIVE_KEYS =");
}

function verifyBackupAndExportBoundary() {
  assertIncludes('src/shared/types/database-management.ts', 'containsSecrets: boolean');
  assertIncludes('src/main/services/settings/database-management.ts', 'containsSecrets: true');
  assertIncludes('src/renderer/src/features/settings/components/DatabaseManagement.vue', 'settings.databaseManagement.message.backupContainsSecrets');
  assertIncludes('src/renderer/src/features/settings/components/DatabaseManagement.vue', 'settings.databaseManagement.backup.containsSecrets');

  const exportSource = read('src/main/services/export/index.ts');
  for (const forbidden of ['modelConnections.v1', 'model_vendors', 'app_settings']) {
    if (exportSource.includes(forbidden)) {
      throw new Error(`P10 导出不应写入全局密钥配置：${forbidden}`);
    }
  }
}

async function main() {
  await verifySanitizer();
  verifyModelConnectionBoundary();
  verifyVendorBoundary();
  verifyDiagnosticsAndLogs();
  verifyBackupAndExportBoundary();
  console.log('Secret boundary verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
