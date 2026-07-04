import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

function read(relativePath) {
  return readFileSync(join(workspaceRoot, relativePath), 'utf-8');
}

function assertIncludes(relativePath, needle) {
  const content = read(relativePath);
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} missing: ${needle}`);
  }
}

const checks = [
  ['src/shared/constants/dictionaries.ts', 'export const DEPENDENCY_STATUSES'],
  ['src/shared/constants/dictionaries.ts', "STALE: 'stale'"],
  ['src/shared/constants/dictionaries.ts', "NEEDS_REVIEW: 'needs_review'"],
  ['src/shared/constants/dictionaries.ts', "MISSING_DEPENDENCY: 'missing_dependency'"],
  ['src/shared/constants/dictionaries.ts', "BLOCKED: 'blocked'"],
  ['src/shared/constants/status-layers.ts', "DEPENDENCY_STATE: 'dependencyState'"],
  ['src/shared/constants/status-layers.ts', 'scripts/assets/production dependency_status fields'],
  ['src/shared/constants/status-layers.ts', "'production_videos.dependency_status': STATUS_LAYER_IDS.DEPENDENCY_STATE"],

  ['src/main/services/production/migrations.ts', '0017_add_dependency_status_fields'],
  ['src/main/services/production/migrations.ts', "ALTER TABLE scripts ADD COLUMN dependency_status TEXT NOT NULL DEFAULT 'valid'"],
  ['src/main/services/production/migrations.ts', 'ALTER TABLE assets ADD COLUMN dependency_reason TEXT'],
  ['src/main/services/production/migrations.ts', 'ALTER TABLE production_storyboards ADD COLUMN dependency_reason TEXT'],
  ['src/main/services/production/migrations.ts', 'ALTER TABLE production_video_tracks ADD COLUMN dependency_reason TEXT'],
  ['src/main/services/production/migrations.ts', 'ALTER TABLE production_videos ADD COLUMN dependency_reason TEXT'],

  ['src/main/services/dependency-state.ts', 'export const DEPENDENCY_REASON'],
  ['src/main/services/dependency-state.ts', 'export function assertDependencyStatus'],
  ['src/main/services/dependency-state.ts', 'export function markScriptsDependencyStatus'],
  ['src/main/services/dependency-state.ts', 'export function markProductionForScriptsChanged'],
  ['src/main/services/dependency-state.ts', 'export function markProductionForAssetsChanged'],
  ['src/main/services/dependency-state.ts', 'export function markVideosForStoryboardsChanged'],

  ['src/main/services/source/service.ts', 'markScriptsDependencyStatus'],
  ['src/main/services/source/service.ts', 'DEPENDENCY_REASON.SOURCE_CHANGED'],
  ['src/main/services/source/service.ts', 'DEPENDENCY_STATUSES.STALE'],
  ['src/main/services/script/service.ts', 'markScriptsDependencyStatus'],
  ['src/main/services/script/service.ts', 'markProductionForScriptsChanged'],
  ['src/main/services/script/service.ts', 'DEPENDENCY_REASON.SCRIPT_CHANGED'],
  ['src/main/services/script/service.ts', 'DEPENDENCY_REASON.SCRIPT_DELETED'],
  ['src/main/services/agent/script-workspace.ts', 'markProductionForScriptsChanged'],
  ['src/main/services/agent/script-workspace.ts', 'DEPENDENCY_REASON.SCRIPT_CHANGED'],
  ['src/main/services/assets/service.ts', 'markProductionForAssetsChanged'],
  ['src/main/services/assets/service.ts', 'DEPENDENCY_REASON.ASSET_CHANGED'],
  ['src/main/services/assets/service.ts', 'DEPENDENCY_REASON.ASSET_DELETED'],
  ['src/main/services/assets/service.ts', 'DEPENDENCY_REASON.ASSET_IMAGE_MISSING'],
  ['src/main/services/production/service.ts', 'markVideosForStoryboardsChanged'],
  ['src/main/services/production/service.ts', 'markTracksDependencyStatus'],
  ['src/main/services/production/service.ts', 'markVideosDependencyStatus'],
  ['src/main/services/production/service.ts', 'DEPENDENCY_REASON.STORYBOARD_CHANGED'],
  ['src/main/services/production/service.ts', 'DEPENDENCY_REASON.TRACK_CHANGED'],
  ['src/main/services/production/service.ts', 'DEPENDENCY_REASON.VIDEO_DELETED'],

  ['src/shared/types/script.ts', 'dependencyStatus: DependencyStatus;'],
  ['src/shared/types/assets.ts', 'dependencyStatus: AssetDependencyStatus;'],
  ['src/shared/types/production.ts', 'dependencyStatus: ProductionDependencyStatus;'],
  ['src/shared/types/export.ts', "'dependencyStale'"],
  ['src/shared/types/export.ts', 'dependencyStatus?: DependencyStatus | null;'],
  ['src/main/services/export/index.ts', 'function dependencyFailureReason'],
  ['src/main/services/export/index.ts', "return 'dependencyStale'"],
  ['src/main/services/export/index.ts', "return 'dependencyNeedsReview'"],
  ['src/main/services/export/index.ts', "return 'dependencyMissing'"],
  ['src/main/services/export/index.ts', "return 'dependencyBlocked'"],
  ['src/main/services/export/index.ts', 'trackDependencyStatus: normalizeDependencyStatus(track.dependency_status)'],
  ['src/main/services/export/index.ts', 'videoDependencyStatus: normalizeDependencyStatus(video.dependency_status)'],

  ['src/renderer/src/features/assets/AssetsHome.vue', 'assets.dependencyStatus.'],
  ['src/renderer/src/features/assets/AssetsHome.vue', 'assets.dependencyReasonTitle'],
  ['src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'dependencyStatusMessage'],
  ['src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'dependencyInvalid'],
  ['src/renderer/src/features/production/components/ProductionWorkbenchDialog.vue', 'production.dependencyStatus.'],
  ['src/renderer/src/features/export/ExportHome.vue', 'exportCenter.failureReason.${reason}'],
  ['src/renderer/src/i18n/messages.ts', "dependencyReasonTitle: '依赖状态原因'"],
  ['src/renderer/src/i18n/messages.ts', "dependencyReasonTitle: 'Dependency Status Reason'"],
  ['src/renderer/src/i18n/messages.ts', "missing_dependency: '缺依赖'"],
  ['src/renderer/src/i18n/messages.ts', "missing_dependency: 'Missing Dependency'"],
  ['src/renderer/src/i18n/messages.ts', "dependencyInvalid: '依赖状态异常。'"],
  ['src/renderer/src/i18n/messages.ts', "dependencyInvalid: 'Dependency status is invalid.'"],
  ['src/renderer/src/i18n/messages.ts', "dependencyStale: '依赖已过期'"],
  ['src/renderer/src/i18n/messages.ts', "dependencyStale: 'Dependency Stale'"],

  ['docs/tasks/OPT-054-上游变更与下游失效规则.md', '## 完成记录'],
  ['docs/tasks/OPT-054-上游变更与下游失效规则.md', '完成时间：2026-07-03'],
  ['docs/TODO-优化与缺口.md', '### 【√】OPT-054 上游变更与下游失效规则'],
];

for (const [relativePath, needle] of checks) {
  assertIncludes(relativePath, needle);
}

console.log('OPT-054 upstream invalidation verification passed');
