# UE4 性能优化工具 Unreal Insights 的应用

> 参考官方文档：https://dev.epicgames.com/documentation/zh-cn/unreal-engine/unreal-insights?application_version=4.27

## 一、工具简介

Unreal Insights 是 UE4/UE5 内置的**全量录制式性能分析工具**，可以持续录制所有帧的数据，事后回放分析。它是 Epic 从 UE4.24 开始引入并持续完善的**官方主推**性能分析方案。

**基本工作流程：**

1. 启动游戏时添加 trace 启动参数
2. 正常游玩，经过卡顿场景
3. 关闭游戏后，用 Unreal Insights 工具打开生成的 `.utrace` 文件
4. 在时间轴上可以清楚看到每一帧的耗时峰值，直接定位到卡顿帧并展开分析

---

## 二、使用方法

### 2.1 启动参数

核心启动参数：

```
-trace=gpu,cpu,frame,bookmark -statnamedevents
```

**参数说明：**

| 参数 | 作用 |
|------|------|
| `-trace=cpu` | 录制 CPU 线程事件 |
| `-trace=gpu` | 录制 GPU 耗时数据 |
| `-trace=frame` | 录制帧边界标记 |
| `-trace=bookmark` | 录制书签事件 |
| `-statnamedevents` | 将 stat 系统的命名事件也写入 trace，可以看到更详细的函数级耗时 |

### 2.2 添加启动参数的位置

#### 方式一：编辑器内启动（最常用）

在 UE4/UE5 编辑器中：

- 打开 **Edit → Project Settings → Play**（或者 **编辑 → 项目设置 → 运行**）
- 找到 **Additional Launch Parameters**（额外启动参数）
- 在输入框中填入启动参数
- 之后点 Play 运行游戏时就会自动带上这些参数

#### 方式二：编辑器工具栏的 Play 下拉菜单

在编辑器工具栏的 **Play** 按钮旁边的下拉箭头中：

- 选择 **Advanced Settings...**
- 在 **Additional Command Line Parameters** 中填入参数

#### 方式三：独立运行（Standalone）方式

通过命令行启动打包后的游戏或编辑器：

```bash
# 启动打包后的游戏
YourGame.exe -trace=gpu,cpu,frame,bookmark -statnamedevents

# 启动编辑器
UE4Editor.exe YourProject.uproject -trace=gpu,cpu,frame,bookmark -statnamedevents
```

#### 方式四：快捷方式添加

右键游戏的 `.exe` 快捷方式 → **属性** → 在 **目标(Target)** 栏的路径末尾追加参数：

```
"X:\path\to\YourGame.exe" -trace=gpu,cpu,frame,bookmark -statnamedevents
```

### 2.3 .utrace 文件的位置

录制完成后，`.utrace` 文件默认保存在：

```
项目目录/Saved/TraceSessions/
```

### 2.4 打开 Unreal Insights 工具

Unreal Insights 是一个独立程序，位于引擎安装目录下：

```
Engine/Binaries/Win64/UnrealInsights.exe
```

启动后，它会自动扫描并列出可用的 `.utrace` 文件，也可以手动拖入或打开文件进行分析。

### 2.5 自定义 Trace 事件

可以在 C++ 代码中插入自定义的 Trace 事件，这些事件会出现在 Insights 的时间轴上，方便追踪特定业务逻辑的耗时：

```cpp
// C++ 中
TRACE_CPUPROFILER_EVENT_SCOPE(MyCustomEvent);

// 或使用宏
SCOPED_NAMED_EVENT(MyFunction, FColor::Red);
```

---

## 三、Unreal Insights 相比 stat 工具的优势

Unreal Insights 和 `stat unit` / `stat startfile` 都是 UE 引擎内置的性能分析工具，但它们的定位和能力差异很大。`stat unit` 提供实时帧率显示，`stat startfile` 可以录制 `.ue4stats` 文件用于事后分析，而 Unreal Insights 则是 Epic 官方主推的全量录制式深度分析方案。

### 3.1 全量录制 vs 实时快照

| 特性 | Unreal Insights | stat unit（实时） | stat startfile（录制） |
|------|----------------|-------------------|----------------------|
| 数据方式 | **全量录制**，持续记录每一帧的数据 | **实时显示**，只能看到当前帧的瞬时数据 | 录制 `.ue4stats` 文件，事后在 Session Frontend 中分析 |
| 回溯能力 | 可以事后回放任意时间段 | 无法回溯，错过就看不到了 | 支持事后回看，但体验一般 |

> 这意味着你不需要盯着屏幕等卡顿出现，正常游玩后再回头分析即可。

### 3.2 数据粒度更细

- **stat unit**：只能看到粗略的 Game Thread / Render Thread / GPU 三大线程的总耗时
- **stat startfile**：可以记录 CPU 端的 stat 统计数据，粒度中等
- **Unreal Insights**：
  - 可以展开到**每个函数级别**的耗时
  - 支持查看 CPU 各线程的详细调用栈
  - 支持 GPU 事件的详细分析
  - 可以看到具体是哪个 Actor、哪个 Tick、哪个 RPC 导致的耗时

### 3.3 可视化时间轴

Unreal Insights 提供了**时间轴视图**，可以：

- 直观看到帧耗时的波动曲线
- 快速定位**耗时峰值帧**（卡顿帧）
- 缩放到具体帧，展开查看该帧内所有事件的时序关系
- 多线程并排对比，发现线程间的等待和阻塞

而 `stat unit` 只是屏幕角落的几个数字，无法看到趋势和上下文；`stat startfile` 的 Session Frontend Profiler 虽然有基础时间轴，但交互体验较老旧，大文件加载慢。

### 3.4 支持多种 Trace Channel

Unreal Insights 支持多种数据通道，可以按需组合：

| Channel | 说明 |
|---------|------|
| `cpu` | CPU 线程事件和函数调用 |
| `gpu` | GPU 渲染事件耗时 |
| `frame` | 帧边界标记 |
| `bookmark` | 自定义书签事件 |
| `memory` | 内存分配和释放追踪 |
| `loadtime` | 资源加载耗时 |
| `file` | 文件 I/O 操作 |

`stat unit` 只能看到线程级别的总耗时；`stat startfile` 主要记录 CPU stat 数据，不支持 GPU、内存等维度。

### 3.5 录制开销对比

- **stat unit**：开销极小，但只能实时查看
- **stat startfile**：录制开销**较高**，录制期间对游戏性能有明显影响，录制到的数据可能不完全反映真实运行情况
- **Unreal Insights**：trace 系统经过专门优化，录制开销**极低**，几乎不影响帧率，数据更接近真实表现

### 3.6 离线分析与团队协作

- **stat unit**：只能在运行时查看，数据无法保存和分享
- **stat startfile**：可以录制 `.ue4stats` 文件离线分析，但文件体积较大，分享和协作能力有限
- **Unreal Insights**：
  - 录制后生成 `.utrace` 文件，可以在**另一台电脑**上用独立工具打开分析
  - `.utrace` 文件可以**分享给其他同事**，让不在现场的人也能分析问题
  - 支持添加书签和标记，方便沟通定位问题
  - 文件更紧凑，采用高效的二进制流式写入

### 3.7 Unreal Insights (.utrace) vs stat startfile (.ue4stats) 详细对比

| 维度 | stat startfile (.ue4stats) | Unreal Insights (.utrace) |
|------|---------------------------|--------------------------|
| **录制开销** | 较高，录制期间对游戏性能有明显影响 | 极低，专门优化过的 trace 系统，几乎不影响帧率 |
| **文件体积** | 较大，长时间录制会产生巨大文件 | 更紧凑，采用高效的二进制流式写入 |
| **分析工具** | 编辑器内置的 Session Frontend Profiler，功能较老旧 | 独立的 Unreal Insights 应用，UI 更现代，交互更流畅 |
| **时间轴导航** | 支持但体验一般，大文件加载慢 | 流畅的缩放和平移，支持大规模数据的快速浏览 |
| **数据通道** | 主要是 CPU stat 数据 | 支持 CPU、GPU、内存、文件 I/O、资源加载等多种通道 |
| **GPU 分析** | 不支持或支持有限 | **原生支持 GPU trace**，可以看到渲染管线各阶段耗时 |
| **内存分析** | 不支持 | 支持内存分配追踪（`-trace=memory`） |
| **实时连接** | 不支持 | 支持**实时连接**正在运行的游戏进行分析 |
| **版本趋势** | UE4 时代的老工具，Epic 已不再重点维护 | Epic 当前**主推**的性能分析方案，持续更新中 |

---

## 四、总结

### 三种工具的定位对比

| 维度 | stat unit（实时） | stat startfile (.ue4stats) | Unreal Insights (.utrace) |
|------|-------------------|---------------------------|--------------------------|
| 使用门槛 | ⭐ 极低，控制台输入即可 | ⭐⭐ 控制台命令录制 | ⭐⭐ 需要添加启动参数 |
| 数据深度 | 浅（线程级总耗时） | 中（CPU stat 数据） | **深（函数级调用栈 + 多维度）** |
| 回溯分析 | ❌ 不支持 | ✅ 支持 | ✅ 完整回放 |
| 可视化 | 简单数字 | 基础时间轴 | **完整时间轴，交互流畅** |
| 录制开销 | 无 | 较高 | **极低** |
| GPU 分析 | ❌ | ❌ | ✅ |
| 内存分析 | ❌ | ❌ | ✅ |
| 离线分析 | ❌ | ✅ | ✅ |
| 团队协作 | ❌ | ⚠️ 有限 | ✅ 可分享 .utrace |
| 适用场景 | 快速粗略检查 | 简单的事后分析 | **深度性能分析** |

### 推荐使用策略

- **日常开发**：先用 `stat unit` 快速判断当前帧率是否正常
- **发现问题后**：使用 Unreal Insights 深入定位"为什么卡"以及"卡在哪里"
- **`.ue4stats` 录制**：如果项目还在用 UE4 且习惯了 stat 录制的工作流，继续用也没问题；但如果是新项目或者需要更深入的分析，建议迁移到 Unreal Insights