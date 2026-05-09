/**
 * init 命令处理模块
 *
 * v0.4.0 交互流程：
 *   1. 指定源目录（可选，默认 ~/.aitools/）
 *   2. 自动创建扁平骨架 <source>/{skills,commands,agents,rules}/
 *   3. 选择同步目标工具（非必填，默认仅 codebuddy）
 *   4. 生成 ~/.aitools/config.yaml（含空的 user_subscriptions）
 *   5. 扫描源目录中已存在的资源，给出「首次订阅引导」（RFC §4.6 Q3）
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { input, checkbox, confirm } from '@inquirer/prompts';
import { logger } from '../utils/logger.js';
import { ensureResourceSkeleton } from '../utils/scaffold.js';
import {
  configExists,
  saveConfig,
  createConfig,
  getDefaultTargets,
  expandTilde,
  collapseTilde,
  getConfigPath,
  getDefaultSourceDir,
} from '../config/manager.js';
import { getToolDisplayName } from '../registry/tools.js';
import { getHandler } from '../core/resources/registry.js';
import type { Target } from '../types/index.js';

/**
 * 校验源目录路径输入
 * 允许为空（空字符串 → 使用默认路径），非空时必须是绝对路径或 ~ 开头
 * @param value 用户输入的路径字符串
 * @returns 校验通过返回 true，否则返回错误提示
 */
function validateSourcePath(value: string): string | boolean {
  const trimmed = value.trim();
  /* 允许留空，表示使用默认路径 */
  if (!trimmed) {
    return true;
  }
  if (!trimmed.startsWith('/') && !trimmed.startsWith('~')) {
    return '请输入绝对路径（以 / 或 ~ 开头），或留空使用默认路径';
  }
  return true;
}

/**
 * 初始化命令处理函数
 * 交互式引导用户完成全局初始化
 */
export async function initCommand(): Promise<void> {
  logger.info('🚀 欢迎使用 AITools CLI！\n');

  /* 检查是否已初始化 */
  if (await configExists()) {
    const overwrite = await confirm({
      message: '检测到已有配置文件，是否覆盖？',
      default: false,
    });

    if (!overwrite) {
      logger.info('已取消初始化');
      return;
    }
  }

  /* 步骤 1：指定源目录（可选） */
  const defaultSource = getDefaultSourceDir();
  const defaultSourceDisplay = collapseTilde(defaultSource);

  const sourceInput = await input({
    message: `请指定资源源目录路径（留空使用默认 ${defaultSourceDisplay}）:`,
    validate: validateSourcePath,
  });

  const trimmedInput = sourceInput.trim();
  const expandedSource = trimmedInput
    ? expandTilde(trimmedInput)
    : defaultSource;

  /* 检查/创建源目录自身 */
  try {
    const stat = await fs.stat(expandedSource);
    if (!stat.isDirectory()) {
      logger.error(`${trimmedInput || defaultSourceDisplay} 不是一个目录`);
      return;
    }
    logger.success(`源目录已存在: ${collapseTilde(expandedSource)}`);
  } catch {
    /* 目录不存在，自动创建 */
    await fs.mkdir(expandedSource, { recursive: true });
    logger.success(`源目录已创建: ${collapseTilde(expandedSource)}`);
  }

  /* 步骤 2：生成资源骨架子目录（v0.4 扁平：skills/commands/agents/rules） */
  const scaffold = await ensureResourceSkeleton(expandedSource);
  if (scaffold.created.length > 0) {
    logger.success(
      `已创建 ${scaffold.created.length} 个资源骨架目录（跳过已有 ${scaffold.skipped.length} 个）`,
    );
  } else {
    logger.info(
      `资源骨架目录已存在（共 ${scaffold.skipped.length} 个），未创建新目录`,
    );
  }

  /* 步骤 3：选择同步目标工具（FEAT-005：选项与默认值均来自 SSOT） */
  const defaultTargets = getDefaultTargets();
  const choices = defaultTargets.map((t) => ({
    /* 显示名通过 SSOT 适配层获取，删除硬编码三元 */
    name: getToolDisplayName(t.name),
    value: t.name,
    /* 默认勾选状态与 getDefaultTargets 返回的 enabled 保持一致 */
    checked: t.enabled,
  }));

  const selectedNames = await checkbox({
    message:
      '要同步到哪些 AI 工具？（空格切换，回车确认；可全不选，默认 codebuddy）',
    choices,
  });

  /* 根据选择设置 enabled 状态；未选任何工具时保留默认（codebuddy） */
  const targets: Target[] = defaultTargets.map((t) => ({
    ...t,
    enabled:
      selectedNames.length === 0
        ? t.name === 'codebuddy'
        : selectedNames.includes(t.name),
  }));

  /* 步骤 4：生成配置文件（v0.4 默认含空 user_subscriptions） */
  const displaySource = trimmedInput
    ? trimmedInput.startsWith('~')
      ? trimmedInput
      : collapseTilde(path.resolve(expandedSource))
    : defaultSourceDisplay;

  const config = createConfig(displaySource, targets);
  await saveConfig(config);

  /* 输出摘要 */
  console.log('');
  logger.success('初始化完成！');
  logger.info(`配置文件: ${collapseTilde(getConfigPath())}`);
  logger.info(`资源源目录: ${displaySource}`);
  const enabledNames = targets.filter((t) => t.enabled).map((t) => t.name);
  logger.info(`同步目标: ${enabledNames.join(', ') || '(无)'}`);

  /* 步骤 5：源目录结构说明 */
  console.log('');
  logger.info('📁 源目录骨架结构（v0.4 扁平化）:');
  console.log(`   ${displaySource}/`);
  console.log('   ├── skills/       (资源扁平存放，身份由订阅清单声明)');
  console.log('   ├── commands/     (预留，暂未支持同步)');
  console.log('   ├── agents/       (预留，暂未支持同步)');
  console.log('   └── rules/        (预留，暂未支持同步)');

  /* 步骤 6：首次订阅引导（v0.4 RFC §4.6 Q3） */
  await guideFirstSubscription(expandedSource);

  console.log('');
  logger.info('💡 常用命令:');
  logger.info(
    `   1. 把 skill 文件夹放入 ${displaySource}/skills/<name>/（需包含 SKILL.md）`,
  );
  logger.info(
    '   2. aitools subscribe skills <name>           —— 订阅到用户级',
  );
  logger.info(
    '   3. aitools subscribe skills <name> --scope project  —— 订阅到当前项目',
  );
  logger.info('   4. aitools sync                              —— 按订阅清单同步');
  logger.info('   5. aitools list                              —— 查看订阅与状态');
}

/**
 * 首次订阅引导
 *
 * v0.4.0 RFC §4.6 Q3 决策：
 * - init 不自动订阅任何资源（保持「克制先于全面」）
 * - 但若源目录已存在 skill，给出一次性友好提示，告知用户如何订阅
 *
 * @param sourceDir 已展开的源目录绝对路径
 */
async function guideFirstSubscription(sourceDir: string): Promise<void> {
  try {
    const handler = getHandler('skills');
    const resources = await handler.scan(sourceDir);
    if (resources.length === 0) {
      return;
    }

    console.log('');
    logger.info(
      `🔍 检测到源目录已有 ${resources.length} 个 skill（未订阅，不会被自动同步）：`,
    );
    for (const r of resources.slice(0, 5)) {
      console.log(`   · ${r.dirName}`);
    }
    if (resources.length > 5) {
      console.log(`   · ... 另有 ${resources.length - 5} 个`);
    }
    console.log('');
    logger.info('   如需同步，请使用 `aitools subscribe skills <name>` 显式订阅。');
  } catch {
    /* 引导失败不影响 init 主流程 */
  }
}
