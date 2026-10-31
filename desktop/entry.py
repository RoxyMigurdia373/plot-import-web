"""PyInstaller 入口脚本：用绝对导入，保证打包时能收集到 desktop 包与静态资源。"""

from desktop.app import main

raise SystemExit(main())
