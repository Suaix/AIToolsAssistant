#!/usr/bin/env bash

# ============================================================
# aitools-cli 一键安装脚本
# 功能：安装依赖 → 编译构建 → 全局链接
# 执行完成后可在任何目录使用 aitools 命令
# ============================================================

set -e

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

# ---------------------- 总步骤数 ----------------------
TOTAL_STEPS=5

# ---------------------- 切换到脚本所在目录 ----------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "\n${BOLD}🚀 aitools-cli 一键安装${RESET}"
echo -e "   项目目录: ${SCRIPT_DIR}\n"

# ---------------------- 步骤 1：检查 Node.js 版本 ----------------------
step 1 "检查 Node.js 环境"

if ! command -v node &> /dev/null; then
    error "未检测到 Node.js，请先安装 Node.js >= 20.0.0"
    error "推荐使用 nvm 安装: https://github.com/nvm-sh/nvm"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 20 ]; then
    error "Node.js 版本过低: v${NODE_VERSION}，需要 >= 20.0.0"
    exit 1
fi

success "Node.js v${NODE_VERSION}"

# ---------------------- 步骤 2：检测包管理器 ----------------------
step 2 "检测包管理器"

# 优先使用 pnpm，其次 npm
if command -v pnpm &> /dev/null; then
    PM="pnpm"
    PM_VERSION=$(pnpm -v)
    success "使用 pnpm v${PM_VERSION}"
elif command -v npm &> /dev/null; then
    PM="npm"
    PM_VERSION=$(npm -v)
    warn "未检测到 pnpm，使用 npm v${PM_VERSION}（推荐安装 pnpm 以获得更好体验）"
else
    error "未检测到 pnpm 或 npm，请先安装包管理器"
    exit 1
fi

# ---------------------- 步骤 3：安装依赖 ----------------------
step 3 "安装项目依赖"

$PM install
success "依赖安装完成"

# ---------------------- 步骤 4：编译构建 ----------------------
step 4 "编译 TypeScript → dist/"

$PM run build
success "编译构建完成"

# ---------------------- 步骤 5：全局链接 ----------------------
step 5 "注册全局命令 aitools"

# 确保构建产物有执行权限
chmod +x dist/index.js

if [ "$PM" = "pnpm" ]; then
    pnpm link --global 2>/dev/null || {
        warn "pnpm link --global 失败，尝试使用 npm link..."
        npm link
    }
else
    npm link
fi

success "全局链接完成"

# ---------------------- 验证 ----------------------
echo ""
if command -v aitools &> /dev/null; then
    AITOOLS_PATH=$(which aitools)
    AITOOLS_VERSION=$(aitools --version 2>/dev/null || echo "unknown")
    echo -e "${BOLD}${GREEN}══════════════════════════════════════════${RESET}"
    echo -e "${BOLD}${GREEN}  ✅ 安装成功！${RESET}"
    echo -e "${BOLD}${GREEN}══════════════════════════════════════════${RESET}"
    echo ""
    info "命令路径: ${AITOOLS_PATH}"
    info "版本:     v${AITOOLS_VERSION}"
    echo ""
    info "现在可以在任何目录执行以下命令："
    echo ""
    echo -e "   ${BOLD}aitools init${RESET}            初始化配置（首次使用，自动创建源目录骨架）"
    echo -e "   ${BOLD}aitools sync [type]${RESET}     同步资源到 AI 工具（type: skills|commands|agents|rules|all）"
    echo -e "   ${BOLD}aitools list [type]${RESET}     查看资源列表及同步状态"
    echo -e "   ${BOLD}aitools --help${RESET}          查看帮助信息"
    echo ""
    info "如需卸载，请执行: ${BOLD}./uninstall.sh${RESET}"
    echo ""
else
    warn "全局命令验证失败，可能需要重启终端或检查 PATH 配置"
    info "手动验证: which aitools && aitools --version"
    info "如果使用 pnpm，请确保 pnpm 全局 bin 目录在 PATH 中："
    echo -e "   ${BOLD}export PATH=\"\$(pnpm -g bin):\$PATH\"${RESET}"
fi
