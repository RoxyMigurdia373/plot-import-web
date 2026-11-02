"""桌面壳“另存为”桥接的单元测试（不弹真实对话框）。"""

from __future__ import annotations

import base64
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from desktop.savefile import SaveApi, _filter_for, _default_dir


class SaveFileTest(unittest.TestCase):
    def setUp(self) -> None:
        self.scratch = Path(tempfile.mkdtemp(prefix="plot-save-test-"))
        self.api = SaveApi(owner_title="测试窗口")

    def tearDown(self) -> None:
        for path in sorted(self.scratch.rglob("*"), reverse=True):
            if path.is_file():
                path.unlink()
            elif path.is_dir():
                path.rmdir()
        self.scratch.rmdir()

    def test_writes_to_an_explicit_target(self) -> None:
        target = self.scratch / "成果" / "标准矢量.geojson"
        payload = b'{"type":"FeatureCollection","features":[]}'
        reply = self.api.save_file("标准矢量.geojson", base64.b64encode(payload).decode(), str(target))
        self.assertEqual(reply, {"path": str(target)})
        self.assertEqual(target.read_bytes(), payload)

    def test_env_override_directory_keeps_the_suggested_name(self) -> None:
        with mock.patch.dict(os.environ, {"PLOT_IMPORT_SAVE_DIR": str(self.scratch)}):
            reply = self.api.save_file("导入表格.xlsx", base64.b64encode(b"xlsx-bytes").decode())
        self.assertEqual(reply, {"path": str(self.scratch / "导入表格.xlsx")})
        self.assertEqual((self.scratch / "导入表格.xlsx").read_bytes(), b"xlsx-bytes")

    def test_unsafe_name_is_reduced_to_a_file_name(self) -> None:
        with mock.patch.dict(os.environ, {"PLOT_IMPORT_SAVE_DIR": str(self.scratch)}):
            reply = self.api.save_file("../../逃逸.csv", base64.b64encode(b"a,b").decode())
        saved = Path(reply["path"])
        self.assertEqual(saved.parent, self.scratch)
        self.assertEqual(saved.name, "逃逸.csv")

    def test_bad_payload_reports_an_error(self) -> None:
        reply = self.api.save_file("坏文件.zip", "not*base64")
        self.assertIn("error", reply)
        self.assertIn("解码失败", reply["error"])

    def test_writing_onto_a_directory_reports_an_error(self) -> None:
        folder = self.scratch / "已存在的目录"
        folder.mkdir()
        reply = self.api.save_file("x.csv", base64.b64encode(b"a").decode(), str(folder))
        self.assertIn("error", reply)
        self.assertIn("写入失败", reply["error"])

    def test_filters_and_default_directory(self) -> None:
        self.assertIn("*.geojson", _filter_for("标准矢量.geojson"))
        self.assertIn("*.xlsx", _filter_for("导入表格.xlsx"))
        self.assertIn("*.*", _filter_for("未知.bin"))
        self.assertTrue(_default_dir().is_dir())


if __name__ == "__main__":
    unittest.main()
