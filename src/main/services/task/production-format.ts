const PRODUCTION_TASK_CATEGORY_ALIASES: Record<string, string> = {
  剧本资产提取: '提取资源',
  生产分镜图片生成: '生成分镜图',
  生产衍生资产图片生成: '生成资源图',
  生产视频提示词生成: '生成视频提示词',
  生产视频生成: '生成视频',
  剪映草稿导出: '导出',
  生产Agent: '生产助手',
  '生产 Agent': '生产助手',
};

export function normalizeProductionTaskCategory(category: string): string {
  const normalized = category.trim();
  return PRODUCTION_TASK_CATEGORY_ALIASES[normalized] ?? normalized;
}

export function getProductionTaskCategoryFilterValues(category: string): string[] {
  const normalized = normalizeProductionTaskCategory(category);
  const values = new Set<string>([category.trim(), normalized]);

  Object.entries(PRODUCTION_TASK_CATEGORY_ALIASES).forEach(([legacyCategory, nextCategory]) => {
    if (nextCategory === normalized) {
      values.add(legacyCategory);
    }
  });

  return Array.from(values).filter(Boolean);
}
