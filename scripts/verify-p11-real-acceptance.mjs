import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();

const checks = [
  ['docs/tasks/P11-真实数据验收批.md', '状态：已收口'],
  ['docs/tasks/P11-真实数据验收批.md', '禁止写入假数据'],
  ['docs/tasks/P11-真实数据验收批.md', 'P5 到 P10 主业务链路'],
  ['docs/tasks/P11-真实数据验收批.md', '真实图片/视频执行器未接通时'],
  ['docs/tasks/P11-真实数据验收批.md', 'scripts/inspect-p11-real-data.mjs'],
  ['docs/tasks/P11-真实数据验收批.md', 'P11 真实链路走查仍被真实数据和视频配置阻塞'],
  ['docs/tasks/P11-真实数据验收批.md', 'scripts/cleanup-p11-demo-residuals.mjs'],
  ['docs/tasks/P11-真实数据验收批.md', 'demoResiduals 已清零'],
  ['docs/tasks/P11-真实数据验收批.md', '已解除：开发库 vt_demo_media_connection 历史残留已备份并受控清理'],
  ['docs/tasks/P11-真实数据验收批.md', 'D:\\software\\nodejs\\pnpm.cmd run build'],
  ['docs/tasks/P9-生产工作台批次.md', '状态：已完成'],
  ['docs/tasks/P9-生产工作台批次.md', 'P10 后已清理 P9 临时演示数据注入'],
  ['docs/03-执行进度.md', 'P11 真实数据验收批已收口'],
  ['docs/03-执行进度.md', '不写假数据'],
  ['docs/04-对齐验收与偏差记录.md', 'P9 生产工作台批三条偏差记录'],
  ['docs/04-对齐验收与偏差记录.md', '真实图片/视频执行器'],
  ['docs/05-后续执行计划.md', '### P11 真实数据验收批'],
  ['docs/05-后续执行计划.md', '当前下一步是 P11 真实数据验收批'],
];

for (const [relativePath, needle] of checks) {
  const content = readFileSync(join(workspaceRoot, relativePath), 'utf-8');
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} 缺少 ${needle}`);
  }
}

console.log('P11 real acceptance verification passed');
