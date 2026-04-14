# GAS 整体架构概述

> **源码依据**：综合分析 `AbilitySystemComponent.h`、`GameplayAbility.h`、`AttributeSet.h`、`GameplayEffect.h`、`AbilitySystemInterface.h`、`AbilitySystemGlobals.h`

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
| `UAbilitySystemComponent` | UActorComponent 子类 | **核心枢纽**，管理所有 GAS 功能 |
| `UGameplayAbility` | UObject 子类 | 定义单个技能的完整行为逻辑 |
| `UAttributeSet` | UObject 子类 | 定义并持有角色属性数值 |
| `UGameplayEffect` | UObject 子类（数据资产） | 定义对属性的修改规则 |
| `FGameplayTag` | 结构体 | 层级化标签，用于条件判断和通信 |
| `UGameplayCueNotify_*` | UObject/AActor 子类 | 技能表现层（特效、音效等） |
| `UAbilityTask` | UGameplayTask 子类 | 技能内的异步操作 |

---

## 3. 类继承关系

```mermaid
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
        +ActivatableAbilities: FGameplayAbilitySpecContainer
        +ActiveGameplayEffects: FActiveGameplayEffectsContainer
        +SpawnedAttributes: TArray~UAttributeSet~
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
        +DurationPolicy: EGameplayEffectDurationType
        +Modifiers: TArray~FGameplayModifierInfo~
        +Executions: TArray~FGameplayEffectExecutionDefinition~
    }
```

---

## 4. Actor 接入 GAS 的方式

### 4.1 IAbilitySystemInterface 接口

来源：`Public/AbilitySystemInterface.h`

```cpp
// Actor 需要实现此接口，才能被 GAS 系统识别
class GAMEPLAYABILITIES_API IAbilitySystemInterface
{
    GENERATED_IINTERFACE_BODY()

    // 返回该 Actor 使用的 AbilitySystemComponent
    // 注意：ASC 可以不在 Actor 自身上，例如 Pawn 可以使用 PlayerState 上的 ASC
    virtual UAbilitySystemComponent* GetAbilitySystemComponent() const = 0;
};
```

### 4.2 两种常见的 ASC 归属方式

**方式一：ASC 在 Pawn 自身上**
```
APawn
  └── UAbilitySystemComponent  ← ASC 直接挂在 Pawn 上
  └── UMyAttributeSet          ← AttributeSet 也在 Pawn 上
```

**方式二：ASC 在 PlayerState 上（推荐用于玩家角色）**
```
APlayerState
  └── UAbilitySystemComponent  ← ASC 在 PlayerState 上（跨 Pawn 持久化）
  └── UMyAttributeSet

APawn
  └── 实现 IAbilitySystemInterface，返回 PlayerState 上的 ASC
```

> **为什么推荐方式二？** 当玩家死亡重生时，Pawn 会被销毁重建，但 PlayerState 持续存在，ASC 上的技能、属性、效果不会丢失。

---

## 5. GAS 初始化流程

```mermaid
flowchart TD
    A["项目启动"] --> B["UAbilitySystemGlobals::InitGlobalData()"]
    B --> C["加载 GlobalCurveTable\n（属性默认值曲线表）"]
    B --> D["初始化 GlobalTags\n（ActivateFailIsDeadTag 等）"]
    B --> E["初始化 GameplayCueManager"]
    B --> F["初始化 AttributeSetInitter\n（属性初始化器）"]

    G["Actor BeginPlay"] --> H["ASC::InitAbilityActorInfo()\n设置 OwnerActor 和 AvatarActor"]
    H --> I["服务端：授予初始技能\nGiveAbility()"]
    H --> J["服务端：应用初始效果\nApplyGameplayEffectToSelf()"]
    H --> K["属性初始化\nInitializeAttributes()"]

    L["客户端 OnRep_PlayerState"] --> H
```

### 5.1 InitAbilityActorInfo 的重要性

来源：`AbilitySystemComponent.h`

```cpp
// 必须在 BeginPlay 或 Possess 时调用，设置 Owner 和 Avatar
// OwnerActor: 拥有 ASC 的 Actor（通常是 PlayerState 或 Pawn）
// AvatarActor: 实际在世界中的 Actor（通常是 Pawn）
virtual void InitAbilityActorInfo(AActor* InOwnerActor, AActor* InAvatarActor);
```

---

## 6. 数据流向

```mermaid
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
```

---

## 7. 网络架构

GAS 是为多人游戏设计的，其网络架构如下：

```mermaid
flowchart TB
    subgraph Server["服务端（权威）"]
        S_ASC["ASC（服务端）\n拥有完整数据"]
        S_GA["GameplayAbility\n服务端实例"]
    end

    subgraph Client_Owner["客户端（拥有者）"]
        C_ASC["ASC（客户端）\n接收复制数据"]
        C_GA["GameplayAbility\n客户端实例（预测）"]
        PK["FPredictionKey\n预测键"]
    end

    subgraph Client_Other["其他客户端"]
        O_ASC["ASC（模拟端）\n只接收最终状态"]
    end

    S_ASC -->|"网络复制\nActivatableAbilities\nActiveGameplayEffects\nMinimalReplicationTags"| C_ASC
    S_ASC -->|"网络复制"| O_ASC
    C_GA -->|"发送 RPC\n携带 PredictionKey"| S_GA
    S_GA -->|"验证并确认/回滚"| C_GA
```

### 7.1 三种网络角色

| 角色 | 说明 | 能做什么 |
|------|------|----------|
| **Authority（服务端）** | 拥有完整权威数据 | 可以做任何操作 |
| **AutonomousProxy（本地玩家）** | 本地控制的 Pawn | 可以发起预测，等待服务端确认 |
| **SimulatedProxy（其他玩家）** | 远端玩家在本地的模拟 | 只接收复制数据，不能主动操作 |

---

## 8. 关键枚举速查

### 8.1 技能实例化策略（来源：`GameplayAbility.h`）

```cpp
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
```

### 8.2 技能网络执行策略（来源：`GameplayAbility.h`）

```cpp
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
```

### 8.3 GameplayEffect 持续类型（来源：`GameplayEffect.h`）

```cpp
UENUM(BlueprintType)
namespace EGameplayEffectDurationType
{
    enum Type
    {
        Instant,   // 瞬时效果（立即修改 BaseValue）
        Infinite,  // 无限持续（持续修改 CurrentValue）
        HasDuration, // 有限持续时间
    };
}
```

---

## 9. 文档导航

- 下一篇：[02 - AbilitySystemComponent 核心组件](./02_AbilitySystemComponent.md)
- 返回：[总目录](./00_GAS学习文档总目录.md)
