"""e2e：用 Edge(CDP) 驱动打包后的 dist，走完三步流程并真的下载成果。

只验证前端产物本身（EXE 内的 dist 就是这份），因此不依赖 pywebview。
运行：.venv\\Scripts\\python.exe desktop\\e2e_ui.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import websocket

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from desktop.server import LocalServer  # noqa: E402

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
DIST = Path(__file__).resolve().parent.parent / "dist"
CHECKS: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: object = "") -> None:
    CHECKS.append((name, bool(ok), str(detail)))
    status = "OK  " if ok else "FAIL"
    print(f"  [{status}] {name}")


class CDP:
    def __init__(self, url: str, download_dir: Path, port: int = 9337) -> None:
        self.proc = subprocess.Popen(
            [
                EDGE,
                "--headless=new",
                "--disable-gpu",
                f"--remote-debugging-port={port}",
                f"--user-data-dir={tempfile.mkdtemp(prefix='edge-cdp-')}",
                "--no-first-run",
                "--window-size=1360,860",
                url,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.ws = self._connect(port)
        self.msg_id = 0
        self.call("Browser.setDownloadBehavior", {"behavior": "allow", "downloadPath": str(download_dir)})

    def _connect(self, port: int) -> websocket.WebSocket:
        for _ in range(60):
            try:
                raw = urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=2).read()
                targets = [t for t in json.loads(raw) if t.get("type") == "page"]
                if targets:
                    sock = websocket.create_connection(targets[0]["webSocketDebuggerUrl"], timeout=30)
                    sock.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
                    return sock
            except Exception:  # noqa: BLE001
                pass
            time.sleep(0.3)
        raise RuntimeError("Edge CDP 连接失败")

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
                  const el = nodes.find(n => (n.innerText || '').includes(%s));
                  if (!el) return false;
                  el.click();
                  return true;
                })()"""
                % json.dumps(text)
            )
        )

    def close(self) -> None:
        try:
            self.ws.close()
        finally:
            self.proc.kill()


def wait_for(cdp: CDP, expression: str, timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if cdp.eval(expression):
            return True
        time.sleep(0.3)
    return False


def main() -> int:
    downloads = Path(tempfile.mkdtemp(prefix="plot-dl-"))
    with LocalServer(DIST) as server:
        cdp = CDP(f"{server.url}/#/flow/upload", downloads)
        try:
            check("页面已渲染", wait_for(cdp, "document.querySelectorAll('button').length > 0"), "")
            check("标题", cdp.eval("document.title") == "矢量转换与导出", cdp.eval("document.title"))
            text = cdp.eval("document.body.innerText")
            check("上传页三步导航", all(k in text for k in ("上传原始矢量", "映射与拓扑检查", "矢量和表格成果")), "")

            check("点击使用演示矢量", cdp.click("演示"), "")
            check(
                "演示数据已载入",
                wait_for(cdp, "/已读取/.test(document.body.innerText) && /5 个要素/.test(document.body.innerText)"),
                "5 个要素 · 12 个原始字段",
            )

            check("进入映射页", cdp.click("下一步") and wait_for(cdp, "location.hash.includes('mapping')"),
                  cdp.eval("location.hash"))
            selects = cdp.eval("document.querySelectorAll('select').length")
            check("映射页有 34 个模板字段", selects >= 34, selects)

            check("生成矢量和表格", cdp.click("生成矢量和表格") and wait_for(cdp, "location.hash.includes('output')", 90),
                  cdp.eval("location.hash"))
            check("成果页已渲染", wait_for(cdp, "/下载|导出/.test(document.body.innerText)"),
                  (cdp.eval("document.body.innerText") or "")[:60].replace("\n", " "))

            labels = cdp.eval(
                "JSON.stringify([...document.querySelectorAll('button, a')]"
                ".map(n => (n.innerText || '').trim()).filter(t => /下载|导出/.test(t)))"
            )
            check("成果页有下载入口", bool(labels) and labels != "[]", labels)

            for label in json.loads(labels or "[]"):
                cdp.click(label)
                time.sleep(1.5)
            time.sleep(2.0)
            files = sorted(p.name for p in downloads.iterdir() if p.is_file())
            check("下载产生成果文件", len(files) >= 2, files)
            check("含矢量成果", any(name.lower().endswith((".geojson", ".zip", ".shp")) for name in files), files)
            check("含表格成果", any(name.lower().endswith((".xlsx", ".csv")) for name in files), files)
        finally:
            cdp.close()

    failed = [name for name, ok, _ in CHECKS if not ok]
    print(f"\n{len(CHECKS) - len(failed)}/{len(CHECKS)} 通过")
    if failed:
        print("失败：", "、".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
