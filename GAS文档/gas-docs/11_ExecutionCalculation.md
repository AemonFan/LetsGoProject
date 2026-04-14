# GameplayEffectExecutionCalculation 自定义执行计算详解

> **源码文件**：`Public/GameplayEffectExecutionCalculation.h`（16.06 KB，330行）
> **继承链**：`UObject → UGameplayEffectCalculation → UGameplayEffectExecutionCalculation`

---

## 1. 概述

`UGameplayEffectExecutionCalculation`（简称 ExecCalc 或 EC）是 GAS 中**最强大的 GE 计算方式**，允许开发者编写完全自定义的 C++ 计算逻辑。

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

来源：`Public/GameplayEffectExecutionCalculation.h`

```cpp
struct GAMEPLAYABILITIES_API FGameplayEffectCustomExecutionParameters
{
    // ==================== 属性捕获查询 ====================

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

    // 尝试计算带基础值的捕获属性
    bool AttemptCalculateCapturedAttributeMagnitudeWithBase(
        const FGameplayEffectAttributeCaptureDefinition& InCaptureDef,
        const FAggregatorEvaluateParameters& InEvalParams,
        float InBaseValue,
        OUT float& OutMagnitude
    ) const;

    // ==================== 临时聚合器（Transient Aggregator）====================

    // 尝试计算临时聚合器的值（通过 Tag 标识的临时变量）
    bool AttemptCalculateTransientAggregatorMagnitude(
        const FGameplayTag& InAggregatorIdentifier,
        const FAggregatorEvaluateParameters& InEvalParams,
        OUT float& OutMagnitude
    ) const;

    // ==================== 访问器 ====================

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
```

### 2.2 FGameplayEffectCustomExecutionOutput（输出结果）

```cpp
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
```

---

## 3. 属性捕获宏

来源：`Public/GameplayEffectExecutionCalculation.h`

```cpp
// 在类中声明属性捕获变量
#define DECLARE_ATTRIBUTE_CAPTUREDEF(P) \
    FProperty* P##Property; \
    FGameplayEffectAttributeCaptureDefinition P##Def;

// 在构造函数中定义属性捕获
// S: AttributeSet 类名
// P: 属性名
// T: Source（来源方）或 Target（目标方）
// B: true=快照（GE 应用时捕获），false=实时（执行时捕获）
#define DEFINE_ATTRIBUTE_CAPTUREDEF(S, P, T, B) \
{ \
    P##Property = FindFieldChecked<FProperty>(S::StaticClass(), \
        GET_MEMBER_NAME_CHECKED(S, P)); \
    P##Def = FGameplayEffectAttributeCaptureDefinition(P##Property, \
        EGameplayEffectAttributeCaptureSource::T, B); \
}
```

### 快照（Snapshot）vs 实时（Non-Snapshot）

| 模式 | 捕获时机 | 适用场景 |
|------|----------|----------|
| **快照（bSnapshot=true）** | GE 应用时（`MakeOutgoingSpec` 时） | 来源方属性（攻击力等），避免后续变化影响 |
| **实时（bSnapshot=false）** | GE 执行时（实际计算时） | 目标方属性（防御力等），需要最新值 |

---

## 4. FGameplayEffectAttributeCaptureDefinition

来源：`Public/GameplayEffectTypes.h`

```cpp
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
```

---

## 5. 完整实现示例：RPG 伤害计算

```cpp
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
    // 定义属性捕获
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
        AttackPowerDef, EvalParams, AttackPower
    );
    AttackPower = FMath::Max(AttackPower, 0.f);

    float CriticalRate = 0.f;
    ExecutionParams.AttemptCalculateCapturedAttributeMagnitude(
        CriticalRateDef, EvalParams, CriticalRate
    );

    float CriticalDamage = 1.5f; // 默认暴击伤害倍率
    ExecutionParams.AttemptCalculateCapturedAttributeMagnitude(
        CriticalDamageDef, EvalParams, CriticalDamage
    );

    float Defense = 0.f;
    ExecutionParams.AttemptCalculateCapturedAttributeMagnitude(
        DefenseDef, EvalParams, Defense
    );

    float DefensePenetration = 0.f;
    ExecutionParams.AttemptCalculateCapturedAttributeMagnitude(
        DefensePenetrationDef, EvalParams, DefensePenetration
    );

    // ==================== 读取 SetByCaller 数值 ====================

    // 读取技能传入的基础伤害系数
    float DamageCoefficient = ExecutionParams.GetOwningSpec().GetSetByCallerMagnitude(
        FGameplayTag::RequestGameplayTag("Moe.Effect.SetByCaller.DamageCoefficient"),
        false,  // 找不到时不报错
        1.0f    // 默认值
    );

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

    // 修改 Damage 属性（在 AttributeSet::PostGameplayEffectExecute 中处理）
    OutExecutionOutput.AddOutputModifier(
        FGameplayModifierEvaluatedData(
            UMyAttributeSet::GetDamageAttribute(),
            EGameplayModOp::Additive,
            FinalDamage
        )
    );

    // 如果暴击，还可以修改其他属性（如触发特殊效果）
    // OutExecutionOutput.AddOutputModifier(...);
}
```

---

## 6. 在 GE 中配置 ExecutionCalculation

在 `UGameplayEffect` 资产中：
1. 找到 `Executions` 数组
2. 添加一个 `FGameplayEffectExecutionDefinition`
3. 设置 `CalculationClass` 为你的 ExecCalc 类
4. 可选：配置 `CalculationModifiers`（作用域修改器，在执行前临时修改捕获的属性）

---

## 7. 与 ModifierMagnitudeCalculation（MMC）的区别

| 特性 | MMC | ExecutionCalculation |
|------|-----|---------------------|
| 基类 | `UGameplayModMagnitudeCalculation` | `UGameplayEffectExecutionCalculation` |
| 输出 | 单个 float 数值 | 多个属性修改 |
| 用途 | 计算单个 Modifier 的数值 | 完整的自定义执行逻辑 |
| 适用场景 | 复杂的数值计算（如：攻击力 * 等级系数） | 伤害公式、多属性联动计算 |

---

## 8. 文档导航

- 上一篇：[10 - AbilitySystemGlobals 全局配置](./10_AbilitySystemGlobals.md)
- 返回：[总目录](./00_GAS学习文档总目录.md)
