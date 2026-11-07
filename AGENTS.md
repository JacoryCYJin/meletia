# Meletia

独立、本地优先的桌面词汇学习应用。学习设计按词书、每日新词、组内循环、拼写、间隔复习分层维护；CSV 导入、词条内容和调度分别维护，界面使用 Vue，桌面壳使用 Tauri。词库与复习记录仅存应用数据目录，个人词表和打包产物不得提交。

本项目开发入口为 `bash scripts/dev.sh start`，在工作区根目录使用 `bash scripts/dev.sh meletia start`。同一入口支持 stop、restart、status、logs、list、help 和 build。build 执行前端构建，验证执行 `npm test` 与 `npm run build`，打包执行 `npm run tauri build -- --bundles app,dmg`。发布和提交遵循外层工作区规则。

## 开发版运行与重启

- 检查运行状态必须只读。先核对本仓库的 `src-tauri/target/debug/meletia` 进程、`tauri dev` 父进程和 `127.0.0.1:1437` 的监听进程，确认它们属于同一条开发链路。禁止使用可能自动启动应用的名称或应用标识查找窗口，禁止为验证 dev 打开打包版 `Meletia.app`。
- 每次修改后判断是否需要重启。前端改动先验证热更新，确认 dev 已加载新版就复用现有进程。如果改动确实需要重启 dev，直接执行并验证，无需再次询问用户。
- 重启前确认端口归属，并检查打包版是否正在运行。发现打包版正在运行、端口归属不明或旧开发进程尚未退出时，报告冲突，避免启动第二个实例。重启使用 `bash scripts/dev.sh restart`，只停止已确认的本仓库开发链路及其子进程，确认端口释放后再启动并核对开发进程、端口和页面响应。
- 启动脚本自动加入 `~/.cargo/bin`。dev 与 build 日志分别保存到 `.dev/logs/dev.log` 和 `.dev/logs/build.log`，运行日志不提交。通过其他终端启动的实例会复用，但可能没有脚本日志。
