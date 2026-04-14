# AbilitySystemGlobals 全局配置详解

> **源码文件**：`Public/AbilitySystemGlobals.h`（16.65 KB，424行）
> **继承链**：`UObject → UAbilitySystemGlobals`

---

## 1. 概述

`UAbilitySystemGlobals` 是 GAS 的**全局配置单例**，负责：

- 管理全局数据表（CurveTable、AttributeMetaDataTable）
- 初始化全局 GameplayTag（激活失败标签等）
- 管理 GameplayCueManager 单例
- 提供全局辅助函数（如从 Actor 获取 ASC）
- 支持项目级别的自定义扩展

---

## 2. 获取单例

来源：`Public/AbilitySystemGlobals.h`

```cpp
// 获取全局单例（通过 IGameplayAbilitiesModule 模块接口）
static UAbilitySystemGlobals& Get()
{
    return *IGameplayAbilitiesModule::Get().GetAbilitySystemGlobals();
}

// 使用示例
UAbilitySystemGlobals& Globals = UAbilitySystemGlobals::Get();
UGameplayCueManager* CueManager = Globals.GetGameplayCueManager();
```

---

## 3. 初始化

```cpp
// 必须在项目启动时调用（通常在 GameInstance 或 GameMode 中）
// 加载全局数据表、初始化标签、初始化 CueManager
virtual void InitGlobalData();

// 检查是否已初始化
bool IsAbilitySystemGlobalsInitialized()
{
    return GlobalAttributeSetInitter.IsValid();
}
```

---

## 4. 全局数据表配置

### 4.1 GlobalCurveTable（全局曲线表）

```cpp
// 配置（DefaultGame.ini）：
// [/Script/GameplayAbilities.AbilitySystemGlobals]
// GlobalCurveTableName=/Game/GAS/Data/GE_GlobalCurveTable

// 获取全局曲线表
UCurveTable* GetGlobalCurveTable();

// 用途：ScalableFloat 的默认曲线表
// 当 GE 中的数值使用 ScalableFloat 但没有指定曲线表时，使用此表
```

### 4.2 GlobalAttributeSetDefaultsTableNames（属性默认值表）

```cpp
// 配置（DefaultGame.ini）：
// [/Script/GameplayAbilities.AbilitySystemGlobals]
// GlobalAttributeSetDefaultsTableNames=/Game/GAS/Data/AttributeDefaults

// 用途：通过 InitializeAttributeSetDefaults() 批量初始化属性
// 行名格式：AttributeSetClassName.AttributeName
// 例如：UMyAttributeSet.Health

// 获取属性初始化器
FAttributeSetInitter* GetAttributeSetInitter() const;
```

---

## 5. 全局 GameplayTag

来源：`Public/AbilitySystemGlobals.h`

GAS 预定义了一组用于技能激活失败原因的全局标签：

```cpp
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
```

**配置示例**（`DefaultGame.ini`）：
```ini
[/Script/GameplayAbilities.AbilitySystemGlobals]
ActivateFailIsDeadName=Ability.ActivateFail.IsDead
ActivateFailCooldownName=Ability.ActivateFail.Cooldown
ActivateFailCostName=Ability.ActivateFail.Cost
ActivateFailTagsBlockedName=Ability.ActivateFail.TagsBlocked
ActivateFailTagsMissingName=Ability.ActivateFail.TagsMissing
ActivateFailNetworkingName=Ability.ActivateFail.Networking
```

---

## 6. 全局辅助函数

```cpp
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
```

---

## 7. 项目自定义扩展

### 7.1 自定义 AbilitySystemGlobals 类

```cpp
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
```

---

## 8. 调试功能

来源：`Public/AbilitySystemGlobals.h`

```cpp
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
```

---

## 9. 修改器评估通道

来源：`Public/AbilitySystemGlobals.h`

GAS 支持多个修改器评估通道（Channel），用于控制多个 Modifier 的计算顺序：

```cpp
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
```

---

## 10. 完整 ini 配置参考

```ini
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
```

---

## 11. 文档导航

- 上一篇：[09 - 预测系统](./09_预测系统.md)
- 下一篇：[11 - ExecutionCalculation 自定义计算](./11_ExecutionCalculation.md)
- 返回：[总目录](./00_GAS学习文档总目录.md)
