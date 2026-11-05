# Meletia

独立、本地优先的桌面词汇学习应用。学习设计按词书、每日新词、组内循环、拼写、间隔复习分层维护；CSV 导入、词条内容和调度分别维护，界面使用 Vue，桌面壳使用 Tauri。词库与复习记录仅存应用数据目录，个人词表和打包产物不得提交。

开发命令为 `npm run tauri dev`，验证执行 `npm test` 与 `npm run build`，打包执行 `npm run tauri build -- --bundles app,dmg`。发布和提交遵循外层工作区规则。
