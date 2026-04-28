/**
 * GUI 本地状态持久化
 *
 * RFC-002 §4.2：持久化到 `~/.aitools/gui-state.json`
 * 存储当前项目路径、最近项目列表、Onboarding 完成标志等
 *
 * 在 Tauri 环境中通过 invoke 读写文件系统；
 * 开发环境（纯浏览器）降级到 localStorage。
 */
import { invoke } from '@tauri-apps/api/core';

/* ============================================================
 * 类型定义
 * ============================================================ */

/**
 * GUI 本地状态结构
 */
export interface GuiState {
  /** 当前选中的项目目录路径 */
  currentProject: string | null;
  /** 最近打开的项目路径列表（最新在前，最多 10 项） */
  recentProjects: string[];
  /** Onboarding 向导是否已完成（完成后不再弹出） */
  onboardingDone: boolean;
}

/** 默认状态 */
const DEFAULT_STATE: GuiState = {
  currentProject: null,
  recentProjects: [],
  onboardingDone: false,
};

/** 最近项目列表最大长度 */
const MAX_RECENT = 10;

/** localStorage 降级键名 */
const LS_KEY = 'aitools-gui-state';

/* ============================================================
 * 读写实现
 * ============================================================ */

/**
 * 读取 GUI 本地状态
 * 优先从 Tauri invoke 读取文件，失败则降级 localStorage
 */
export async function loadGuiState(): Promise<GuiState> {
  try {
    const raw = await invoke<string>('read_gui_state');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GuiState>;
      return { ...DEFAULT_STATE, ...parsed };
    }
  } catch {
    /* Tauri 不可用或文件不存在，降级 */
  }

  /* localStorage 降级 */
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GuiState>;
      return { ...DEFAULT_STATE, ...parsed };
    }
  } catch {
    /* 忽略 */
  }

  return { ...DEFAULT_STATE };
}

/**
 * 保存 GUI 本地状态
 */
export async function saveGuiState(state: GuiState): Promise<void> {
  const json = JSON.stringify(state, null, 2);

  try {
    await invoke('write_gui_state', { content: json });
  } catch {
    /* Tauri 不可用，降级到 localStorage */
  }

  try {
    localStorage.setItem(LS_KEY, json);
  } catch {
    /* 忽略 */
  }
}

/* ============================================================
 * 辅助操作
 * ============================================================ */

/**
 * 将一个项目路径设为当前项目，并更新最近列表
 */
export function setCurrentProject(state: GuiState, projectDir: string): GuiState {
  /* 从最近列表中移除（如果已存在），然后插到最前 */
  const filtered = state.recentProjects.filter((p) => p !== projectDir);
  const recentProjects = [projectDir, ...filtered].slice(0, MAX_RECENT);

  return {
    ...state,
    currentProject: projectDir,
    recentProjects,
  };
}

/**
 * 标记 Onboarding 已完成
 */
export function markOnboardingDone(state: GuiState): GuiState {
  return { ...state, onboardingDone: true };
}

/**
 * 从绝对路径提取目录名
 */
export function getProjectDisplayName(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || path;
}
