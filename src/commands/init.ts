/**
 * init 命令处理模块
 * 实现交互式全局初始化：
 *   - 指定源目录（可选，默认 ~/.aitools/）
 *   - 自动创建 <source>/<resource_type>/<scope>/ 骨架（8 个叶子目录）
 *   - 选择同步目标工具（非必填，默认仅 codebuddy）
 *   - 生成 ~/.aitools/config.yaml
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

  /* 步骤 2：生成资源骨架子目录（skills/commands/agents/rules × user/project） */
  const scaffold = await ensureResourceSkeleton(expandedSource);
  if (scaffold.created.length > 0) {
    logger.success(
      `已创建 ${scaffold.created.length} 个资源骨架目录（跳过已有 ${scaffold.skipped.length} 个）`,
    );
  } else {
    logger.info(`资源骨架目录已存在（共 ${scaffold.skipped.length} 个），未创建新目录`);
  }

  /* 步骤 3：选择同步目标工具（非必填，默认 codebuddy） */
  const defaultTargets = getDefaultTargets();
  const choices = defaultTargets.map((t) => ({
    name: t.name === 'codebuddy' ? 'CodeBuddy' : 'Claude Code',
    value: t.name,
    /* 默认勾选状态与 getDefaultTargets 返回的 enabled 保持一致 */
    checked: t.enabled,
  }));

  const selectedNames = await checkbox({
    message: '要同步到哪些 AI 工具？（空格切换，回车确认；可全不选，默认 codebuddy）',
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

  /* 步骤 4：生成配置文件 */
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

  /* 步骤 5：完成引导 —— 列出骨架结构与示例路径 */
  console.log('');
  logger.info('📁 源目录骨架结构:');
  console.log(`   ${displaySource}/`);
  console.log('   ├── skills/        (当前仅 skills 已实现同步)');
  console.log('   │   ├── user/      <- 存放用户级 skills (自动同步到所有已启用工具)');
  console.log('   │   └── project/   <- 存放项目级 skills (需通过 --skill 关联到项目)');
  console.log('   ├── commands/      (预留，暂未支持同步)');
  console.log('   │   ├── user/');
  console.log('   │   └── project/');
  console.log('   ├── agents/        (预留，暂未支持同步)');
  console.log('   │   ├── user/');
  console.log('   │   └── project/');
  console.log('   └── rules/         (预留，暂未支持同步)');
  console.log('       ├── user/');
  console.log('       └── project/');

  console.log('');
  logger.info('💡 接下来:');
  logger.info(
    `   1. 将用户级 skill 文件夹放入 ${displaySource}/skills/user/<name>/（包含 SKILL.md）`,
  );
  logger.info(
    `   2. 将项目级 skill 文件夹放入 ${displaySource}/skills/project/<name>/`,
  );
  logger.info('   3. 运行 aitools sync skills 开始同步（或 aitools sync 同步全部已实现类型）');
  logger.info('   4. 运行 aitools list skills 查看同步状态');
}
