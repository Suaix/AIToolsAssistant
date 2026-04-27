/*
 * Tauri 应用主入口
 *
 * 架构：UI-over-CLI —— 桌面 App 不重复实现业务逻辑，
 * 而是通过 invoke_cli command 调用 aitools CLI，消费其 --json NDJSON 输出。
 *
 * 参见：CODEBUDDY.md「架构要点」与 src/utils/reporter.ts
 */

use std::process::Command;

/// 调用 aitools CLI 的返回结果（一次性回传，非流式）
///
/// MVP 阶段采用"阻塞式调用 + 一次性返回 stdout"的简化策略：
/// - list 命令耗时短（< 1s），不需要流式事件
/// - 阶段 4 实现 sync 同步时再切换到 `tauri::Emitter` 流式发送
#[derive(serde::Serialize)]
struct CliResult {
    /// 进程退出码（0 = 成功；非 0 通常代表 CLI 内部错误或未找到）
    exit_code: i32,
    /// 标准输出原文（NDJSON：每行一个 JsonEvent）
    stdout: String,
    /// 标准错误输出原文（human 模式下的日志；JSON 模式一般为空）
    stderr: String,
}

/// Tauri command：调用系统 PATH 中的 aitools CLI
///
/// 参数 `args` 是 CLI 参数数组，调用方负责拼接（如 `["--json", "list", "skills"]`）。
///
/// ### macOS PATH 坑位
/// GUI 应用的进程环境 PATH 不包含 nvm / pnpm 注入的用户 bin 目录，
/// 直接 `Command::new("aitools")` 会报 "No such file or directory"。
/// 解决：通过登录 shell（`sh -lc`）执行，让 shell rc 加载完整 PATH。
///
/// ### 错误处理策略
/// - 进程启动失败（未找到 shell / 权限问题）：返回 Err，前端展示"CLI 不可用"态
/// - 进程成功启动但 CLI 自身报错（exit != 0）：返回 Ok，exit_code 非零，
///   前端从 stderr 或 stdout 的 error 事件中提取原因
#[tauri::command]
fn invoke_cli(args: Vec<String>) -> Result<CliResult, String> {
    /* 为了防御性，args 里不允许包含 shell 特殊字符（防命令注入） */
    for arg in &args {
        if arg.contains('\'') || arg.contains('`') || arg.contains('$') {
            return Err(format!("参数包含非法字符: {}", arg));
        }
    }

    /* 拼接完整命令行：aitools <arg1> <arg2> ... */
    let joined_args = args.join(" ");
    let full_cmd = format!("aitools {}", joined_args);

    /* 用登录 shell 执行，确保 PATH 完整（nvm/pnpm/volta 等） */
    let output = Command::new("sh")
        .arg("-lc")
        .arg(&full_cmd)
        .output()
        .map_err(|e| format!("启动 shell 失败: {}", e))?;

    Ok(CliResult {
        exit_code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

/// 检查 aitools CLI 是否可用
///
/// 独立命令，用于桌面 App 启动时做"健康检查"，
/// 若返回 false，首页 Dashboard 展示"未检测到 aitools"空态。
#[tauri::command]
fn check_cli_available() -> bool {
    let output = Command::new("sh")
        .arg("-lc")
        .arg("command -v aitools")
        .output();

    match output {
        Ok(out) => out.status.success() && !out.stdout.is_empty(),
        Err(_) => false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        /* 注册可供前端 invoke 的命令集 */
        .invoke_handler(tauri::generate_handler![invoke_cli, check_cli_available])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
