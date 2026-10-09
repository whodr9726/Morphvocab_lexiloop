# AGENTS.md — 给 AI 助手读的项目指南

> 本文件供 AI 编程助手（Claude Code / Cursor / ZCode 等）在本仓库工作时阅读。人类开发者请先读 README.md。

## 项目一句话

本地单词学习系统：Python 单文件静态服务（webapp/server.py，8901 端口）+ 原生 JS 单页应用（app.js）+ 词书数据文件（webapp/data/*.js）+ 音频/词义工程流水线（tools/）。

## 铁律（违反会出事故，全部来自真实教训）

1. **测试一律走 `http://127.0.0.1:8901/?test=1` 沙盒**（TEST_MODE：独立 localStorage、不读写服务端账本、不上传报告）。绝不驱动用户的真实页面或真实账本（webapp/data/state.json）。
2. **版本号纪律**：改 app.js / style.css / index.html 任一文件，必须同时递增 index.html 里的 `?v=N` 引用参数和 app.js 里的 `APP_VER` 字符串。排查行为问题前先让用户核对页脚版本号。
3. **state.json 是唯一事实源**：服务端整份账本 + rev 版本号，POST 低 rev 会被 409 拒绝。AI 直写账本流程：先备份 → rev+100 → 用户刷新后采纳。任何批量写词进度禁止覆盖 `due >= 今天` 的词（防回退）。
4. **词性/释义改动同步七处**：POS_CN、ZH_POS_CN、zhReadSeq 正则、gen_tts_audio.py 的 POS_NAME 与义项正则、validator 的 POS_OK 与 POS_RE（详见 docs/BUG审查手册.md B34）。
5. **正则与替换回调是强耦合对**：改任一必查其二；改完必须在页面上用真实函数跑多词性样例验收（B23 三次复发教训）。
6. **改任何题型/模式前先对照 docs/BUG审查手册.md**（34 条历史 bug + 新模式上线 12 条自查清单），出新 bug 追加进手册，不要另开文件。

## 核心机制速查

- **数据流**：答题 → applyResult() → gradeCorrect/gradeWrong（SRS：iv/ease/due）→ save()（rev+1，防抖 POST /api/state）
- **音频**：pumpSpeech 队列 + 播放令牌（playToken）+ 三重看门狗（3s 软复位 / 45s 硬超时 / playGuard 3s）；MP3 按文本哈希缓存，文本变更自动落新键
- **中文朗读管线**：zhSpeakText / zhReadSeq（前 N 义，词性变化才报词性）/ sanitizeZhText；声音层替换（地→第、得体→德体）只在 TTS 输入层，显示与索引键不变
- **chunkMix（组合拼写·混合）**：session.mixDir 逐词随机定向（自适应均衡），zh 向拼英文字母块、en 向选中文义块（块数跟设置 N，词性跟朗读词性开关）；判分 sameModules（顺序无关）
- **形态转译学习法**（docs/中文工程总规范.md）：vt. 带某槽 / vi. 动作感（往上升）/ 方式副词带地 / 名词事物化（升势）——释义形态承载词性，不加语法标签

## 词义工程流水线（tools/）

规范提示词在 tools/prompts/（唯一权威源，禁止转述改写）；校验器 `*_check.js`；合并器 `v2_*.py / *_merge.py`。流程：切批 → 子代理按规范产出 → 机检 → 合并（不变量断言：词数守恒、未修义逐字节保留、条数冻结）→ 增量音频 → 版本递增 → 一次性推送（静态替换对运行中页面不可见）。

## 常用命令

```bash
cd webapp && python server.py              # 起服务
python tools/gen_tts_audio.py --sense      # 增量生成逐义项音频
python tools/build_webapp_words.py         # 从 lexicon 重建词书（含 OVERRIDES 校对表）
```
