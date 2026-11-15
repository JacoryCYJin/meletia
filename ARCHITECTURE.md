# Meletia 架构

Meletia 是 Vue 3 + JavaScript + Tauri 2 的本地优先桌面词汇工具。代码按业务功能组织；打开一个文件应能看出它负责什么。

## 目录与职责

```
src/
  main.js                 样式导入顺序与应用挂载
  App.vue                 应用壳组合、加载状态、错误提示
  app/                    窗口级协调，不含业务规则
    useNavigation.js      页面路由、历史、滚动恢复
    useSidebar.js         侧栏宽度、拖动、动画、偏好存储
  storage/                唯一持久状态与提交边界
    store.js              state、loadLibrary、commit、cardById、setError
    persistence.js        library.json 路径/读写、浏览器预览、迁移调用
    migrate.js            STORE_VERSION、空库、旧存档迁移与备份协调
  shared/                 真正通用、无业务归属的组件与工具
    Icon.vue Modal.vue ToastHost.vue TypeAnswerInput.vue
    date.js notifications.js
  features/
    library/              词条内容与词条管理
      model.js            单词键、义项解析、标签、卡片创建/归一化
      actions.js          保存/删除词条
      browse.js           今日新增词过目
      LibraryView.vue    词书内词条列表与编辑入口
      BrowseView.vue
      components/        WordDetail、CardEditorDialog、DeleteCardDialog
    books/                词书模型与管理
      model.js            书标志、统计、更新时间
      actions.js          新建/重命名/更新/合并/删除入回收站
      BooksView.vue       词书列表与入口
      components/         CreateBookDialog、MergeBooksDialog、RenameBookDialog
    study/                背诵、复习、拼写
      scheduler.js        间隔阶梯
      model.js            背诵进度默认值与归一化、到期判断
      mastery.js          掌握状态与每日掌握记录
      progress.js         graduate/reviewCard/missSpelling
      choices.js          四选一释义生成
      session.js          学习/复习/拼写状态机、断点恢复
      tasks.js            今日学习队列
      summary.js          待学队列与小结
      actions.js          学习结果、复习日志、断点、撤销
      useStudySession.js  建组、断点恢复、上一词、下一组、保存/撤销协调
      export.js           词语状态导出
      StudyView.vue       学习页阶段组合与焦点协调
      components/         QuestionStage、SpellingStage、SpellingReadyStage、ExportStudyStatusButton
    dictation/            听写轨
      model.js            听写进度默认值与写入规则
      session.js          听写轮次状态机
      tasks.js            今日听写与自由练习队列
      actions.js          听写结果与日志
      useDictationRunner.js 共用轮次/播放/判分/计时
      useTodayDictation.js  今日页听写启动与自由练习协调
      DictationPanel.vue  DictationSummary.vue  FreePracticeDialog.vue
    import/               CSV 解析、映射、导入与撤销
      csv.js preview.js actions.js
      useImportFlow.js     单份表格草稿与导入流程状态
      ImportView.vue       流程界面组合
      CsvPreviewView.vue ImportBatches.vue
      components/         ReadOnlyCards、ColumnMapping、ImportFilters、ConflictResolver
    trash/                回收站规则与动作
    settings/             设置默认值与更新动作
    insights/             学习统计、日历、导出入口
    speech/               本地语音封装与发音按钮
    today/                今日页组合与任务入口
```

## 保留较长文件的理由

- `StudyView.vue`：题面/作答反馈、拼写、拼写前阶段已拆成组件；建组、断点恢复、上一词、下一组与保存/撤销已移入 `useStudySession.js`。页面保留阶段组合和焦点协调。
- `TodayView.vue`：今日任务展示与学习/听写启动入口；听写运行和自由练习已移入 `dictation/`。
- `useImportFlow.js`：约 300 行，集中持有单份导入草稿与流程状态；列映射、筛选、冲突确认已拆成展示组件。继续拆分会让草稿所有权分散，因此保留。
- `styles/base.css`：全局重置、排版、应用框架和通用控件；功能样式已迁到 `features/*/*.css`。

## 依赖方向

```
shared → features/*/model → storage → features/*/actions → features/*/UI → app
```

- `storage/migrate.js` 只引用各功能的纯 `model.js`。
- 功能 `actions.js` 只引用 `storage` 与纯模型，不引用其他功能的页面。
- `storage` 不引用任何 `actions.js`。
- 页面通过 props/events 和明确动作接口协作；不复制业务规则。
- `shared` 只放无业务归属的通用组件/工具。

## 状态与提交

- 唯一持久状态：`src/storage/store.js` 的 `state`。
- 唯一提交入口：`commit(next)`；先写盘成功，再 `Object.assign(state)`。
- 学习结果、复习日志和学习断点仍在同一次 `commit` 中写入。
- `state.busy` 提供并发保护；保存失败抛错并保留内存原值。
- 学习断点统一经 `resumeLearnCheckpoint` 校验；无效断点不会写入。
- `library.json` 顶层字段、版本、应用数据路径和浏览器预览键保持不变。

## 常见改动去哪里

| 想改什么 | 入口 |
| --- | --- |
| 答题/复习/拼写规则 | `features/study/session.js`、`progress.js`、`mastery.js` |
| 今日学习队列 | `features/study/tasks.js`、`summary.js` |
| 听写规则与队列 | `features/dictation/model.js`、`session.js`、`tasks.js` |
| 听写界面/自动播放/重播 | `features/dictation/useDictationRunner.js`、`DictationPanel.vue` |
| CSV 解析、列映射、导入 | `features/import/csv.js`、`preview.js`、`actions.js` |
| 存档格式与迁移 | `storage/migrate.js`、`persistence.js` |
| 词书操作 | `features/books/actions.js`、`model.js` |
| 词条内容与编辑 | `features/library/model.js`、`actions.js`、`LibraryView.vue` |
| 回收站 | `features/trash/model.js`、`actions.js` |
| 设置 | `features/settings/model.js`、`actions.js` |
| 统计/日历 | `features/insights/stats.js` |
| 语音 | `features/speech/speech.js`、`PronunciationButtons.vue` |
| 导航与侧栏 | `app/useNavigation.js`、`app/useSidebar.js` |

## 样式

- `styles/tokens.css`：设计 token。
- `styles/base.css`：重置、排版、应用框架、通用控件。
- `styles/dialogs.css`：通用弹窗与编辑器。
- 功能样式位于 `features/<feature>/*.css`，由 `main.js` 按原 `base.css` 段落顺序导入，保持同权重选择器的级联、断点和深色行为。

## 平台边界

- Tauri 命令名、参数和返回值不变：`load_library`、`save_library`、`migrate_library`、`save_study_export`、`speak_text`、`stop_speech`。
- Rust 模块：`main.rs` 只负责启动与命令注册；`library.rs` 负责词库读写/迁移/备份；`export.rs` 负责 CSV 导出；`speech.rs` 负责本地语音。
- 迁移备份、`.tmp` 原子替换、导出防覆盖和 UTF-8 行为不变。

## 审查参考

- 业务 JS 约 250 行、Vue SFC 约 400 行作为人工审查参考，不是硬性上限。
- 只有出现第二个可清晰命名的职责时才继续拆；不为压行数制造单次转发文件。
- 文件超过参考线时，应在变更说明里给出保留理由。

## 验证

```sh
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
bash scripts/dev.sh status
bash scripts/dev.sh restart
```

行为验证使用隔离数据或浏览器预览存储，不操作个人 `library.json`。
