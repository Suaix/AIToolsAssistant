/**
 * init 命令处理模块
 * 实现交互式全局初始化：指定源目录、选择目标工具、生成配置文件
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { input, checkbox, confirm } from '@inquirer/prompts';
import { logger } from '../utils/logger.js';
import {
  configExists,
  saveConfig,
  createConfig,
  getDefaultTargets,
  expandTilde,
  collapseTilde,
  getConfigPath,
} from '../config/manager.js';
import type { Target } from '../types/index.js';

/**
 * 验证路径输入是否有效
 * 不能为空，必须是绝对路径或以 ~ 开头
 * @param value 用户输入的路径字符串
 * @returns 校验通过返回 true，否则返回错误提示
 */
function validatePath(value: string): string | boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return '路径不能为空，请输入有效的目录路径';
  }
  if (!trimmed.startsWith('/') && !trimmed.startsWith('~')) {
    return '请输入绝对路径（以 / 或 ~ 开头）';
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

  /* 步骤 1：指定 Skills 源目录 */
  const sourcePath = await input({
    message: '请指定 Skills 源目录路径:',
    validate: validatePath,
  });

  const expandedSource = expandTilde(sourcePath.trim());

  /* 检查源目录是否存在，不存在则创建 */
  try {
    const stat = await fs.stat(expandedSource);
    if (!stat.isDirectory()) {
      logger.error(`${sourcePath} 不是一个目录`);
      return;
    }
    logger.success(`源目录已存在: ${collapseTilde(expandedSource)}`);
  } catch {
    /* 目录不存在，自动创建 */
    await fs.mkdir(expandedSource, { recursive: true });
    logger.success(`源目录已创建: ${collapseTilde(expandedSource)}`);
  }

  /* 步骤 2：选择同步目标工具 */
  const defaultTargets = getDefaultTargets();
  const choices = defaultTargets.map((t) => ({
    name: t.name === 'codebuddy' ? 'CodeBuddy' : 'Claude Code',
    value: t.name,
    checked: true,
  }));

  let selectedNames: string[] = [];
  /* 循环直到用户至少选择一个目标 */
  while (selectedNames.length === 0) {
    selectedNames = await checkbox({
      message: '要同步到哪些 AI 工具？（空格选择，回车确认）',
      choices,
    });

    if (selectedNames.length === 0) {
      logger.warn('至少需要选择一个目标工具，请重新选择');
    }
  }

  /* 根据选择设置 enabled 状态 */
  const targets: Target[] = defaultTargets.map((t) => ({
    ...t,
    enabled: selectedNames.includes(t.name),
  }));

  /* 步骤 3：生成配置文件 */
  const displaySource = sourcePath.trim().startsWith('~')
    ? sourcePath.trim()
    : collapseTilde(path.resolve(expandedSource));

  const config = createConfig(displaySource, targets);
  await saveConfig(config);

  /* 输出摘要 */
  console.log('');
  logger.success('初始化完成！');
  logger.info(`配置文件: ${collapseTilde(getConfigPath())}`);
  logger.info(`Skills 源目录: ${displaySource}`);
  logger.info(
    `同步目标: ${targets
      .filter((t) => t.enabled)
      .map((t) => t.name)
      .join(', ')}`,
  );

  console.log('');
  logger.info('💡 接下来:');
  logger.info(`   1. 将你的 Skill 文件夹放入 ${displaySource}/`);
  logger.info('   2. 运行 aitools sync 开始同步');
}
