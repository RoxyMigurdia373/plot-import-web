"""Serve the existing Vue app as a Streamlit custom component.

Uploaded vectors stay in the iframe/browser; Python receives no source files.
"""
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

from streamlit_release import BUILD_REVISION

st.set_page_config(page_title="田图 · 矢量转换", page_icon="🌿", layout="wide")
st.markdown(
    """<style>
    .stMainBlockContainer {max-width:none;padding:0 0 1rem;}
    [data-testid="stHeader"] {display:none;}
    [data-testid="stAppViewContainer"] {background:#f4f6f2;}
    </style>""",
    unsafe_allow_html=True,
)

frontend = Path(__file__).resolve().parent / "streamlit_frontend"
if not (frontend / "index.html").is_file():
    st.error("网页尚未构建，请先运行 npm ci 和 npm run build:streamlit。")
    st.stop()

plot_app = components.declare_component("plot_import_web", path=str(frontend))
plot_app(build_revision=BUILD_REVISION, default=None, key="plot-import-web")
