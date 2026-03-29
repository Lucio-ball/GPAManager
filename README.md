# GPAManager

离线 GPA 管理系统，当前仓库包含 Python 核心业务层和 `apps/desktop` 下的 Tauri + React 桌面前端。

## Desktop Dev 最小环境

在 macOS 本机跑通 `tauri dev`，至少需要：

1. `node` 与 `npm`
2. `rustc` 与 `cargo`
3. `python3`
4. 首次编译 Tauri 所需的系统构建工具

可用下面这组命令快速自检：

```bash
node -v
npm -v
rustc --version
cargo --version
python3 --version
cd apps/desktop
npx tauri --version
```

如果 `npx tauri --version` 提示 `@tauri-apps/cli` 原生依赖缺失，可以在 `apps/desktop` 下执行：

```bash
npm install
```

如果当前机器没有 `python` 命令而只有 `python3`，现在桌面端会自动优先解析 `python3`。如需强制指定，也可以显式设置：

```bash
export GPA_MANAGER_PYTHON=python3
```

如需指定数据库位置：

```bash
export GPA_MANAGER_DB_PATH=/absolute/path/to/gpa_manager.sqlite3
```

## 启动桌面端

```bash
cd apps/desktop
npm install
npm run tauri:dev
```

说明：

- React dev server 默认运行在 `http://127.0.0.1:1420`
- Tauri 会通过 `desktop_bridge` command 调用根目录 `tools/desktop_backend_bridge.py`
- Python bridge 会复用 `src/gpa_manager` 下的现有 service / repository / SQLite 逻辑
- 开发环境下已忽略 `src-tauri/target` 的前端监听，避免 Rust 编译产物触发大量无效 HMR

## 最小联调验证步骤

建议按这条链路验证一次：

1. 打开桌面端首页，确认能正常显示 GPA 快照而不是 mock 数据报错。
2. 进入课程页，新建一门未修课程，例如 `桌面联调测试课 / 2026春 / 2.0 学分`。
3. 返回首页，确认课程数、未修学分或首页概览随之刷新。
4. 把该课程改成已修，再进入成绩页录入一个真实成绩。
5. 返回首页，确认当前 GPA、已计入学分、已计入课程数同步变化。
6. 进入规划页创建目标 GPA，并保存至少一个情景的预期成绩。
7. 返回首页，确认目标差距、剩余平均要求和三情景概览卡片刷新。

如果桌面端报错，请优先关注三类问题：

- Python 未找到：检查 `python3 --version` 与 `GPA_MANAGER_PYTHON`
- 数据库路径异常：检查 `GPA_MANAGER_DB_PATH`
- bridge 业务报错：前端会直接显示真实错误，不会在 Tauri 环境回退到 mock
