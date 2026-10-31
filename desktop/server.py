"""本地静态服务：只用标准库，把构建好的前端目录通过 127.0.0.1 提供出去。

前端是纯客户端应用（Hash 路由、Web Worker、mock JSON），所以不需要任何后端接口，
这里只做三件事：正确的 MIME、禁止路径穿越、把未知的页面路径回落到 index.html。
"""

from __future__ import annotations

import http.server
import socket
import threading
from pathlib import Path
from typing import Callable

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".geojson": "application/geo+json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".wasm": "application/wasm",
    ".txt": "text/plain; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip",
}

# 带内容哈希的构建产物可以长期缓存，入口文件与数据必须每次校验。
IMMUTABLE_PREFIXES = ("/assets/",)


class LocalHTTPServer(http.server.ThreadingHTTPServer):
    """只监听本机的 HTTP 服务。

    `allow_reuse_address` 必须关掉：Windows 上 SO_REUSEADDR 允许第二个进程绑定
    已经被占用的端口，两个服务会静默地抢同一个端口，端口回退就永远不生效。
    """

    allow_reuse_address = False
    daemon_threads = True


def make_handler(root: Path, log: Callable[[str], None] | None = None):
    """生成绑定到某个静态目录的请求处理器。"""
    root = Path(root).resolve()

    class Handler(http.server.BaseHTTPRequestHandler):
        server_version = "PlotImportDesktop/1.0"
        protocol_version = "HTTP/1.1"

        def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler 约定
            self._respond(send_body=True)

        def do_HEAD(self) -> None:  # noqa: N802
            self._respond(send_body=False)

        def _respond(self, send_body: bool) -> None:
            if self.path.split("?", 1)[0].split("#", 1)[0] == "/favicon.ico" and not (root / "favicon.ico").is_file():
                # 前端没有单独的 favicon，窗口本身就带图标；直接 204 免得日志里一堆 404。
                self.send_response(204)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            target = self._resolve()
            if target is None:
                self.send_error(404, "Not Found")
                return
            try:
                payload = target.read_bytes()
            except OSError:
                self.send_error(404, "Not Found")
                return
            self.send_response(200)
            self.send_header("Content-Type", self._content_type(target))
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", self._cache_header(target))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            if send_body:
                self.wfile.write(payload)

        def _resolve(self) -> Path | None:
            raw = self.path.split("?", 1)[0].split("#", 1)[0]
            if not raw.startswith("/"):
                return None
            relative = raw.lstrip("/")
            candidate = (root / relative).resolve() if relative else root / "index.html"
            try:
                candidate.relative_to(root)
            except ValueError:  # 路径穿越
                return None
            if candidate.is_dir():
                candidate = candidate / "index.html"
            if candidate.is_file():
                return candidate
            # 页面路由（没有扩展名）回落到入口文件，前端用 Hash 路由。
            if not Path(relative).suffix:
                fallback = root / "index.html"
                if fallback.is_file():
                    return fallback
            return None

        @staticmethod
        def _content_type(path: Path) -> str:
            return MIME_TYPES.get(path.suffix.lower(), "application/octet-stream")

        @staticmethod
        def _cache_header(path: Path) -> str:
            absolute = path.as_posix()
            if any(f"/{prefix.strip('/')}/" in absolute for prefix in IMMUTABLE_PREFIXES):
                return "public, max-age=31536000, immutable"
            return "no-store"

        def log_message(self, fmt: str, *args) -> None:  # 默认写 stderr，窗口程序里会丢
            if log is not None:
                log("%s - %s" % (self.address_string(), fmt % args))

    return Handler


class LocalServer:
    """在后台线程里跑一个只监听 127.0.0.1 的静态服务。"""

    def __init__(self, root: Path, port: int = 0, log: Callable[[str], None] | None = None):
        self.root = Path(root).resolve()
        self.requested_port = port
        self._log = log or (lambda message: None)
        self._server: http.server.ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    @property
    def url(self) -> str:
        if self._server is None:
            raise RuntimeError("服务尚未启动")
        host, port = self._server.server_address[:2]
        return f"http://{host}:{port}/"

    @property
    def port(self) -> int:
        if self._server is None:
            raise RuntimeError("服务尚未启动")
        return int(self._server.server_address[1])

    def start(self) -> str:
        handler = make_handler(self.root, self._log)
        last_error: OSError | None = None
        for candidate in (self.requested_port, 0):
            try:
                server = LocalHTTPServer(("127.0.0.1", candidate), handler)
            except OSError as error:  # 端口被占用就用随机端口
                last_error = error
                continue
            self._server = server
            self._thread = threading.Thread(
                target=server.serve_forever, name="plot-import-http", daemon=True
            )
            self._thread.start()
            self._log(f"本地服务已启动：{self.url}（目录 {self.root}）")
            return self.url
        raise RuntimeError(f"无法启动本地服务：{last_error}")

    def close(self) -> None:
        server, thread = self._server, self._thread
        self._server = None
        self._thread = None
        if server is not None:
            server.shutdown()
            server.server_close()
        if thread is not None:
            thread.join(timeout=3)
        self._log("本地服务已停止")

    def __enter__(self) -> "LocalServer":
        self.start()
        return self

    def __exit__(self, *exc_info) -> None:
        self.close()


def free_port() -> int:
    """探测一个当前空闲的端口（仅用于需要固定端口的场景）。"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])
