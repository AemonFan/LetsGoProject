# 5.2. 资源打包API

## 1. 概述

资源打包系统由多个核心组件协同工作：UnrealPak工具负责Pak文件的创建和分发，CookOnTheFlyServer用于实时资源烹饪，CookPlatformManager管理多平台烹饪适配。整个系统通过命令行工具、队列管理和平台适配接口实现从资源格式转换到分包存储的完整流程，支持多平台资源部署和增量更新。资源打包工作流程在业务流程文档(2.3 资源打包流程)中已详细描述，本文档聚焦于具体的API接口使用。

```mermaid
graph TD
    A["UnrealPak<br/>资源打包工具"] -->|创建Pak文件| B["Pak文件系统"]
    C["CookOnTheFlyServer<br/>烹饪服务器"] -->|实时烹饪资源| D["Resource Queue"]
    E["CookPlatformManager<br/>平台管理器"] -->|平台适配| F["Platform Data"]
    D -->|写入| B
    F -->|配置| C
    G["FPakOrderMap<br/>顺序映射"] -->|优化加载| B
    H["FPackageData<br/>包数据跟踪"] -->|状态管理| D
```

> Sources:
> [UnrealPak.cpp](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Programs/UnrealPak/Private/UnrealPak.cpp#L1)

## 2. UnrealPak API

UnrealPak工具提供完整的Pak文件操作接口。主入口函数`INT32_MAIN_INT32_ARGC_TCHAR_ARGV`处理命令行参数，初始化引擎环境后调用`ExecuteUnrealPak`执行核心逻辑。命令行参数支持创建Pak文件(-Create)、测试完整性(-Test)、提取内容(-Extract)、列出内容(-List)、比较差异(-Diff)、批量处理(-Batch)等功能。加密密钥通过KeyChain结构处理，支持多平台适配配置。

```mermaid
flowchart LR
    A["命令行参数"] --> B["INT32_MAIN入口"]
    B --> C["GEngineLoop.PreInit"]
    C --> D["ExecuteUnrealPak"]
    D --> E{操作类型}
    E -->|Create| F["创建Pak文件"]
    E -->|Test| G["测试完整性"]
    E -->|Extract| H["提取内容"]
    E -->|List| I["列出内容"]
    E -->|Diff| J["比较差异"]
    E -->|Batch| K["批量处理"]
    F --> L["加密与压缩"]
    G --> L
    H --> L
    I --> L
    J --> L
    K --> L
    L --> M["输出Pak文件"]
```

RunUnrealPak函数在AutomationTool中提供自动化打包接口，通过GetUnrealPakArguments构建命令行参数，GetUnrealPakLocation获取工具路径。典型调用示例：`UnrealPak.exe Game.pak -create=ResponseFile.txt -order=OrderMap.txt -compression=Oodle -encrypt`

> Sources:
> [UnrealPak.cpp](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Programs/UnrealPak/Private/UnrealPak.cpp#L1), [PakFileUtilities.h](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Developer/PakFileUtilities/Public/PakFileUtilities.h#L1)

## 3. FPakOrderMap API

FPakOrderMap类管理Pak文件中文件的顺序索引以优化资源加载性能。核心方法包括：`Add`添加文件名和排序索引，`AddOffset`添加文件名和偏移量，`ConvertOffsetsToOrder`将偏移量转换为顺序索引，`GetFileOrder`查询文件顺序，`Empty`清空数据，`Num`获取元素数量。OrderMap存储文件名到顺序/偏移量的映射，MaxPrimaryOrderIndex记录最大主顺序索引。

```mermaid
sequenceDiagram
    participant Client
    participant FPakOrderMap
    participant OrderMap
    participant MaxIndex
    
    Client->>FPakOrderMap: AddOffset("Texture.uasset", 100)
    FPakOrderMap->>OrderMap: 存储偏移量映射
    Client->>FPakOrderMap: AddOffset("Mesh.uasset", 200)
    FPakOrderMap->>OrderMap: 存储偏移量映射
    Client->>FPakOrderMap: ConvertOffsetsToOrder()
    FPakOrderMap->>OrderMap: 遍历并转换
    FPakOrderMap->>MaxIndex: 更新最大索引
    Client->>FPakOrderMap: GetFileOrder("Mesh.uasset")
    FPakOrderMap-->>Client: 返回排序索引(1)
```

通过顺序优化，频繁访问的资源可以放置在Pak文件开头，减少磁盘寻址时间，提升游戏启动和运行时的资源加载性能。

> Sources:
> [PakFileUtilities.h](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Developer/PakFileUtilities/Public/PakFileUtilities.h#L1)

## 4. CookOnTheFlyServer API

UCookOnTheFlyServer类管理实时资源烹饪服务器。`IsInSession`方法检查烹饪会话状态，`OnRemoveSessionPlatform`移除平台请求数据。状态队列包括：`GetRequestQueue`获取请求队列，`GetLoadReadyQueue`获取就绪加载队列，`GetLoadPrepareQueue`获取预加载队列，`GetSaveQueue`获取保存队列。bLoadBusy和bSaveBusy标志用于异步工作阻塞通知。

```mermaid
graph TD
    A["CookOnTheFlyServer"] --> B["IsInSession<br/>检查会话状态"]
    A --> C["OnRemoveSessionPlatform<br/>移除平台数据"]
    A --> D["GetRequestQueue<br/>FIFO队列"]
    A --> E["GetLoadReadyQueue<br/>依赖排序队列"]
    A --> F["GetLoadPrepareQueue<br/>预加载队列"]
    A --> G["GetSaveQueue<br/>保存队列"]
    A --> H["bLoadBusy<br/>加载阻塞标志"]
    A --> I["bSaveBusy<br/>保存阻塞标志"]
    D --> J["烹饪模式选择"]
    J --> K["CookOnTheFly<br/>实时烹饪"]
    J --> L["CookByTheBook<br/>预设规则烹饪"]
```

RequestQueue遵循FIFO原则，LoadReadyQueue按依赖关系排序。CookOnTheFly模式用于编辑器实时烹饪，CookByTheBook模式用于大规模批量烹饪。

> Sources:
> [CookOnTheFlyServer.h](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Editor/UnrealEd/Classes/CookOnTheSide/CookOnTheFlyServer.h#L1), [CookPackageData.h](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Editor/UnrealEd/Private/Cooker/CookPackageData.h#L1)

## 5. CookPlatformManager API

FPlatformManager结构体管理多平台烹饪。核心接口：`AddRefCookOnTheFlyPlatform`增加平台引用计数，`ReleaseCookOnTheFlyPlatform`释放平台引用，`SelectSessionPlatforms`选择会话平台，`ClearSessionPlatforms`清理会话平台，`GetPlatformData`获取平台数据，`GetPlatformDataByName`通过名称获取平台数据，`RemapTargetPlatforms`重映射目标平台指针。

```mermaid
graph LR
    A["AddRefCookOnTheFlyPlatform"] --> B["增加引用计数"]
    B --> C{平台已存在?}
    C -->|否| D["添加到SessionPlatforms"]
    C -->|是| E["递增引用计数"]
    E --> F["PruneUnreferencedSessionPlatforms"]
    D --> F
    F --> G["RemoveCookOnTheFlyPlatform"]
    A -->|FReadScopeLock| H["线程安全访问"]
    I["GetPlatformData"] -->|FReadScopeLock| H
```

线程安全通过FReadScopeLock实现。系统自动清理未被引用的平台(PruneUnreferencedSessionPlatforms)，释放内存资源。RemapTargetPlatforms在平台指针变更时更新映射关系。

> Sources:
> [CookPlatformManager.h](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Editor/UnrealEd/Private/Cooker/CookPlatformManager.h#L1), [CookPlatformManager.cpp](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Editor/UnrealEd/Private/Cooker/CookPlatformManager.cpp#L1)

## 6. FPackageData API

FPackageData类跟踪包的烹饪状态。核心方法：`CreatePackageData`创建包数据，`FindPackageDataByPackageName`通过包名查找，`ClearCookedPlatforms`清理已烹饪平台，`ReleaseCookedPlatformData`释放烹饪平台数据，`SetState`设置状态，`IsInProgress`检查进行中状态。FPackageDatas容器类提供`GetPackageDatas`获取所有包数据，`Contains`检查包含关系，`begin/end`迭代器支持。

```mermaid
stateDiagram-v2
    [*] --> Empty: CreatePackageData
    Empty --> Requested: "添加到请求队列"
    Requested --> Loading: "GetLoadReadyQueue"
    Loading --> Save: "烹饪完成"
    Save --> Saved: "写入磁盘"
    Saved --> [*]
    Loading --> Failed: "烹饪失败"
    Failed --> [*]
    
    Requested --> Cache: "IsInProgress=true"
    Loading --> Cache: "IsInProgress=true"
    Save --> Cache: "IsInProgress=true"
    Cache --> Requested: "重试"
```

包状态包括Empty(空闲)、Requested(已请求)、Loading(加载中)、Save(保存中)、Saved(已保存)、Failed(失败)等。IsInProgress返回true表示包处于非空闲状态，CookOnTheFlyServer会检查并处理。

> Sources:
> [CookPackageData.h](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Editor/UnrealEd/Private/Cooker/CookPackageData.h#L1), [CookPackageData.cpp](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Editor/UnrealEd/Private/Cooker/CookPackageData.cpp#L1)

## 7. 压缩优化API

资源打包支持多种压缩算法和优化选项。UnrealPak命令行参数指定压缩选项：`-compression=Oodle`、`-compression=LZ4`等。IoStore功能通过`SetUseIoStore(true)`启用，自动调用`SetDeployWithUnrealPak(true)`。Mount函数挂载Pak文件时支持加密验证和索引加载。控制台变量配置Pak文件行为：bEnablePakLog启用日志、GPakCache_Enable启用缓存、GEnablePakFDPruning启用文件描述符修剪。

```mermaid
flowchart TD
    A["启用IoStore"] -->|SetUseIoStore| B["启用UnrealPak部署"]
    B --> C["生成IoStore格式Pak"]
    C --> D["Mount挂载"]
    D --> E{加密检查}
    E -->|有密钥| F["验证签名"]
    E -->|无密钥| G["跳过验证"]
    F --> H["加载索引"]
    G --> H
    H --> I{缓存配置}
    I -->|启用| J["GPakCache_Enable=true"]
    I -->|禁用| K["直接读取"]
    J --> L["FEncryptionKeyCache"]
    K --> L
```

加密支持通过FEncryptionKeyCache类管理，签名验证使用GetPakSignatureFile函数。压缩块处理FPakCompressedBlock结构，支持Oodle和LZ4等多种算法。

> Sources:
> [IPlatformFilePak.h](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Runtime/PakFile/Public/IPlatformFilePak.h#L1), [LauncherProfile.h](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Developer/LauncherServices/Private/Profiles/LauncherProfile.h#L1)

## 8. 分包管理API

自动化打包任务通过PakFileTask类实现。核心方法：`RunUnrealPak`执行自动化打包，`UnpakBuild`解压Pak文件到目标目录，`GetUnrealPakLocation`获取UnrealPak工具位置，`GetUnrealPakArguments`构建命令行参数。PackageUtils类提供`ExtractPakFiles`按补丁层级解压，`SortFilesByPatchLayers`按层级排序，支持加密密钥传递。

```mermaid
sequenceDiagram
    participant Client
    participant PakFileTask
    participant RunUnrealPak
    participant UnrealPakExe
    participant PackageUtils
    participant UnpakBuild
    
    Client->>PakFileTask: 创建打包任务
    PakFileTask->>PakFileTask: 生成响应文件
    PakFileTask->>PakFileTask: 构建命令行参数
    PakFileTask->>RunUnrealPak: 执行打包
    RunUnrealPak->>UnrealPakExe: 调用工具
    UnrealPakExe-->>RunUnrealPak: 返回Pak文件
    RunUnrealPak-->>Client: 打包完成
    
    Client->>PackageUtils: ExtractPakFiles
    alt 按层级解压
        PackageUtils->>PackageUtils: SortFilesByPatchLayers
    end
    PackageUtils->>UnpakBuild: 并行解压
    UnpakBuild->>UnrealPakExe: 提取命令
    UnpakBuild-->>PackageUtils: 解压完成
```

标签系统管理构建产物：FindConsumedTagNames返回消耗标签，FindProducedTagNames返回产生标签。UnpakBuild方法并行支持多文件解压，大幅提升处理效率。

> Sources:
> [PakFileTask.cs](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Programs/AutomationTool/BuildGraph/Tasks/PakFileTask.cs#L1), [CopyBuildToStagingDirectory.Automation.cs](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Programs/AutomationTool/Scripts/CopyBuildToStagingDirectory.Automation.cs#L1)
