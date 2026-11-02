"""页面点“下载”时弹系统“另存为”对话框，由桌面壳落盘。

浏览器里 `a.download` 会被 WebView2 拦掉（点了没反应），所以桌面壳注册一个
``save_file`` 给页面调用：前端把 Blob 读成 base64，这里解码后写文件。
"""

from __future__ import annotations

import base64
import ctypes
import json
import os
from ctypes import wintypes
from pathlib import Path

from .app import LOG_DIR, log

STATE_FILE = LOG_DIR / "last-save.json"

OFN_OVERWRITEPROMPT = 0x00000002
OFN_NOCHANGEDIR = 0x00000008
OFN_PATHMUSTEXIST = 0x00000800
OFN_EXPLORER = 0x00080000


class OPENFILENAMEW(ctypes.Structure):
    _fields_ = [
        ("lStructSize", wintypes.DWORD),
        ("hwndOwner", wintypes.HWND),
        ("hInstance", wintypes.HINSTANCE),
        ("lpstrFilter", wintypes.LPCWSTR),
        ("lpstrCustomFilter", wintypes.LPWSTR),
        ("nMaxCustFilter", wintypes.DWORD),
        ("nFilterIndex", wintypes.DWORD),
        ("lpstrFile", wintypes.LPWSTR),
        ("nMaxFile", wintypes.DWORD),
        ("lpstrFileTitle", wintypes.LPWSTR),
        ("nMaxFileTitle", wintypes.DWORD),
        ("lpstrInitialDir", wintypes.LPCWSTR),
        ("lpstrTitle", wintypes.LPCWSTR),
        ("Flags", wintypes.DWORD),
        ("nFileOffset", wintypes.WORD),
        ("nFileExtension", wintypes.WORD),
        ("lpstrDefExt", wintypes.LPCWSTR),
        ("lCustData", wintypes.LPARAM),
        ("lpfnHook", ctypes.c_void_p),
        ("lpTemplateName", wintypes.LPCWSTR),
        ("pvReserved", ctypes.c_void_p),
        ("dwReserved", wintypes.DWORD),
        ("FlagsEx", wintypes.DWORD),
    ]


def _default_dir() -> Path:
    try:
        saved = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        folder = Path(str(saved.get("dir", "")))
        if folder.is_dir():
            return folder
    except (OSError, ValueError):
        pass
    for name in ("Desktop", "Downloads"):
        folder = Path.home() / name
        if folder.is_dir():
            return folder
    return Path.home()


def _remember(folder: Path) -> None:
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps({"dir": str(folder)}, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def _owner_window(title: str) -> int:
    """找到主窗口当对话框的 owner，避免对话框弹到窗口后面。"""
    user32 = ctypes.windll.user32
    found: list[int] = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def callback(hwnd, _):
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            if length:
                buffer = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buffer, length + 1)
                if title in buffer.value:
                    found.append(hwnd)
                    return False
        return True

    user32.EnumWindows(callback, 0)
    return found[0] if found else 0


def _filter_for(name: str) -> str:
    suffix = Path(name).suffix.lower()
    labels = {
        ".geojson": ("GeoJSON 文件", "*.geojson"),
        ".json": ("JSON 文件", "*.json"),
        ".xlsx": ("Excel 工作簿", "*.xlsx"),
        ".csv": ("CSV 文件", "*.csv"),
        ".zip": ("压缩包", "*.zip"),
    }
    label, pattern = labels.get(suffix, ("成果文件", f"*{suffix or '.*'}"))
    return f"{label} ({pattern})\0{pattern}\0所有文件 (*.*)\0*.*\0\0"


def ask_save_path(suggested: str, owner_title: str = "") -> Path | None:
    """弹系统保存对话框；用户取消返回 None。非 Windows 直接返回 None。"""
    if os.name != "nt":
        return None
    ole32 = ctypes.windll.ole32
    try:
        ole32.CoInitialize(None)
    except OSError:
        pass
    buffer = ctypes.create_unicode_buffer(suggested, 1024)
    dialog = OPENFILENAMEW()
    dialog.lStructSize = ctypes.sizeof(OPENFILENAMEW)
    dialog.hwndOwner = _owner_window(owner_title) if owner_title else 0
    dialog.lpstrFilter = _filter_for(suggested)
    dialog.nFilterIndex = 1
    dialog.lpstrFile = ctypes.cast(buffer, wintypes.LPWSTR)
    dialog.nMaxFile = len(buffer)
    dialog.lpstrInitialDir = str(_default_dir())
    dialog.lpstrTitle = "选择保存位置"
    dialog.Flags = OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR | OFN_EXPLORER
    suffix = Path(suggested).suffix.lstrip(".")
    if suffix:
        dialog.lpstrDefExt = suffix
    comdlg32 = ctypes.windll.comdlg32
    comdlg32.GetSaveFileNameW.argtypes = [ctypes.POINTER(OPENFILENAMEW)]
    comdlg32.GetSaveFileNameW.restype = wintypes.BOOL
    if not comdlg32.GetSaveFileNameW(ctypes.byref(dialog)):
        return None
    chosen = Path(buffer.value)
    if chosen.suffix == "" and suffix:
        chosen = chosen.with_suffix(f".{suffix}")
    return chosen


class SaveApi:
    """注册给页面的 `window.pywebview.api`。"""

    def __init__(self, owner_title: str = "") -> None:
        self.owner_title = owner_title

    def save_file(self, filename: str, data: str, target: str | None = None) -> dict:
        """把 base64 内容写到用户选择的位置，返回 {"path": ...} 或 {"cancelled": True}。"""
        name = Path(str(filename or "下载文件")).name or "下载文件"
        try:
            payload = base64.b64decode(data, validate=False)
        except (ValueError, TypeError) as error:
            log(f"保存失败：内容不是合法 base64（{error}）")
            return {"error": f"内容解码失败：{error}"}

        override = os.environ.get("PLOT_IMPORT_SAVE_DIR")
        if target:
            destination = Path(target)
        elif override:
            destination = Path(override) / name
        else:
            destination = ask_save_path(name, self.owner_title)
        if destination is None:
            log(f"用户取消了保存：{name}")
            return {"cancelled": True}
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(payload)
        except OSError as error:
            log(f"保存失败：{destination}（{error}）")
            return {"error": f"写入失败：{error}"}
        _remember(destination.parent)
        log(f"已保存：{destination}（{len(payload)} 字节）")
        return {"path": str(destination)}
