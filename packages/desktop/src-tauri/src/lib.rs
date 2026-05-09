/*
 * Tauri 应用主入口
 *
 * 架构：UI-over-CLI —— 桌面 App 不重复实现业务逻辑，
 * 而是通过 invoke_cli / invoke_cli_stream command 调用 aitools CLI，
 * 消费其 --json NDJSON 输出。
 *
 * 参见：CODEBUDDY.md「架构要点」与 src/utils/reporter.ts
 */

use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::thread;

use tauri::{AppHandle, Emitter};

/// 调用 aitools CLI 的返回结果（一次性回传，非流式）
///
/// 用于 list 等耗时短（< 1s）的只读命令；
/// 对 sync 等需要流式进度的命令，请使用 [`invoke_cli_stream`]。
#[derive(serde::Serialize)]
struct CliResult {
    /// 进程退出码（0 = 成功；非 0 通常代表 CLI 内部错误或未找到）
    exit_code: i32,
    /// 标准输出原文（NDJSON：每行一个 JsonEvent）
    stdout: String,
    /// 标准错误输出原文（human 模式下的日志；JSON 模式一般为空）
    stderr: String,
}

/// 参数白名单校验：阻止 shell 元字符进入命令行，防命令注入
///
/// 允许：字母、数字、常见路径/参数字符（`-`、`_`、`.`、`/`、`=`、`~`）
/// 禁止：单引号、反引号、`$`、`;`、`&`、`|`、`<`、`>`、空格（空格由 join 控制）
fn validate_args(args: &[String]) -> Result<(), String> {
    for arg in args {
        if arg.contains('\'')
            || arg.contains('`')
            || arg.contains('$')
            || arg.contains(';')
            || arg.contains('&')
            || arg.contains('|')
            || arg.contains('<')
            || arg.contains('>')
            || arg.contains('\n')
        {
            return Err(format!("参数包含非法字符: {}", arg));
        }
    }
    Ok(())
}

/// 中性兜底工作目录（FEAT-004 BUG-1）
///
/// 当 invoke_cli / invoke_cli_stream 未被显式传入 cwd 时，
/// 必须把子进程 cwd 切到一个**保证不含 .aitools/project.yaml** 的目录，
/// 否则 CLI 内 `process.cwd()` 会 fallback 到 Tauri 进程的 cwd
/// （开发态为 desktop/src-tauri/，生产态为 .app/Contents/MacOS/），
/// 一旦该路径恰好存在 `.aitools/project.yaml`（如本仓库 src-tauri 历史遗留），
/// CLI 会将其误读为"当前项目"，导致 GUI 显示错误的项目级订阅。
///
/// 选 $HOME：稳定存在、用户家目录通常不直接放 .aitools/project.yaml；
/// 取不到时退回 "/"（绝对中性）。
fn neutral_cwd() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
}

/// Tauri command：同步（阻塞）调用 aitools CLI
///
/// ### macOS PATH 坑位
/// GUI 应用的进程环境 PATH 不包含 nvm / pnpm 注入的用户 bin 目录，
/// 直接 `Command::new("aitools")` 会报 "No such file or directory"。
/// 解决：通过登录 shell（`sh -lc`）执行，让 shell rc 加载完整 PATH。
///
/// ### 错误处理策略
/// - 进程启动失败：返回 Err，前端展示"CLI 不可用"态
/// - 进程成功启动但 CLI 自身报错（exit != 0）：返回 Ok，exit_code 非零，
///   前端从 stderr 或 stdout 的 error 事件中提取原因
#[tauri::command]
fn invoke_cli(args: Vec<String>, cwd: Option<String>) -> Result<CliResult, String> {
    validate_args(&args)?;

    /* 拼接完整命令行：aitools <arg1> <arg2> ... */
    let joined_args = args.join(" ");
    let full_cmd = format!("aitools {}", joined_args);

    /* 用登录 shell 执行，确保 PATH 完整（nvm/pnpm/volta 等） */
    let mut cmd = Command::new("sh");
    cmd.arg("-lc").arg(&full_cmd);
    /* 工作目录策略（FEAT-004 BUG-1）：
     *   · 显式传 cwd：使用之，影响 CLI 的 process.cwd()
     *   · 未传 cwd：强制兜底到中性目录（$HOME），
     *     避免 fallback 到 Tauri 进程的 cwd（src-tauri/）误读它的 .aitools/project.yaml
     */
    let effective_cwd = cwd.clone().unwrap_or_else(neutral_cwd);
    cmd.current_dir(&effective_cwd);
    let output = cmd
        .output()
        .map_err(|e| format!("启动 shell 失败: {}", e))?;

    Ok(CliResult {
        exit_code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

/// Tauri command：检查 aitools CLI 是否可用
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

/// 流式事件：单行原始 stdout（NDJSON 的一行）
///
/// 前端监听 `cli-stream://{stream_id}` 频道接收。
/// 前端侧已有 NDJSON 解析器，所以这里只做"按行 emit"，不做 JSON 解析，
/// 避免 Rust 侧与 TS 侧类型重复维护。
#[derive(Clone, serde::Serialize)]
struct CliStreamLine {
    /// NDJSON 的一行原文（不含换行符）
    line: String,
}

/// 流式事件：CLI 执行结束
#[derive(Clone, serde::Serialize)]
struct CliStreamDone {
    /// 进程退出码
    exit_code: i32,
    /// 完整的 stderr（用于错误场景展示；GUI 优先用 stdout 的 error 事件）
    stderr: String,
}

/// Tauri command：流式调用 aitools CLI
///
/// 用法：
/// - 前端生成唯一 `stream_id`（如 `Date.now().toString()`）
/// - 调用前先 `listen('cli-stream://' + stream_id, handler)`
/// - 前端按行收到 `CliStreamLine`，再按行 `JSON.parse`
/// - 最终收到 `cli-stream-done://' + stream_id`（`CliStreamDone`）
///
/// 设计要点：
/// - 逐行读取 stdout，每读一行立即 emit，保证 GUI 能感知 progress 事件的实时节奏
/// - stderr 一次性收集在末尾 emit（reporter 在 JSON 模式下 stderr 只放 warn/error 文本，量小）
/// - 进程在后台线程执行，不阻塞 Tauri 主线程
///
/// ### 参数
/// - `args`：传给 aitools 的参数数组（不含 `--json`，该函数内部会自动加）
/// - `stream_id`：前端生成的本次调用唯一 ID，用于多次同步并发时区分频道
#[tauri::command]
fn invoke_cli_stream(
    app: AppHandle,
    args: Vec<String>,
    stream_id: String,
    cwd: Option<String>,
) -> Result<(), String> {
    validate_args(&args)?;

    /* stream_id 本身也要做白名单校验（它会出现在 event 名里） */
    if !stream_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("非法的 stream_id: {}", stream_id));
    }

    /* 统一补上 --json flag */
    let mut full_args = vec!["--json".to_string()];
    full_args.extend(args);
    let joined = full_args.join(" ");
    let full_cmd = format!("aitools {}", joined);

    /* 启动子进程：登录 shell 保证 PATH 完整 */
    let mut cmd = Command::new("sh");
    cmd.arg("-lc")
        .arg(&full_cmd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    /* FEAT-004 BUG-1：未传 cwd 时强制兜底到中性目录，避免误读 src-tauri/.aitools */
    let effective_cwd = cwd.clone().unwrap_or_else(neutral_cwd);
    cmd.current_dir(&effective_cwd);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动 shell 失败: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法获取子进程 stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法获取子进程 stderr".to_string())?;

    /* event 频道名：带上 stream_id，支持并发调用 */
    let line_event = format!("cli-stream://{}", stream_id);
    let done_event = format!("cli-stream-done://{}", stream_id);

    /* 后台线程：按行读取 stdout 并 emit */
    let app_for_stdout = app.clone();
    let line_event_for_stdout = line_event.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line_result in reader.lines() {
            match line_result {
                Ok(line) => {
                    if line.trim().is_empty() {
                        continue;
                    }
                    /* emit 失败不致命：可能窗口关闭了，直接停止循环 */
                    if app_for_stdout
                        .emit(&line_event_for_stdout, CliStreamLine { line })
                        .is_err()
                    {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    /* 后台线程：等待进程结束 + 收集 stderr + emit done */
    let app_for_done = app.clone();
    thread::spawn(move || {
        /* 先把 stderr 全部读出来（避免管道满导致子进程阻塞） */
        let mut stderr_buf = String::new();
        let mut stderr_reader = BufReader::new(stderr);
        let mut line = String::new();
        while let Ok(n) = stderr_reader.read_line(&mut line) {
            if n == 0 {
                break;
            }
            stderr_buf.push_str(&line);
            line.clear();
        }

        /* 再 wait 子进程 */
        let exit_code = match child.wait() {
            Ok(status) => status.code().unwrap_or(-1),
            Err(_) => -1,
        };

        /* emit done 事件；失败忽略 */
        let _ = app_for_done.emit(
            &done_event,
            CliStreamDone {
                exit_code,
                stderr: stderr_buf,
            },
        );
    });

    Ok(())
}

/// Tauri command：确保项目配置存在
///
/// 若 `<project_dir>/.aitools/project.yaml` 不存在，则创建最小配置。
/// 已存在则不做任何操作（幂等）。
/// GUI 在 scope=project 订阅前调用，避免 CLI JSON 模式跳过创建。
#[tauri::command]
fn ensure_project_config(project_dir: String) -> Result<(), String> {
    let aitools_dir = std::path::Path::new(&project_dir).join(".aitools");
    let config_path = aitools_dir.join("project.yaml");

    if config_path.exists() {
        return Ok(());
    }

    /* 创建 .aitools 目录 */
    std::fs::create_dir_all(&aitools_dir)
        .map_err(|e| format!("创建 .aitools 目录失败: {}", e))?;

    /* 写入最小 project.yaml */
    std::fs::write(&config_path, "skills: []\n")
        .map_err(|e| format!("写入 project.yaml 失败: {}", e))?;

    Ok(())
}

/// Tauri command：打开目录选择对话框
///
/// macOS 上通过 osascript 调用 Finder 的 choose folder 对话框，
/// 返回用户选中的目录绝对路径；用户取消时返回 null。
/// 不引入额外 Rust 依赖（tauri-plugin-dialog），保持最小化。
#[tauri::command]
fn open_directory_dialog() -> Result<Option<String>, String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg("POSIX path of (choose folder with prompt \"选择项目目录\")")
        .output()
        .map_err(|e| format!("启动 osascript 失败: {}", e))?;

    if !output.status.success() {
        /* 用户点了取消，osascript 退出码非零 */
        return Ok(None);
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    /* osascript 返回的路径末尾带 /，去掉 */
    let path = path.trim_end_matches('/').to_string();
    if path.is_empty() {
        return Ok(None);
    }
    Ok(Some(path))
}

/// Tauri command：探测项目根目录下哪些候选标记目录存在
///
/// 设计目标（FEAT-004）：
///   GUI 需要根据"项目根目录是否包含 .codebuddy / .claude-internal 等"
///   动态计算"项目关联工具集合"。本命令保持纯 fs 探测，
///   不引入工具名 ↔ 目录名映射，让映射只存在于 TS 一侧（lib/tools.ts），
///   未来增加新工具时 Rust 端无需修改。
///
/// 入参：
///   project_dir    项目绝对路径
///   candidate_dirs 候选目录名列表（已带 . 前缀，如 [".codebuddy", ".claude-internal"]）
///
/// 返回：
///   Ok(Vec<String>)  实际存在的目录名（保持入参顺序，自动去重）
///   Err(String)      project_dir 不存在或不是目录
#[tauri::command]
fn detect_project_tools(
    project_dir: String,
    candidate_dirs: Vec<String>,
) -> Result<Vec<String>, String> {
    let root = std::path::Path::new(&project_dir);
    if !root.is_dir() {
        return Err(format!("项目目录不存在或不是目录: {}", project_dir));
    }
    let mut found: Vec<String> = Vec::new();
    for name in candidate_dirs {
        let p = root.join(&name);
        if p.is_dir() && !found.contains(&name) {
            found.push(name);
        }
    }
    Ok(found)
}

/// 读取相对路径下的文本文件（可选）（FEAT-005）
///
/// 用途：GUI 启动时探测 ~/.aitools/.last-migration.json，
/// 该文件可能不存在（新装用户 / 已 ack 用户）。
///
/// 行为约定：
///   - 文件存在 → 返回内容字符串
///   - 文件不存在 → 返回 None（前端 .catch 兜底转 null）
///   - 其他 IO 错误 → Err，前端 .catch 也转 null
///
/// 安全约束：basePath 必须是绝对路径，relativePath 不允许 .. 跳出
#[tauri::command]
fn read_text_file_optional(base_path: String, relative_path: String) -> Result<Option<String>, String> {
    if relative_path.contains("..") {
        return Err("relative_path 不允许包含 ..".to_string());
    }
    let full = std::path::Path::new(&base_path).join(&relative_path);
    match std::fs::read_to_string(&full) {
        Ok(content) => Ok(Some(content)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("读取文件失败: {}", err)),
    }
}

/// 删除相对路径下的文件（可选）（FEAT-005）
///
/// 用途：GUI ack 配置升级弹窗后清理 ~/.aitools/.last-migration.json，
/// 避免下次启动重复弹窗。
///
/// 行为约定：
///   - 文件存在 → 删除并返回 ()
///   - 文件不存在 → 返回 ()（幂等，不报错）
///   - 删除失败 → Err
#[tauri::command]
fn delete_file_optional(base_path: String, relative_path: String) -> Result<(), String> {
    if relative_path.contains("..") {
        return Err("relative_path 不允许包含 ..".to_string());
    }
    let full = std::path::Path::new(&base_path).join(&relative_path);
    match std::fs::remove_file(&full) {
        Ok(_) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("删除文件失败: {}", err)),
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
        .invoke_handler(tauri::generate_handler![
            invoke_cli,
            check_cli_available,
            invoke_cli_stream,
            open_directory_dialog,
            ensure_project_config,
            detect_project_tools,
            read_text_file_optional,
            delete_file_optional
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
