#!/usr/bin/env node

/**
 * aitools CLI 入口文件
 * v0.2.0：支持多资源类型（skills/commands/agents/rules）
 * 命令双模式：子命令参数（aitools sync skills）与 --type 简写
 */
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { syncCommand } from './commands/sync.js';
import { listCommand } from './commands/list.js';

/** 实例化命令行程序对象 */
const program = new Command();

/** 配置基础应用信息 */
program
  .name('aitools')
  .description('AI Agent 统一配置与资源同步管理工具（skills/commands/agents/rules）')
  .version('0.2.0');

/** 注册 init 初始化命令 */
program
  .command('init')
  .description(
    '交互式全局初始化：指定/创建源目录、生成资源骨架、选择同步目标',
  )
  .action(initCommand);

/** 注册 sync 同步命令（支持位置参数 [type] 与 --type 简写） */
program
  .command('sync')
  .description(
    '将源目录资源同步到各 AI 工具（用户级/项目级）。type 可选值: skills | commands | agents | rules | all（默认）',
  )
  .argument('[type]', '资源类型: skills/commands/agents/rules/all（默认 all）')
  .option(
    '--type <type>',
    '资源类型简写（与位置参数等价）: skills/commands/agents/rules/all',
  )
  .option('-t, --target <name>', '指定单个同步目标工具（如 codebuddy、claude-code）')
  .option('-s, --skill <name>', '指定资源名称，添加到当前项目并同步（仅支持单一资源类型）')
  .option('--scope <scope>', '同步范围: user（仅用户级）| project（仅项目级）')
  .action(syncCommand);

/** 注册 list 列表命令（支持位置参数 [type] 与 --type 简写） */
program
  .command('list')
  .description(
    '列出所有资源及其同步状态。type 可选值: skills | commands | agents | rules | all（默认）',
  )
  .argument('[type]', '资源类型: skills/commands/agents/rules/all（默认 all）')
  .option(
    '--type <type>',
    '资源类型简写（与位置参数等价）: skills/commands/agents/rules/all',
  )
  .action(listCommand);

/** 执行命令行参数解析 */
program.parse();
