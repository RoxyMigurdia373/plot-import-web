"""e2e：驱动打包好的 EXE（WebView2），验证“下载”会走桌面壳的另存为桥接。

做法：给 EXE 设置 `PLOT_IMPORT_SAVE_DIR`（桥接在该环境下直接写目录，不弹框），
再用 WebView2 的远程调试端口连进去，走完演示数据的三步流程并点下载，最后检查
成果文件是否真的落在该目录。

运行：.venv\\Scripts\\python.exe desktop\\e2e_exe.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import websocket

ROOT = Path(__file__).resolve().parent.parent
EXE = ROOT / "release" / "矢量转换与导出_v0.1.3.exe"
PORT = 9341
CHECKS: list[tuple[str, bool, str]] = []

try:  # 控制台是 GBK，中文/箭头符号会让 print 抛 UnicodeEncodeError
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass


def check(name: str, ok: bool, detail: object = "") -> None:
    CHECKS.append((name, bool(ok), str(detail)))
    print(f"  [{'OK  ' if ok else 'FAIL'}] {name}")


class Page:
    def __init__(self, port: int) -> None:
        self.ws = self._connect(port)
        self.msg_id = 0
        self.call("Runtime.enable")
        self.call("DOM.enable")

    def _connect(self, port: int) -> websocket.WebSocket:
        for _ in range(160):
            try:
                raw = urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=2).read()
                targets = [t for t in json.loads(raw) if t.get("type") == "page"]
                if targets:
                    return websocket.create_connection(targets[0]["webSocketDebuggerUrl"], timeout=60)
            except Exception:  # noqa: BLE001
                pass
            time.sleep(0.5)
        raise RuntimeError("连不上 WebView2 的调试端口")

    def call(self, method: str, params: dict | None = None):
        self.msg_id += 1
        self.ws.send(json.dumps({"id": self.msg_id, "method": method, "params": params or {}}))
        while True:
            message = json.loads(self.ws.recv())
            if message.get("id") == self.msg_id:
                return message.get("result", {})

    def eval(self, expression: str):
        result = self.call(
            "Runtime.evaluate",
            {"expression": expression, "awaitPromise": True, "returnByValue": True},
        ).get("result", {})
        return result.get("value")

    def click(self, text: str) -> bool:
        return bool(
            self.eval(
                """(() => {
                  const nodes = [...document.querySelectorAll('button, a, [role="button"]')];
                  const el = nodes.find(n => (n.innerText || '').includes(%s) && !n.disabled);
                  if (!el) return false;
                  el.click();
                  return true;
                })()"""
                % json.dumps(text)
            )
        )

    def wait(self, expression: str, timeout: float = 60.0) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.eval(expression):
                    return True
            except Exception:  # noqa: BLE001
                pass
            time.sleep(0.3)
        return False

    def close(self) -> None:
        try:
            self.ws.close()
        except Exception:  # noqa: BLE001
            pass


def kill_stale() -> None:
    """WebView2 的浏览器进程比宿主活得久，残留会沿用旧的调试参数，必须清掉。"""
    subprocess.run(["taskkill", "/F", "/IM", "msedgewebview2.exe"], capture_output=True)


def main() -> int:
    if not EXE.is_file():
        print(f"缺少打包产物：{EXE}")
        return 2
    save_dir = Path(tempfile.mkdtemp(prefix="plot-exe-save-"))
    env = dict(os.environ)
    env["PLOT_IMPORT_SAVE_DIR"] = str(save_dir)
    env["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = f"--remote-debugging-port={PORT}"
    kill_stale()
    proc = subprocess.Popen([str(EXE)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    page: Page | None = None
    try:
        page = Page(PORT)
        check("窗口已加载页面", page.wait("document.querySelectorAll('.template-choice').length > 3", 180))
        check("跑在桌面壳里（存在另存为桥接）",
              page.wait("typeof ((window.pywebview || {}).api || {}).save_file === 'function'", 90))

        check("点“使用演示矢量”", page.click("使用演示矢量"))
        check("演示矢量已读取", page.wait("/个要素 ·/.test(document.body.innerText)", 90))
        check("进入映射页", page.click("下一步") and page.wait("location.hash.includes('mapping')", 60))
        check(
            "映射页不再有拓扑检查面板",
            "已检查" not in (page.eval("document.body.innerText") or ""),
            (page.eval("document.body.innerText") or "")[:120],
        )
        check("点“生成矢量和表格”", page.click("生成矢量和表格"))
        check("进入成果页", page.wait("location.hash.includes('output')", 120))
        check("成果页出现下载按钮", page.wait("/下载矢量|下载表格/.test(document.body.innerText)", 60))

        before = {p.name for p in save_dir.iterdir() if p.is_file()}
        check("点“下载矢量”", page.click("下载矢量"))
        deadline = time.time() + 90
        saved: list[str] = []
        while time.time() < deadline:
            saved = sorted(p.name for p in save_dir.iterdir() if p.is_file() and p.name not in before)
            if saved:
                break
            time.sleep(0.5)
        check("矢量成果已保存到指定目录", bool(saved), saved)
        check("页面提示已保存路径",
              page.wait(
                  "((document.querySelector('[role=status]') || {}).innerText || '').includes(%s)"
                  % json.dumps(str(save_dir)),
                  30,
              ),
              page.eval("(document.querySelector('[role=status]') || {}).innerText"))

        before = {p.name for p in save_dir.iterdir() if p.is_file()}
        check("点“下载表格”", page.click("下载表格"))
        deadline = time.time() + 90
        while time.time() < deadline:
            saved = sorted(p.name for p in save_dir.iterdir() if p.is_file() and p.name not in before)
            if saved:
                break
            time.sleep(0.5)
        check("表格成果已保存到指定目录", bool(saved), saved)
        check("成果文件非空", all(p.stat().st_size > 0 for p in save_dir.iterdir() if p.is_file()),
              [(p.name, p.stat().st_size) for p in save_dir.iterdir() if p.is_file()])
    finally:
        if page is not None:
            page.close()
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
        kill_stale()

    passed = sum(1 for _, ok, _ in CHECKS if ok)
    print(f"\n{passed}/{len(CHECKS)} 通过")
    for name, ok, detail in CHECKS:
        if not ok:
            print(f"  FAIL {name}: {detail}")
    return 0 if passed == len(CHECKS) else 1


if __name__ == "__main__":
    raise SystemExit(main())
