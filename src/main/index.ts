import { app, BrowserWindow } from 'electron';
import { configureGpu } from './app/gpu';
import { configureRuntime } from './app/runtime';
import { startLocalServer, stopLocalServer } from './app/server';
import { createMainWindow } from './app/window';
import { registerIpc } from './ipc';
import { closeDatabase, getDatabaseInfo, runMigrations } from './services/database';
import { syncDefaultAssets } from './services/default-assets';
import { getRuntimeDirectories, initializeFileSystem } from './services/file-system';
import { logger } from './services/logger';
import { recoverAssetTaskStatus } from './services/assets';
import { recoverRunningSourceEvents } from './services/source';
import { startSocketService, stopSocketService } from './services/socket';
import { recoverScriptExtractStatus } from './services/script';
import { recoverRunningTasks } from './services/task';
import { recoverProductionTaskStatus } from './services/production';

configureRuntime();
configureGpu();

app.whenReady().then(async () => {
  logger.section('VT Studio 启动');
  logger.info('启动', 'VT Studio 正在启动...');

  const directories = initializeFileSystem();
  logger.info('运行目录', `已就绪：${directories.userData}`);
  logger.detail('运行目录', '运行目录详情', getRuntimeDirectories());
  syncDefaultAssets();

  runMigrations();
  const recoveredTaskCount = recoverRunningTasks();
  const recoveredAssetTaskCount = recoverAssetTaskStatus().recovered;
  const recoveredSourceEventCount = recoverRunningSourceEvents();
  const recoveredScriptExtractCount = recoverScriptExtractStatus().recovered;
  const recoveredProductionTaskCount = recoverProductionTaskStatus().recovered;
  const databaseInfo = getDatabaseInfo();
  logger.info('数据库', `已连接：${databaseInfo.tableCount} 张表，${databaseInfo.migrationCount} 个迁移记录`);
  logger.detail('数据库', '数据库详情', databaseInfo);
  logger.info('任务中心', `已恢复 ${recoveredTaskCount} 个运行中任务`);
  logger.info('资产中心', `已恢复 ${recoveredAssetTaskCount} 个中断的资产任务`);
  logger.info('原文事件', `已恢复 ${recoveredSourceEventCount} 个运行中事件分析`);
  logger.info('剧本资产', `已恢复 ${recoveredScriptExtractCount} 个中断的资产提取`);
  logger.info('生产工作台', `已恢复 ${recoveredProductionTaskCount} 个中断的生产任务`);

  const localServerInfo = await startLocalServer();
  startSocketService(localServerInfo.server, localServerInfo.url);

  registerIpc();
  createMainWindow();
  logger.info('桌面窗口', '已打开');
  logger.info('启动', 'VT Studio 启动完成');
  logger.section('启动完成');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  void stopSocketService()
    .then(() => stopLocalServer())
    .catch((error) => logger.error('退出', '关闭本地服务失败', error))
    .finally(() => closeDatabase());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
