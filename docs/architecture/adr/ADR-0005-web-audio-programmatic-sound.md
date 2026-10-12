# ADR-0005：零音频资产 —— Web Audio API 程序化合成音效

- **状态**：已采纳（Accepted）
- **日期**：2026-09
- **决策者**：技术负责人
- **相关代码**：`src/utils/sound.ts`（139 行）、`src/hooks/useBoardSound.ts`（58 行）

---

## 背景

对弈类应用的音效承担一个明确的功能：**操作确认反馈**。落子需要即时听觉确认（用户点击后眼睛可能仍在棋盘另一处），胜负需要清晰的区分提示。

常规做法是引入音频资产（`.mp3`/`.wav`/`.ogg`），这带来：

1. **体积**：每个音效几十 KB，一套（落子 + 翻转 + 跳过 + 胜 + 负 + 平 + 非法）通常 100–300 KB
2. **首屏或运行时网络请求**：需要加载时机管理、静音前的加载浪费
3. **格式协商**：为兼容不同浏览器可能需要多格式（≈ 体积再乘 2）
4. **版权与来源**：音效来源需要授权确认
5. **构建流水线的一环**：资产目录、复制、指纹、缓存策略

而本作对音效的全部需求是：**几个短促的单音/和弦**（落子"嗒"、翻转泛音、跳过下行两音、胜利上行琶音、失败下行小调、平局同度双音、非法低音提示）。

这些**全部是振荡器 + 包络的组合**，不需要任何采样。

同时项目的整体约束是「零运行时依赖」（`package.json:20-23` 只有 react / react-dom / react-router-dom）与「产物极简」（实测首屏 JS 64.27 KB gzip），音效方案必须与之相容。

## 决策

**用 Web Audio API 的 `OscillatorNode` + `GainNode` 实时合成全部音效，项目内零音频文件。**

具体实现：

### 1. 单一合成原语：指数包络的短音

`sound.ts:75-90` 的 `tone()` 是全部音效的唯一定音器：

```ts
const osc = ac.createOscillator();
const g = ac.createGain();
osc.frequency.setValueAtTime(freq, t0);
g.gain.setValueAtTime(0.0001, t0);                      // 从近静开始
g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);  // 12ms attack
g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);   // 指数衰减
osc.connect(g); g.connect(ac.destination);
osc.start(t0); osc.stop(t0 + dur + 0.03);
```

**关键设计点**：
- **从 0.0001 起步而不是 0**（`:83`）：`exponentialRampToValueAtTime` 要求正值，从 0 起步会抛异常。同时这也消除了爆音（click）。
- **`osc.stop()` 多留 30 ms**（`:89`）：让振荡器自然结束，避免节点在包络结束瞬间被硬切产生的咔哒声。
- **12 ms attack**（`:84`）：极短的起音，模拟"清脆"的木质敲击感。

`sound.ts:92-94` 的 `arp()` 在 `tone()` 之上叠一个固定步长的延迟，实现琶音。

### 2. 七个音效全部由这两个原语组合而成

| 音效 | 位置 | 合成方式 | 波形 | 时长 |
|---|---|---|---|---|
| 落子 | `playPlace` `:97-101` | 两音 `520Hz` + `760Hz`（延迟 45 ms），triangle | triangle | 90/70 ms |
| 翻转 | `playFlip` `:104-107` | 单音 `900Hz` | sine | 60 ms |
| 跳过 | `playPass` `:110-114` | 下行两音 `440→330Hz`（延迟 100 ms） | sine | 120/160 ms |
| 胜利 | `playWin` `:117-120` | 上行琶音 `[523.25, 659.25, 783.99, 1046.5]`，步长 90 ms（纯五度叠置大三和弦） | triangle | 4 × 180 ms |
| 失败 | `playLose` `:123-126` | 下行 `[440, 349.23, 261.63]`，步长 120 ms | sine | 3 × 180 ms |
| 平局 | `playDraw` `:129-133` | 同度双音 `523.25Hz` 重复 | triangle | 160/160 ms |
| 非法 | `playInvalid` `:136-139` | 低音 `160Hz` | **square** | 120 ms |

**设计上是有意图的**（`playWin` 的纯五度上行 vs `playLose` 的小三度下行，是音乐中最基本的「明/暗」对比），不是随手取值。

### 3. AudioContext 懒创建 + 手势解锁

`sound.ts:47-64` 的 `getCtx()`：
- `:48` `typeof window === 'undefined'` 直接返回 null → **SSR / Node / vitest 安全**
- `:50-57` 首次调用才 `new AC()`，并兼容旧 Safari 的 `webkitAudioContext`（`:53`）
- `:58-59` **`state === 'suspended'` 时 `resume()`** —— 浏览器自动播放策略要求用户手势后才能出声

`sound.ts:6-8` 的注释给出了关键论证：**「首个落子本身即用户手势，可解锁」**。落子必然由 `click` 触发（`Cell.tsx:65` 的 `onClick`），因此解锁时机天然成立 —— 不需要额外的"点击任意处启用声音"引导。

`:59` 的 `void ctx.resume().catch(() => {})` 吞掉 resume 失败（`:61-63` 另有 try/catch 兜底）→ **任何 AudioContext 异常都降级为无声，而非崩溃**。

### 4. 全局静音开关，持久化到 localStorage

`sound.ts:13` 键 `othello_sound`，`:15` 模块加载时 `readInitialEnabled()` 读取，`:18-26` 带 try/catch（隐私模式）。
- `getSoundEnabled()` `:28` / `setSoundEnabled()` `:32` / `toggleSound()` `:42`
- **每个音效函数的第一行都是 `if (!enabled) return;`**（`:98,105,111,118,124,130,137`）→ 静音时零开销，连 `getCtx()` 都不调

UI 侧：`Room.tsx:245-273` 与 `AIGame.tsx:329-357` 各有一个开关（视觉完全相同的两段重复 UI），`Room.tsx:39-41` 调 `toggleSound()`。

### 5. 触发时机由 Hook 集中管理

`sound.ts` 只提供 `playXxx()` 原语，**不关心何时播**。这个职责在 `useBoardSound.ts`（58 行）：

| 规则 | 位置 | 实现 |
|---|---|---|
| 首次挂载不播音 | `useBoardSound.ts:38-43` | `prevCount === null` 时只记基线 |
| `moveCount` 净增且在 playing → 播落子音 | `:51-53` | `state.moveCount > prevCount && state.status === 'playing'` |
| 轮询导致的无变化更新不播音 | `:12-14` 注释 | 因为 `moveCount` 未变，条件不成立 |
| 重开（`moveCount` 归零）不播音 | `:13` 注释 | 条件不成立 |
| 进入 finished → 按视角播胜/负/和 | `:45-50` | `prevStatus !== 'finished' && state.status === 'finished'` |

**视角解析由调用方注入**（`resolveOutcome`）：
- `Room.tsx:78-85`：旁观者（`myColor === null`）→ 播中性「和」音
- `AIGame.tsx:86`：以玩家执子为基准判胜负

`:21-23` 用 `cbRef` 持有 `resolveOutcome`，注释明说「避免其引用变化导致每次渲染都跑 effect」—— **避免了闭包导致的重复播放**，是一个真实踩过的坑。

## 后果

**正面**：

- **零资产、零字节传输**。无音频文件 → 首屏无音频请求、无 preload、无解码、无缓存策略。`dist/` 总计 228 879 B（`performance-budget.md` §1.1），其中 0 B 是音频。
- **音效播放零延迟**。合成在用户手势后立即发生（~1 ms），不存在音频文件下载/解码导致的"音效慢半拍"。这是程序化合成相对采样最直接的优势。
- **零版权风险**。所有频率与包络由代码给定，无第三方授权问题。
- **参数可调**。调整音色是改一个数字（`sound.ts:99` 的 `520`），而非用音频编辑器重新导出 mp3 并等待构建复制。
- **无障碍降级双侧到位**：`prefers-reduced-motion` 在 CSS 侧关闭全部动画（`index.css:452-460`）且在 JS 侧跳过翻转态（`Cell.tsx:36`）。声音侧无对应降级需求（不涉及运动），但开关可被用户随时关闭并持久化。
- **静默开销为 0**：静音时所有 `playXxx` 首行即 return。
- **测试友好**：`sound.ts` 的所有导出函数在无 `window`/`AudioContext` 环境下安全降级（`:48,61-63`），因此页面级测试（`Room.test.tsx` / `AIGame.test.tsx`）无需 mock 音频。

**负面 / 代价**：

1. **音色受振荡器波形限制**。可用波形仅 `sine` / `triangle` / `square` / `sawtooth`（`sound.ts:69` 的 `OscillatorType`），无采样音色、无包络塑形滤波器、无混响。听感偏「电子/合成器」，与真实木质落子声有差距。
   **判定：可接受。** 音效在此承担的是功能反馈（确认操作、区分胜负），不是氛围营造。胜利用纯五度上行、失败用小三度下行（`:119` vs `:125`）已足以传达语义。
2. **无音量分级**。只有一个全局开关（`othello_sound`），无音量滑杆，`gain` 值硬编码（`:75` 的默认 0.16，`:99-100` 等逐音覆盖）。
   **判定：可接受。** 用户要静音就静音，音量调节是更高阶的需求。
3. **`getCtx()` 无复用失效处理**。若 `AudioContext` 因某种原因进入 `closed` 状态，`:50` 的 `if (!ctx)` 为假，不会重建 → **音效永久静默直到刷新页面**。
   **判定：低危。** `closed` 状态在正常浏览中几乎不会发生（且页面刷新成本极低）。修法约 3 行（加 `|| ctx.state === 'closed'` 判断）。**记入技术债。**
4. **音效 UI 在 `Room.tsx` 与 `AIGame.tsx` 中重复**。两段开关 JSX 几乎完全相同（`Room.tsx:245-273` ≈ `AIGame.tsx:329-357`，各约 29 行）。同样的重复也存在于"显示落子提示"开关（`Room.tsx:220-243` ≈ `AIGame.tsx:304-327`）。
   **共约 58 行重复 JSX。** 抽 `<ToggleRow>` 组件可省约 30 行。
   **判定：打磨期不重构**（纯 UI 重构，收益低、回归风险非零），但**记入技术债** —— 这是全项目最明显的一处可抽取重复。
5. **`matchMedia` 在 `Cell.tsx:36` 每次翻转新建 MediaQueryList**（无缓存）。与本 ADR 无关，属 `performance-budget.md` §3.6 已记录的同源小项。
6. **`playFlip`（`playFlip`, `:104-107`）实际未被调用**。`useBoardSound.ts:3` 只 import 了 `playPlace/playWin/playLose/playDraw` —— 翻转音效与 `playPass`、`playInvalid` 目前是**死代码**。
   **判定：低危。** `sound.ts:1-4` 的注释把 `playFlip` 标为「可选，跟随落子」（`:103`），是有意为将来保留的 API。不构成负担（三处 `if (!enabled) return` 各 1 行）。

## 替代方案

| 方案 | 为何未采纳 |
|---|---|
| **A. 引入 mp3/ogg 音频资产** | +100–300 KB 体积（破坏已达标的 64.27 KB gzip 首屏预算，余量仅 15.7 KB）、+网络请求与加载时机管理、+多格式协商、+版权来源确认。**与项目的零依赖、极简产物约束直接冲突。否决。** |
| **B. 引入采样音效库（如 Howler.js）** | 引入运行时依赖（违反零运行时依赖约束）+ 库体积（数十 KB gzip）+ 它解决的是「播放采样」问题，而本作**不需要采样**。用一个大库来做 Web Audio 的薄封装是本末倒置。**否决。** |
| **C. 不做音效** | 落子与胜负反馈纯视觉。**判定：这是可接受的替代方案**（很多在线棋类无声）。但本作已投入做了这套方案且工作良好，功能反馈（尤其"跳过回合"这种非视觉可见事件）确有价值。**保留现状。** |
| **D. CSS 动画驱动的伪音效** | 不存在这种技术。**否决。** |
| **E. Web Audio 但用采样（AudioBuffer）加载极短 base64 内联音频** | 规避了网络请求，但 base64 会让体积膨胀 33%，且仍需异步 `decodeAudioData`（失去"零延迟"优势）、仍是采样波形（放弃本 ADR 的参数可调性）。**相比本方案无任何优势。否决。** |
| **F. Tone.js 等音乐库** | 一个八度音符效果引入数百 KB 的库。**否决。** |

## 验证与失效条件

**已验证（自动化 / 本机实测）**：
- `npm test` 全量实测：14 文件 / 126 用例通过（2026-10-12），其中 `Room.test.tsx`（11 用例）与 `AIGame.test.tsx`（11 用例）在 jsdom 环境下渲染含音效逻辑的页面**无需任何音频 mock** —— 证明 `sound.ts` 的降级路径（`sound.ts:48,61-63`）有效
- `npm run build` 实测：`dist/` 中无任何音频产物；产物总计 228 879 B

**需人工验证（体验性，无法自动化）**：
- 实际音色是否可接受（尤其 `playWin` / `playLose` 的区分度）
- 音量是否偏大/偏小（`gain` 硬编码，当前值 0.06–0.16）
- **浏览器自动播放策略下，首个落子的音效是否可靠响起**（`sound.ts:58-59` 的 `resume()` 路径）
- 移动端静音开关是否真的能切换到 `suspended`

**失效条件（应重新评估本决策）**：
1. 产品要求"沉浸式"音效体验（真实木质敲击、环境音）→ 采样资产成为必需
2. 需要背景音乐 → 程序化合成勉强可做，但变长音频的循环/无缝衔接会暴露 Web Audio 方案的能力边界
3. 需要用户自定义音效 → 必须改为上传/采样路径
