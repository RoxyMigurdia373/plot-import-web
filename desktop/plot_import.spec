# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller 打包配置：单文件、无控制台窗口，前端 dist 直接塞进包里。"""

from pathlib import Path

ROOT = Path(SPECPATH).resolve()  # desktop/
APP_ROOT = ROOT.parent  # 仓库根
DIST = APP_ROOT / "dist"

if not (DIST / "index.html").is_file():
    raise SystemExit(f"缺少前端构建产物：{DIST}，先运行 npm run build")

datas = [(str(DIST), "dist")]
datas.append((str(ROOT / "README.md"), "desktop"))

hiddenimports = [
    "desktop.app",
    "desktop.server",
    "webview.platforms.winforms",
    "webview.platforms.edgechromium",
    "clr_loader",
]

a = Analysis(
    [str(ROOT / "entry.py")],
    pathex=[str(APP_ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "PIL", "matplotlib", "numpy", "pandas", "pytest", "setuptools"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="PlotImportDesktop",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    icon=str(ROOT / "app.ico"),
    version=str(ROOT / "version_info.txt"),
)
