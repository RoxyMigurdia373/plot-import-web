"""本地桌面窗口：把构建好的前端放进一个原生窗口里，双击即用，不需要浏览器。

入口行为：
* 不带参数：启动本地服务 + 打开桌面窗口（默认）。
* ``--browser``：改用系统默认浏览器打开（没有 WebView2 运行时的兜底）。
* ``--serve``：只启动本地服务并把地址打印到日志，供调试使用。
* ``--selftest [路径]``：检查打包资源、静态服务、示例数据与 WebView2 运行时，写 JSON 报告。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
import urllib.request
import webbrowser
from pathlib import Path

from .server import LocalServer

APP_NAME = "矢量转换与导出"
APP_VERSION = "0.1.0"  # 与 package.json 的 version 保持一致，打包脚本会校验
LOG_DIR = Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "plot-import-desktop"
LOG_FILE = LOG_DIR / "launcher.log"


def log(message: str) -> None:
    """窗口程序没有 stdout，日志同时写文件；失败也不影响主流程。"""
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%H:%M:%S")
        with LOG_FILE.open("a", encoding="utf-8") as stream:
            stream.write(f"{stamp}  {message}\n")
    except OSError:
        pass
    if sys.stdout is not None:
        try:
            print(message, flush=True)
        except (OSError, ValueError):
            pass


def resource_dir() -> Path:
    """打包后是 _MEIPASS/dist，源码运行时是仓库里的 dist。"""
    frozen_root = getattr(sys, "_MEIPASS", None)
    if frozen_root:
        return Path(frozen_root) / "dist"
    return Path(__file__).resolve().parent.parent / "dist"


def webview_version() -> str:
    try:
        from importlib.metadata import version

        return version("pywebview")
    except Exception:  # noqa: BLE001 - 版本号只用于自检展示
        return "unknown"


def webview2_runtime() -> str | None:
    """读取 WebView2 运行时的版本号；没有安装时返回 None。"""
    try:
        import winreg
    except ImportError:
        return None
    key = r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
        try:
            with winreg.OpenKey(hive, key) as handle:
                value, _ = winreg.QueryValueEx(handle, "pv")
        except OSError:
            continue
        if value:
            return str(value)
    return None


def _get(url: str, timeout: float = 5.0) -> tuple[int, bytes]:
    with urllib.request.urlopen(url, timeout=timeout) as response:  # noqa: S310 - 仅本机地址
        return int(response.status), response.read()


def screen_metrics() -> tuple[int, int]:
    """屏幕的逻辑像素尺寸。

    进程保持「非 DPI 感知」时 Windows 会把窗口尺寸按系统缩放虚拟化：在 150%
    的屏幕上把窗口设成 1360×860，实际得到 2040×1290 的物理窗口和 1346 CSS
    像素的视口，WebView2 再按 devicePixelRatio=1.5 高清绘制 —— 各尺寸都对得上。
    反过来如果在进程里调用 SetProcessDpiAwareness，窗口尺寸变成物理像素，
    WebView2 却仍把它当作 CSS 像素再乘 1.5 渲染，页面就会被放大后裁切。
    """
    if sys.platform != "win32":
        return 1440, 900
    try:
        import ctypes

        user32 = ctypes.windll.user32
        return int(user32.GetSystemMetrics(0)), int(user32.GetSystemMetrics(1))
    except Exception:  # noqa: BLE001
        return 1440, 900


def run_window(url: str) -> None:
    import webview

    screen_w, screen_h = screen_metrics()
    width = min(1360, max(900, screen_w - 80))
    height = min(860, max(600, screen_h - 120))
    override = os.environ.get("PLOT_IMPORT_WINDOW")
    if override and "x" in override:
        raw_w, raw_h = override.lower().split("x", 1)
        width, height = int(raw_w), int(raw_h)
    window = webview.create_window(
        f"{APP_NAME} v{APP_VERSION}",
        url=url,
        width=width,
        height=height,
        min_size=(min(960, width), min(600, height)),
        background_color="#183f35",
        text_select=True,
    )
    storage = Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "plot-import-desktop" / "webview"
    storage.mkdir(parents=True, exist_ok=True)
    log(f"打开桌面窗口：{url}（{width}×{height}，屏幕 {screen_w}×{screen_h}）")

    def after_load() -> None:
        """PLOT_IMPORT_DEBUG=1 时把页面的视口信息写进日志，方便核对缩放。"""
        if not os.environ.get("PLOT_IMPORT_DEBUG"):
            return
        try:
            probe = window.evaluate_js(
                "JSON.stringify({w:innerWidth,h:innerHeight,dpr:devicePixelRatio,"
                "sw:screen.width,sh:screen.height})"
            )
            log(f"viewport {probe}")
        except Exception as error:  # noqa: BLE001 - 只用于排查
            log(f"viewport probe failed: {error}")

    webview.start(
        after_load,
        private_mode=False,  # 保留界面状态，避免每次重开都像新会话
        storage_path=str(storage),
        debug=False,
    )
    del window


def run_browser(url: str) -> None:
    log(f"使用系统浏览器打开：{url}")
    webbrowser.open(url)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log("收到退出信号")


def selftest(report_path: str | None = None) -> int:
    """逐项检查打包结果，全部通过才返回 0。"""
    root = resource_dir()
    checks: list[dict[str, object]] = []

    def check(name: str, ok: bool, detail: object = "") -> None:
        checks.append({"name": name, "ok": bool(ok), "detail": str(detail)})
        log(f"[{'OK  ' if ok else 'FAIL'}] {name}: {detail}")

    check(
        "versions",
        True,
        f"python {sys.version.split()[0]}, app {APP_VERSION}, pywebview {webview_version()}, "
        f"frozen {getattr(sys, 'frozen', False)}",
    )

    index = root / "index.html"
    assets = sorted((root / "assets").glob("*.js")) if (root / "assets").is_dir() else []
    mocks = sorted((root / "mock").glob("*.json")) if (root / "mock").is_dir() else []
    check(
        "bundled frontend",
        index.is_file() and len(assets) >= 5 and len(mocks) >= 5,
        f"{index.is_file()} index, {len(assets)} js, {len(mocks)} mock json, root {root}",
    )

    server = LocalServer(root, port=0, log=log)
    url = server.start()
    try:
        status, body = _get(url)
        check(
            "static server",
            status == 200 and b'<div id="app">' in body,
            f"GET / -> {status}, {len(body)} bytes",
        )

        missing: list[str] = []
        html = index.read_text(encoding="utf-8")
        for marker in ('src="', 'href="'):
            for chunk in html.split(marker)[1:]:
                path = chunk.split('"', 1)[0]
                if not path.startswith("/"):
                    continue
                code, _ = _get(url + path.lstrip("/"))
                if code != 200:
                    missing.append(path)
        check("entry references", not missing, f"{missing or 'all cited assets reachable'}")

        code, payload = _get(url + "mock/flow-demo.geojson")
        demo = json.loads(payload) if code == 200 else {}
        check(
            "demo vector",
            code == 200 and demo.get("type") == "FeatureCollection" and demo.get("features"),
            f"HTTP {code}, {len(demo.get('features', []))} features, schema "
            f"{(demo.get('features') or [{}])[0].get('properties', {}).get('__schema__', 'n/a')}",
        )

        worker_name = next((path.name for path in (root / "assets").glob("topology*.js")), "")
        code, payload = _get(url + f"assets/{worker_name}") if worker_name else (0, b"")
        check(
            "topology worker",
            bool(worker_name) and code == 200,
            f"{worker_name or 'missing'} HTTP {code}, {len(payload)} bytes",
        )

        runtime = webview2_runtime()
        check(
            "webview2 runtime",
            bool(runtime),
            runtime or "未检测到 WebView2，EXE 会回退到系统浏览器",
        )
        check(
            "window module",
            webview_version() != "unknown",
            f"pywebview {webview_version()}",
        )
    finally:
        server.close()

    ok = all(item["ok"] for item in checks)
    report = {
        "ok": ok,
        "app": APP_NAME,
        "version": APP_VERSION,
        "executable": sys.executable,
        "frozen": bool(getattr(sys, "frozen", False)),
        "resource_dir": str(root),
        "checks": checks,
    }
    if report_path:
        Path(report_path).write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        log(f"自检报告：{report_path}")
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="plot-import-desktop", description=f"{APP_NAME} 本地版")
    parser.add_argument("--port", type=int, default=0, help="本地服务端口，默认自动选择")
    parser.add_argument("--browser", action="store_true", help="用系统浏览器打开，不使用桌面窗口")
    parser.add_argument("--serve", action="store_true", help="只启动本地服务，不打开窗口")
    parser.add_argument("--selftest", nargs="?", const="selftest.json", help="运行自检并写报告")
    args = parser.parse_args(argv)

    if args.selftest:
        return selftest(args.selftest)

    root = resource_dir()
    if not (root / "index.html").is_file():
        log(f"缺少前端构建产物：{root}")
        return 2

    server = LocalServer(root, port=args.port, log=log)
    try:
        url = server.start()
    except RuntimeError as error:
        log(str(error))
        return 3

    if args.serve:
        log(f"服务已就绪：{url}（Ctrl+C 退出）")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            server.close()
        return 0

    try:
        if args.browser or not webview2_runtime():
            run_browser(url)
        else:
            run_window(url)
        return 0
    except Exception as error:  # noqa: BLE001 - 窗口失败不应让用户什么也看不到
        log(f"桌面窗口启动失败：{error}\n{traceback.format_exc()}")
        run_browser(url)
        return 0
    finally:
        server.close()


if __name__ == "__main__":
    raise SystemExit(main())
