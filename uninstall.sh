#!/usr/bin/env bash

# ============================================================
# aitools-cli 卸载脚本
# 功能：移除全局命令 → 清理构建产物与依赖 → (可选) 清理配置与源目录
# ============================================================

set -u

# ---------------------- 颜色定义 ----------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

# ---------------------- 日志工具 ----------------------
info()    { echo -e "${BLUE}ℹ${RESET}  $1"; }
success() { echo -e "${GREEN}✅${RESET} $1"; }
warn()    { echo -e "${YELLOW}⚠️${RESET}  $1"; }
error()   { echo -e "${RED}❌${RESET} $1"; }
step()    { echo -e "\n${BOLD}[$1/$TOTAL_STEPS] $2${RESET}"; }

# ---------------------- 切换到脚本所在目录 ----------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

TOTAL_STEPS=4

echo -e "\n${BOLD}🗑️  aitools-cli 卸载${RESET}"
echo -e "   项目目录: ${SCRIPT_DIR}\n"

# ---------------------- 通用工具函数 ----------------------

# 交互式 y/N 询问（默认 N）
# 用法: confirm_yn "提示信息" && echo "用户选择了 yes"
confirm_yn() {
    local prompt="$1"
    local reply=""
    # shellcheck disable=SC2162
    read -p "$(echo -e "${YELLOW}?${RESET} ${prompt} [y/N]: ")" reply
    case "$reply" in
        [yY] | [yY][eE][sS]) return 0 ;;
        *) return 1 ;;
    esac
}

# 安全删除目录：前置校验路径非空、不是根目录、不是 $HOME 本身
safe_rm_dir() {
    local target="$1"
    local label="${2:-目录}"

    if [ -z "$target" ]; then
        warn "跳过 ${label}: 路径为空"
        return 1
    fi
    if [ "$target" = "/" ] || [ "$target" = "$HOME" ]; then
        error "拒绝删除 ${label}: ${target}（路径过于危险）"
        return 1
    fi
    if [ ! -e "$target" ]; then
        info "${label} 不存在，跳过: ${target}"
        return 0
    fi

    rm -rf "$target" 2>/dev/null && success "已删除 ${label}: ${target}" || {
        warn "${label} 删除失败: ${target}"
        return 1
    }
}

# 探测包管理器（优先 pnpm，其次 npm）
detect_pm() {
    if command -v pnpm &> /dev/null; then
        echo "pnpm"
    elif command -v npm &> /dev/null; then
        echo "npm"
    else
        echo ""
    fi
}

# ---------------------- 步骤 1：解除全局命令链接 ----------------------
step 1 "解除全局命令 aitools"

PM="$(detect_pm)"
if [ -z "$PM" ]; then
    warn "未检测到 pnpm/npm，跳过 unlink（全局命令可能不存在）"
else
    info "使用 ${PM} 进行解除链接"
    # 先尝试在项目目录执行 unlink（pnpm 要求在包目录内）
    if [ "$PM" = "pnpm" ]; then
        pnpm unlink --global 2>/dev/null \
            || pnpm unlink 2>/dev/null \
            || npm unlink -g aitools-cli 2>/dev/null \
            || warn "pnpm/npm unlink 未成功，可能命令已不存在"
    else
        npm unlink -g aitools-cli 2>/dev/null \
            || warn "npm unlink -g 未成功，可能命令已不存在"
    fi

    # 验证是否已解除
    if command -v aitools &> /dev/null; then
        warn "全局命令 aitools 仍可用：$(which aitools)"
        info "如需彻底移除，请手动检查 PATH 和包管理器全局目录"
    else
        success "全局命令 aitools 已移除"
    fi
fi

# ---------------------- 步骤 2：清理构建产物与依赖 ----------------------
step 2 "清理构建产物与依赖"

safe_rm_dir "$SCRIPT_DIR/dist" "dist 目录"
safe_rm_dir "$SCRIPT_DIR/node_modules" "node_modules 目录"

# ---------------------- 步骤 3：询问是否清理 ~/.aitools ----------------------
step 3 "清理用户配置目录"

AITOOLS_HOME="$HOME/.aitools"
if [ -d "$AITOOLS_HOME" ]; then
    info "检测到用户配置目录: ${AITOOLS_HOME}"
    info "（包含 config.yaml 以及默认源目录下的资源子目录）"
    if confirm_yn "是否删除 ${AITOOLS_HOME} 及其中所有内容？"; then
        safe_rm_dir "$AITOOLS_HOME" "用户配置目录"
    else
        info "已跳过清理用户配置目录"
    fi
else
    info "未检测到 ${AITOOLS_HOME}，跳过"
fi

# ---------------------- 步骤 4：询问是否清理自定义源目录 ----------------------
step 4 "清理自定义源资源目录"

# 从 config.yaml 中读取 source 字段（已在步骤3可能被删除，因此再次检查）
CUSTOM_SOURCE=""
CONFIG_FILE="$HOME/.aitools/config.yaml"
if [ -f "$CONFIG_FILE" ]; then
    # 提取形如：source: <value> 的值
    CUSTOM_SOURCE=$(grep -E '^source:' "$CONFIG_FILE" 2>/dev/null | head -n 1 | sed -E 's/^source:[[:space:]]*//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/' | xargs)
fi

# 展开 ~ 为 $HOME
if [ -n "$CUSTOM_SOURCE" ]; then
    case "$CUSTOM_SOURCE" in
        "~")           CUSTOM_SOURCE="$HOME" ;;
        "~/"*)         CUSTOM_SOURCE="$HOME/${CUSTOM_SOURCE#~/}" ;;
    esac
fi

# 仅当配置中的 source 指向非默认路径（即不是 ~/.aitools）时才询问
if [ -n "$CUSTOM_SOURCE" ] && [ "$CUSTOM_SOURCE" != "$AITOOLS_HOME" ] && [ -d "$CUSTOM_SOURCE" ]; then
    info "检测到自定义源目录: ${CUSTOM_SOURCE}"
    warn "⚠️ 源目录可能包含你的 skills、commands 等资源，删除后不可恢复！"
    if confirm_yn "是否删除自定义源目录 ${CUSTOM_SOURCE}？"; then
        safe_rm_dir "$CUSTOM_SOURCE" "自定义源目录"
    else
        info "已跳过清理自定义源目录"
    fi
else
    info "未检测到自定义源目录，跳过"
fi

# ---------------------- 完成 ----------------------
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  ✅ 卸载流程已完成${RESET}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════${RESET}"
echo ""
info "如果仍能执行 aitools 命令，请重启终端或检查 PATH 配置"
info "重新安装可执行: ./setup.sh"
echo ""
