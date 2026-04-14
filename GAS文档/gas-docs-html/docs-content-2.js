// GAS 文档内容 - 07 到 11

docs['07'] = `# GameplayCue 表现层系统详解

> **源码文件**：
> - \`Public/GameplayCueManager.h\`（16.35 KB，380行）
> - \`Public/GameplayCueNotify_Static.h\`（2.69 KB，69行）
> - \`Public/GameplayCueNotify_Actor.h\`（6.89 KB，161行）
> - \`Public/GameplayEffectTypes.h\`（EGameplayCueEvent 定义）

---

## 1. 概述

GameplayCue（GC）是 GAS 的**表现层系统**，负责将游戏逻辑（伤害、Buff 等）与视觉/音效表现解耦。

核心设计原则：
- **逻辑与表现分离**：GameplayEffect 负责数值逻辑，GameplayCue 负责视觉/音效
- **标签驱动**：每个 Cue 通过 \`GameplayCueTag\`（必须以 \`GameplayCue.\` 开头）标识
- **自动匹配**：GAS 根据标签层级自动找到最匹配的 Cue 处理器
- **对象池**：\`AGameplayCueNotify_Actor\` 支持对象回收复用，避免频繁创建销毁

---

## 2. 两种 Cue 通知类型

### 2.1 UGameplayCueNotify_Static（静态 Cue）

来源：\`Public/GameplayCueNotify_Static.h\`

\`\`\`cpp
// 非实例化的 UObject，适用于一次性"爆发"效果
// 不能有状态，不能 Tick，不能持续
UCLASS(Blueprintable, meta = (ShowWorldContextPin), hidecategories = (Replication))
class GAMEPLAYABILITIES_API UGameplayCueNotify_Static : public UObject
{
    // 处理 Cue 事件的入口
    virtual void HandleGameplayCue(
        AActor* MyTarget,
        EGameplayCueEvent::Type EventType,
        const FGameplayCueParameters& Parameters
    );

    // 蓝图可实现的通用事件（所有事件类型都会调用）
    UFUNCTION(BlueprintImplementableEvent, Category = "GameplayCueNotify")
    void K2_HandleGameplayCue(
        AActor* MyTarget,
        EGameplayCueEvent::Type EventType,
        const FGameplayCueParameters& Parameters
    ) const;

    // 各事件类型的具体回调（蓝图可重写）
    UFUNCTION(BlueprintNativeEvent, BlueprintPure, Category = "GameplayCueNotify")
    bool OnExecute(AActor* MyTarget, const FGameplayCueParameters& Parameters) const;

    UFUNCTION(BlueprintNativeEvent, BlueprintPure, Category = "GameplayCueNotify")
    bool OnActive(AActor* MyTarget, const FGameplayCueParameters& Parameters) const;

    UFUNCTION(BlueprintNativeEvent, BlueprintPure, Category = "GameplayCueNotify")
    bool WhileActive(AActor* MyTarget, const FGameplayCueParameters& Parameters) const;

    UFUNCTION(BlueprintNativeEvent, BlueprintPure, Category = "GameplayCueNotify")
    bool OnRemove(AActor* MyTarget, const FGameplayCueParameters& Parameters) const;

    // 此 Cue 绑定的标签（必须以 GameplayCue. 开头）
    UPROPERTY(EditDefaultsOnly, Category = GameplayCue, meta=(Categories="GameplayCue"))
    FGameplayTag GameplayCueTag;

    // 是否覆盖父标签的 Cue（true=覆盖，false=叠加调用）
    UPROPERTY(EditDefaultsOnly, Category = GameplayCue)
    bool IsOverride;
};
\`\`\`

**适用场景**：
- 一次性特效（爆炸、命中闪光）
- 一次性音效（攻击音效、技能音效）
- 不需要持续状态的表现

### 2.2 AGameplayCueNotify_Actor（Actor Cue）

来源：\`Public/GameplayCueNotify_Actor.h\`

\`\`\`cpp
// 实例化的 Actor，适用于需要持续状态的效果
// 可以 Tick，可以有状态，支持对象池回收
UCLASS(Blueprintable, meta = (ShowWorldContextPin), hidecategories = (Replication))
class GAMEPLAYABILITIES_API AGameplayCueNotify_Actor : public AActor
{
    // 各事件类型的具体回调（蓝图可重写）
    UFUNCTION(BlueprintNativeEvent, Category = "GameplayCueNotify")
    bool OnExecute(AActor* MyTarget, const FGameplayCueParameters& Parameters);

    UFUNCTION(BlueprintNativeEvent, Category = "GameplayCueNotify")
    bool OnActive(AActor* MyTarget, const FGameplayCueParameters& Parameters);

    UFUNCTION(BlueprintNativeEvent, Category = "GameplayCueNotify")
    bool WhileActive(AActor* MyTarget, const FGameplayCueParameters& Parameters);

    UFUNCTION(BlueprintNativeEvent, Category = "GameplayCueNotify")
    bool OnRemove(AActor* MyTarget, const FGameplayCueParameters& Parameters);

    // ==================== 生命周期管理 ====================

    // GE 移除时是否自动销毁/回收此 Actor
    UPROPERTY(EditDefaultsOnly, Category = Cleanup)
    bool bAutoDestroyOnRemove;

    // 自动销毁延迟时间（秒）
    UPROPERTY(EditAnywhere, Category = Cleanup)
    float AutoDestroyDelay;

    // 手动结束 Cue（触发回收）
    UFUNCTION(BlueprintCallable, Category="GameplayCueNotify")
    virtual void K2_EndGameplayCue();

    // ==================== 对象池支持 ====================

    // 回收到对象池时调用（重置状态）
    virtual bool Recycle();

    // 从对象池取出复用时调用
    virtual void ReuseAfterRecycle();

    // 预分配实例数量
    UPROPERTY(EditDefaultsOnly, Category = GameplayCue)
    int32 NumPreallocatedInstances;

    // ==================== 实例化策略 ====================

    // 是否为每个施法者创建独立实例
    UPROPERTY(EditDefaultsOnly, Category = GameplayCue)
    bool bUniqueInstancePerInstigator;

    // 是否为每个来源对象创建独立实例
    UPROPERTY(EditDefaultsOnly, Category = GameplayCue)
    bool bUniqueInstancePerSourceObject;

    // 是否自动附着到目标 Actor
    UPROPERTY(EditDefaultsOnly, Category = GameplayCue)
    bool bAutoAttachToOwner;

    // 此 Cue 绑定的标签
    UPROPERTY(EditDefaultsOnly, Category=GameplayCue, meta=(Categories="GameplayCue"))
    FGameplayTag GameplayCueTag;

    // 是否覆盖父标签的 Cue
    UPROPERTY(EditDefaultsOnly, Category = GameplayCue)
    bool IsOverride;
};
\`\`\`

**适用场景**：
- 持续特效（持续燃烧、持续光环）
- 需要附着到目标的效果（跟随目标的粒子）
- 需要 Tick 更新的效果（动态光束）
- 需要状态的效果（需要记录开始位置等）

---

## 3. 两种 Cue 类型对比

| 特性 | UGameplayCueNotify_Static | AGameplayCueNotify_Actor |
|------|--------------------------|--------------------------|
| 基类 | UObject | AActor |
| 实例化 | 不实例化（使用 CDO） | 每次创建实例（支持对象池） |
| 状态 | 无状态 | 有状态 |
| Tick | 不支持 | 支持 |
| 对象池 | 不需要 | 支持（\`Recycle\`/\`ReuseAfterRecycle\`） |
| 适用场景 | 一次性效果 | 持续效果 |
| 性能开销 | 极低 | 较高（但有对象池优化） |

---

## 4. Cue 事件类型

来源：\`Public/GameplayEffectTypes.h\`

\`\`\`cpp
namespace EGameplayCueEvent
{
    enum Type
    {
        // 触发时机：Duration/Infinite GE 被应用时
        OnActive,

        // 触发时机：GE 已激活时（用于 Join-in-progress 同步）
        // 当玩家中途加入游戏，需要同步已有的持续效果时触发
        WhileActive,

        // 触发时机：Instant GE 执行时，或 Duration/Infinite GE 的周期执行时
        Executed,

        // 触发时机：Duration/Infinite GE 被移除时
        Removed
    };
}
\`\`\`

---

## 5. UGameplayCueManager：Cue 管理器

来源：\`Public/GameplayCueManager.h\`

\`\`\`cpp
UCLASS()
class GAMEPLAYABILITIES_API UGameplayCueManager : public UDataAsset
{
    // 处理 Cue 事件（分发给对应的 Cue 处理器）
    virtual void HandleGameplayCue(
        AActor* TargetActor,
        FGameplayTag GameplayCueTag,
        EGameplayCueEvent::Type EventType,
        const FGameplayCueParameters& Parameters
    );

    // 加载 GameplayCue 对象库（异步）
    virtual void LoadObjectLibraryFromPaths(const TArray<FString>& InPaths);

    // 获取运行时对象库（包含所有已加载的 Cue 通知类）
    UObjectLibrary* GetRuntimeCueObjectLibrary() { return RuntimeGameplayCueObjectLibrary.CueSet; }

    // 从对象池获取 Cue Actor（如果有预分配实例）
    AGameplayCueNotify_Actor* GetInstancedCueActor(
        AActor* TargetActor,
        UClass* CueClass,
        const FGameplayCueParameters& Parameters
    );

    // 将 Cue Actor 回收到对象池
    virtual void NotifyGameplayCueActorFinished(AGameplayCueNotify_Actor* Actor);

    // 获取全局 GameplayCueManager 单例
    static UGameplayCueManager* Get();
};
\`\`\`

### 5.1 Cue 加载路径配置

在 \`DefaultGame.ini\` 中配置 Cue 搜索路径：

\`\`\`ini
[/Script/GameplayAbilities.AbilitySystemGlobals]
; GameplayCue 通知类的搜索路径
GameplayCueNotifyPaths=/Game/GAS/GameplayCues
\`\`\`

---

## 6. Cue 标签匹配规则

GAS 使用**最长前缀匹配**原则来找到 Cue 处理器：

\`\`\`
触发标签：GameplayCue.Damage.Physical.Slash

匹配顺序（从最精确到最宽泛）：
1. GameplayCue.Damage.Physical.Slash  ← 最精确匹配
2. GameplayCue.Damage.Physical        ← 次级匹配
3. GameplayCue.Damage                 ← 再次级
4. GameplayCue                        ← 最宽泛

如果 IsOverride = true，找到第一个匹配就停止
如果 IsOverride = false，会继续调用父标签的 Cue
\`\`\`

---

## 7. Cue 触发方式

### 7.1 通过 GameplayEffect 自动触发

在 GE 资产中配置 \`GameplayCues\` 数组：

\`\`\`cpp
// GE 中的 Cue 配置（来源：GameplayEffect.h）
UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = GameplayCue)
TArray<FGameplayEffectCue> GameplayCues;

struct FGameplayEffectCue
{
    UPROPERTY(EditDefaultsOnly, Category = GameplayCue)
    float MinLevel;

    UPROPERTY(EditDefaultsOnly, Category = GameplayCue)
    float MaxLevel;

    UPROPERTY(EditDefaultsOnly, Category = GameplayCue, meta=(Categories="GameplayCue"))
    FGameplayTagContainer GameplayCueTags;
};
\`\`\`

### 7.2 通过代码手动触发

\`\`\`cpp
// 触发一次性 Cue（Executed 事件）
AbilitySystemComponent->ExecuteGameplayCue(
    FGameplayTag::RequestGameplayTag("GameplayCue.Damage.Physical"),
    EffectContext
);

// 添加持续 Cue（OnActive 事件）
AbilitySystemComponent->AddGameplayCue(
    FGameplayTag::RequestGameplayTag("GameplayCue.Buff.Speed"),
    EffectContext
);

// 移除持续 Cue（Removed 事件）
AbilitySystemComponent->RemoveGameplayCue(
    FGameplayTag::RequestGameplayTag("GameplayCue.Buff.Speed")
);
\`\`\`

---

## 8. Cue 生命周期流程

\`\`\`mermaid
flowchart TD
    subgraph "Instant GE 或周期执行"
        A1["GE 执行"] --> B1["触发 Executed 事件"]
        B1 --> C1["GameplayCueManager::HandleGameplayCue\\n(EventType=Executed)"]
        C1 --> D1["找到匹配的 Cue 处理器"]
        D1 --> E1["Static: OnExecute()\\nActor: OnExecute()"]
    end

    subgraph "Duration/Infinite GE"
        A2["GE 应用"] --> B2["触发 OnActive 事件"]
        B2 --> C2["GameplayCueManager::HandleGameplayCue\\n(EventType=OnActive)"]
        C2 --> D2["找到匹配的 Cue 处理器"]
        D2 --> E2["Static: OnActive()\\nActor: 创建/复用实例，调用 OnActive()"]
        E2 --> F2["GE 持续期间\\n(WhileActive 用于 Join-in-progress)"]
        F2 --> G2["GE 移除时\\n触发 Removed 事件"]
        G2 --> H2["Static: OnRemove()\\nActor: OnRemove()，然后回收到对象池"]
    end
\`\`\`

---

## 9. 对象池工作原理

\`\`\`mermaid
flowchart LR
    A["触发 OnActive"] --> B{"对象池中有可用实例?"}
    B -->|"有"| C["取出实例\\n调用 ReuseAfterRecycle()"]
    B -->|"无"| D["创建新实例\\n（或使用预分配实例）"]
    C --> E["调用 OnActive()"]
    D --> E
    E --> F["Cue 激活中"]
    F --> G["触发 Removed"]
    G --> H["调用 OnRemove()"]
    H --> I{"bAutoDestroyOnRemove?"}
    I -->|"true"| J["延迟 AutoDestroyDelay 秒后\\n调用 K2_EndGameplayCue()"]
    I -->|"false"| K["等待手动调用\\nK2_EndGameplayCue()"]
    J --> L["调用 Recycle()\\n重置状态"]
    K --> L
    L --> M["放回对象池\\n等待复用"]
\`\`\`
`;

docs['08'] = `# AbilityTask 异步任务系统详解

> **源码文件**：
> - \`Public/Abilities/Tasks/AbilityTask.h\`（7.99 KB，209行）
> - \`Public/Abilities/Tasks/AbilityTask_PlayMontageAndWait.h\`（3.60 KB，94行）
> - \`Public/Abilities/Tasks/AbilityTask_WaitGameplayEvent.h\`（1.83 KB，53行）
> - \`Public/Abilities/Tasks/\`（约37个任务类）

---

## 1. 概述

\`UAbilityTask\` 是 GAS 中**技能内异步操作的基类**，继承自 \`UGameplayTask\`。它允许技能在执行过程中等待某个异步事件（如动画完成、输入按下、游戏事件等），而不需要阻塞技能的执行流程。

核心特点：
- **异步执行**：任务启动后立即返回，通过委托回调通知完成
- **与技能绑定**：任务的生命周期与所属技能绑定，技能结束时任务自动销毁
- **蓝图友好**：通过静态工厂函数创建，支持蓝图中的异步节点
- **可取消**：支持外部取消（\`ExternalCancel\`）

---

## 2. UAbilityTask 基类

来源：\`Public/Abilities/Tasks/AbilityTask.h\`

\`\`\`cpp
UCLASS(Abstract)
class GAMEPLAYABILITIES_API UAbilityTask : public UGameplayTask
{
    GENERATED_UCLASS_BODY()

    // 创建任务的模板函数（子类通过静态工厂函数调用此模板）
    template <class T>
    static T* NewAbilityTask(UGameplayAbility* ThisAbility, FName InstanceName = FName())
    {
        check(ThisAbility);
        T* MyObj = NewObject<T>();
        MyObj->InitTask(*ThisAbility, ThisAbility->GetGameplayTaskDefaultPriority());
        MyObj->InstanceName = InstanceName;
        return MyObj;
    }

    // 任务激活（子类重写，实现具体逻辑）
    virtual void Activate() override;

    // 外部取消（被技能或外部系统取消时调用）
    virtual void ExternalCancel() override;

    // 任务销毁（子类重写，清理资源）
    virtual void OnDestroy(bool bInOwnerFinished) override;

    // 等待状态枚举
    enum class EAbilityTaskWaitState : uint8
    {
        WaitingOnGame,          // 等待游戏逻辑
        WaitingOnAvatar,        // 等待 Avatar Actor
        WaitingOnUser,          // 等待用户输入
        WaitingOnExternalEvent, // 等待外部事件
    };

    // 获取所属技能的 ASC
    UAbilitySystemComponent* GetTargetASC();

    UAbilitySystemComponent* AbilitySystemComponent;
    TWeakObjectPtr<UGameplayAbility> Ability;
    FGameplayAbilitySpecHandle AbilitySpecHandle;
    FGameplayAbilityActivationInfo ActivationInfo;
};
\`\`\`

### 任务生命周期

\`\`\`mermaid
flowchart TD
    A["NewAbilityTask<T>()\\n创建任务实例"] --> B["配置任务参数"]
    B --> C["ReadyForActivation()\\n或 Activate()"]
    C --> D["任务激活\\nActivate() 被调用"]
    D --> E{"等待异步事件"}
    E -->|"事件发生"| F["触发输出委托\\n（如 OnCompleted）"]
    F --> G["EndTask()\\n或技能调用 EndAbility()"]
    E -->|"技能被取消"| H["ExternalCancel()"]
    H --> G
    G --> I["OnDestroy()\\n清理资源"]
    I --> J["任务销毁"]
\`\`\`

---

## 3. 常用任务类详解

### 3.1 AbilityTask_PlayMontageAndWait

来源：\`Public/Abilities/Tasks/AbilityTask_PlayMontageAndWait.h\`

**功能**：播放动画蒙太奇并等待完成，是最常用的 AbilityTask。

\`\`\`cpp
UCLASS()
class GAMEPLAYABILITIES_API UAbilityTask_PlayMontageAndWait : public UAbilityTask
{
    // 蒙太奇正常播放完成
    UPROPERTY(BlueprintAssignable)
    FMontageWaitSimpleDelegate OnCompleted;

    // 蒙太奇开始混出（即将结束）
    UPROPERTY(BlueprintAssignable)
    FMontageWaitSimpleDelegate OnBlendOut;

    // 蒙太奇被其他蒙太奇打断
    UPROPERTY(BlueprintAssignable)
    FMontageWaitSimpleDelegate OnInterrupted;

    // 技能被取消时触发
    UPROPERTY(BlueprintAssignable)
    FMontageWaitSimpleDelegate OnCancelled;

    /**
     * 创建播放蒙太奇任务
     * @param TaskInstanceName    任务实例名（用于后续查询）
     * @param MontageToPlay       要播放的蒙太奇
     * @param Rate                播放速率（默认 1.0）
     * @param StartSection        起始段落名（可选）
     * @param bStopWhenAbilityEnds 技能正常结束时是否停止蒙太奇
     * @param AnimRootMotionTranslationScale 根运动缩放（0=禁用根运动）
     * @param StartTimeSeconds    起始时间偏移（秒）
     */
    UFUNCTION(BlueprintCallable, Category="Ability|Tasks",
        meta = (DisplayName="PlayMontageAndWait",
                HidePin = "OwningAbility", DefaultToSelf = "OwningAbility",
                BlueprintInternalUseOnly = "TRUE"))
    static UAbilityTask_PlayMontageAndWait* CreatePlayMontageAndWaitProxy(
        UGameplayAbility* OwningAbility,
        FName TaskInstanceName,
        UAnimMontage* MontageToPlay,
        float Rate = 1.f,
        FName StartSection = NAME_None,
        bool bStopWhenAbilityEnds = true,
        float AnimRootMotionTranslationScale = 1.f,
        float StartTimeSeconds = 0.f
    );

    virtual void Activate() override;
    virtual void ExternalCancel() override;
    virtual void OnDestroy(bool AbilityEnded) override;
};
\`\`\`

**使用示例**：
\`\`\`cpp
void UMyAttackAbility::ActivateAbility(...)
{
    // 创建任务
    UAbilityTask_PlayMontageAndWait* MontageTask =
        UAbilityTask_PlayMontageAndWait::CreatePlayMontageAndWaitProxy(
            this,           // 所属技能
            NAME_None,      // 任务名
            AttackMontage,  // 蒙太奇资产
            1.0f,           // 播放速率
            NAME_None,      // 起始段落
            true            // 技能结束时停止蒙太奇
        );

    // 绑定回调
    MontageTask->OnCompleted.AddDynamic(this, &UMyAttackAbility::OnMontageCompleted);
    MontageTask->OnBlendOut.AddDynamic(this, &UMyAttackAbility::OnMontageBlendOut);
    MontageTask->OnInterrupted.AddDynamic(this, &UMyAttackAbility::OnMontageInterrupted);
    MontageTask->OnCancelled.AddDynamic(this, &UMyAttackAbility::OnMontageCancelled);

    // 激活任务（必须调用！）
    MontageTask->ReadyForActivation();
}

void UMyAttackAbility::OnMontageCompleted()
{
    EndAbility(CurrentSpecHandle, CurrentActorInfo, CurrentActivationInfo, true, false);
}
\`\`\`

---

### 3.2 AbilityTask_WaitGameplayEvent

来源：\`Public/Abilities/Tasks/AbilityTask_WaitGameplayEvent.h\`

**功能**：等待指定 GameplayTag 的游戏事件，常用于技能内的事件驱动逻辑（如等待动画通知触发伤害）。

\`\`\`cpp
UCLASS()
class GAMEPLAYABILITIES_API UAbilityTask_WaitGameplayEvent : public UAbilityTask
{
    // 事件触发时的委托（携带事件数据）
    UPROPERTY(BlueprintAssignable)
    FWaitGameplayEventDelegate EventReceived;

    /**
     * 等待指定 GameplayTag 事件
     * @param EventTag              要等待的事件标签
     * @param OptionalExternalTarget 可选：监听其他 Actor 的事件（默认监听自身）
     * @param OnlyTriggerOnce       是否只触发一次（true=触发后自动结束任务）
     * @param OnlyMatchExact        是否精确匹配标签（false=匹配子标签也触发）
     */
    UFUNCTION(BlueprintCallable, Category = "Ability|Tasks",
        meta = (HidePin = "OwningAbility", DefaultToSelf = "OwningAbility",
                BlueprintInternalUseOnly = "TRUE"))
    static UAbilityTask_WaitGameplayEvent* WaitGameplayEvent(
        UGameplayAbility* OwningAbility,
        FGameplayTag EventTag,
        AActor* OptionalExternalTarget = nullptr,
        bool OnlyTriggerOnce = false,
        bool OnlyMatchExact = true
    );

    virtual void Activate() override;
    virtual void GameplayEventCallback(const FGameplayEventData* Payload);
    void OnDestroy(bool AbilityEnding) override;
};
\`\`\`

**使用示例**（等待动画通知触发伤害）：
\`\`\`cpp
void UMyAttackAbility::ActivateAbility(...)
{
    // 播放蒙太奇
    UAbilityTask_PlayMontageAndWait* MontageTask = ...;
    MontageTask->ReadyForActivation();

    // 等待伤害触发事件（由动画通知发送）
    UAbilityTask_WaitGameplayEvent* EventTask =
        UAbilityTask_WaitGameplayEvent::WaitGameplayEvent(
            this,
            FGameplayTag::RequestGameplayTag("Moe.GAS.GameEvent.HitConfirm"),
            nullptr,    // 监听自身
            false,      // 可以多次触发（连击）
            true        // 精确匹配
        );

    EventTask->EventReceived.AddDynamic(this, &UMyAttackAbility::OnHitConfirm);
    EventTask->ReadyForActivation();
}

void UMyAttackAbility::OnHitConfirm(FGameplayEventData Payload)
{
    // 在此处应用伤害效果
    ApplyGameplayEffectToTarget(...);
}
\`\`\`

---

### 3.3 其他常用任务类

来源：\`Public/Abilities/Tasks/\` 目录（约37个任务类）

| 任务类 | 功能 |
|--------|------|
| \`AbilityTask_WaitInputPress\` | 等待输入按下 |
| \`AbilityTask_WaitInputRelease\` | 等待输入释放 |
| \`AbilityTask_WaitConfirmCancel\` | 等待确认或取消输入 |
| \`AbilityTask_WaitDelay\` | 等待指定时间 |
| \`AbilityTask_WaitAttributeChange\` | 等待属性值变化 |
| \`AbilityTask_WaitAttributeChangeThreshold\` | 等待属性超过/低于阈值 |
| \`AbilityTask_WaitGameplayTagAdded\` | 等待标签被添加 |
| \`AbilityTask_WaitGameplayTagRemoved\` | 等待标签被移除 |
| \`AbilityTask_WaitGameplayEffectApplied\` | 等待 GE 被应用 |
| \`AbilityTask_WaitGameplayEffectRemoved\` | 等待 GE 被移除 |
| \`AbilityTask_WaitMovementModeChange\` | 等待移动模式变化 |
| \`AbilityTask_WaitOverlap\` | 等待碰撞重叠 |
| \`AbilityTask_WaitTargetData\` | 等待目标数据（配合 TargetActor 使用） |
| \`AbilityTask_SpawnActor\` | 生成 Actor |
| \`AbilityTask_ApplyRootMotionConstantForce\` | 应用恒定根运动力 |
| \`AbilityTask_ApplyRootMotionJumpForce\` | 应用跳跃根运动力 |
| \`AbilityTask_ApplyRootMotionMoveToActorForce\` | 根运动移动到目标 Actor |
| \`AbilityTask_ApplyRootMotionMoveToForce\` | 根运动移动到指定位置 |
| \`AbilityTask_ApplyRootMotionRadialForce\` | 应用径向根运动力 |
| \`AbilityTask_NetworkSyncPoint\` | 网络同步点（等待服务端/客户端同步） |
| \`AbilityTask_VisualizeTargeting\` | 可视化目标选择 |

---

## 4. 自定义 AbilityTask

### 4.1 创建自定义任务

\`\`\`cpp
// 头文件
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FMyCustomTaskDelegate, float, Value);

UCLASS()
class UAbilityTask_MyCustomTask : public UAbilityTask
{
    GENERATED_BODY()

public:
    UPROPERTY(BlueprintAssignable)
    FMyCustomTaskDelegate OnSuccess;

    UPROPERTY(BlueprintAssignable)
    FMyCustomTaskDelegate OnFailed;

    UFUNCTION(BlueprintCallable, Category = "Ability|Tasks",
        meta = (HidePin = "OwningAbility", DefaultToSelf = "OwningAbility",
                BlueprintInternalUseOnly = "TRUE"))
    static UAbilityTask_MyCustomTask* CreateMyCustomTask(
        UGameplayAbility* OwningAbility, float Duration);

    virtual void Activate() override;
    virtual void OnDestroy(bool bInOwnerFinished) override;

private:
    float Duration;
    FTimerHandle TimerHandle;
    void OnTimerComplete();
};

// 实现文件
UAbilityTask_MyCustomTask* UAbilityTask_MyCustomTask::CreateMyCustomTask(
    UGameplayAbility* OwningAbility, float Duration)
{
    UAbilityTask_MyCustomTask* Task =
        NewAbilityTask<UAbilityTask_MyCustomTask>(OwningAbility);
    Task->Duration = Duration;
    return Task;
}

void UAbilityTask_MyCustomTask::Activate()
{
    Super::Activate();
    GetWorld()->GetTimerManager().SetTimer(
        TimerHandle, this,
        &UAbilityTask_MyCustomTask::OnTimerComplete,
        Duration, false
    );
}

void UAbilityTask_MyCustomTask::OnTimerComplete()
{
    if (ShouldBroadcastAbilityTaskDelegates())
    {
        OnSuccess.Broadcast(Duration);
    }
    EndTask();
}

void UAbilityTask_MyCustomTask::OnDestroy(bool bInOwnerFinished)
{
    if (GetWorld())
    {
        GetWorld()->GetTimerManager().ClearTimer(TimerHandle);
    }
    Super::OnDestroy(bInOwnerFinished);
}
\`\`\`

---

## 5. 注意事项

### 5.1 必须调用 ReadyForActivation()

\`\`\`cpp
// 创建任务后，必须调用 ReadyForActivation() 才能激活
// 否则任务不会执行
Task->ReadyForActivation();
\`\`\`

### 5.2 ShouldBroadcastAbilityTaskDelegates()

\`\`\`cpp
// 在触发委托前，必须检查此函数
// 如果技能已经结束，不应该再触发委托
if (ShouldBroadcastAbilityTaskDelegates())
{
    OnCompleted.Broadcast();
}
\`\`\`

### 5.3 任务与技能的生命周期关系

- 技能调用 \`EndAbility()\` 时，所有关联的 AbilityTask 会自动调用 \`OnDestroy(true)\`
- 任务调用 \`EndTask()\` 时，只销毁该任务，不影响技能
- 如果技能使用 \`NonInstanced\` 策略，**不能使用** AbilityTask（因为没有实例）
`;

docs['09'] = `# GAS 预测系统（Prediction）详解

> **源码文件**：\`Public/GameplayPrediction.h\`（29.13 KB，566行）
> **注意**：此文件包含大量 Epic 工程师的详细注释，是理解 GAS 预测机制的权威文档

---

## 1. 概述

GAS 的预测系统允许**客户端在不等待服务端确认的情况下立即执行技能**，从而消除网络延迟带来的操作不流畅感。服务端随后验证客户端的预测，并在必要时进行回滚。

来源：\`GameplayPrediction.h\` 注释（Epic 原文）：
> "The ability system prediction system is designed to allow clients to predict ability activation and gameplay effect application without waiting for the server to confirm."

---

## 2. 核心概念：FPredictionKey

来源：\`Public/GameplayPrediction.h\`

\`\`\`cpp
USTRUCT(BlueprintType)
struct GAMEPLAYABILITIES_API FPredictionKey
{
    GENERATED_USTRUCT_BODY()

    typedef int16 KeyType;

    FPredictionKey()
        : Current(0), Base(0), bIsServerInitiated(false), bIsStale(false) {}

    // 当前预测键值（非零表示有效）
    UPROPERTY()
    KeyType Current;

    // 基础键值（用于依赖链）
    UPROPERTY()
    KeyType Base;

    // 是否是服务端发起的预测
    UPROPERTY()
    bool bIsServerInitiated;

    // 是否已过期（服务端已处理）
    bool bIsStale;

    // 创建新的预测键
    static FPredictionKey CreateNewPredictionKey(UAbilitySystemComponent* OwningComponent);

    // 创建依赖于当前键的子键
    FPredictionKey CreateNewChildKey() const;

    // 检查键是否有效
    bool IsValidKey() const { return Current != 0; }

    // 检查是否是本地客户端生成的键
    bool IsLocalClientKey() const { return !bIsServerInitiated && Current > 0; }

    // 检查是否是服务端生成的键
    bool IsServerInitiatedKey() const { return bIsServerInitiated; }
};
\`\`\`

### 预测键的工作原理

\`\`\`mermaid
sequenceDiagram
    participant Client as 客户端
    participant Server as 服务端

    Note over Client: 生成新的 PredictionKey（如 Key=42）
    Client->>Client: 本地执行技能（携带 Key=42）
    Client->>Server: ServerTryActivateAbility RPC（携带 Key=42）

    Note over Server: 服务端处理请求
    Server->>Server: 验证并执行技能
    Server->>Client: ClientActivateAbilitySucceed（Key=42）

    Note over Client: 收到确认，Key=42 的预测被确认
    Client->>Client: 标记 Key=42 为已确认，清理预测状态

    alt 服务端拒绝
        Server->>Client: ClientActivateAbilityFailed（Key=42）
        Note over Client: 回滚 Key=42 相关的所有预测操作
    end
\`\`\`

---

## 3. FScopedPredictionWindow：预测窗口

来源：\`Public/GameplayPrediction.h\`

\`\`\`cpp
/**
 * 预测窗口的 RAII 包装器
 * 在构造时创建预测键，在析构时清理
 *
 * 来源注释（Epic 原文）：
 * "A scoped prediction window is used to group together a set of predictions
 *  that should all be rolled back together if the prediction fails."
 */
struct GAMEPLAYABILITIES_API FScopedPredictionWindow
{
    // 构造函数：创建新的预测键并设置到 ASC
    FScopedPredictionWindow(
        UAbilitySystemComponent* AbilitySystemComponent,
        bool bCanGenerateNewKey = true
    );

    // 构造函数：使用已有的预测键
    FScopedPredictionWindow(
        UAbilitySystemComponent* AbilitySystemComponent,
        FPredictionKey InPredictionKey,
        bool bSetReplicatedPredictionKey = false
    );

    // 析构函数：清理预测窗口
    ~FScopedPredictionWindow();

private:
    TWeakObjectPtr<UAbilitySystemComponent> Owner;
    bool bClearScopedPredictionKey;
    bool bSetReplicatedPredictionKey;
};
\`\`\`

**使用示例**：
\`\`\`cpp
// 在技能激活时创建预测窗口
void UMyAbility::ActivateAbility(...)
{
    // 创建预测窗口（自动管理预测键的生命周期）
    FScopedPredictionWindow ScopedPrediction(
        GetAbilitySystemComponentFromActorInfo()
    );

    // 在此窗口内的所有操作都会被预测
    ApplyGameplayEffectToOwner(...);
    // 窗口析构时自动清理
}
\`\`\`

---

## 4. 预测系统的工作流程

### 4.1 客户端预测激活流程

\`\`\`mermaid
flowchart TD
    A["玩家输入"] --> B["TryActivateAbility()"]
    B --> C["IsLocallyControlled() == true?"]
    C -->|"是"| D["生成 PredictionKey\\nFScopedPredictionWindow"]
    D --> E["本地立即执行\\nActivateAbility()"]
    E --> F["发送 ServerTryActivateAbility RPC\\n携带 PredictionKey"]
    F --> G["等待服务端响应"]

    G -->|"ClientActivateAbilitySucceed"| H["预测确认\\n继续执行"]
    G -->|"ClientActivateAbilityFailed"| I["预测失败\\n回滚所有预测操作"]

    C -->|"否（服务端）"| J["直接执行\\n无需预测"]
\`\`\`

### 4.2 预测的 GameplayEffect

当客户端预测应用 GE 时：

\`\`\`mermaid
flowchart LR
    A["客户端预测应用 GE"] --> B["GE 被添加到\\nActiveGameplayEffects\\n（标记为预测状态）"]
    B --> C["属性立即更新\\n（客户端看到效果）"]
    C --> D{"服务端确认?"}
    D -->|"确认"| E["GE 状态从预测变为确认\\n保持效果"]
    D -->|"拒绝"| F["移除预测 GE\\n属性回滚到原始值"]
\`\`\`

---

## 5. 预测键的依赖链

来源：\`GameplayPrediction.h\` 注释

\`\`\`cpp
/**
 * 预测键可以形成依赖链：
 * 如果父键被拒绝，所有依赖于父键的子键也会被拒绝
 *
 * 例如：
 * Key=1（技能激活）
 *   └── Key=1.1（技能内应用的 GE）
 *         └── Key=1.1.1（GE 触发的 Cue）
 *
 * 如果 Key=1 被拒绝，Key=1.1 和 Key=1.1.1 也会被回滚
 */
\`\`\`

---

## 6. 服务端发起的预测

来源：\`GameplayPrediction.h\`

\`\`\`cpp
/**
 * 服务端也可以发起预测（ServerInitiated）
 * 这用于服务端主动激活技能并通知客户端的场景
 *
 * 流程：
 * 1. 服务端生成 ServerInitiated PredictionKey
 * 2. 服务端执行技能
 * 3. 服务端通知客户端（携带 PredictionKey）
 * 4. 客户端使用此 Key 执行本地预测
 */
\`\`\`

---

## 7. HasAuthorityOrPredictionKey

来源：\`AbilitySystemComponent.h\`

\`\`\`cpp
// 检查是否有权限执行操作（服务端权威 或 有有效预测键）
// 这是 GAS 中最常用的权限检查函数
bool HasAuthorityOrPredictionKey(
    const FGameplayAbilityActivationInfo* ActivationInfo
) const;
\`\`\`

**使用场景**：
\`\`\`cpp
// 在技能中，只有服务端或有预测键的客户端才能应用 GE
if (HasAuthorityOrPredictionKey(ActivationInfo))
{
    ApplyGameplayEffectToOwner(...);
}
\`\`\`

---

## 8. 预测系统的限制

来源：\`GameplayPrediction.h\` 注释（Epic 原文）

> "Not everything can be predicted. The following things cannot be predicted:
> - Spawning actors (use GameplayCue for visual effects instead)
> - Random numbers (use a seeded random with the prediction key)
> - Anything that requires server-side state that the client doesn't have"

**不能预测的操作**：
1. **生成 Actor**：客户端不应预测生成 Actor（改用 GameplayCue 实现视觉效果）
2. **随机数**：需要使用基于预测键的种子随机数
3. **需要服务端状态的操作**：客户端没有的服务端数据

---

## 9. 预测相关的 ASC 配置

\`\`\`cpp
// 来源：AbilitySystemGlobals.h
// 是否允许客户端预测对非本地目标的 GE 应用
// 默认 false（只预测对自身的效果）
UPROPERTY(config)
bool PredictTargetGameplayEffects;
\`\`\`

---

## 10. 预测系统完整流程图

\`\`\`mermaid
sequenceDiagram
    participant Input as 玩家输入
    participant Client as 客户端 ASC
    participant Server as 服务端 ASC

    Input->>Client: 按下技能键
    Client->>Client: 生成 PredictionKey(42)
    Client->>Client: FScopedPredictionWindow 开启
    Client->>Client: ActivateAbility() 本地执行
    Client->>Client: ApplyGE() 预测应用（标记 Key=42）
    Client->>Client: 属性立即更新（玩家看到效果）
    Client->>Server: ServerTryActivateAbility(Key=42)

    Server->>Server: 验证激活条件
    Server->>Server: ActivateAbility() 服务端执行
    Server->>Server: ApplyGE() 服务端应用

    alt 验证通过
        Server->>Client: ClientActivateAbilitySucceed(Key=42)
        Client->>Client: 确认 Key=42 的预测
        Client->>Client: 预测 GE 转为确认状态
        Note over Client: 效果保持，无感知
    else 验证失败
        Server->>Client: ClientActivateAbilityFailed(Key=42)
        Client->>Client: 回滚 Key=42 的所有预测
        Client->>Client: 移除预测 GE
        Client->>Client: 属性回滚
        Note over Client: 玩家看到效果消失（回滚）
    end
\`\`\`
`;

docs['10'] = `# AbilitySystemGlobals 全局配置详解

> **源码文件**：\`Public/AbilitySystemGlobals.h\`（16.65 KB，424行）
> **继承链**：\`UObject → UAbilitySystemGlobals\`

---

## 1. 概述

\`UAbilitySystemGlobals\` 是 GAS 的**全局配置单例**，负责：

- 管理全局数据表（CurveTable、AttributeMetaDataTable）
- 初始化全局 GameplayTag（激活失败标签等）
- 管理 GameplayCueManager 单例
- 提供全局辅助函数（如从 Actor 获取 ASC）
- 支持项目级别的自定义扩展

---

## 2. 获取单例

来源：\`Public/AbilitySystemGlobals.h\`

\`\`\`cpp
// 获取全局单例（通过 IGameplayAbilitiesModule 模块接口）
static UAbilitySystemGlobals& Get()
{
    return *IGameplayAbilitiesModule::Get().GetAbilitySystemGlobals();
}

// 使用示例
UAbilitySystemGlobals& Globals = UAbilitySystemGlobals::Get();
UGameplayCueManager* CueManager = Globals.GetGameplayCueManager();
\`\`\`

---

## 3. 初始化

\`\`\`cpp
// 必须在项目启动时调用（通常在 GameInstance 或 GameMode 中）
// 加载全局数据表、初始化标签、初始化 CueManager
virtual void InitGlobalData();

// 检查是否已初始化
bool IsAbilitySystemGlobalsInitialized()
{
    return GlobalAttributeSetInitter.IsValid();
}
\`\`\`

---

## 4. 全局数据表配置

### 4.1 GlobalCurveTable（全局曲线表）

\`\`\`cpp
// 配置（DefaultGame.ini）：
// [/Script/GameplayAbilities.AbilitySystemGlobals]
// GlobalCurveTableName=/Game/GAS/Data/GE_GlobalCurveTable

// 获取全局曲线表
UCurveTable* GetGlobalCurveTable();

// 用途：ScalableFloat 的默认曲线表
// 当 GE 中的数值使用 ScalableFloat 但没有指定曲线表时，使用此表
\`\`\`

### 4.2 GlobalAttributeSetDefaultsTableNames（属性默认值表）

\`\`\`cpp
// 配置（DefaultGame.ini）：
// [/Script/GameplayAbilities.AbilitySystemGlobals]
// GlobalAttributeSetDefaultsTableNames=/Game/GAS/Data/AttributeDefaults

// 用途：通过 InitializeAttributeSetDefaults() 批量初始化属性
// 行名格式：AttributeSetClassName.AttributeName
// 例如：UMyAttributeSet.Health

// 获取属性初始化器
FAttributeSetInitter* GetAttributeSetInitter() const;
\`\`\`

---

## 5. 全局 GameplayTag

来源：\`Public/AbilitySystemGlobals.h\`

GAS 预定义了一组用于技能激活失败原因的全局标签：

\`\`\`cpp
// 技能激活失败：角色已死亡
UPROPERTY()
FGameplayTag ActivateFailIsDeadTag;
UPROPERTY(config)
FName ActivateFailIsDeadName;  // 在 ini 中配置名称

// 技能激活失败：冷却中
UPROPERTY()
FGameplayTag ActivateFailCooldownTag;
UPROPERTY(config)
FName ActivateFailCooldownName;

// 技能激活失败：资源不足（Cost 检查失败）
UPROPERTY()
FGameplayTag ActivateFailCostTag;
UPROPERTY(config)
FName ActivateFailCostName;

// 技能激活失败：被标签阻止
UPROPERTY()
FGameplayTag ActivateFailTagsBlockedTag;
UPROPERTY(config)
FName ActivateFailTagsBlockedName;

// 技能激活失败：缺少必要标签
UPROPERTY()
FGameplayTag ActivateFailTagsMissingTag;
UPROPERTY(config)
FName ActivateFailTagsMissingName;

// 技能激活失败：网络配置错误（设计错误）
UPROPERTY()
FGameplayTag ActivateFailNetworkingTag;
UPROPERTY(config)
FName ActivateFailNetworkingName;
\`\`\`

**配置示例**（\`DefaultGame.ini\`）：
\`\`\`ini
[/Script/GameplayAbilities.AbilitySystemGlobals]
ActivateFailIsDeadName=Ability.ActivateFail.IsDead
ActivateFailCooldownName=Ability.ActivateFail.Cooldown
ActivateFailCostName=Ability.ActivateFail.Cost
ActivateFailTagsBlockedName=Ability.ActivateFail.TagsBlocked
ActivateFailTagsMissingName=Ability.ActivateFail.TagsMissing
ActivateFailNetworkingName=Ability.ActivateFail.Networking
\`\`\`

---

## 6. 全局辅助函数

\`\`\`cpp
// 从 Actor 获取 ASC（通过 IAbilitySystemInterface 接口）
// LookForComponent=true 时，如果接口未实现，会尝试直接查找组件
static UAbilitySystemComponent* GetAbilitySystemComponentFromActor(
    const AActor* Actor,
    bool LookForComponent = false
);

// 获取 GameplayCueManager 单例
virtual UGameplayCueManager* GetGameplayCueManager();

// 获取 GameplayTagResponseTable
UGameplayTagReponseTable* GetGameplayTagResponseTable();

// 初始化 GameplayCue 参数（项目可重写以添加自定义数据）
virtual void InitGameplayCueParameters(
    FGameplayCueParameters& CueParameters,
    const FGameplayEffectSpecForRPC& Spec
);
\`\`\`

---

## 7. 项目自定义扩展

### 7.1 自定义 AbilitySystemGlobals 类

\`\`\`cpp
// 1. 创建子类
UCLASS()
class UMyAbilitySystemGlobals : public UAbilitySystemGlobals
{
    GENERATED_BODY()

public:
    // 重写以分配自定义 ActorInfo
    virtual FGameplayAbilityActorInfo* AllocAbilityActorInfo() const override;

    // 重写以分配自定义 EffectContext
    virtual FGameplayEffectContext* AllocGameplayEffectContext() const override;

    // 重写以在 GE 应用前执行全局逻辑
    virtual void GlobalPreGameplayEffectSpecApply(
        FGameplayEffectSpec& Spec,
        UAbilitySystemComponent* AbilitySystemComponent
    ) override;
};

// 2. 在 DefaultGame.ini 中配置使用自定义类
// [/Script/GameplayAbilities.AbilitySystemGlobals]
// AbilitySystemGlobalsClassName=/Script/MyGame.MyAbilitySystemGlobals
\`\`\`

---

## 8. 调试功能

来源：\`Public/AbilitySystemGlobals.h\`

\`\`\`cpp
// 以下功能仅在非 Shipping/Test 版本中可用

// 切换忽略冷却（控制台命令：AbilitySystem.ToggleIgnoreCooldowns）
UFUNCTION(exec)
virtual void ToggleIgnoreAbilitySystemCooldowns();

// 切换忽略消耗（控制台命令：AbilitySystem.ToggleIgnoreCosts）
UFUNCTION(exec)
virtual void ToggleIgnoreAbilitySystemCosts();

// 列出玩家所有技能（控制台命令）
UFUNCTION(exec)
void ListPlayerAbilities();

// 强制服务端激活技能（控制台命令，用于测试）
UFUNCTION(exec)
void ServerActivatePlayerAbility(FString AbilityNameMatch);

// 强制服务端结束技能
UFUNCTION(exec)
void ServerEndPlayerAbility(FString AbilityNameMatch);

// 强制服务端取消技能
UFUNCTION(exec)
void ServerCancelPlayerAbility(FString AbilityNameMatch);
\`\`\`

---

## 9. 修改器评估通道

来源：\`Public/AbilitySystemGlobals.h\`

GAS 支持多个修改器评估通道（Channel），用于控制多个 Modifier 的计算顺序：

\`\`\`cpp
// 是否允许使用修改器评估通道（默认 false）
UPROPERTY(config)
bool bAllowGameplayModEvaluationChannels;

// 默认评估通道
UPROPERTY(config)
EGameplayModEvaluationChannel DefaultGameplayModEvaluationChannel;

// 通道别名（最多 10 个通道：Channel0 ~ Channel9）
UPROPERTY(config)
FName GameplayModEvaluationChannelAliases[static_cast<int32>(EGameplayModEvaluationChannel::Channel_MAX)];

// 检查通道是否有效
bool IsGameplayModEvaluationChannelValid(EGameplayModEvaluationChannel Channel) const;
\`\`\`

---

## 10. 完整 ini 配置参考

\`\`\`ini
[/Script/GameplayAbilities.AbilitySystemGlobals]
; 自定义 Globals 类（可选）
AbilitySystemGlobalsClassName=/Script/MyGame.MyAbilitySystemGlobals

; 全局曲线表
GlobalCurveTableName=/Game/GAS/Data/GlobalCurveTable

; 属性默认值表（可以有多个）
GlobalAttributeSetDefaultsTableNames=/Game/GAS/Data/AttributeDefaults_Base
+GlobalAttributeSetDefaultsTableNames=/Game/GAS/Data/AttributeDefaults_Hero

; GameplayCue 管理器类
GlobalGameplayCueManagerClass=/Script/MyGame.MyGameplayCueManager

; GameplayCue 搜索路径
GameplayCueNotifyPaths=/Game/GAS/GameplayCues

; 激活失败标签名称
ActivateFailIsDeadName=Ability.ActivateFail.IsDead
ActivateFailCooldownName=Ability.ActivateFail.Cooldown
ActivateFailCostName=Ability.ActivateFail.Cost
ActivateFailTagsBlockedName=Ability.ActivateFail.TagsBlocked
ActivateFailTagsMissingName=Ability.ActivateFail.TagsMissing
ActivateFailNetworkingName=Ability.ActivateFail.Networking

; 是否允许客户端预测对目标的 GE 应用
PredictTargetGameplayEffects=false

; 最小化复制标签计数的位数
MinimalReplicationTagCountBits=5

; 是否允许修改器评估通道
bAllowGameplayModEvaluationChannels=false
\`\`\`
`;

docs['11'] = `# GameplayEffectExecutionCalculation 自定义执行计算详解

> **源码文件**：\`Public/GameplayEffectExecutionCalculation.h\`（16.06 KB，330行）
> **继承链**：\`UObject → UGameplayEffectCalculation → UGameplayEffectExecutionCalculation\`

---

## 1. 概述

\`UGameplayEffectExecutionCalculation\`（简称 ExecCalc 或 EC）是 GAS 中**最强大的 GE 计算方式**，允许开发者编写完全自定义的 C++ 计算逻辑。

与简单 Modifier 的区别：

| 特性 | 简单 Modifier | ExecutionCalculation |
|------|--------------|---------------------|
| 可读取的属性 | 仅目标属性 | 来源和目标的任意属性 |
| 计算复杂度 | 简单加减乘除 | 任意复杂逻辑 |
| 输出 | 单个属性修改 | 多个属性修改 |
| 蓝图支持 | 有限 | 完整 C++ 控制 |
| 适用场景 | 简单 Buff/Debuff | 伤害公式、复杂计算 |

---

## 2. 核心结构

### 2.1 FGameplayEffectCustomExecutionParameters（输入参数）

来源：\`Public/GameplayEffectExecutionCalculation.h\`

\`\`\`cpp
struct GAMEPLAYABILITIES_API FGameplayEffectCustomExecutionParameters
{
    // 尝试计算捕获属性的当前值（受 Modifier 影响）
    // 返回 false 表示该属性未被捕获
    bool AttemptCalculateCapturedAttributeMagnitude(
        const FGameplayEffectAttributeCaptureDefinition& InCaptureDef,
        const FAggregatorEvaluateParameters& InEvalParams,
        OUT float& OutMagnitude
    ) const;

    // 尝试计算捕获属性的基础值（不受 Modifier 影响）
    bool AttemptCalculateCapturedAttributeBaseValue(
        const FGameplayEffectAttributeCaptureDefinition& InCaptureDef,
        OUT float& OutBaseValue
    ) const;

    // 尝试计算捕获属性的加成值（CurrentValue - BaseValue）
    bool AttemptCalculateCapturedAttributeBonusMagnitude(
        const FGameplayEffectAttributeCaptureDefinition& InCaptureDef,
        const FAggregatorEvaluateParameters& InEvalParams,
        OUT float& OutBonusMagnitude
    ) const;

    // 获取 GE 规格（包含 SetByCaller 数值、标签等）
    const FGameplayEffectSpec& GetOwningSpec() const;

    // 获取目标 ASC
    UAbilitySystemComponent* GetTargetAbilitySystemComponent() const;

    // 获取来源 ASC（可能为 null）
    UAbilitySystemComponent* GetSourceAbilitySystemComponent() const;

    // 获取传入的额外标签
    const FGameplayTagContainer& GetPassedInTags() const;

    // 获取预测键
    FPredictionKey GetPredictionKey() const;
};
\`\`\`

### 2.2 FGameplayEffectCustomExecutionOutput（输出结果）

\`\`\`cpp
struct GAMEPLAYABILITIES_API FGameplayEffectCustomExecutionOutput
{
    // 添加输出修改器（可以多次调用，修改不同属性）
    void AddOutputModifier(const FGameplayModifierEvaluatedData& InOutputMod);

    // 标记堆叠数已手动处理（GAS 不再自动处理）
    void MarkStackCountHandledManually();

    // 标记 GameplayCue 已手动处理（GAS 不再自动触发）
    void MarkGameplayCuesHandledManually();

    // 标记需要触发条件 GE（Conditional Gameplay Effects）
    void MarkConditionalGameplayEffectsToTrigger();

    // 获取所有输出修改器
    const TArray<FGameplayModifierEvaluatedData>& GetOutputModifiers() const;
};
\`\`\`

---

## 3. 属性捕获宏

来源：\`Public/GameplayEffectExecutionCalculation.h\`

\`\`\`cpp
// 在类中声明属性捕获变量
#define DECLARE_ATTRIBUTE_CAPTUREDEF(P) \\
    FProperty* P##Property; \\
    FGameplayEffectAttributeCaptureDefinition P##Def;

// 在构造函数中定义属性捕获
// S: AttributeSet 类名
// P: 属性名
// T: Source（来源方）或 Target（目标方）
// B: true=快照（GE 应用时捕获），false=实时（执行时捕获）
#define DEFINE_ATTRIBUTE_CAPTUREDEF(S, P, T, B) \\
{ \\
    P##Property = FindFieldChecked<FProperty>(S::StaticClass(), \\
        GET_MEMBER_NAME_CHECKED(S, P)); \\
    P##Def = FGameplayEffectAttributeCaptureDefinition(P##Property, \\
        EGameplayEffectAttributeCaptureSource::T, B); \\
}
\`\`\`

### 快照（Snapshot）vs 实时（Non-Snapshot）

| 模式 | 捕获时机 | 适用场景 |
|------|----------|----------|
| **快照（bSnapshot=true）** | GE 应用时（\`MakeOutgoingSpec\` 时） | 来源方属性（攻击力等），避免后续变化影响 |
| **实时（bSnapshot=false）** | GE 执行时（实际计算时） | 目标方属性（防御力等），需要最新值 |

---

## 4. FGameplayEffectAttributeCaptureDefinition

来源：\`Public/GameplayEffectTypes.h\`

\`\`\`cpp
USTRUCT(BlueprintType)
struct GAMEPLAYABILITIES_API FGameplayEffectAttributeCaptureDefinition
{
    // 要捕获的属性
    UPROPERTY(EditDefaultsOnly, Category=Capture)
    FGameplayAttribute AttributeToCapture;

    // 捕获来源（Source 或 Target）
    UPROPERTY(EditDefaultsOnly, Category=Capture)
    EGameplayEffectAttributeCaptureSource AttributeSource;

    // 是否快照
    UPROPERTY(EditDefaultsOnly, Category=Capture)
    bool bSnapshot;
};

// 捕获来源枚举
enum class EGameplayEffectAttributeCaptureSource : uint8
{
    Source,  // 来源方（施法者）
    Target,  // 目标方（受击者）
};
\`\`\`

---

## 5. 完整实现示例：RPG 伤害计算

\`\`\`cpp
// ==================== 头文件 ====================
UCLASS()
class UMyRPGDamageExecCalc : public UGameplayEffectExecutionCalculation
{
    GENERATED_BODY()

    // 声明需要捕获的属性
    DECLARE_ATTRIBUTE_CAPTUREDEF(AttackPower);      // 来源：攻击力
    DECLARE_ATTRIBUTE_CAPTUREDEF(CriticalRate);     // 来源：暴击率
    DECLARE_ATTRIBUTE_CAPTUREDEF(CriticalDamage);   // 来源：暴击伤害
    DECLARE_ATTRIBUTE_CAPTUREDEF(Defense);          // 目标：防御力
    DECLARE_ATTRIBUTE_CAPTUREDEF(DefensePenetration); // 来源：穿甲

public:
    UMyRPGDamageExecCalc();

    virtual void Execute_Implementation(
        const FGameplayEffectCustomExecutionParameters& ExecutionParams,
        OUT FGameplayEffectCustomExecutionOutput& OutExecutionOutput
    ) const override;
};

// ==================== 实现文件 ====================
UMyRPGDamageExecCalc::UMyRPGDamageExecCalc()
{
    // 来源方属性：快照（应用时捕获，避免后续变化影响）
    DEFINE_ATTRIBUTE_CAPTUREDEF(UMyAttributeSet, AttackPower, Source, true);
    DEFINE_ATTRIBUTE_CAPTUREDEF(UMyAttributeSet, CriticalRate, Source, true);
    DEFINE_ATTRIBUTE_CAPTUREDEF(UMyAttributeSet, CriticalDamage, Source, true);
    DEFINE_ATTRIBUTE_CAPTUREDEF(UMyAttributeSet, DefensePenetration, Source, true);

    // 目标方属性：实时（执行时捕获，使用最新防御值）
    DEFINE_ATTRIBUTE_CAPTUREDEF(UMyAttributeSet, Defense, Target, false);

    // 注册捕获定义（必须！否则 GAS 不会捕获这些属性）
    RelevantAttributesToCapture.Add(AttackPowerDef);
    RelevantAttributesToCapture.Add(CriticalRateDef);
    RelevantAttributesToCapture.Add(CriticalDamageDef);
    RelevantAttributesToCapture.Add(DefensePenetrationDef);
    RelevantAttributesToCapture.Add(DefenseDef);
}

void UMyRPGDamageExecCalc::Execute_Implementation(
    const FGameplayEffectCustomExecutionParameters& ExecutionParams,
    OUT FGameplayEffectCustomExecutionOutput& OutExecutionOutput) const
{
    // 构建评估参数（包含来源和目标标签，用于条件 Modifier）
    FAggregatorEvaluateParameters EvalParams;
    EvalParams.SourceTags = ExecutionParams.GetOwningSpec().CapturedSourceTags.GetAggregatedTags();
    EvalParams.TargetTags = ExecutionParams.GetOwningSpec().CapturedTargetTags.GetAggregatedTags();

    // ==================== 读取属性值 ====================

    float AttackPower = 0.f;
    ExecutionParams.AttemptCalculateCapturedAttributeMagnitude(
        AttackPowerDef, EvalParams, AttackPower);
    AttackPower = FMath::Max(AttackPower, 0.f);

    float CriticalRate = 0.f;
    ExecutionParams.AttemptCalculateCapturedAttributeMagnitude(
        CriticalRateDef, EvalParams, CriticalRate);

    float CriticalDamage = 1.5f; // 默认暴击伤害倍率
    ExecutionParams.AttemptCalculateCapturedAttributeMagnitude(
        CriticalDamageDef, EvalParams, CriticalDamage);

    float Defense = 0.f;
    ExecutionParams.AttemptCalculateCapturedAttributeMagnitude(
        DefenseDef, EvalParams, Defense);

    float DefensePenetration = 0.f;
    ExecutionParams.AttemptCalculateCapturedAttributeMagnitude(
        DefensePenetrationDef, EvalParams, DefensePenetration);

    // ==================== 读取 SetByCaller 数值 ====================

    float DamageCoefficient = ExecutionParams.GetOwningSpec().GetSetByCallerMagnitude(
        FGameplayTag::RequestGameplayTag("Moe.Effect.SetByCaller.DamageCoefficient"),
        false, 1.0f);

    // ==================== 计算最终伤害 ====================

    // 有效防御 = 防御 * (1 - 穿甲率)
    float EffectiveDefense = Defense * (1.f - FMath::Clamp(DefensePenetration, 0.f, 1.f));

    // 基础伤害
    float BaseDamage = AttackPower * DamageCoefficient;

    // 防御减伤（简单公式：伤害 = 攻击 * 攻击 / (攻击 + 防御)）
    float FinalDamage = BaseDamage * BaseDamage / (BaseDamage + EffectiveDefense);

    // 暴击判定
    bool bIsCritical = FMath::FRand() < CriticalRate;
    if (bIsCritical)
    {
        FinalDamage *= CriticalDamage;
    }

    FinalDamage = FMath::Max(FinalDamage, 1.f); // 最低 1 点伤害

    // ==================== 输出结果 ====================

    OutExecutionOutput.AddOutputModifier(
        FGameplayModifierEvaluatedData(
            UMyAttributeSet::GetDamageAttribute(),
            EGameplayModOp::Additive,
            FinalDamage
        )
    );
}
\`\`\`

---

## 6. 在 GE 中配置 ExecutionCalculation

在 \`UGameplayEffect\` 资产中：
1. 找到 \`Executions\` 数组
2. 添加一个 \`FGameplayEffectExecutionDefinition\`
3. 设置 \`CalculationClass\` 为你的 ExecCalc 类
4. 可选：配置 \`CalculationModifiers\`（作用域修改器，在执行前临时修改捕获的属性）

---

## 7. 与 ModifierMagnitudeCalculation（MMC）的区别

| 特性 | MMC | ExecutionCalculation |
|------|-----|---------------------|
| 基类 | \`UGameplayModMagnitudeCalculation\` | \`UGameplayEffectExecutionCalculation\` |
| 输出 | 单个 float 数值 | 多个属性修改 |
| 用途 | 计算单个 Modifier 的数值 | 完整的自定义执行逻辑 |
| 适用场景 | 复杂的数值计算（如：攻击力 * 等级系数） | 伤害公式、多属性联动计算 |
`;
