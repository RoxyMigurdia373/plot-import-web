"""打包脚本：构建前端 → PyInstaller 单文件 EXE → 自检。

用法（在仓库根目录）：
    .\\.venv\\Scripts\\python.exe desktop\\build_exe.py            # 复用已有 dist
    .\\.venv\\Scripts\\python.exe desktop\\build_exe.py --web      # 先重新构建前端
    .\\.venv\\Scripts\\python.exe desktop\\build_exe.py --selftest # 只对已有 EXE 自检
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP_ROOT = ROOT.parent
WEB_DIST = APP_ROOT / "dist"
BUILD_DIR = APP_ROOT / "build"
RELEASE_DIR = APP_ROOT / "release"
SPEC = ROOT / "plot_import.spec"

sys.path.insert(0, str(APP_ROOT))

for _stream in (sys.stdout, sys.stderr):
    try:  # 控制台可能是 GBK，日志里有中文与替换字符时不能因此崩掉
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from desktop.app import APP_NAME, APP_VERSION  # noqa: E402


def npm_command() -> str:
    found = shutil.which("npm")
    if found:
        return found
    fallback = Path(r"C:\Program Files\nodejs\npm.cmd")
    if fallback.is_file():
        return str(fallback)
    raise SystemExit("找不到 npm，请先安装 Node.js 22.12+")


def run(command: list[str], cwd: Path = APP_ROOT) -> None:
    print("+", " ".join(command), flush=True)
    result = subprocess.run(command, cwd=str(cwd), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        print(result.stdout[-4000:])
        print(result.stderr[-4000:])
        raise SystemExit(f"命令失败（{result.returncode}）：{' '.join(command)}")
    return result


def package_version() -> str:
    data = json.loads((APP_ROOT / "package.json").read_text(encoding="utf-8"))
    return str(data["version"])


def build_web() -> None:
    print("== 构建前端 ==", flush=True)
    run([npm_command(), "run", "build"])
    index = WEB_DIST / "index.html"
    if not index.is_file():
        raise SystemExit(f"前端构建失败，缺少 {index}")
    assets = len(list((WEB_DIST / "assets").glob("*.js")))
    print(f"   dist: {index} + {assets} 个 js", flush=True)


def exe_path() -> Path:
    return RELEASE_DIR / f"{APP_NAME}_v{APP_VERSION}.exe"


def build_exe() -> Path:
    version = package_version()
    if version != APP_VERSION:
        raise SystemExit(f"版本不一致：package.json={version}，desktop/app.py={APP_VERSION}")
    print(f"== 打包 EXE v{APP_VERSION} ==", flush=True)
    RELEASE_DIR.mkdir(parents=True, exist_ok=True)
    started = time.time()
    run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--distpath",
            str(RELEASE_DIR),
            "--workpath",
            str(BUILD_DIR / "pyinstaller"),
            str(SPEC),
        ]
    )
    built = RELEASE_DIR / "PlotImportDesktop.exe"
    if not built.is_file():
        raise SystemExit(f"打包失败，缺少 {built}")
    target = exe_path()
    if target.exists():
        target.unlink()
    built.replace(target)
    size = target.stat().st_size / 1024 / 1024
    print(f"   产物：{target}（{size:.1f} MB，用时 {time.time() - started:.0f} 秒）", flush=True)
    return target


def selftest(exe: Path) -> int:
    print(f"== 自检 {exe.name} ==", flush=True)
    report = RELEASE_DIR / "selftest.json"
    if report.exists():
        report.unlink()
    result = subprocess.run(
        [str(exe), "--selftest", str(report)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
    )
    if not report.is_file():
        print(result.stdout[-3000:])
        print(result.stderr[-3000:])
        raise SystemExit("自检没有产出报告文件")
    data = json.loads(report.read_text(encoding="utf-8"))
    for item in data["checks"]:
        mark = "OK  " if item["ok"] else "FAIL"
        print(f"  [{mark}] {item['name']}: {item['detail']}", flush=True)
    print(f"  ok={data['ok']}  （exe 返回码 {result.returncode}）", flush=True)
    return 0 if data["ok"] else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=f"{APP_NAME} 打包工具")
    parser.add_argument("--web", action="store_true", help="先重新构建前端")
    parser.add_argument("--selftest", action="store_true", help="只对已有 EXE 运行自检")
    args = parser.parse_args(argv)

    if args.selftest:
        target = exe_path()
        if not target.is_file():
            raise SystemExit(f"还没有 EXE：{target}")
        return selftest(target)

    if args.web or not (WEB_DIST / "index.html").is_file():
        build_web()
    target = build_exe()
    return selftest(target)


if __name__ == "__main__":
    raise SystemExit(main())
