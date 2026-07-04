import { logger } from '../logger';
import { syncDefaultAssets } from '../default-assets';
import { getDatabase } from './connection';
import { seedAgentConfigs } from './seed-agent-configs';
import { seedDefaultAssetRecords } from './seed-default-assets';
import { seedPrompts } from './seed-prompts';
import { seedSettings } from './seed-settings';
import { seedSkillAttributions, seedSkills } from './seed-skills';
import { seedUsers } from './seed-users';
import { seedVendors } from './seed-vendors';

export function runSeed(database = getDatabase()): void {
  const now = Date.now();

  syncDefaultAssets();

  const transaction = database.transaction(() => {
    seedUsers(database, now);
    seedSettings(database, now);
    seedVendors(database, now);
    seedAgentConfigs(database, now);
    seedPrompts(database, now);
    seedSkills(database, now);
    seedSkillAttributions(database);
    seedDefaultAssetRecords(database, now);
  });

  transaction();
  logger.info('默认数据', '已初始化');
}
