# Morphvocab_lexiloop
🎯 A local-first vocabulary trainer with morpheme-chunk spelling, bidirectional mixed quizzes (EN↔CN) and shape-coded definitions — spaced repetition with a real-time pace/ETA dashboard. 零云依赖，本地运行。
# 智能背单词 · 看图背单词（Vocab Quiz）

一个本地运行的雅思单词学习系统：间隔重复（SRS）调度 + 8 种题型（含双向「组合拼写·混合」）+ 预生成 MP3 语音 + 实时战情仪表（正确率 / 配速 / 预计完成时间）+ GSAP 微动效。纯本地服务，零云依赖，进度存于服务端唯一账本。

## 功能特性

- **词书**：雅思 9523 词条（词性义项按使用频率降序跨词性交叉），短语与介词规则库
- **记忆调度**：SM-2 风格间隔重复（答对 ease↑/间隔乘法增长，答错归 1 天）；每日额度制 + 超额跨天自动摊开（不滚雪球）
- **题型**：看词选义 / 听音辨义 / 听中文选词 / 拼写默写 / 听中文写词 / 组合拼写（词根词缀拆块）/ 意象组合 / **组合拼写·混合**（同队列逐词随机「听中文拼英文」或「听英文选中文义」，自适应均衡防偏向）
- **形态转译学习法**：vt. 带宾语槽（说服某人）、vi. 动作感（往上升）、方式副词带「地」、名词事物化（升势）——不背语法标签，凭释义形态获得语法直觉
- **实时仪表**：每场独立的正确率（0.1% 精度）/ 每分钟词数 / 预计剩余时间，5 秒时钟驱动
- **语音**：预生成小晓（zh-CN-XiaoxiaoNeural）逐义项 MP3，多音字声音层替换（地→第 dì、得体→德体）
- **可靠性别册**：服务端唯一账本（rev 防覆盖）、音频三重看门狗（软复位 / 45s 硬超时 / playGuard）、34 条历史 bug 手册

## 快速部署

```bash
# 1. Python 3.10+ 环境
python -m venv .venv
.venv\Scripts\activate            # Windows；Linux/macOS: source .venv/bin/activate
pip install edge-tts              # 唯一依赖（音频再生成用）

# 2. 启动本地服务（端口 8901）
cd webapp
python server.py

# 3. 浏览器打开
# http://127.0.0.1:8901/
```

> 首次开箱即可用（浏览器 TTS 兜底发声）；要零延迟小晓音色，见下节生成音频缓存。

## 音频缓存（约 805MB，55558 个 MP3）

**Release 完整包**已内置全部音频（英文词 + 中文释义 + 逐义项 + 词性名，小晓音色），解压即零延迟发声。**仓库源码版**不含音频（Git 不适合放大文件），一条命令按需增量生成（需联网，调微软 edge-tts 免费接口）：

```bash
python tools/gen_tts_audio.py            # 全量（英文词 + 中文释义 + 逐义项，断点续跑）
python tools/gen_tts_audio.py --en-only  # 只英文
python tools/gen_tts_audio.py --sense    # 只逐义项中文
```

生成器自带：断点续跑、索引渐进落盘（页面每 2 分钟自动拉新）、单侧跑不清另一侧索引。首次全量约数小时，可随时中断重跑。

## 项目结构

```
webapp/
  server.py              本地服务 8901：静态 + /api/state（rev 校验 409 拒旧）+ /api/report + /api/plan
  index.html / app.js / style.css   前端单页应用（版本号纪律：?v=N 随代码递增，页脚 APP_VER）
  lib/gsap.min.js        GSAP 3.13（见 lib/LICENSE-GSAP）
  data/
    ielts.js             词书 9523 词条（window.IELTS_WORDS）
    phrases.js           生活短语库
    prepositions.js      介词规则库
    vp_map.js            介词动词映射（词 → {义项下标: 介词}）
    chunk_map.js         词根词缀拆块表（词 → [[块,块义],...]）
    audio_index.js       音频索引（文本 → MP3 路径，哈希键）
tools/
  gen_tts_audio.py       音频批量生成（edge-tts）
  build_webapp_words.py  词书转换器（OVERRIDES 校对表）
  v2_*.py / *_check.js   词义工程流水线（校验器/合并器）
  prompts/*.md           子代理任务规范（唯一权威源，防漂移）
docs/
  BUG审查手册.md          34 条历史 bug + 新模式上线 12 条自查清单
  中文工程总规范.md        词义工程根规范
  拆块规范-词根词缀制.md
  学习调度规范.md          常用词优先 + 出错词退出 + 每日检查清单
```

## 排障指南（Troubleshooting）

| 症状                    | 原因与解法                                                   |
| ----------------------- | ------------------------------------------------------------ |
| 打开页面是旧版本行为    | 浏览器缓存——服务端已发 `Cache-Control: no-store`，Ctrl+F5 强刷；页脚 APP_VER 应与 `app.js` 内 `APP_VER` 一致 |
| 端口 8901 被占用        | 已有服务在跑，直接用即可；或 `netstat -ano | findstr 8901` 找 PID 结束后重启 |
| 页面 404 / 无法连接     | server.py 未启动或不在 webapp 目录下运行（工作目录必须是 webapp/） |
| 完全没有声音            | ①音频缓存未生成——跑 gen_tts_audio.py 或依赖浏览器 TTS（检查系统音量/静音）；②长会话音频假死——页面会自动弹「🔄 一键恢复声音」，点击即可（进度实时已存）；③中文 TTS 需浏览器支持 zh-CN |
| 进度"回滚"              | 多标签页旧快照——系统有 rev 版本号 + 409 拒旧防护，关多余标签只留一个；服务端 `data/state.json` 是唯一事实源 |
| 修改词书/释义后朗读不对 | 音频按释义文本哈希缓存——文本变了自动落新键，重跑 `gen_tts_audio.py --sense` 生成 |
| 拼写判分不认我的答案    | 判分忽略大小写与空格；介词动词必须带介词（abideby ✓ / abide ✗） |
| 每日任务量突然变大      | 间隔重复的正常波动：错词次日回访 + 对词 2~3 天回归 + 新词首复三股流叠加；每日上限封顶，超额自动摊到后续日期 |

**开发纪律**（改代码前必读 docs/BUG审查手册.md）：改 app.js/style.css/index.html 任一文件必须递增 index.html 的 `?v=N` 与 `APP_VER`；测试一律走 `http://127.0.0.1:8901/?test=1` 沙盒（独立存档、不碰真实账本）。

## 许可

- 本项目代码：未指定（建议上传者自行添加 LICENSE，如 MIT）
- GSAP 3.13：GreenSock 标准许可（2025 起 100% 免费含商用），见 lib/LICENSE-GSAP
- 语音：微软 edge-tts 在线接口生成，仅供个人学习使用
