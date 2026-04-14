// GAS 文档内容 - 01 到 06
// 此文件由工具自动生成，包含所有文档的 Markdown 内容

docs['01'] = `# GAS 整体架构概述

> **源码依据**：综合分析 \`AbilitySystemComponent.h\`、\`GameplayAbility.h\`、\`AttributeSet.h\`、\`GameplayEffect.h\`、\`AbilitySystemInterface.h\`、\`AbilitySystemGlobals.h\`

---

## 1. GAS 是什么

GAS（Gameplay Ability System）是 Epic Games 为 UE4 提供的一套完整的**技能与效果框架**，最初为《堡垒之夜》开发，后作为引擎插件开放。它解决了以下核心问题：

- **技能系统**：定义、授予、激活、取消技能
- **属性系统**：管理角色数值（生命值、攻击力等），支持网络同步
- **效果系统**：定义对属性的修改规则（伤害、治疗、Buff/Debuff）
- **标签系统**：通过层级标签控制技能激活条件、状态管理
- **表现层**：通过 GameplayCue 将逻辑与视觉/音效解耦
- **网络预测**：内置客户端预测机制，减少网络延迟感

---

## 2. 核心组件总览

GAS 由以下七大核心组件构成：

| 组件 | 类型 | 职责 |
|------|------|------|
| \`UAbilitySystemComponent\` | UActorComponent 子类 | **核心枢纽**，管理所有 GAS 功能 |
| \`UGameplayAbility\` | UObject 子类 | 定义单个技能的完整行为逻辑 |
| \`UAttributeSet\` | UObject 子类 | 定义并持有角色属性数值 |
| \`UGameplayEffect\` | UObject 子类（数据资产） | 定义对属性的修改规则 |
| \`FGameplayTag\` | 结构体 | 层级化标签，用于条件判断和通信 |
| \`UGameplayCueNotify_*\` | UObject/AActor 子类 | 技能表现层（特效、音效等） |
| \`UAbilityTask\` | UGameplayTask 子类 | 技能内的异步操作 |

---

## 3. 类继承关系

\`\`\`mermaid
classDiagram
    direction TB

    UObject <|-- UActorComponent
    UActorComponent <|-- UGameplayTasksComponent
    UGameplayTasksComponent <|-- UAbilitySystemComponent
    UAbilitySystemComponent ..|> IAbilitySystemReplicationProxyInterface

    UObject <|-- UGameplayAbility

    UObject <|-- UAttributeSet

    UObject <|-- UGameplayEffect

    UObject <|-- UGameplayCueNotify_Static
    AActor <|-- AGameplayCueNotify_Actor

    UGameplayTask <|-- UAbilityTask

    class UAbilitySystemComponent {
        +ActivatableAbilities FGameplayAbilitySpecContainer
        +ActiveGameplayEffects FActiveGameplayEffectsContainer
        +SpawnedAttributes TArray~UAttributeSet~
        +GiveAbility() FGameplayAbilitySpecHandle
        +TryActivateAbility() bool
        +ApplyGameplayEffectToSelf() FActiveGameplayEffectHandle
    }

    class UGameplayAbility {
        +ActivateAbility()
        +EndAbility()
        +CommitAbility() bool
        +CanActivateAbility() bool
    }

    class UAttributeSet {
        +PreAttributeChange()
        +PostGameplayEffectExecute()
        +GetLifetimeReplicatedProps()
    }

    class UGameplayEffect {
        +DurationPolicy EGameplayEffectDurationType
        +Modifiers TArray~FGameplayModifierInfo~
        +Executions TArray~FGameplayEffectExecutionDefinition~
    }
\`\`\`

---

## 4. Actor 接入 GAS 的方式

### 4.1 IAbilitySystemInterface 接口

来源：\`Public/AbilitySystemInterface.h\`

\`\`\`cpp
// Actor 需要实现此接口，才能被 GAS 系统识别
class GAMEPLAYABILITIES_API IAbilitySystemInterface
{
    GENERATED_IINTERFACE_BODY()

    // 返回该 Actor 使用的 AbilitySystemComponent
    // 注意：ASC 可以不在 Actor 自身上，例如 Pawn 可以使用 PlayerState 上的 ASC
    virtual UAbilitySystemComponent* GetAbilitySystemComponent() const = 0;
};
\`\`\`

### 4.2 两种常见的 ASC 归属方式

**方式一：ASC 在 Pawn 自身上**
\`\`\`
APawn
  └── UAbilitySystemComponent  ← ASC 直接挂在 Pawn 上
  └── UMyAttributeSet          ← AttributeSet 也在 Pawn 上
\`\`\`

**方式二：ASC 在 PlayerState 上（推荐用于玩家角色）**
\`\`\`
APlayerState
  └── UAbilitySystemComponent  ← ASC 在 PlayerState 上（跨 Pawn 持久化）
  └── UMyAttributeSet

APawn
  └── 实现 IAbilitySystemInterface，返回 PlayerState 上的 ASC
\`\`\`

> **为什么推荐方式二？** 当玩家死亡重生时，Pawn 会被销毁重建，但 PlayerState 持续存在，ASC 上的技能、属性、效果不会丢失。

---

## 5. GAS 初始化流程

\`\`\`mermaid
flowchart TD
    A["项目启动"] --> B["UAbilitySystemGlobals::InitGlobalData()"]
    B --> C["加载 GlobalCurveTable\\n（属性默认值曲线表）"]
    B --> D["初始化 GlobalTags\\n（ActivateFailIsDeadTag 等）"]
    B --> E["初始化 GameplayCueManager"]
    B --> F["初始化 AttributeSetInitter\\n（属性初始化器）"]

    G["Actor BeginPlay"] --> H["ASC::InitAbilityActorInfo()\\n设置 OwnerActor 和 AvatarActor"]
    H --> I["服务端：授予初始技能\\nGiveAbility()"]
    H --> J["服务端：应用初始效果\\nApplyGameplayEffectToSelf()"]
    H --> K["属性初始化\\nInitializeAttributes()"]

    L["客户端 OnRep_PlayerState"] --> H
\`\`\`

### 5.1 InitAbilityActorInfo 的重要性

来源：\`AbilitySystemComponent.h\`

\`\`\`cpp
// 必须在 BeginPlay 或 Possess 时调用，设置 Owner 和 Avatar
// OwnerActor: 拥有 ASC 的 Actor（通常是 PlayerState 或 Pawn）
// AvatarActor: 实际在世界中的 Actor（通常是 Pawn）
virtual void InitAbilityActorInfo(AActor* InOwnerActor, AActor* InAvatarActor);
\`\`\`

---

## 6. 数据流向

\`\`\`mermaid
flowchart LR
    subgraph 输入层
        Input["玩家输入 / 游戏逻辑"]
    end

    subgraph 技能层
        ASC["AbilitySystemComponent"]
        GA["GameplayAbility"]
        AT["AbilityTask"]
    end

    subgraph 效果层
        GE["GameplayEffect"]
        AS["AttributeSet"]
        EC["ExecutionCalculation"]
    end

    subgraph 表现层
        GCM["GameplayCueManager"]
        GCN["GameplayCueNotify"]
    end

    Input -->|"TryActivateAbility()"| ASC
    ASC -->|"ActivateAbility()"| GA
    GA -->|"创建任务"| AT
    AT -->|"等待完成后"| GA
    GA -->|"ApplyGameplayEffectToTarget()"| ASC
    ASC -->|"应用效果"| GE
    GE -->|"修改属性"| AS
    GE -->|"自定义计算"| EC
    EC -->|"输出修改值"| AS
    GE -->|"触发 Cue"| GCM
    GCM -->|"分发"| GCN
\`\`\`

---

## 7. 网络架构

GAS 是为多人游戏设计的，其网络架构如下：

\`\`\`mermaid
flowchart TB
    subgraph Server["服务端（权威）"]
        S_ASC["ASC（服务端）\\n拥有完整数据"]
        S_GA["GameplayAbility\\n服务端实例"]
    end

    subgraph Client_Owner["客户端（拥有者）"]
        C_ASC["ASC（客户端）\\n接收复制数据"]
        C_GA["GameplayAbility\\n客户端实例（预测）"]
        PK["FPredictionKey\\n预测键"]
    end

    subgraph Client_Other["其他客户端"]
        O_ASC["ASC（模拟端）\\n只接收最终状态"]
    end

    S_ASC -->|"网络复制\\nActivatableAbilities\\nActiveGameplayEffects\\nMinimalReplicationTags"| C_ASC
    S_ASC -->|"网络复制"| O_ASC
    C_GA -->|"发送 RPC\\n携带 PredictionKey"| S_GA
    S_GA -->|"验证并确认/回滚"| C_GA
\`\`\`

### 7.1 三种网络角色

| 角色 | 说明 | 能做什么 |
|------|------|----------|
| **Authority（服务端）** | 拥有完整权威数据 | 可以做任何操作 |
| **AutonomousProxy（本地玩家）** | 本地控制的 Pawn | 可以发起预测，等待服务端确认 |
| **SimulatedProxy（其他玩家）** | 远端玩家在本地的模拟 | 只接收复制数据，不能主动操作 |

---

## 8. 关键枚举速查

### 8.1 技能实例化策略（来源：\`GameplayAbility.h\`）

\`\`\`cpp
UENUM(BlueprintType)
namespace EGameplayAbilityInstancingPolicy
{
    enum Type
    {
        // 不实例化，使用 CDO 直接执行（最轻量，不能有状态）
        NonInstanced,
        // 每个 Actor 一个实例（最常用）
        InstancedPerActor,
        // 每次执行一个实例（支持并发执行同一技能）
        InstancedPerExecution,
    };
}
\`\`\`

### 8.2 技能网络执行策略（来源：\`GameplayAbility.h\`）

\`\`\`cpp
UENUM(BlueprintType)
namespace EGameplayAbilityNetExecutionPolicy
{
    enum Type
    {
        LocalPredicted,   // 本地预测执行（最常用）
        LocalOnly,        // 仅本地执行（单机或纯客户端逻辑）
        ServerInitiated,  // 服务端发起
        ServerOnly,       // 仅服务端执行
    };
}
\`\`\`

### 8.3 GameplayEffect 持续类型（来源：\`GameplayEffect.h\`）

\`\`\`cpp
UENUM(BlueprintType)
namespace EGameplayEffectDurationType
{
    enum Type
    {
        Instant,     // 瞬时效果（立即修改 BaseValue）
        Infinite,    // 无限持续（持续修改 CurrentValue）
        HasDuration, // 有限持续时间
    };
}
\`\`\`
`;

docs['02'] = `# AbilitySystemComponent（ASC）核心组件详解

> **源码文件**：\`Public/AbilitySystemComponent.h\`（87.18 KB，1632行）
> **继承链**：\`UObject → UActorComponent → UGameplayTasksComponent → UAbilitySystemComponent\`

---

## 1. 概述

\`UAbilitySystemComponent\`（简称 ASC）是 GAS 框架的**核心枢纽**。它是一个 \`UActorComponent\`，挂载在 Actor 上，负责：

- **技能管理**：授予、移除、激活、取消技能
- **效果管理**：应用、移除 GameplayEffect，维护激活效果列表
- **属性管理**：持有 AttributeSet，提供属性查询接口
- **标签管理**：维护当前 Actor 的 GameplayTag 计数
- **网络同步**：复制技能列表、激活效果、标签状态
- **预测支持**：管理预测键，支持客户端预测

---

## 2. 核心数据成员

来源：\`Public/AbilitySystemComponent.h\`

### 2.1 技能相关

\`\`\`cpp
// 所有已授予的技能规格列表（通过 GiveAbility 添加）
// ReplicatedUsing=OnRep_ActivatableAbilities 表示复制时触发回调
UPROPERTY(ReplicatedUsing=OnRep_ActivatableAbilities, BlueprintReadOnly, Category = "Abilities")
FGameplayAbilitySpecContainer ActivatableAbilities;
\`\`\`

### 2.2 效果相关

\`\`\`cpp
// 当前所有激活中的 GameplayEffect 容器
// 这是一个 FFastArraySerializer，支持高效网络复制
FActiveGameplayEffectsContainer ActiveGameplayEffects;
\`\`\`

### 2.3 属性相关

\`\`\`cpp
// 所有已注册的 AttributeSet 列表
// 通过 AddAttributeSetSubobject() 或在构造函数中 CreateDefaultSubobject 添加
UPROPERTY(Replicated)
TArray<UAttributeSet*> SpawnedAttributes;
\`\`\`

### 2.4 标签相关

\`\`\`cpp
// 当前 Actor 拥有的 GameplayTag 计数容器（本地，不复制）
FGameplayTagCountContainer GameplayTagCountContainer;

// 用于最小化复制的标签计数 Map（复制给所有客户端）
UPROPERTY(Replicated)
FMinimalReplicationTagCountMap MinimalReplicationTags;

// 用于仅复制给拥有者的标签计数 Map
UPROPERTY(Replicated)
FMinimalReplicationTagCountMap ReplicatedTagCountMap;
\`\`\`

### 2.5 网络相关

\`\`\`cpp
// 当前预测键（客户端预测使用）
FPredictionKey ScopedPredictionKey;

// 服务端确认的预测键（用于验证客户端预测）
UPROPERTY(ReplicatedUsing=OnRep_ServerCurrentActivationInfo)
FGameplayAbilityActivationInfo ServerCurrentActivationInfo;
\`\`\`

---

## 3. 技能管理 API

### 3.1 授予技能

\`\`\`cpp
// 授予一个技能，返回技能句柄（用于后续引用该技能）
// 只能在服务端调用
FGameplayAbilitySpecHandle GiveAbility(const FGameplayAbilitySpec& AbilitySpec);

// 授予技能并立即激活（激活后自动移除）
FGameplayAbilitySpecHandle GiveAbilityAndActivateOnce(
    FGameplayAbilitySpec& AbilitySpec,
    const FGameplayEventData* GameplayEventData = nullptr
);
\`\`\`

**使用示例**：
\`\`\`cpp
// 构造技能规格并授予
FGameplayAbilitySpec AbilitySpec(
    AbilityClass,       // 技能类
    AbilityLevel,       // 技能等级
    InputID,            // 输入绑定 ID（可选）
    SourceObject        // 来源对象（可选）
);
FGameplayAbilitySpecHandle Handle = AbilitySystemComponent->GiveAbility(AbilitySpec);
\`\`\`

### 3.2 移除技能

\`\`\`cpp
// 通过句柄移除技能
void ClearAbility(const FGameplayAbilitySpecHandle& Handle);

// 移除所有技能
void ClearAllAbilities();

// 移除所有技能并取消激活中的技能
void ClearAllAbilitiesWithInputID(int32 InputID);
\`\`\`

### 3.3 激活技能

\`\`\`cpp
// 尝试通过句柄激活技能（最常用）
// 返回 true 表示激活成功
bool TryActivateAbility(
    FGameplayAbilitySpecHandle AbilityToActivate,
    bool bAllowRemoteActivation = true
);

// 尝试通过类激活技能
bool TryActivateAbilityByClass(
    TSubclassOf<UGameplayAbility> InAbilityToActivate,
    bool bAllowRemoteActivation = true
);

// 通过 GameplayTag 激活技能（激活所有匹配标签的技能）
bool TryActivateAbilitiesByTag(
    const FGameplayTagContainer& GameplayTagContainer,
    bool bAllowRemoteActivation = true
);
\`\`\`

### 3.4 取消技能

\`\`\`cpp
// 取消所有匹配标签的技能
void CancelAbilities(
    const FGameplayTagContainer* WithTags = nullptr,
    const FGameplayTagContainer* WithoutTags = nullptr,
    UGameplayAbility* Ignore = nullptr
);

// 取消所有技能
void CancelAllAbilities(UGameplayAbility* Ignore = nullptr);

// 取消指定句柄的技能
void CancelAbilityHandle(const FGameplayAbilitySpecHandle& AbilityHandle);
\`\`\`

### 3.5 查询技能

\`\`\`cpp
// 通过句柄查找技能规格（返回指针，可能为 null）
FGameplayAbilitySpec* FindAbilitySpecFromHandle(FGameplayAbilitySpecHandle Handle);

// 通过类查找技能规格
FGameplayAbilitySpec* FindAbilitySpecFromClass(TSubclassOf<UGameplayAbility> InAbilityClass);

// 通过输入 ID 查找技能规格
FGameplayAbilitySpec* FindAbilitySpecFromInputID(int32 InputID);
\`\`\`

---

## 4. GameplayEffect 管理 API

### 4.1 应用效果

\`\`\`cpp
// 应用效果到自身（最常用）
FActiveGameplayEffectHandle ApplyGameplayEffectToSelf(
    const UGameplayEffect* GameplayEffect,
    float Level,
    FGameplayEffectContextHandle EffectContext,
    FPredictionKey PredictionKey = FPredictionKey()
);

// 应用效果到目标
FActiveGameplayEffectHandle ApplyGameplayEffectToTarget(
    UGameplayEffect* GameplayEffect,
    UAbilitySystemComponent* Target,
    float Level = UGameplayEffect::INVALID_LEVEL,
    FGameplayEffectContextHandle Context = FGameplayEffectContextHandle(),
    FPredictionKey PredictionKey = FPredictionKey()
);

// 通过已构建的 Spec 应用效果（更灵活）
FActiveGameplayEffectHandle ApplyGameplayEffectSpecToSelf(
    const FGameplayEffectSpec& GameplayEffect,
    FPredictionKey PredictionKey = FPredictionKey()
);

FActiveGameplayEffectHandle ApplyGameplayEffectSpecToTarget(
    const FGameplayEffectSpec& GameplayEffect,
    UAbilitySystemComponent* Target,
    FPredictionKey PredictionKey = FPredictionKey()
);
\`\`\`

### 4.2 移除效果

\`\`\`cpp
// 通过句柄移除效果
bool RemoveActiveGameplayEffect(
    FActiveGameplayEffectHandle Handle,
    int32 StacksToRemove = -1  // -1 表示移除所有层
);

// 通过 GameplayTag 移除效果
int32 RemoveActiveEffectsWithTags(const FGameplayTagContainer& Tags);
\`\`\`

### 4.3 构建 EffectSpec

\`\`\`cpp
// 构建效果规格（用于后续应用）
FGameplayEffectSpecHandle MakeOutgoingSpec(
    TSubclassOf<UGameplayEffect> GameplayEffectClass,
    float Level,
    FGameplayEffectContextHandle Context
) const;

// 构建效果上下文
FGameplayEffectContextHandle MakeEffectContext();
\`\`\`

### 4.4 查询效果

\`\`\`cpp
// 检查是否有匹配标签的激活效果
bool HasMatchingGameplayTag(FGameplayTag TagToCheck) const;

// 获取效果的剩余时间
float GetGameplayEffectDuration(FActiveGameplayEffectHandle Handle) const;

// 获取效果的堆叠数
int32 GetCurrentStackCount(FActiveGameplayEffectHandle Handle) const;
\`\`\`

---

## 5. 属性管理 API

\`\`\`cpp
// 获取属性当前值（CurrentValue，受 Modifier 影响）
float GetNumericAttribute(const FGameplayAttribute& Attribute) const;

// 获取属性基础值（BaseValue，不受 Modifier 影响）
float GetNumericAttributeBase(const FGameplayAttribute& Attribute) const;

// 设置属性基础值（直接修改，不通过 GE）
void SetNumericAttributeBase(const FGameplayAttribute& Attribute, float NewBaseValue);

// 注册属性变化回调
FOnGameplayAttributeValueChange& GetGameplayAttributeValueChangeDelegate(
    FGameplayAttribute Attribute
);
\`\`\`

**使用示例**：
\`\`\`cpp
// 监听生命值变化
AbilitySystemComponent->GetGameplayAttributeValueChangeDelegate(
    UMyAttributeSet::GetHealthAttribute()
).AddUObject(this, &AMyCharacter::OnHealthChanged);
\`\`\`

---

## 6. 标签管理 API

\`\`\`cpp
// 检查是否拥有某个标签
bool HasMatchingGameplayTag(FGameplayTag TagToCheck) const;

// 检查是否拥有所有标签
bool HasAllMatchingGameplayTags(const FGameplayTagContainer& TagContainer) const;

// 检查是否拥有任意标签
bool HasAnyMatchingGameplayTags(const FGameplayTagContainer& TagContainer) const;

// 手动添加标签（不通过 GE）
void AddLooseGameplayTag(const FGameplayTag& GameplayTag, int32 Count = 1);

// 手动移除标签
void RemoveLooseGameplayTag(const FGameplayTag& GameplayTag, int32 Count = 1);

// 注册标签变化回调
FOnGameplayEffectTagCountChanged& RegisterGameplayTagEvent(
    FGameplayTag Tag,
    EGameplayTagEventType::Type EventType = EGameplayTagEventType::NewOrRemoved
);
\`\`\`

---

## 7. GameplayCue 触发 API

\`\`\`cpp
// 执行一次性 Cue（对应 Executed 事件）
void ExecuteGameplayCue(
    const FGameplayTag GameplayCueTag,
    FGameplayEffectContextHandle EffectContext = FGameplayEffectContextHandle()
);

// 添加持续 Cue（对应 OnActive + WhileActive 事件）
void AddGameplayCue(
    const FGameplayTag GameplayCueTag,
    FGameplayEffectContextHandle EffectContext = FGameplayEffectContextHandle()
);

// 移除持续 Cue（对应 OnRemove 事件）
void RemoveGameplayCue(const FGameplayTag GameplayCueTag);
\`\`\`

---

## 8. 游戏事件 API

\`\`\`cpp
// 发送游戏事件（可被 AbilityTask_WaitGameplayEvent 监听）
void HandleGameplayEvent(
    FGameplayTag EventTag,
    const FGameplayEventData* Payload
);
\`\`\`

---

## 9. 网络复制机制

### 9.1 复制的数据

| 数据 | 复制方式 | 说明 |
|------|----------|------|
| \`ActivatableAbilities\` | \`ReplicatedUsing=OnRep_ActivatableAbilities\` | 技能列表，使用 FFastArraySerializer |
| \`ActiveGameplayEffects\` | FFastArraySerializer | 激活效果列表，高效增量复制 |
| \`SpawnedAttributes\` | \`Replicated\` | 属性集列表 |
| \`MinimalReplicationTags\` | \`Replicated\` | 最小化标签复制（给所有客户端） |
| \`ReplicatedTagCountMap\` | \`Replicated\` | 标签复制（仅给拥有者） |

### 9.2 GetLifetimeReplicatedProps

\`\`\`cpp
// ASC 注册复制属性（来源：AbilitySystemComponent.cpp）
void UAbilitySystemComponent::GetLifetimeReplicatedProps(
    TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    // ActivatableAbilities 复制给所有人
    DOREPLIFETIME(UAbilitySystemComponent, ActivatableAbilities);
    // SpawnedAttributes 复制给所有人
    DOREPLIFETIME(UAbilitySystemComponent, SpawnedAttributes);
    // 最小化标签复制给所有人
    DOREPLIFETIME(UAbilitySystemComponent, MinimalReplicationTags);
    // 拥有者专属标签复制
    DOREPLIFETIME_CONDITION(UAbilitySystemComponent, ReplicatedTagCountMap, COND_OwnerOnly);
}
\`\`\`

---

## 10. 输入绑定

ASC 支持将技能与输入绑定，通过 InputID 关联：

\`\`\`cpp
// 当输入按下时调用（激活绑定了该 InputID 的技能）
void AbilityLocalInputPressed(int32 InputID);

// 当输入释放时调用
void AbilityLocalInputReleased(int32 InputID);

// 确认/取消目标选择
void LocalInputConfirm();
void LocalInputCancel();
\`\`\`

---

## 11. 完整工作流程

\`\`\`mermaid
flowchart TD
    A["GiveAbility(AbilitySpec)"] --> B["添加到 ActivatableAbilities\\n复制给客户端"]
    B --> C["TryActivateAbility(Handle)"]
    C --> D{"检查激活条件\\nCanActivateAbility()"}
    D -->|"标签不满足/冷却中/资源不足"| E["激活失败\\n触发 OnAbilityFailed 委托"]
    D -->|"条件满足"| F["CallActivateAbility()"]
    F --> G["ActivateAbility()\\n子类实现技能逻辑"]
    G --> H["CommitAbility()\\n消耗资源 + 应用冷却"]
    H --> I["执行技能效果\\nApplyGameplayEffectToTarget()"]
    I --> J["EndAbility()\\n技能结束"]
    J --> K{"bReplicateEndAbility"}
    K -->|"true"| L["通知所有客户端技能结束"]
    K -->|"false"| M["仅本地结束"]
\`\`\`
`;

docs['03'] = `# GameplayAbility 技能系统详解

> **源码文件**：\`Public/Abilities/GameplayAbility.h\`（47.00 KB，891行）
> **继承链**：\`UObject → UGameplayAbility\`

---

## 1. 概述

\`UGameplayAbility\` 是 GAS 中**技能的基类**，定义了一个技能从激活到结束的完整行为。每个具体技能都继承自此类并重写关键虚函数。

核心职责：
- 定义技能的**激活条件**（标签需求、冷却、资源消耗）
- 定义技能的**执行逻辑**（\`ActivateAbility\` 虚函数）
- 管理技能的**生命周期**（激活 → 执行 → 结束）
- 控制技能的**网络行为**（本地预测、服务端权威）

---

## 2. 三大策略枚举

这三个枚举决定了技能的实例化方式、网络执行方式和复制方式，是理解 GAS 技能系统的关键。

### 2.1 实例化策略（InstancingPolicy）

来源：\`Public/Abilities/GameplayAbility.h\`

\`\`\`cpp
UENUM(BlueprintType)
namespace EGameplayAbilityInstancingPolicy
{
    enum Type
    {
        // 不实例化：直接使用 CDO（Class Default Object）执行
        // 优点：零内存开销，最高性能
        // 缺点：不能有任何运行时状态，不能使用 AbilityTask
        NonInstanced,

        // 每个 Actor 一个实例（最常用）
        // 优点：可以有状态，支持 AbilityTask
        // 缺点：同一技能同时只能有一个激活实例
        InstancedPerActor,

        // 每次执行一个新实例
        // 优点：支持同一技能并发执行多次
        // 缺点：内存开销最大
        InstancedPerExecution,
    };
}
\`\`\`

### 2.2 网络执行策略（NetExecutionPolicy）

\`\`\`cpp
UENUM(BlueprintType)
namespace EGameplayAbilityNetExecutionPolicy
{
    enum Type
    {
        // 本地预测：客户端立即执行，同时通知服务端
        // 服务端验证后确认或回滚
        // 适用于：大多数玩家主动技能
        LocalPredicted,

        // 仅本地执行：不通知服务端
        // 适用于：纯表现层技能、单机游戏
        LocalOnly,

        // 服务端发起：服务端决定何时激活，通知客户端
        // 适用于：AI 技能、服务端触发的技能
        ServerInitiated,

        // 仅服务端执行：客户端不执行
        // 适用于：纯逻辑技能，无需客户端表现
        ServerOnly,
    };
}
\`\`\`

### 2.3 复制策略（ReplicationPolicy）

\`\`\`cpp
UENUM(BlueprintType)
namespace EGameplayAbilityReplicationPolicy
{
    enum Type
    {
        // 不复制技能实例（默认，大多数情况使用）
        ReplicateNo,

        // 复制技能实例到所有客户端
        // 注意：只有 InstancedPerActor 策略才支持复制
        ReplicateYes,
    };
}
\`\`\`

---

## 3. 技能生命周期

\`\`\`mermaid
flowchart TD
    A["ASC::TryActivateAbility()"] --> B["CanActivateAbility()"]
    B --> C{"激活条件检查"}
    C -->|"失败"| D["NotifyAbilityFailed()\\n返回 false"]
    C -->|"通过"| E["CallActivateAbility()"]
    E --> F["PreActivate()\\n内部初始化"]
    F --> G["ActivateAbility()\\n⭐ 子类重写此函数"]
    G --> H{"技能执行中"}
    H -->|"正常完成"| I["CommitAbility()\\n消耗 Cost + 应用 Cooldown"]
    I --> J["EndAbility(bWasCancelled=false)"]
    H -->|"被取消"| K["CancelAbility()"]
    K --> L["EndAbility(bWasCancelled=true)"]
    J --> M["OnEndAbility()\\n清理资源"]
    L --> M
    M --> N["技能结束\\n实例回收或销毁"]
\`\`\`

### 3.1 关键生命周期函数

\`\`\`cpp
// ==================== 激活阶段 ====================

// 检查技能是否可以激活（不消耗资源，只检查条件）
virtual bool CanActivateAbility(
    const FGameplayAbilitySpecHandle Handle,
    const FGameplayAbilityActorInfo* ActorInfo,
    const FGameplayTagContainer* SourceTags = nullptr,
    const FGameplayTagContainer* TargetTags = nullptr,
    OUT FGameplayTagContainer* OptionalRelevantTags = nullptr
) const;

// ⭐ 技能激活入口，子类必须重写此函数实现技能逻辑
// 注意：必须在某个时刻调用 EndAbility()，否则技能永远不会结束
virtual void ActivateAbility(
    const FGameplayAbilitySpecHandle Handle,
    const FGameplayAbilityActorInfo* ActorInfo,
    const FGameplayAbilityActivationInfo ActivationInfo,
    const FGameplayEventData* TriggerEventData
);

// ==================== 提交阶段 ====================

// 提交技能：同时检查并消耗 Cost + 应用 Cooldown
// 通常在 ActivateAbility 开始时调用
// 返回 false 表示无法提交（资源不足或冷却中）
virtual bool CommitAbility(
    const FGameplayAbilitySpecHandle Handle,
    const FGameplayAbilityActorInfo* ActorInfo,
    const FGameplayAbilityActivationInfo ActivationInfo,
    OUT FGameplayTagContainer* OptionalRelevantTags = nullptr
);

// ==================== 结束阶段 ====================

// 结束技能（必须调用，否则技能永远激活）
// bWasCancelled: true 表示被取消，false 表示正常结束
virtual void EndAbility(
    const FGameplayAbilitySpecHandle Handle,
    const FGameplayAbilityActorInfo* ActorInfo,
    const FGameplayAbilityActivationInfo ActivationInfo,
    bool bReplicateEndAbility,
    bool bWasCancelled
);
\`\`\`

---

## 4. 激活条件配置

### 4.1 标签需求（来源：\`GameplayAbility.h\`）

\`\`\`cpp
// 技能激活时，Owner Actor 必须拥有这些标签
UPROPERTY(EditDefaultsOnly, Category = Tags)
FGameplayTagContainer ActivationRequiredTags;

// 技能激活时，Owner Actor 不能拥有这些标签
UPROPERTY(EditDefaultsOnly, Category = Tags)
FGameplayTagContainer ActivationBlockedTags;

// 技能激活时，Source Actor 必须拥有这些标签
UPROPERTY(EditDefaultsOnly, Category = Tags)
FGameplayTagContainer SourceRequiredTags;

// 技能激活时，Target Actor 必须拥有这些标签
UPROPERTY(EditDefaultsOnly, Category = Tags)
FGameplayTagContainer TargetRequiredTags;
\`\`\`

### 4.2 技能自身标签

\`\`\`cpp
// 技能自身的标签（用于被其他系统查询）
UPROPERTY(EditDefaultsOnly, Category = Tags)
FGameplayTagContainer AbilityTags;

// 技能激活时，会给 Owner 添加这些标签（技能结束时自动移除）
UPROPERTY(EditDefaultsOnly, Category = Tags)
FGameplayTagContainer ActivationOwnedTags;

// 技能激活时，会阻止其他拥有这些标签的技能激活
UPROPERTY(EditDefaultsOnly, Category = Tags)
FGameplayTagContainer BlockAbilitiesWithTag;

// 技能激活时，会取消其他拥有这些标签的技能
UPROPERTY(EditDefaultsOnly, Category = Tags)
FGameplayTagContainer CancelAbilitiesWithTag;
\`\`\`

### 4.3 冷却与消耗

\`\`\`cpp
// 冷却效果（一个 GameplayEffect，通常是 HasDuration 类型）
UPROPERTY(EditDefaultsOnly, Category = Cooldowns)
TSubclassOf<class UGameplayEffect> CooldownGameplayEffectClass;

// 消耗效果（一个 GameplayEffect，通常是 Instant 类型，减少 Mana/Stamina 等）
UPROPERTY(EditDefaultsOnly, Category = Costs)
TSubclassOf<class UGameplayEffect> CostGameplayEffectClass;
\`\`\`

---

## 5. 触发器配置

技能可以通过 GameplayTag 事件触发（而不仅仅通过 \`TryActivateAbility\`）：

\`\`\`cpp
// 触发器列表：当指定 GameplayTag 事件发生时，自动激活此技能
UPROPERTY(EditDefaultsOnly, Category = Triggers)
TArray<FAbilityTriggerData> AbilityTriggers;
\`\`\`

\`FAbilityTriggerData\` 结构：
\`\`\`cpp
USTRUCT(BlueprintType)
struct FAbilityTriggerData
{
    // 触发此技能的 GameplayTag
    UPROPERTY(EditDefaultsOnly, Category=GameplayAbility)
    FGameplayTag TriggerTag;

    // 触发来源（GameplayEvent 或 OwnedTag）
    UPROPERTY(EditDefaultsOnly, Category=GameplayAbility)
    TEnumAsByte<EGameplayAbilityTriggerSource::Type> TriggerSource;
};
\`\`\`

---

## 6. ActorInfo：技能的上下文信息

\`FGameplayAbilityActorInfo\` 包含技能执行时需要的所有 Actor 引用：

\`\`\`cpp
struct GAMEPLAYABILITIES_API FGameplayAbilityActorInfo
{
    // 拥有 ASC 的 Actor（通常是 PlayerState 或 Pawn）
    TWeakObjectPtr<AActor> OwnerActor;

    // 实际在世界中的 Actor（通常是 Pawn）
    TWeakObjectPtr<AActor> AvatarActor;

    // PlayerController（可能为 null，如 AI）
    TWeakObjectPtr<APlayerController> PlayerController;

    // 角色的 AbilitySystemComponent
    TWeakObjectPtr<UAbilitySystemComponent> AbilitySystemComponent;

    // 角色的 SkeletalMeshComponent（用于播放动画）
    TWeakObjectPtr<USkeletalMeshComponent> SkeletalMeshComponent;

    // 角色的 AnimInstance
    TWeakObjectPtr<UAnimInstance> AnimInstance;

    // 角色的 MovementComponent
    TWeakObjectPtr<UMovementComponent> MovementComponent;

    // 是否是本地控制（AutonomousProxy 或 Authority）
    bool IsLocallyControlled() const;

    // 是否是服务端权威
    bool IsNetAuthority() const;
};
\`\`\`

---

## 7. 技能中常用的辅助函数

\`\`\`cpp
// 获取 AvatarActor（世界中的 Actor）
AActor* GetAvatarActorFromActorInfo() const;

// 获取 OwnerActor（拥有 ASC 的 Actor）
AActor* GetOwningActorFromActorInfo() const;

// 获取 AbilitySystemComponent
UAbilitySystemComponent* GetAbilitySystemComponentFromActorInfo() const;

// 获取当前技能等级
int32 GetAbilityLevel() const;

// 应用 GameplayEffect 到自身
FActiveGameplayEffectHandle ApplyGameplayEffectToOwner(
    const FGameplayAbilitySpecHandle Handle,
    const FGameplayAbilityActorInfo* ActorInfo,
    const FGameplayAbilityActivationInfo ActivationInfo,
    const UGameplayEffect* GameplayEffect,
    float GameplayEffectLevel,
    int32 Stacks = 1
) const;

// 发送 GameplayEvent
void SendGameplayEvent(FGameplayTag EventTag, FGameplayEventData Payload);
\`\`\`

---

## 8. 典型技能实现模板

\`\`\`cpp
// 典型的 InstancedPerActor 技能实现
void UMyAttackAbility::ActivateAbility(
    const FGameplayAbilitySpecHandle Handle,
    const FGameplayAbilityActorInfo* ActorInfo,
    const FGameplayAbilityActivationInfo ActivationInfo,
    const FGameplayEventData* TriggerEventData)
{
    // 1. 检查并提交（消耗资源 + 应用冷却）
    if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
    {
        EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
        return;
    }

    // 2. 播放蒙太奇并等待完成
    UAbilityTask_PlayMontageAndWait* Task =
        UAbilityTask_PlayMontageAndWait::CreatePlayMontageAndWaitProxy(
            this, NAME_None, AttackMontage, 1.0f
        );

    // 3. 绑定完成回调
    Task->OnCompleted.AddDynamic(this, &UMyAttackAbility::OnMontageCompleted);
    Task->OnCancelled.AddDynamic(this, &UMyAttackAbility::OnMontageCancelled);
    Task->OnInterrupted.AddDynamic(this, &UMyAttackAbility::OnMontageInterrupted);

    // 4. 激活任务
    Task->ReadyForActivation();
}

void UMyAttackAbility::OnMontageCompleted()
{
    // 技能正常完成
    EndAbility(CurrentSpecHandle, CurrentActorInfo, CurrentActivationInfo, true, false);
}
\`\`\`

---

## 9. 网络执行流程

\`\`\`mermaid
sequenceDiagram
    participant Client as 客户端（AutonomousProxy）
    participant Server as 服务端（Authority）

    Client->>Client: TryActivateAbility()
    Note over Client: LocalPredicted 策略
    Client->>Client: 本地立即执行 ActivateAbility()
    Client->>Server: ServerTryActivateAbility RPC\\n（携带 PredictionKey）

    Server->>Server: 验证激活条件
    alt 验证通过
        Server->>Server: 执行 ActivateAbility()
        Server->>Client: ClientActivateAbilitySucceed RPC
        Note over Client: 确认预测，继续执行
    else 验证失败
        Server->>Client: ClientActivateAbilityFailed RPC
        Note over Client: 回滚预测结果
    end
\`\`\`
`;

docs['04'] = `# AttributeSet 属性系统详解

> **源码文件**：\`Public/AttributeSet.h\`（21.16 KB，571行）
> **继承链**：\`UObject → UAttributeSet\`

---

## 1. 概述

\`UAttributeSet\` 是 GAS 中**属性的容器**，用于定义和持有角色的数值属性（如生命值、攻击力、防御力等）。

核心特点：
- 属性以 \`FGameplayAttributeData\` 结构存储，包含 **BaseValue**（基础值）和 **CurrentValue**（当前值）
- 通过 \`ATTRIBUTE_ACCESSORS\` 宏自动生成访问器
- 提供 \`PreAttributeChange\` 和 \`PostGameplayEffectExecute\` 回调，用于属性修改的拦截和后处理
- 支持网络复制（每个属性单独配置复制）

---

## 2. FGameplayAttributeData：属性数据结构

来源：\`Public/AttributeSet.h\`

\`\`\`cpp
USTRUCT(BlueprintType)
struct GAMEPLAYABILITIES_API FGameplayAttributeData
{
    GENERATED_BODY()

    FGameplayAttributeData()
        : BaseValue(0.f), CurrentValue(0.f) {}

    FGameplayAttributeData(float DefaultValue)
        : BaseValue(DefaultValue), CurrentValue(DefaultValue) {}

    // 获取当前值（受 Modifier 影响的最终值）
    float GetCurrentValue() const { return CurrentValue; }

    // 设置当前值（通常由 GAS 内部调用，不要直接调用）
    virtual void SetCurrentValue(float NewValue) { CurrentValue = NewValue; }

    // 获取基础值（不受 Modifier 影响的原始值）
    float GetBaseValue() const { return BaseValue; }

    // 设置基础值（Instant GE 修改的是 BaseValue）
    virtual void SetBaseValue(float NewValue) { BaseValue = NewValue; }

protected:
    UPROPERTY(BlueprintReadOnly, Category = "Attribute")
    float BaseValue;

    UPROPERTY(BlueprintReadOnly, Category = "Attribute")
    float CurrentValue;
};
\`\`\`

### BaseValue vs CurrentValue 的区别

| 值类型 | 说明 | 何时修改 |
|--------|------|----------|
| **BaseValue** | 属性的基础值，持久存储 | \`Instant\` 类型 GE 修改 |
| **CurrentValue** | 当前实际值 = BaseValue + 所有激活 Modifier 的叠加 | \`Duration/Infinite\` 类型 GE 的 Modifier 影响 |

---

## 3. ATTRIBUTE_ACCESSORS 宏

来源：\`Public/AttributeSet.h\`

这是定义属性时最重要的宏，自动生成 4 个访问器函数：

\`\`\`cpp
// 宏定义（来源：AttributeSet.h）
#define ATTRIBUTE_ACCESSORS(ClassName, PropertyName) \\
    GAMEPLAYATTRIBUTE_PROPERTY_GETTER(ClassName, PropertyName) \\
    GAMEPLAYATTRIBUTE_VALUE_GETTER(PropertyName) \\
    GAMEPLAYATTRIBUTE_VALUE_SETTER(PropertyName) \\
    GAMEPLAYATTRIBUTE_VALUE_INITTER(PropertyName)
\`\`\`

展开后等价于：

\`\`\`cpp
// 1. 获取 FGameplayAttribute 对象（用于注册监听、构建 GE 等）
static FGameplayAttribute GetHealthAttribute();

// 2. 获取当前值
float GetHealth() const { return Health.GetCurrentValue(); }

// 3. 设置当前值（直接设置，不通过 GE）
void SetHealth(float NewVal);

// 4. 初始化值（仅用于初始化，不触发回调）
void InitHealth(float NewVal) { Health.SetBaseValue(NewVal); Health.SetCurrentValue(NewVal); }
\`\`\`

---

## 4. 定义属性集的完整示例

### 4.1 头文件（.h）

\`\`\`cpp
UCLASS()
class UMyAttributeSet : public UAttributeSet
{
    GENERATED_BODY()

public:
    UMyAttributeSet();

    // 必须重写：注册网络复制属性
    virtual void GetLifetimeReplicatedProps(
        TArray<FLifetimeProperty>& OutLifetimeProps) const override;

    // 属性修改前回调（用于限制属性范围）
    virtual void PreAttributeChange(
        const FGameplayAttribute& Attribute, float& NewValue) override;

    // GE 执行后回调（用于处理属性变化的副作用）
    virtual void PostGameplayEffectExecute(
        const FGameplayEffectModCallbackData& Data) override;

    // ==================== 属性定义 ====================

    // 生命值
    UPROPERTY(BlueprintReadOnly, Category="Attributes", ReplicatedUsing=OnRep_Health)
    FGameplayAttributeData Health;
    ATTRIBUTE_ACCESSORS(UMyAttributeSet, Health)

    // 最大生命值
    UPROPERTY(BlueprintReadOnly, Category="Attributes", ReplicatedUsing=OnRep_MaxHealth)
    FGameplayAttributeData MaxHealth;
    ATTRIBUTE_ACCESSORS(UMyAttributeSet, MaxHealth)

    // 攻击力
    UPROPERTY(BlueprintReadOnly, Category="Attributes", ReplicatedUsing=OnRep_AttackPower)
    FGameplayAttributeData AttackPower;
    ATTRIBUTE_ACCESSORS(UMyAttributeSet, AttackPower)

    // 伤害（临时属性，不复制，用于伤害计算中间值）
    UPROPERTY(BlueprintReadOnly, Category="Attributes")
    FGameplayAttributeData Damage;
    ATTRIBUTE_ACCESSORS(UMyAttributeSet, Damage)

protected:
    UFUNCTION()
    virtual void OnRep_Health(const FGameplayAttributeData& OldHealth);

    UFUNCTION()
    virtual void OnRep_MaxHealth(const FGameplayAttributeData& OldMaxHealth);

    UFUNCTION()
    virtual void OnRep_AttackPower(const FGameplayAttributeData& OldAttackPower);
};
\`\`\`

### 4.2 实现文件（.cpp）

\`\`\`cpp
void UMyAttributeSet::GetLifetimeReplicatedProps(
    TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    DOREPLIFETIME_CONDITION_NOTIFY(UMyAttributeSet, Health, COND_None, REPNOTIFY_Always);
    DOREPLIFETIME_CONDITION_NOTIFY(UMyAttributeSet, MaxHealth, COND_None, REPNOTIFY_Always);
    DOREPLIFETIME_CONDITION_NOTIFY(UMyAttributeSet, AttackPower, COND_None, REPNOTIFY_Always);
}

void UMyAttributeSet::PreAttributeChange(
    const FGameplayAttribute& Attribute, float& NewValue)
{
    Super::PreAttributeChange(Attribute, NewValue);

    // 限制 Health 在 [0, MaxHealth] 范围内
    if (Attribute == GetHealthAttribute())
    {
        NewValue = FMath::Clamp(NewValue, 0.0f, GetMaxHealth());
    }
}

void UMyAttributeSet::PostGameplayEffectExecute(
    const FGameplayEffectModCallbackData& Data)
{
    Super::PostGameplayEffectExecute(Data);

    // 处理 Damage 属性（伤害计算完成后，转换为 Health 减少）
    if (Data.EvaluatedData.Attribute == GetDamageAttribute())
    {
        const float LocalDamageDone = GetDamage();
        SetDamage(0.f);

        if (LocalDamageDone > 0.f)
        {
            const float NewHealth = GetHealth() - LocalDamageDone;
            SetHealth(FMath::Clamp(NewHealth, 0.0f, GetMaxHealth()));

            if (GetHealth() <= 0.f)
            {
                // 触发死亡逻辑...
            }
        }
    }
}

// 网络复制回调实现（必须使用此宏）
void UMyAttributeSet::OnRep_Health(const FGameplayAttributeData& OldHealth)
{
    GAMEPLAYATTRIBUTE_REPNOTIFY(UMyAttributeSet, Health, OldHealth);
}
\`\`\`

---

## 5. 关键回调函数详解

### 5.1 PreAttributeChange

\`\`\`cpp
// 在属性值即将改变时调用（CurrentValue 改变前）
// 注意：此时修改 NewValue 可以限制属性范围
// 注意：此回调对 BaseValue 的修改无效，只影响 CurrentValue
virtual void PreAttributeChange(
    const FGameplayAttribute& Attribute,
    float& NewValue
);
\`\`\`

> **重要说明**（来源：\`AttributeSet.h\` 注释）：
> \`PreAttributeChange\` 只在 \`CurrentValue\` 改变时调用，不在 \`BaseValue\` 改变时调用。
> 如果需要在 \`BaseValue\` 改变时做处理，应使用 \`PostGameplayEffectExecute\`。

### 5.2 PostGameplayEffectExecute

\`\`\`cpp
// 在 GameplayEffect 执行完成后调用（属性已经改变）
// 此时可以安全地读取新值并处理副作用
// 注意：只在服务端调用（Authority）
virtual void PostGameplayEffectExecute(
    const FGameplayEffectModCallbackData& Data
);
\`\`\`

\`FGameplayEffectModCallbackData\` 包含：
\`\`\`cpp
struct FGameplayEffectModCallbackData
{
    const FGameplayEffectSpec& EffectSpec;      // 触发此回调的 GE 规格
    FGameplayModifierEvaluatedData& EvaluatedData; // 评估后的修改数据
    UAbilitySystemComponent& Target;            // 目标 ASC
};
\`\`\`

### 5.3 PreAttributeBaseChange

\`\`\`cpp
// 在属性 BaseValue 即将改变时调用
// 可以在此限制 BaseValue 的范围
virtual void PreAttributeBaseChange(
    const FGameplayAttribute& Attribute,
    float& NewValue
) const;
\`\`\`

---

## 6. 属性初始化

### 6.1 通过 GameplayEffect 初始化（推荐）

\`\`\`cpp
// 创建一个 Instant 类型的 GE，用于初始化属性
// 在 BeginPlay 时应用
AbilitySystemComponent->ApplyGameplayEffectToSelf(
    InitialAttributesEffect,
    1.0f,
    AbilitySystemComponent->MakeEffectContext()
);
\`\`\`

---

## 7. AttributeSet 的注册方式

\`\`\`cpp
// 方式一：在 Actor 构造函数中创建（推荐）
AMyCharacter::AMyCharacter()
{
    AbilitySystemComponent = CreateDefaultSubobject<UAbilitySystemComponent>(TEXT("ASC"));
    AttributeSet = CreateDefaultSubobject<UMyAttributeSet>(TEXT("AttributeSet"));
    // AttributeSet 会自动注册到 ASC（因为它是 ASC 所在 Actor 的子对象）
}

// 方式二：运行时添加
AbilitySystemComponent->AddAttributeSetSubobject(NewAttributeSet);
\`\`\`

---

## 8. 属性修改流程

\`\`\`mermaid
flowchart TD
    A["GameplayEffect 执行"] --> B{"GE 持续类型"}
    B -->|"Instant"| C["修改 BaseValue"]
    B -->|"Duration/Infinite"| D["添加 Modifier\\n影响 CurrentValue"]

    C --> E["PreAttributeBaseChange()\\n可限制 BaseValue 范围"]
    E --> F["BaseValue 更新"]
    F --> G["重新计算 CurrentValue\\n= BaseValue + 所有 Modifier"]
    G --> H["PostGameplayEffectExecute()\\n处理副作用（如死亡判断）"]

    D --> I["PreAttributeChange()\\n可限制 CurrentValue 范围"]
    I --> J["CurrentValue 更新"]
    J --> K["触发 OnGameplayAttributeValueChange 委托\\n通知监听者"]
\`\`\`
`;

docs['05'] = `# GameplayEffect 效果系统详解

> **源码文件**：\`Public/GameplayEffect.h\`（85.41 KB，2082行）、\`Public/GameplayEffectTypes.h\`（48.92 KB，1704行）
> **继承链**：\`UObject → UGameplayEffect\`

---

## 1. 概述

\`UGameplayEffect\`（GE）是 GAS 中**定义数值修改规则的数据资产**。它本身不包含逻辑，只是一个配置数据对象，描述"如何修改属性"。

核心能力：
- **修改属性**：通过 Modifier 对 AttributeSet 中的属性进行加减乘除或覆盖
- **授予标签**：激活时给目标添加 GameplayTag，移除时自动清除
- **授予技能**：激活时给目标授予 GameplayAbility
- **触发 Cue**：激活时触发 GameplayCue（表现层）
- **自定义计算**：通过 ExecutionCalculation 实现复杂的伤害公式
- **堆叠管理**：支持多层叠加，控制叠加策略

---

## 2. GE 持续类型

来源：\`Public/GameplayEffect.h\`

\`\`\`cpp
UENUM(BlueprintType)
namespace EGameplayEffectDurationType
{
    enum Type
    {
        // 瞬时效果：立即执行，修改 BaseValue，不在 ActiveGameplayEffects 中保留
        // 适用于：伤害、治疗、一次性属性修改
        Instant,

        // 无限持续：持续存在，直到被手动移除
        // 适用于：永久 Buff、装备加成
        Infinite,

        // 有限持续时间：持续指定时间后自动移除
        // 适用于：临时 Buff/Debuff、冷却效果
        HasDuration,
    };
}
\`\`\`

### 三种类型的行为差异

| 特性 | Instant | HasDuration | Infinite |
|------|---------|-------------|---------|
| 修改 BaseValue | ✅ | ❌ | ❌ |
| 修改 CurrentValue | ❌ | ✅（持续期间） | ✅（持续期间） |
| 保存在 ActiveGameplayEffects | ❌ | ✅ | ✅ |
| 可以被移除 | ❌（已执行） | ✅（到期自动移除） | ✅（需手动移除） |
| 触发 OnActive/OnRemove Cue | ❌ | ✅ | ✅ |
| 触发 Executed Cue | ✅ | 可选（周期触发） | 可选（周期触发） |

---

## 3. 修改器（Modifier）

修改器定义了 GE 如何修改属性。

### 3.1 FGameplayModifierInfo 结构

来源：\`Public/GameplayEffect.h\`

\`\`\`cpp
USTRUCT(BlueprintType)
struct GAMEPLAYABILITIES_API FGameplayModifierInfo
{
    // 要修改的属性（如 UMyAttributeSet::GetHealthAttribute()）
    UPROPERTY(EditDefaultsOnly, Category=GameplayModifier)
    FGameplayAttribute Attribute;

    // 修改操作类型
    UPROPERTY(EditDefaultsOnly, Category=GameplayModifier)
    TEnumAsByte<EGameplayModOp::Type> ModifierOp;

    // 修改数值（支持多种计算方式）
    UPROPERTY(EditDefaultsOnly, Category=GameplayModifier)
    FGameplayEffectModifierMagnitude ModifierMagnitude;

    // 此修改器生效的标签需求
    UPROPERTY(EditDefaultsOnly, Category=GameplayModifier)
    FGameplayTagRequirements SourceTags;

    UPROPERTY(EditDefaultsOnly, Category=GameplayModifier)
    FGameplayTagRequirements TargetTags;
};
\`\`\`

### 3.2 修改操作类型（EGameplayModOp）

来源：\`Public/GameplayEffectTypes.h\`

\`\`\`cpp
namespace EGameplayModOp
{
    enum Type
    {
        Additive = 0,    // 加法：CurrentValue += Magnitude
        Multiplicitive,  // 乘法：CurrentValue *= Magnitude
        Division,        // 除法：CurrentValue /= Magnitude
        Override,        // 覆盖：CurrentValue = Magnitude（忽略原值）
        Max
    };
}
\`\`\`

> **注意**：\`Multiplicitive\` 的计算方式是 \`CurrentValue * Magnitude\`，而不是 \`CurrentValue * (1 + Magnitude)\`。如果想实现"增加 20% 攻击力"，Magnitude 应设为 \`1.2\`，而不是 \`0.2\`。

### 3.3 修改数值来源（FGameplayEffectModifierMagnitude）

GE 的修改数值支持多种计算方式：

\`\`\`cpp
UENUM(BlueprintType)
enum class EGameplayEffectMagnitudeCalculation : uint8
{
    ScalableFloat,          // 固定数值（最简单）
    AttributeBased,         // 从属性捕获（如：伤害 = 攻击力 * 系数）
    CustomCalculationClass, // 自定义计算类（MMC）
    SetByCaller,            // 由调用者在运行时设置数值
};
\`\`\`

#### SetByCaller 使用示例

\`\`\`cpp
// 1. 在 GE 中配置 Modifier，选择 SetByCaller 类型，设置 DataTag
// DataTag: Moe.Effect.SetByCaller.Damage

// 2. 在代码中构建 Spec 并设置数值
FGameplayEffectSpecHandle SpecHandle = AbilitySystemComponent->MakeOutgoingSpec(
    DamageEffectClass, AbilityLevel, EffectContext
);
// 通过 Tag 设置数值
SpecHandle.Data->SetSetByCallerMagnitude(
    FGameplayTag::RequestGameplayTag("Moe.Effect.SetByCaller.Damage"),
    DamageAmount
);
// 应用效果
AbilitySystemComponent->ApplyGameplayEffectSpecToTarget(*SpecHandle.Data, TargetASC);
\`\`\`

---

## 4. 自定义执行计算（ExecutionCalculation）

当简单的 Modifier 无法满足需求时（如需要同时读取多个属性进行复杂计算），使用 \`UGameplayEffectExecutionCalculation\`。

\`\`\`cpp
// 伤害计算类示例
UCLASS()
class UMyDamageExecCalc : public UGameplayEffectExecutionCalculation
{
    GENERATED_BODY()

    DECLARE_ATTRIBUTE_CAPTUREDEF(AttackPower);   // 来源方攻击力
    DECLARE_ATTRIBUTE_CAPTUREDEF(Defense);       // 目标方防御力

public:
    UMyDamageExecCalc()
    {
        DEFINE_ATTRIBUTE_CAPTUREDEF(UMyAttributeSet, AttackPower, Source, true);
        DEFINE_ATTRIBUTE_CAPTUREDEF(UMyAttributeSet, Defense, Target, false);
        RelevantAttributesToCapture.Add(AttackPowerDef);
        RelevantAttributesToCapture.Add(DefenseDef);
    }

    virtual void Execute_Implementation(
        const FGameplayEffectCustomExecutionParameters& ExecutionParams,
        OUT FGameplayEffectCustomExecutionOutput& OutExecutionOutput) const override
    {
        float AttackPower = 0.f, Defense = 0.f;
        FAggregatorEvaluateParameters EvalParams;
        ExecutionParams.AttemptCalculateCapturedAttributeMagnitude(AttackPowerDef, EvalParams, AttackPower);
        ExecutionParams.AttemptCalculateCapturedAttributeMagnitude(DefenseDef, EvalParams, Defense);

        float FinalDamage = FMath::Max(AttackPower - Defense * 0.5f, 1.0f);

        OutExecutionOutput.AddOutputModifier(
            FGameplayModifierEvaluatedData(
                UMyAttributeSet::GetDamageAttribute(),
                EGameplayModOp::Additive,
                FinalDamage
            )
        );
    }
};
\`\`\`

---

## 5. 标签授予

GE 激活时可以给目标授予 GameplayTag：

\`\`\`cpp
// GE 激活时授予，移除时自动清除（最常用）
UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category=Tags)
FInheritedTagContainer InheritableOwnedTagsContainer;

// GE 激活时授予，移除时自动清除（仅在 GE 激活期间有效）
UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category=Tags)
FGameplayTagContainer DynamicGrantedTags;
\`\`\`

---

## 6. 技能授予

GE 激活时可以给目标授予 GameplayAbility：

\`\`\`cpp
// GE 激活时授予技能，GE 移除时自动移除技能
UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category=GameplayEffect)
TArray<FGameplayAbilitySpecDef> GrantedAbilities;
\`\`\`

---

## 7. 堆叠系统

### 7.1 堆叠类型

\`\`\`cpp
UENUM(BlueprintType)
enum class EGameplayEffectStackingType : uint8
{
    None,               // 不堆叠：每次应用都是独立实例
    AggregateBySource,  // 按来源堆叠：同一来源的 GE 叠加
    AggregateByTarget,  // 按目标堆叠：同一目标上的 GE 叠加（最常用）
};
\`\`\`

### 7.2 堆叠相关配置

\`\`\`cpp
UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category=Stacking)
EGameplayEffectStackingType StackingType;

UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category=Stacking)
int32 StackLimitCount;  // 最大堆叠数

UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category=Stacking)
EGameplayEffectStackingDurationPolicy StackDurationRefreshPolicy;

UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category=Stacking)
EGameplayEffectStackingExpirationPolicy StackExpirationPolicy;
\`\`\`

---

## 8. 周期执行（Periodic）

\`HasDuration\` 和 \`Infinite\` 类型的 GE 可以配置周期执行：

\`\`\`cpp
// 周期执行间隔（秒）
UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category=Period)
FScalableFloat Period;

// 是否在应用时立即执行一次
UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category=Period)
bool bExecutePeriodicEffectOnApplication;
\`\`\`

---

## 9. FGameplayEffectSpec：运行时效果规格

\`UGameplayEffect\` 是静态数据资产，\`FGameplayEffectSpec\` 是运行时的实例化数据：

\`\`\`cpp
struct GAMEPLAYABILITIES_API FGameplayEffectSpec
{
    TWeakObjectPtr<const UGameplayEffect> Def;  // 对应的 GE 资产
    FGameplayEffectContextHandle EffectContext;  // 效果上下文（来源信息）
    float Level;                                // 效果等级
    float Duration;                             // 持续时间（运行时计算后的值）
    float Period;                               // 周期（运行时计算后的值）
    TMap<FGameplayTag, float> SetByCallerTagMagnitudes; // SetByCaller 数值 Map
    FTagContainerAggregator CapturedSourceTags; // 捕获的来源标签
    FTagContainerAggregator CapturedTargetTags; // 捕获的目标标签
    FGameplayTagContainer DynamicGrantedTags;   // 动态授予的标签
};
\`\`\`

---

## 10. FActiveGameplayEffect：激活中的效果

\`\`\`cpp
struct GAMEPLAYABILITIES_API FActiveGameplayEffect : public FFastArraySerializerItem
{
    FActiveGameplayEffectHandle Handle;  // 唯一句柄（用于后续引用和移除）
    FGameplayEffectSpec Spec;            // 效果规格（包含所有运行时数据）
    FPredictionKey PredictionKey;        // 预测键（客户端预测使用）
    float StartServerWorldTime;          // 开始时间
    bool bIsInhibited;                   // 是否被抑制（标签条件不满足时暂时失效）
};
\`\`\`

---

## 11. GE 应用完整流程

\`\`\`mermaid
flowchart TD
    A["ApplyGameplayEffectToTarget()"] --> B["创建 FGameplayEffectSpec\\n（包含 Level、Context、SetByCaller 等）"]
    B --> C["检查应用条件\\n（ApplicationTagRequirements）"]
    C -->|"不满足"| D["应用失败，返回无效 Handle"]
    C -->|"满足"| E{"GE 持续类型"}

    E -->|"Instant"| F["立即执行 Modifier\\n修改 BaseValue"]
    F --> G["触发 PostGameplayEffectExecute 回调"]
    G --> H["触发 Executed GameplayCue"]

    E -->|"Duration/Infinite"| I["添加到 ActiveGameplayEffects"]
    I --> J["应用 Modifier 到 CurrentValue"]
    J --> K["授予标签（GrantedTags）"]
    K --> L["授予技能（GrantedAbilities）"]
    L --> M["触发 OnActive/WhileActive GameplayCue"]
    M --> N{"HasDuration?"}
    N -->|"是"| O["启动持续时间计时器"]
    O --> P["到期后移除\\n触发 OnRemove Cue"]
    N -->|"否（Infinite）"| Q["持续存在\\n等待手动移除"]
\`\`\`
`;

docs['06'] = `# GameplayTag 标签系统详解

> **源码文件**：\`Public/GameplayEffectTypes.h\`（48.92 KB，1704行）
> **注意**：GameplayTag 本身定义在 UE4 引擎核心（\`GameplayTagContainer.h\`），本文档重点介绍 GAS 中对 GameplayTag 的扩展使用

---

## 1. 概述

GameplayTag 是 UE4 提供的**层级化字符串标签系统**，在 GAS 中被广泛用于：

- **技能激活条件**：技能需要/阻止哪些标签
- **效果条件**：GE 的应用/移除条件
- **状态管理**：通过标签表示角色状态（眩晕、沉默等）
- **事件通信**：通过 GameplayTag 发送和监听游戏事件
- **Cue 触发**：通过标签触发表现层效果

---

## 2. FGameplayTagCountContainer：标签计数容器

来源：\`Public/GameplayEffectTypes.h\`

GAS 在 ASC 内部使用 \`FGameplayTagCountContainer\` 来追踪标签的**引用计数**（而不是简单的有/无）。

\`\`\`cpp
struct GAMEPLAYABILITIES_API FGameplayTagCountContainer
{
    // 检查是否拥有某个标签（包含父标签匹配）
    FORCEINLINE bool HasMatchingGameplayTag(FGameplayTag TagToCheck) const
    {
        return GameplayTagCountMap.FindRef(TagToCheck) > 0;
    }

    // 检查是否拥有所有标签
    FORCEINLINE bool HasAllMatchingGameplayTags(
        const FGameplayTagContainer& TagContainer) const;

    // 检查是否拥有任意标签
    FORCEINLINE bool HasAnyMatchingGameplayTags(
        const FGameplayTagContainer& TagContainer) const;

    // 更新标签计数（CountDelta 可以为正或负）
    FORCEINLINE bool UpdateTagCount(const FGameplayTag& Tag, int32 CountDelta);

    // 注册标签变化事件
    FOnGameplayEffectTagCountChanged& RegisterGameplayTagEvent(
        const FGameplayTag& Tag,
        EGameplayTagEventType::Type EventType = EGameplayTagEventType::NewOrRemoved
    );

private:
    TMap<FGameplayTag, int32> GameplayTagCountMap;   // 标签 → 计数（包含父标签）
    TMap<FGameplayTag, int32> ExplicitTagCountMap;   // 标签 → 显式计数（不包含父标签）
    FGameplayTagContainer ExplicitTags;              // 显式添加的标签容器
    TMap<FGameplayTag, FDelegateInfo> GameplayTagEventMap; // 标签变化事件 Map
};
\`\`\`

### 为什么使用计数而不是布尔值？

因为同一个标签可能被多个来源同时添加（例如：两个不同的 GE 都授予了 \`State.Stunned\` 标签）。使用计数可以确保只有当**所有来源都移除**后，标签才真正消失。

---

## 3. 标签事件类型

来源：\`Public/GameplayEffectTypes.h\`

\`\`\`cpp
UENUM(BlueprintType)
namespace EGameplayTagEventType
{
    enum Type
    {
        // 仅在标签从无到有（计数 0→1）或从有到无（计数 1→0）时触发
        // 适用于：状态变化监听（如：进入/退出眩晕状态）
        NewOrRemoved,

        // 每次计数变化都触发（包括 1→2、2→1 等）
        // 适用于：需要知道精确计数的场景
        AnyCountChange,
    };
}
\`\`\`

---

## 4. 标签相关委托

来源：\`Public/GameplayEffectTypes.h\`

\`\`\`cpp
// 标签计数变化委托（参数：Tag, 新计数）
DECLARE_MULTICAST_DELEGATE_TwoParams(FOnGameplayEffectTagCountChanged, const FGameplayTag, int32);

// 属性值变化委托
DECLARE_MULTICAST_DELEGATE_OneParam(FOnGameplayAttributeValueChange, const FOnAttributeChangeData&);

// 激活效果移除委托
DECLARE_MULTICAST_DELEGATE_OneParam(FOnActiveGameplayEffectRemoved_Info, const FGameplayEffectRemovalInfo&);

// 激活效果堆叠数变化委托
DECLARE_MULTICAST_DELEGATE_ThreeParams(
    FOnActiveGameplayEffectStackChange,
    FActiveGameplayEffectHandle,
    int32 /*NewStackCount*/,
    int32 /*PreviousStackCount*/
);
\`\`\`

---

## 5. FGameplayTagRequirements：标签需求结构

来源：\`Public/GameplayEffectTypes.h\`

\`\`\`cpp
USTRUCT(BlueprintType)
struct GAMEPLAYABILITIES_API FGameplayTagRequirements
{
    GENERATED_USTRUCT_BODY()

    // 必须全部拥有这些标签
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = GameplayModifier)
    FGameplayTagContainer RequireTags;

    // 不能拥有这些标签中的任何一个
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = GameplayModifier)
    FGameplayTagContainer IgnoreTags;

    // 检查是否满足需求
    bool RequirementsMet(const FGameplayTagContainer& Container) const;

    // 是否为空（无任何需求）
    bool IsEmpty() const;
};
\`\`\`

---

## 6. FMinimalReplicationTagCountMap：网络复制标签 Map

来源：\`Public/GameplayEffectTypes.h\`

\`\`\`cpp
USTRUCT()
struct GAMEPLAYABILITIES_API FMinimalReplicationTagCountMap
{
    TMap<FGameplayTag, int32> TagMap;  // 标签 → 计数 Map（用于网络复制）

    UPROPERTY()
    class UAbilitySystemComponent* Owner;

    void AddTag(const FGameplayTag& Tag);
    void RemoveTag(const FGameplayTag& Tag);

    // 自定义网络序列化（高效压缩）
    bool NetSerialize(FArchive& Ar, class UPackageMap* Map, bool& bOutSuccess);
};
\`\`\`

> **设计说明**：GAS 使用两个不同的标签 Map 进行复制：
> - \`MinimalReplicationTags\`：复制给所有客户端（用于模拟端）
> - \`ReplicatedTagCountMap\`：仅复制给拥有者（用于本地玩家）

---

## 7. GameplayCue 事件类型

来源：\`Public/GameplayEffectTypes.h\`

\`\`\`cpp
UENUM(BlueprintType)
namespace EGameplayCueEvent
{
    enum Type
    {
        OnActive,    // GE 激活时触发（Duration/Infinite 类型 GE 应用时）
        WhileActive, // GE 激活期间持续触发（用于 Join-in-progress 同步）
        Executed,    // 瞬时执行时触发（Instant GE 或周期执行时）
        Removed      // GE 移除时触发
    };
}
\`\`\`

---

## 8. FGameplayCueParameters：Cue 参数

来源：\`Public/GameplayEffectTypes.h\`

\`\`\`cpp
USTRUCT(BlueprintType)
struct GAMEPLAYABILITIES_API FGameplayCueParameters
{
    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    float NormalizedMagnitude;  // 归一化强度（0-1）

    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    float RawMagnitude;         // 原始强度（实际数值，如伤害值）

    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    FGameplayEffectContextHandle EffectContext;  // 效果上下文

    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    FGameplayTag MatchedTagName;  // 匹配到的标签名

    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    FVector_NetQuantize10 Location;  // 位置

    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    FVector_NetQuantizeNormal Normal;  // 法线

    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    TWeakObjectPtr<AActor> Instigator;  // 施法者 Actor

    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    TWeakObjectPtr<AActor> EffectCauser;  // 效果来源 Actor

    UPROPERTY(BlueprintReadWrite, Category = GameplayCue)
    int32 GameplayEffectLevel;  // GE 等级

    UPROPERTY(BlueprintReadWrite, Category = GameplayCue)
    int32 AbilityLevel;  // 技能等级
};
\`\`\`

---

## 9. 本项目 GameplayTag 规范

基于项目画像中的信息，本项目（LetsGo）使用以下 GameplayTag 命名规范：

\`\`\`
Moe
├── GAS
│   ├── Ability
│   │   ├── ActiveAbility.*      ← 主动技能标签
│   │   └── PassiveAbility.*     ← 被动技能标签
│   └── GameEvent.*              ← 游戏事件标签
├── Effect
│   ├── Buff.*                   ← Buff 效果标签
│   ├── SetByCaller.*            ← SetByCaller 数值传递标签
│   └── GameEvent.*              ← 效果相关游戏事件
└── State.*                      ← 状态标签（眩晕、沉默等）

Chest                            ← 宝箱模式专用
├── Ability
│   ├── Type
│   │   ├── Active
│   │   │   ├── Interact.*       ← 交互类主动技能
│   │   │   ├── Normal.*         ← 普通主动技能
│   │   │   └── Prop.*           ← 道具类主动技能
│   │   └── Passive.*            ← 被动技能
│   └── CoolDown.*               ← 冷却标签
└── State.*                      ← 宝箱模式状态标签
\`\`\`

---

## 10. 标签使用最佳实践

### 10.1 监听标签变化

\`\`\`cpp
// 监听 State.Stunned 标签的添加/移除
AbilitySystemComponent->RegisterGameplayTagEvent(
    FGameplayTag::RequestGameplayTag("Moe.State.Stunned"),
    EGameplayTagEventType::NewOrRemoved
).AddUObject(this, &AMyCharacter::OnStunnedTagChanged);

void AMyCharacter::OnStunnedTagChanged(const FGameplayTag Tag, int32 NewCount)
{
    if (NewCount > 0)
    {
        StartStunAnimation();  // 进入眩晕状态
    }
    else
    {
        StopStunAnimation();   // 退出眩晕状态
    }
}
\`\`\`

### 10.2 通过标签激活技能

\`\`\`cpp
FGameplayTagContainer AbilityTags;
AbilityTags.AddTag(FGameplayTag::RequestGameplayTag("Moe.GAS.Ability.ActiveAbility.Attack"));
AbilitySystemComponent->TryActivateAbilitiesByTag(AbilityTags);
\`\`\`

### 10.3 发送游戏事件

\`\`\`cpp
FGameplayEventData EventData;
EventData.Instigator = this;
EventData.Target = TargetActor;
EventData.EventMagnitude = DamageAmount;

AbilitySystemComponent->HandleGameplayEvent(
    FGameplayTag::RequestGameplayTag("Moe.GAS.GameEvent.HitConfirm"),
    &EventData
);
\`\`\`
`;
