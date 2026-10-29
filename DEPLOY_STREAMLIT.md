# GitHub → Streamlit 部署与更新

## 仓库内容

将当前 `plot-import-web` 文件夹作为独立 GitHub 仓库根目录，推荐仓库名 `plot-import-web`。
只提交此项目，不能提交父目录中的其他项目。不要上传 `.qa`、`node_modules`、用户矢量、账号凭据或 `.streamlit/secrets.toml`。

`streamlit_frontend/` 是构建结果，**需要提交**：Streamlit Cloud 只安装 Python 依赖，不依赖云端启动时下载 Node/npm。

## 首次部署

1. 本地运行：

   ```sh
   npm ci
   npm test
   npm run build:streamlit
   pip install -r requirements.txt
   streamlit run streamlit_app.py
   ```

2. 上传项目到 GitHub 的 `main` 分支，确认包含 `streamlit_app.py`、`requirements.txt`、`streamlit_release.py` 和 `streamlit_frontend/`。
3. 登录 Streamlit Community Cloud，点击 Create app / Deploy an app，选择该 GitHub 仓库和 `main` 分支。
4. Main file path 填 `streamlit_app.py`，Python 选择 3.12（要求至少3.11），然后 Deploy。
5. 如果仓库为 private，需要由仓库所有者在 Streamlit 侧授予对应仓库访问权限。不要把令牌写进代码。

## 后续更新自动同步

```text
修改代码 → 提交并推送 main
         → GitHub Actions 自动测试和构建
         → 将 streamlit_frontend 与 streamlit_release.py 提交回 main
         → Streamlit 同步仓库并加载新版本
```

`.github/workflows/streamlit-sync.yml` 负责构建，不负责创建 Streamlit 账号或首次部署。

仓库需允许 GitHub Actions 运行并写入 contents；如分支保护禁止机器人直接提交 main，需要由仓库管理员配置允许更新的方式，不能假定发布已完成。构建失败时保留上一版静态文件，检查 Actions 日志后修正。

每次本地更新前 `git pull --rebase`，接收机器人提交；然后按常规 `git add`、`git commit`、`git push`。
仅在电脑里改文件而未 push，不会更新线上网页。当前浏览器标签页可能需要刷新；刷新会清空用户本次上传及映射会话。

没有 Actions 写权限时，可在本地执行 `npm run build:streamlit`，一并提交源文件、`streamlit_frontend/`、`streamlit_release.py`，同样触发 Streamlit 更新。

## 隐私与运行边界

- Vue 网页作为 Streamlit 自定义组件运行。浏览器 File API 读取矢量，拓扑 Worker 和导出均在浏览器中进行，不向 Python 发送业务属性或几何。
- 组件通信仅发送 ready 与高度信息；演示 mock 和模板静态文件由应用服务器提供。
- 不新增后端数据库、账号系统或文件上传接口。
- 单次会话仍限250要素、10MB，支持WGS84 GeoJSON；CSV/XLSX/GeoJSON/ZIP在浏览器下载。
- 主项目仍可使用 `npm run dev` 独立运行；Streamlit 使用相对路径构建，包含地图、mock 与 Worker。

## 官方参考

- https://docs.streamlit.io/develop/api-reference/custom-components/st.components.v1.declare_component
- https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app
- https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app/edit-your-app
