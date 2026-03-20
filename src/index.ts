#!/usr/bin/env node

/**
 * aitools CLI 入口文件
 * 负责解析命令行参数并路由到对应的命令处理函数
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
  .description('AI Agent 统一配置与技能同步管理工具')
  .version('0.1.0');

/** 注册 init 初始化命令 */
program
  .command('init')
  .description('交互式全局初始化，指定 Skills 源目录和同步目标')
  .action(initCommand);

/** 注册 sync 同步命令 */
program
  .command('sync')
  .description('将源目录中的 Skills 同步到各 AI 工具目录（用户级/项目级）')
  .option('-t, --target <name>', '指定单个同步目标工具（如 codebuddy、claude-code）')
  .option('-s, --skill <name>', '指定 Skill 名称，添加到当前项目并同步')
  .option('--scope <scope>', '同步范围: user（仅用户级）| project（仅项目级）')
  .action(syncCommand);

/** 注册 list 列表命令 */
program
  .command('list')
  .description('列出所有 Skills 及其同步状态')
  .action(listCommand);

/** 执行命令行参数解析 */
program.parse();
