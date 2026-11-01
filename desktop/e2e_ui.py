"""e2e：用 Edge(CDP) 驱动打包后的 dist，走完三步流程并真的下载成果。

只验证前端产物本身（EXE 内的 dist 就是这份），因此不依赖 pywebview。
运行：.venv\\Scripts\\python.exe desktop\\e2e_ui.py
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
        self.call("DOM.enable")
        self.call("Page.enable")

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
                  const el = nodes.find(n => (n.innerText || '').includes(%s) && !n.disabled);
                  if (!el) return false;
                  el.click();
                  return true;
                })()"""
                % json.dumps(text)
            )
        )

    def click_modal(self, text: str) -> bool:
        """只在对话框内点按钮，避免点到页面上同名的工具条按钮。"""
        return bool(
            self.eval(
                """(() => {
                  const nodes = [...document.querySelectorAll('.modal button')];
                  const el = nodes.find(n => (n.innerText || '').includes(%s) && !n.disabled);
                  if (!el) return false;
                  el.click();
                  return true;
                })()"""
                % json.dumps(text)
            )
        )

    def set_input(self, selector: str, value: str) -> bool:
        """按原生 setter 赋值并派发 input/change，Vue 的 v-model 与 @change 才能感知。"""
        return bool(
            self.eval(
                """(() => {
                  const el = document.querySelector(%s);
                  if (!el) return false;
                  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, %s);
                  el.dispatchEvent(new Event('input', {bubbles: true}));
                  el.dispatchEvent(new Event('change', {bubbles: true}));
                  return true;
                })()"""
                % (json.dumps(selector), json.dumps(value))
            )
        )

    def select(self, selector: str, value: str) -> bool:
        return bool(
            self.eval(
                """(() => {
                  const el = document.querySelector(%s);
                  if (!el) return false;
                  el.value = %s;
                  el.dispatchEvent(new Event('change', {bubbles: true}));
                  return el.value === %s;
                })()"""
                % (json.dumps(selector), json.dumps(value), json.dumps(value))
            )
        )

    def set_files(self, selector: str, path: Path) -> bool:
        document = self.call("DOM.getDocument", {"depth": -1})
        node = self.call("DOM.querySelector", {"nodeId": document["root"]["nodeId"], "selector": selector})
        if not node.get("nodeId"):
            return False
        self.call("DOM.setFileInputFiles", {"files": [str(path)], "nodeId": node["nodeId"]})
        return True

    def close(self) -> None:
        try:
            self.ws.close()
        except Exception:  # noqa: BLE001 - Edge 关闭时 socket 常被重置
            pass
        finally:
            self.proc.kill()




def big_geojson(path: Path, rows: int, cols: int) -> int:
    """生成 rows*cols 个相邻地块，用于验证本地预算下的三万级数据。"""
    size, shift = 0.0005, 0.0001
    features = []
    for r in range(rows):
        for c in range(cols):
            x = c * size + (r % 2) * shift
            y = r * size
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "地块编码": f"{r}-{c}",
                        "乡镇名称": f"乡镇{r % 20}",
                        "村名称": f"村{c % 40}",
                        "实测面积": round(size * size * 111000 * 111000, 2),
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]],
                    },
                }
            )
    path.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False),
        encoding="utf-8",
    )
    return len(features)


def big_data_stage(cdp: CDP, server, downloads: Path) -> None:
    """E2E_BIG=1 时验证本地预算下的三万级数据：上传、检查、生成、下载。"""
    work = Path(tempfile.mkdtemp(prefix="plot-big-"))
    geo = work / "大参量地块.geojson"
    total = big_geojson(geo, 150, 200)
    cdp.eval(f"location.href = '{server.url}/?local=1#/'")
    wait_for(cdp, "document.querySelectorAll('.template-choice').length > 0", 30)
    check(
        "大数据：文件已选择",
        cdp.set_files("input[type=file]", geo),
        f"{geo.stat().st_size / 1024 / 1024:.1f} MB, {total} 个要素",
    )
    check(
        "大数据：读取完成",
        wait_for(cdp, f"/{total} 个要素 ·/.test(document.body.innerText)", 180),
        cdp.eval("document.body.innerText.slice(0, 120)"),
    )
    check(
        "大数据：进入映射页",
        cdp.click("下一步") and wait_for(cdp, "location.hash.includes('mapping')", 60),
        cdp.eval("location.hash"),
    )
    check(
        "大数据：拓扑检查完成",
        wait_for(cdp, f"/已检查 {total} 个要素/.test(document.body.innerText)", 300),
        cdp.eval("document.body.innerText.slice(0, 160)"),
    )
    check(
        "大数据：生成成果",
        cdp.click("生成矢量和表格") and wait_for(cdp, "location.hash.includes('output')", 300),
        cdp.eval("location.hash"),
    )
    check("大数据：成果页有下载入口", wait_for(cdp, "/下载|导出/.test(document.body.innerText)", 60), "")
    before = {p.name for p in downloads.iterdir() if p.is_file()}
    cdp.click("下载矢量")
    time.sleep(1.0)
    cdp.click("下载表格")
    deadline = time.time() + 180
    while time.time() < deadline:
        if len([p for p in downloads.iterdir() if p.is_file() and p.name not in before]) >= 2:
            break
        time.sleep(1.0)
    new_files = sorted(p.name for p in downloads.iterdir() if p.is_file() and p.name not in before)
    check("大数据：下载出新成果", len(new_files) >= 2, new_files)


def wait_for(cdp: CDP, expression: str, timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if cdp.eval(expression):
            return True
        time.sleep(0.3)
    return False


def body(cdp: CDP) -> str:
    return cdp.eval("document.body.innerText") or ""


def main() -> int:
    downloads = Path(tempfile.mkdtemp(prefix="plot-dl-"))
    work = Path(tempfile.mkdtemp(prefix="plot-tpl-"))
    csv_path = work / "公司上传模板.csv"
    csv_path.write_text("编号,区块名称,实际面积/亩,数据来源\n", encoding="utf-8-sig")

    with LocalServer(DIST) as server:
        cdp = CDP(f"{server.url}/#/flow/upload", downloads)
        try:
            # --- 既有三步流程 ---
            check("页面已渲染", wait_for(cdp, "document.querySelectorAll('button').length > 0"), "")
            check("标题", cdp.eval("document.title") == "矢量转换与导出", cdp.eval("document.title"))
            text = body(cdp)
            check("上传页三步导航", all(k in text for k in ("上传原始矢量", "映射与拓扑检查", "矢量和表格成果")), "")

            # --- 模板库：导入表头 ---
            check("上传页有导入表头入口", "导入表头生成模板" in body(cdp), "")
            check("选择 CSV 模板文件", cdp.set_files("input.hidden-input", csv_path), csv_path.name)
            check("弹出去重命名对话框", wait_for(cdp, "/保存导入的模板/.test(document.body.innerText)"), "")
            check("对话框显示字段数量", "/共 4 个字段/.test(document.body.innerText)", "")
            cdp.set_input(".modal .dialog-input", "某公司上传模板")
            check("保存导入的模板", cdp.click("保存模板") and wait_for(cdp, "/某公司上传模板/.test(document.body.innerText)"), "")
            saved = cdp.eval(
                "JSON.stringify((JSON.parse(localStorage.getItem('plot-import:v2:template-library')||'{}').value||[]).map(r=>r.name))"
            )
            check("模板已写入本地存储", saved == '["某公司上传模板"]', saved)

            # --- 刷新后模板仍在（第 3 项需求）---
            cdp.call("Page.reload", {"ignoreCache": True})
            check("刷新后仍看到自建模板", wait_for(cdp, "/某公司上传模板/.test(document.body.innerText)"), "")
            check("自建模板带标记", "/自建/.test(document.body.innerText)", "")

            # --- 使用自建模板走流程 ---
            check("点击使用演示矢量", cdp.click("演示"), "")
            check(
                "演示数据已载入",
                wait_for(cdp, "/已读取/.test(document.body.innerText) && /5 个要素/.test(document.body.innerText)"),
                "",
            )
            check("进入映射页", cdp.click("下一步") and wait_for(cdp, "location.hash.includes('mapping')"), cdp.eval("location.hash"))
            columns = cdp.eval("document.querySelectorAll('table tbody tr').length")
            check("自建模板只有 4 个字段", columns == 4, columns)

            # --- 第 1 项：新增字段、改字段名、固定值 ---
            check("新增字段", cdp.click("新增字段") and wait_for(cdp, "document.querySelectorAll('table tbody tr').length === 5"), "")
            check("改名后的表头写入", cdp.set_input("table tbody tr:nth-child(1) .header-input", "地块编号"), "")
            check(
                "表头已生效",
                wait_for(cdp, "document.querySelector('table tbody tr:nth-child(1) .header-input')?.value === '地块编号'"),
                cdp.eval("document.querySelector('table tbody tr:nth-child(1) .header-input')?.value"),
            )
            check("选择固定值来源", cdp.select("table tbody tr:nth-child(2) select", "__const__"), "")
            check("固定值输入框出现", wait_for(cdp, "!!document.querySelector('table tbody tr:nth-child(2) .const-input')"), "")
            check("填写固定值", cdp.set_input("table tbody tr:nth-child(2) .const-input", "2026年度摸底"), "")
            check(
                "固定值预览",
                wait_for(
                    cdp,
                    "/固定值：2026年度摸底/.test(document.querySelector('table tbody tr:nth-child(2) td:last-child')?.innerText || '')",
                ),
                cdp.eval("document.querySelector('table tbody tr:nth-child(2) td:last-child')?.innerText"),
            )

            # --- 保存改动为模板（可命名）---
            check(
                "打开保存模板对话框",
                (cdp.click("保存为模板") or cdp.click("保存模板"))
                and wait_for(cdp, "!!document.querySelector('.modal .dialog-input')", 10),
                cdp.eval("document.body.innerText.slice(0, 40)"),
            )
            cdp.set_input(".modal .dialog-input", "某公司上传模板")
            check("保存模板成功提示", cdp.click_modal("保存模板") and wait_for(cdp, "/已保存/.test(document.body.innerText)"), "")
            cdp.call("Page.reload", {"ignoreCache": True})
            deadline = time.time() + 20
            while time.time() < deadline and not cdp.eval("document.readyState === 'complete' && document.querySelectorAll('.template-choice').length > 0"):
                time.sleep(0.3)
            cdp.eval("location.hash = '#/'")
            wait_for(cdp, "location.hash === '#/'", 10)
            restored = wait_for(
                cdp,
                "document.querySelector('.template-choice.chosen')?.innerText.includes('某公司上传模板') === true",
            )
            check(
                "刷新后自动选中上次模板",
                restored,
                cdp.eval(
                    "JSON.stringify({chosen:document.querySelector('.template-choice.chosen')?.innerText,"
                    "hash:location.hash,active:localStorage.getItem('plot-import:v2:active-template')})"
                ),
            )
            check("刷新后重新载入演示矢量", cdp.click("演示"), "")
            check(
                "演示数据已载入",
                wait_for(cdp, "/已读取/.test(document.body.innerText) && /5 个要素/.test(document.body.innerText)"),
                "",
            )

            # --- 生成与下载 ---
            check("回到映射页", cdp.click("下一步") and wait_for(cdp, "location.hash.includes('mapping')"), cdp.eval("location.hash"))
            check(
                "改动的字段名已持久化",
                wait_for(cdp, "document.querySelector('table tbody tr:nth-child(1) .header-input')?.value === '地块编号'"),
                cdp.eval("document.querySelector('table tbody tr:nth-child(1) .header-input')?.value"),
            )
            check(
                "固定值映射已持久化",
                wait_for(cdp, "document.querySelector('table tbody tr:nth-child(2) .const-input')?.value === '2026年度摸底'"),
                cdp.eval("document.querySelector('table tbody tr:nth-child(2) .const-input')?.value"),
            )
            check("生成矢量和表格", cdp.click("生成矢量和表格") and wait_for(cdp, "location.hash.includes('output')", 90), cdp.eval("location.hash"))
            check("成果页已渲染", wait_for(cdp, "/下载|导出/.test(document.body.innerText)"), body(cdp)[:60].replace("\n", " "))
            check("成果预览含固定值", "2026年度摸底" in body(cdp), "")

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

            # --- 本地模式的上限文案 ---
            cdp.eval(f"location.href = '{server.url}/?local=1#/'")
            check(
                "本地模式切到 2 GB / 100 万",
                wait_for(cdp, "/100 万要素/.test(document.body.innerText) && /2 GB/.test(document.body.innerText)", 30),
                cdp.eval("document.querySelector('.dropzone small')?.innerText || document.body.innerText.slice(0, 80)"),
            )
            check(
                "本地模式标注来源",
                wait_for(cdp, "/本地窗口/.test(document.body.innerText)", 10),
                "",
            )
            cdp.eval(f"location.href = '{server.url}/#/'")
            check(
                "网页模式仍是 200 MB",
                wait_for(cdp, "/200 MB/.test(document.body.innerText)", 30),
                cdp.eval("document.querySelector('.dropzone small')?.innerText || ''"),
            )
            if os.environ.get("E2E_BIG") == "1":
                # 前一段已经下载过同名成果，先清空，才能判断大数据阶段真的落盘了
                for stale in downloads.iterdir():
                    if stale.is_file():
                        stale.unlink()
                big_data_stage(cdp, server, downloads)
        finally:
            cdp.close()

    failed = [name for name, ok, _ in CHECKS if not ok]
    print(f"\n{len(CHECKS) - len(failed)}/{len(CHECKS)} 通过")
    if failed:
        print("失败：", "、".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
