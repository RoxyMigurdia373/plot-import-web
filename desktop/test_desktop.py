"""桌面壳的单元测试：静态服务行为 + 端口回退。

只依赖标准库，构建好的前端目录不存在时跳过。
运行：.venv\\Scripts\\python.exe -m unittest discover -s desktop -p "test_*.py"
"""

from __future__ import annotations

import http.client
import tempfile
import unittest
from pathlib import Path

from desktop.server import LocalServer, make_handler  # noqa: E402

DIST = Path(__file__).resolve().parent.parent / "dist"


def request(port: int, path: str, method: str = "GET") -> tuple[int, dict[str, str], bytes]:
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    try:
        conn.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
        conn.putheader("Host", "127.0.0.1")
        conn.endheaders()
        response = conn.getresponse()
        headers = {key.lower(): value for key, value in response.getheaders()}
        return response.status, headers, response.read()
    finally:
        conn.close()


@unittest.skipUnless((DIST / "index.html").is_file(), "先执行 npm run build 生成 dist/")
class StaticServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = LocalServer(DIST)
        cls.server.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.close()

    def test_root_serves_entry(self) -> None:
        status, headers, body = request(self.server.port, "/")
        self.assertEqual(status, 200)
        self.assertIn("text/html", headers["content-type"])
        self.assertIn(b'id="app"', body)

    def test_page_route_falls_back_to_entry(self) -> None:
        status, _, body = request(self.server.port, "/flow/upload")
        self.assertEqual(status, 200)
        self.assertIn(b'id="app"', body)

    def test_hashed_asset_is_immutable(self) -> None:
        status, headers, _ = request(self.server.port, "/")
        self.assertEqual(status, 200)
        asset = None
        for path in sorted((DIST / "assets").glob("*.js")):
            asset = f"/assets/{path.name}"
            break
        self.assertIsNotNone(asset, "dist/assets 里没有 js 产物")
        status, headers, _ = request(self.server.port, asset or "/")
        self.assertEqual(status, 200)
        self.assertIn("javascript", headers["content-type"])
        self.assertIn("immutable", headers["cache-control"])

    def test_entry_is_not_cached(self) -> None:
        _, headers, _ = request(self.server.port, "/")
        self.assertEqual(headers["cache-control"], "no-store")

    def test_missing_data_file_is_404(self) -> None:
        status, _, _ = request(self.server.port, "/mock/no-such-file.json")
        self.assertEqual(status, 404)

    def test_path_traversal_is_blocked(self) -> None:
        status, _, _ = request(self.server.port, "/../pyproject.toml")
        self.assertIn(status, (404, 400))

    def test_favicon_returns_no_content(self) -> None:
        status, _, body = request(self.server.port, "/favicon.ico")
        self.assertEqual(status, 204)
        self.assertEqual(body, b"")

    def test_head_request_has_no_body(self) -> None:
        status, headers, body = request(self.server.port, "/", method="HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        self.assertGreater(int(headers["content-length"]), 0)


class PortFallbackTest(unittest.TestCase):
    def test_second_server_moves_to_a_free_port(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / "index.html").write_text("<html><body>ok</body></html>", encoding="utf-8")
            first = LocalServer(Path(folder))
            first.start()
            try:
                second = LocalServer(Path(folder), port=first.port)
                second.start()
                try:
                    self.assertNotEqual(second.port, first.port)
                    status, _, body = request(second.port, "/")
                    self.assertEqual(status, 200)
                    self.assertIn(b"ok", body)
                finally:
                    second.close()
            finally:
                first.close()

    def test_handler_factory_is_reusable(self) -> None:
        handler = make_handler(Path("."))
        self.assertTrue(callable(handler))


if __name__ == "__main__":
    unittest.main()
