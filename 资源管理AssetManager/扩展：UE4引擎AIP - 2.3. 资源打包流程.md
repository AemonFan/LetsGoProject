# 2.3. 资源打包流程

资源打包流程是ue4_tracking_rdcsp项目将开发完成的游戏资源和代码转换为可发布形式的核心环节。该流程通过UnrealPak工具实现统一打包管理,利用Cook系统完成多平台资源格式转换和优化,支持着色器变体生成、分包安装和增量更新等高级功能,为不同平台提供最优化的资源输出方案。

## 资源打包概述

资源打包将开发阶段的原始资源转换为平台特定的优化格式,生成可分发的Pak文件。主要包含UnrealPak工具打包、Cook过程处理、着色器变体生成、分包增量更新等关键环节。资源打包流程在项目发布链路中承担资源格式转换、平台优化和分发包生成等核心任务。

```mermaid
flowchart TD
    A["原始资源文件<br/>Assets/Source Files"] --> B["Cook系统<br/>资源格式转换"]
    B --> C["平台特定资源"]
    C --> D["UnrealPak打包工具<br/>生成Pak文件"]
    D --> E["完整Pak或分包Pak"]
    E --> F["发布分发"]
```

## UnrealPak工具打包机制

UnrealPak工具是资源打包的核心组件,通过ExecuteUnrealPak函数实现统一的Pak文件管理。主要功能包括测试Pak文件完整性(-Test)、提取Pak文件内容(-Extract)、创建Pak文件(-Create)、列出Pak文件内容(-List)、比较两个Pak文件差异(-Diff)等操作。

工具支持批处理模式(-Batch)和加密密钥处理(KeyChain),可通过命令行参数灵活控制打包行为。UnrealpakViewer提供Pak文件内容查看功能,方便验证打包结果。

```mermaid
flowchart LR
    A["输入参数<br/>命令行解析"] --> B["UnrealPak入口<br/>INT32_MAIN_INT32_ARGC_TCHAR_ARGV"]
    B --> C["ExecuteUnrealPak函数<br/>核心处理逻辑"]
    C --> D{操作类型判断}
    D -->|Test| E["测试Pak完整性"]
    D -->|Extract| F["提取文件内容"]
    D -->|Create| G["创建新Pak文件"]
    D -->|List| H["列出文件列表"]
    D -->|Diff| I["比较差异"]
    E --> J["返回结果"]
    F --> J
    G --> J
    H --> J
    I --> J
```

> Sources:
> [UnrealPak.cpp](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Programs/UnrealPak/Private/UnrealPak.cpp#L1), [PakFileUtilities.h](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Developer/PakFileUtilities/Public/PakFileUtilities.h#L1), [UnrealPakCommandlet.cpp](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Editor/UnrealEd/Private/Commandlets/UnrealPakCommandlet.cpp#L1)

## Cook资源格式转换过程

Cook系统负责将原始资源转换为平台特定格式,核心组件包括UCookOnTheFlyServer和CookPlatformManager。系统支持CookOnTheFly和CookByTheBook两种模式: CookOnTheFly用于实时烹饪,CookByTheBook用于批量烹饪。

CookPlatformManager管理多平台Cook任务,维护FPlatformData结构存储平台名称、目标平台指针、资源注册生成器等信息。CookOnTheFly请求会通过AddRefCookOnTheFlyPlatform和ReleaseCookOnTheFlyPlatform追踪平台使用状态,实现智能的平台生命周期管理。

```mermaid
classDiagram
    class UCookOnTheFlyServer {
        -ECookMode::Type CurrentCookMode
        -FCookByTheBookOptions CookByTheBookOptions
        -FCookFlags CookFlags
        -TUniquePtr~FPlatformManager~ PlatformManager
        +IsCookOnTheFlyMode() bool
        +CollectFilesToCook()
        +GenerateAssetRegistry()
    }
    
    class FPlatformManager {
        -TArray~FPlatformData~ PlatformDatas
        -TArray~ITargetPlatform*~ SessionPlatforms
        -FRWLock PlatformManagerRWLock
        +AddRefCookOnTheFlyPlatform()
        +ReleaseCookOnTheFlyPlatform()
        +PruneUnreferencedSessionPlatforms()
    }
    
    class FCookCommandlet {
        -TArray~UClass*~ FullGCAssetClassNames
        -bool bIterativeCooking
        -bool bCookOnTheFly
        -bool bCookAll
        +CookOnTheFly()
        +CookByTheBook()
        +Main() int32
    }
    
    UCookOnTheFlyServer --> FPlatformManager
    FCookCommandlet --> UCookOnTheFlyServer
```

> Sources:
> [CookOnTheFlyServer.h](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Editor/UnrealEd/Classes/CookOnTheSide/CookOnTheFlyServer.h#L1), [CookOnTheFlyServer.cpp](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Editor/UnrealEd/Private/Cooker/CookOnTheFlyServer.cpp#L1), [CookPlatformManager.h](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Editor/UnrealEd/Private/Cooker/CookPlatformManager.h#L1), [CookCommandlet.cpp](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Editor/UnrealEd/Private/Commandlets/CookCommandlet.cpp#L1)

## 着色器变体生成

ShaderCompileWorker是着色器变体生成的核心工作进程,负责并行编译着色器资源。系统支持通过CVarAllowCompilingThroughWorkers控制是否使用外部ShaderCompileWorker进程进行编译。

着色器系统支持多平台着色器格式生成,通过配置文件DefaultEngine.ini管理派生数据后端,包括Boot缓存、Local文件系统缓存和Pak打包数据配置。CookProcess会触发ShaderCompileWorker生成目标平台所需的所有着色器变体。

```mermaid
flowchart TB
    A["资源打包触发"] --> B["Cook系统分析材质"]
    B --> C["ShaderCompileWorker启动"]
    C --> D["多进程并行编译"]
    D --> E["生成平台着色器变体"]
    E --> F["写入派生数据缓存DDC"]
    F --> G["打包到Pak文件"]
    
    H["配置文件<br/>DefaultEngine.ini"] -.->|控制DDC行为| F
```

> Sources:
> [ShaderCompileWorker.Target.cs](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Programs/ShaderCompileWorker/ShaderCompileWorker.Target.cs#L1), [DefaultEngine.ini](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Programs/ShaderCompileWorker/Config/DefaultEngine.ini#L1), [ShaderCompiler.cpp](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Runtime/Engine/Private/ShaderCompiler/ShaderCompiler.cpp#L1)

## 分包安装与增量更新机制

通过FPakPlatformFile实现分包文件管理,支持MountAllPakFiles挂载多个Pak文件。系统提供GetPakChunkLocation查询Pakchunk位置状态,返回LocalFast、NotAvailable或DoesNotExist等状态。

支持通过GenerateDiffPatch生成两个Pak文件之间的差异补丁,只包含新增、修改或删除的文件。CombinePacks函数可将多个Pak文件合并为单个Pak文件。ChunkDownloader插件提供完整的分块下载和挂载管理功能,包括按需下载、PakFiles数组管理和挂载顺序控制。

```mermaid
flowchart TD
    A["基线Pak文件<br/>v1.0"] --> B["新资源版本<br/>v1.1"]
    B --> C["差异分析<br/>GenerateDiffPatch"]
    C --> D["增量补丁Pak<br/>Delta.pak"]
    D --> E["客户端下载补丁"]
    E --> F["挂载补丁Pak<br/>MountAllPakFiles"]
    F --> G["资源更新完成"]
    
    style D fill:#90EE90
    style G fill:#90EE90
```

> Sources:
> [IPlatformFilePak.h](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Runtime/PakFile/Public/IPlatformFilePak.h#L1), [PakFileUtilities.cpp](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Developer/PakFileUtilities/Private/PakFileUtilities.cpp#L1), [ChunkDownloader.cpp](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Plugins/Runtime/ChunkDownloader/Source/Private/ChunkDownloader.cpp#L1)

## 资源打包优化策略

资源打包支持多种压缩算法和优化配置。可通过配置文件DefaultEngine.ini中设置纹理压缩质量参数如DefaultPVRTCQuality、DefaultASTCQualityBySize等。UCookerSettings类提供bEnableCookOnTheSide、bEnableBuildDDCInBackground、bIterativeCookingForLaunchOn等配置选项控制打包行为。

通过LOD层次打包、按平台差异化输出、冗余资源剔除等策略优化打包体积。BuildGraph框架中的PakFileTask类提供路径重定向、压缩控制、标签管理等高级特性。

```mermaid
flowchart LR
    A["原始资源"] --> B{优化策略选择}
    B -->|纹理压缩| C["DefaultPVRTCQuality<br/>DefaultASTCQuality"]
    B -->|LOD层次| D["选择LOD级别"]
    B -->|平台差异化| E["平台特定格式"]
    B -->|冗余剔除| F["删除未引用资源"]
    C --> G["打包到Pak"]
    D --> G
    E --> G
    F --> G
    G --> H["优化后的发布包"]
```

> Sources:
> [CookerSettings.cpp](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Editor/UnrealEd/Private/CookerSettings.cpp#L1), [BaseEngine.ini](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Config/BaseEngine.ini#L1), [PakFileTask.cs](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Programs/AutomationTool/BuildGraph/Tasks/PakFileTask.cs#L1)

## 打包流程配置与依赖管理

通过配置文件BaseEngine.ini集中管理打包行为,包括派生数据缓存配置、Cook选项、平台特定设置等。CookCommandlet解析命令行参数控制Cook模式,包括bCookOnTheFly、bCookAll、bIterativeCooking等标志。

CookPlatformManager通过FPlatformData结构管理平台依赖,包括目标平台指针、资源注册生成器、沙盒初始化状态等。支持跨平台资源依赖管理,确保打包结果的完整性和一致性。

```mermaid
classDiagram
    class UCookerSettings {
        -bool bEnableCookOnTheSide
        -bool bEnableBuildDDCInBackground
        -bool bIterativeCookingForLaunchOn
        -bool bCompileBlueprintsInDevelopmentMode
        -int32 DefaultPVRTCQuality
        -int32 DefaultASTCQualityBySize
        -int32 DefaultASTCQualitySpeed
    }
    
    class FPlatformData {
        +FName PlatformName
        +ITargetPlatform* TargetPlatform
        +FAssetRegistryGenerator* RegistryGenerator
        +bool bIsSandboxInitialized
        +double LastReferenceTime
        +int32 ReferenceCount
    }
    
    class EBuildConfiguration {
        <<enumeration>>
        Debug
        Development
        Shipping
        Test
    }
    
    UCookerSettings --> EBuildConfiguration
    FPlatformData --> ITargetPlatform
```

> Sources:
> [BaseEngine.ini](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Config/BaseEngine.ini#L1), [CookerSettings.cpp](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Editor/UnrealEd/Private/CookerSettings.cpp#L1), [CookCommandlet.h](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Editor/UnrealEd/Classes/Commandlets/CookCommandlet.h#L1), [CookPlatformManager.h](https://git.woa.com/TimiT1/MOE/Engines/ue4_tracking_rdcsp/blob/e75a13ba27e76deadd29777844b852d8e506e974/Engine/Source/Editor/UnrealEd/Private/Cooker/CookPlatformManager.h#L1)