# 本地 EXE 封装（desktop/）

把 `npm run build` 产出的 `dist/` 打进一个单文件 Windows 程序：双击就打开一个原生窗口，
页面、示例数据、Web Worker 全部在本地，不启动浏览器、不上传数据、不需要 Node.js。

## 构建

```powershell
# 首次：准备 Python 环境（只用于壳与打包，前端仍是 Node 构建）
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install pywebview pyinstaller pillow

# 构建前端 + 打包 + 自检（一条命令）
.\.venv\Scripts\python.exe desktop\build_exe.py --web

# 只重新打包（复用已有 dist）
.\.venv\Scripts\python.exe desktop\build_exe.py

# 只对已有 EXE 自检
.\.venv\Scripts\python.exe desktop\build_exe.py --selftest
```

产物：`release\矢量转换与导出_v0.1.0.exe`（单文件，约 20 MB），`build/`、`release/` 不入库。

## 文件

| 文件 | 作用 |
| --- | --- |
| `app.py` | 窗口与命令行入口：启动本地服务、开 WebView2 窗口、`--browser/--serve/--selftest` |
| `server.py` | 只用标准库的静态服务：MIME 表、禁止路径穿越、未知路径回落 `index.html`、关闭端口复用 |
| `test_desktop.py` | 静态服务与端口回退的单元测试（标准库 unittest） |
| `entry.py` | PyInstaller 入口（绝对导入，保证收集到 `desktop` 包） |
| `plot_import.spec` | 单文件、`console=False`、`dist/` 作为数据目录打进包 |
| `version_info.txt` | EXE 属性里的产品名与版本号 |
| `make_icon.py` | 生成 `app.ico`（`theme-color` 同款深绿 + 琥珀强调块） |
| `build_exe.py` | 构建前端 → PyInstaller → 改名 → 自检的驱动脚本 |

## 运行时行为

* 只监听 `127.0.0.1` 的随机端口，退出即关闭；不写注册表、不留后台服务。
* 窗口 1360×860 CSS 像素（窄屏自动收窄到屏幕内），关闭窗口进程即退出。
* **不要把进程设成 DPI 感知**：进程保持「非 DPI 感知」时，Windows 会把窗口尺寸按系统缩放
  虚拟化（150% 屏上 1360×860 → 2040×1290 物理像素、1346 CSS 像素视口），WebView2 再按
  `devicePixelRatio=1.5` 高清绘制。若在进程里调用 `SetProcessDpiAwareness`，窗口尺寸变成物理
  像素，而 WebView2 仍把它当 CSS 像素再乘 1.5 渲染，页面会被放大后裁切。
* 没有 WebView2 运行时的老系统会自动改用系统浏览器打开同一地址（`--browser` 可手动指定）。
* 日志：`%LOCALAPPDATA%\plot-import-desktop\launcher.log`；设 `PLOT_IMPORT_DEBUG=1` 时额外记录页面视口信息。

## 测试

```powershell
# 前端逻辑（53 项）
npm test

# 桌面壳（静态服务、路径穿越、缓存头、端口回退等 10 项）
.\.venv\Scripts\python.exe -m unittest discover -s desktop -p "test_*.py"

# 打包后的前端三步流程 + 真实下载（Edge/CDP，需要 dist 已构建）
.\.venv\Scripts\python.exe desktop\e2e_ui.py
```

## 自检项

`--selftest` 会逐项验证：Python/pywebview 版本、`dist` 资源数量、静态服务返回、入口引用的
JS/CSS 全部可达、演示矢量可解析、拓扑 Worker 可下载、WebView2 运行时、窗口模块可用；
全部通过才返回 0，并写出 JSON 报告。

## 分发注意

* 未签名：首次运行 SmartScreen 可能提示，选择“更多信息 → 仍要运行”。
* 部分杀软会把 PyInstaller 单文件误判，必要时加白名单。
* 单文件启动时先解包到临时目录，冷启动 1–3 秒属正常。
