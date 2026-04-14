# GameplayTag 标签系统详解

> **源码文件**：`Public/GameplayEffectTypes.h`（48.92 KB，1704行）
> **注意**：GameplayTag 本身定义在 UE4 引擎核心（`GameplayTagContainer.h`），本文档重点介绍 GAS 中对 GameplayTag 的扩展使用

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

来源：`Public/GameplayEffectTypes.h`

GAS 在 ASC 内部使用 `FGameplayTagCountContainer` 来追踪标签的**引用计数**（而不是简单的有/无）。

```cpp
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
    // 标签 → 计数（包含父标签）
    TMap<FGameplayTag, int32> GameplayTagCountMap;

    // 标签 → 显式计数（不包含父标签）
    TMap<FGameplayTag, int32> ExplicitTagCountMap;

    // 显式添加的标签容器
    FGameplayTagContainer ExplicitTags;

    // 标签变化事件 Map
    TMap<FGameplayTag, FDelegateInfo> GameplayTagEventMap;
};
```

### 为什么使用计数而不是布尔值？

因为同一个标签可能被多个来源同时添加（例如：两个不同的 GE 都授予了 `State.Stunned` 标签）。使用计数可以确保只有当**所有来源都移除**后，标签才真正消失。

---

## 3. 标签事件类型

来源：`Public/GameplayEffectTypes.h`

```cpp
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
```

---

## 4. 标签相关委托

来源：`Public/GameplayEffectTypes.h`

```cpp
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
```

---

## 5. FGameplayTagRequirements：标签需求结构

来源：`Public/GameplayEffectTypes.h`

```cpp
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
```

---

## 6. FMinimalReplicationTagCountMap：网络复制标签 Map

来源：`Public/GameplayEffectTypes.h`

```cpp
USTRUCT()
struct GAMEPLAYABILITIES_API FMinimalReplicationTagCountMap
{
    // 标签 → 计数 Map（用于网络复制）
    TMap<FGameplayTag, int32> TagMap;

    // 拥有者 ASC
    UPROPERTY()
    class UAbilitySystemComponent* Owner;

    // 添加标签
    void AddTag(const FGameplayTag& Tag);

    // 移除标签
    void RemoveTag(const FGameplayTag& Tag);

    // 自定义网络序列化（高效压缩）
    bool NetSerialize(FArchive& Ar, class UPackageMap* Map, bool& bOutSuccess);
};
```

> **设计说明**：GAS 使用两个不同的标签 Map 进行复制：
> - `MinimalReplicationTags`：复制给所有客户端（用于模拟端）
> - `ReplicatedTagCountMap`：仅复制给拥有者（用于本地玩家）

---

## 7. GameplayCue 事件类型

来源：`Public/GameplayEffectTypes.h`

```cpp
UENUM(BlueprintType)
namespace EGameplayCueEvent
{
    enum Type
    {
        // GE 激活时触发（Duration/Infinite 类型 GE 应用时）
        OnActive,

        // GE 激活期间持续触发（用于 Join-in-progress，即玩家中途加入时同步状态）
        WhileActive,

        // 瞬时执行时触发（Instant GE 或周期执行时）
        Executed,

        // GE 移除时触发
        Removed
    };
}
```

---

## 8. FGameplayCueParameters：Cue 参数

来源：`Public/GameplayEffectTypes.h`

```cpp
USTRUCT(BlueprintType)
struct GAMEPLAYABILITIES_API FGameplayCueParameters
{
    // 归一化强度（0-1，用于表示效果强度）
    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    float NormalizedMagnitude;

    // 原始强度（实际数值，如伤害值）
    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    float RawMagnitude;

    // 效果上下文（包含来源信息、命中结果等）
    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    FGameplayEffectContextHandle EffectContext;

    // 匹配到的标签名（最精确匹配的 Cue 标签）
    UPROPERTY(BlueprintReadWrite, Category=GameplayCue, NotReplicated)
    FGameplayTag MatchedTagName;

    // 原始标签（触发 Cue 的原始标签）
    UPROPERTY(BlueprintReadWrite, Category=GameplayCue, NotReplicated)
    FGameplayTag OriginalTag;

    // 来源聚合标签
    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    FGameplayTagContainer AggregatedSourceTags;

    // 目标聚合标签
    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    FGameplayTagContainer AggregatedTargetTags;

    // 位置（使用 NetQuantize10 压缩）
    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    FVector_NetQuantize10 Location;

    // 法线（使用 NetQuantizeNormal 压缩）
    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    FVector_NetQuantizeNormal Normal;

    // 施法者 Actor
    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    TWeakObjectPtr<AActor> Instigator;

    // 效果来源 Actor（如武器、投射物）
    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    TWeakObjectPtr<AActor> EffectCauser;

    // 来源对象
    UPROPERTY(BlueprintReadWrite, Category=GameplayCue)
    TWeakObjectPtr<const UObject> SourceObject;

    // 物理材质（用于表面效果）
    UPROPERTY(BlueprintReadWrite, Category = GameplayCue)
    TWeakObjectPtr<const UPhysicalMaterial> PhysicalMaterial;

    // GE 等级
    UPROPERTY(BlueprintReadWrite, Category = GameplayCue)
    int32 GameplayEffectLevel;

    // 技能等级
    UPROPERTY(BlueprintReadWrite, Category = GameplayCue)
    int32 AbilityLevel;

    // 目标附着组件（Cue Actor 可以附着到此组件）
    UPROPERTY(BlueprintReadWrite, Category = GameplayCue)
    TWeakObjectPtr<USceneComponent> TargetAttachComponent;
};
```

---

## 9. 本项目 GameplayTag 规范

基于项目画像中的信息，本项目（LetsGo）使用以下 GameplayTag 命名规范：

```
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
```

---

## 10. 标签使用最佳实践

### 10.1 监听标签变化

```cpp
// 监听 State.Stunned 标签的添加/移除
AbilitySystemComponent->RegisterGameplayTagEvent(
    FGameplayTag::RequestGameplayTag("Moe.State.Stunned"),
    EGameplayTagEventType::NewOrRemoved
).AddUObject(this, &AMyCharacter::OnStunnedTagChanged);

void AMyCharacter::OnStunnedTagChanged(const FGameplayTag Tag, int32 NewCount)
{
    if (NewCount > 0)
    {
        // 进入眩晕状态
        StartStunAnimation();
    }
    else
    {
        // 退出眩晕状态
        StopStunAnimation();
    }
}
```

### 10.2 通过标签激活技能

```cpp
// 激活所有带有 Moe.GAS.Ability.ActiveAbility.Attack 标签的技能
FGameplayTagContainer AbilityTags;
AbilityTags.AddTag(FGameplayTag::RequestGameplayTag("Moe.GAS.Ability.ActiveAbility.Attack"));
AbilitySystemComponent->TryActivateAbilitiesByTag(AbilityTags);
```

### 10.3 发送游戏事件

```cpp
// 发送游戏事件（可被 AbilityTask_WaitGameplayEvent 监听）
FGameplayEventData EventData;
EventData.Instigator = this;
EventData.Target = TargetActor;
EventData.EventMagnitude = DamageAmount;

AbilitySystemComponent->HandleGameplayEvent(
    FGameplayTag::RequestGameplayTag("Moe.GAS.GameEvent.HitConfirm"),
    &EventData
);
```

---

## 11. 文档导航

- 上一篇：[05 - GameplayEffect 效果系统](./05_GameplayEffect.md)
- 下一篇：[07 - GameplayCue 表现层系统](./07_GameplayCue.md)
- 返回：[总目录](./00_GAS学习文档总目录.md)
