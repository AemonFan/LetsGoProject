
## AssetNameMapping 按玩法 Mount/UnMount 的设计分析

	### 一、这样做的优点

	#### 1. 映射表内存的按需管理

	从代码可以看到，`AssetNameMappingInfoMap` 是一个 `TMap<FString, TSharedPtr<AssetNameMappingInfo>>`，每个玩法的映射文件加载后会占用一定的内存（代码中甚至预留了 `Reserve(80000)` 的容量）。

	```cpp
	// Init 时记录了加载前后的内存差值
	uint64 UsedMemoryBeforeLoadAssetNameMapping = MemoryStatsBefore.UsedPhysical;
	// ... 加载映射文件 ...
	uint64 UsedMemoryAfterLoadAssetNameMapping = MemoryStatsAfter.UsedPhysical;
	MOE_LOG(LogMoeAssetManager, Log,
		TEXT("InitAssetNameMappingByPath MemoryStatsBefore %lld  MemoryStatsAfter %lld Diff %lld"),
		UsedMemoryBeforeLoadAssetNameMapping, UsedMemoryAfterLoadAssetNameMapping,
		UsedMemoryAfterLoadAssetNameMapping - UsedMemoryBeforeLoadAssetNameMapping, ...);
	```

	退出玩法时调用 `ClearAssetNameMappingByPath`，会将对应的 `TSharedPtr<AssetNameMappingInfo>` 从 Map 中移除，引用计数归零后，其中的 `ShortNameToPath`、`ShortNameToPathStringView`、`AssetKVStringStore` 等数据结构全部释放，**直接回收映射表本身占用的内存**。

	#### 2. 防止短名命名冲突（命名空间隔离）

	不同玩法可能存在同名的短名资产（如都有 `"hero_mesh"` 这个短名），按玩法分文件管理后，每个玩法的映射表是独立的 `AssetNameMappingInfo` 实例，互不干扰。退出玩法后清除该玩法的映射，也不会影响其他玩法或公共映射表。

	#### 3. 支持热更的动态替换

	映射文件可以随热更包下发，进入玩法时加载最新的映射文件，退出后卸载。下次进入时重新加载，天然支持**资产路径的热更替换**，而不需要重启游戏。

	#### 4. 查询性能保持稳定

	`GetAssetObjectPath` 的查询是遍历 `AssetNameMappingInfoMap` 的所有条目：

	```cpp
	for(auto& AssetNameMappingInfo : AssetNameMappingInfoMap)
	{
		const FString* FoundPath = AssetNameMappingInfo.Value->ShortNameToPath.Find(LowerShortName);
		...
	}
	```

	如果所有玩法的映射表都常驻内存，随着玩法数量增多，这个遍历的开销会线性增长。按需 Mount/UnMount 保证了 Map 中始终只有当前活跃玩法的映射表，**查询复杂度保持在较低水平**。

	---

	### 二、卸载映射文件后，对应资源是否也会卸载？

	**答案是：不会自动卸载，需要额外处理。**

	这是这套设计中最关键的一个区分点，需要理解两个完全独立的层次：

	```mermaid
	graph LR
		A["AssetNameMapping 映射表<br/>(ShortName → FullPath)"] -->|"仅是索引/目录"| B["FStreamableManager<br/>(实际资源加载/持有)"]
		B --> C["UObject 资源实例<br/>(内存中的实际资源)"]

		style A fill:#f9f,stroke:#333
		style B fill:#bbf,stroke:#333
		style C fill:#bfb,stroke:#333
	```

	#### 映射表（AssetNameMapping）的本质

	`AssetNameMappingInfo` 里存储的只是 **字符串到字符串的映射**（短名 → 长路径），它本身不持有任何 `UObject` 资源引用，也不参与 UE 的 GC 系统。调用 `ClearAssetNameMappingByPath` 只是释放了这张"目录"，**不会触发任何资源的卸载**。

	#### 资源的实际生命周期由 FStreamableManager 控制

	资源是否被卸载，取决于 `FStreamableManager` 中对应 `FSoftObjectPath` 的 `FStreamableHandle` 是否被释放：

	```cpp
	// UnloadAssetObject 才是真正触发资源卸载的接口
	void UMoeAssetManager::UnloadAssetObject(const FString& AssetNameKey)
	{
		// 先通过短名查到长路径
		const FSoftObjectPath* AssetPath = GetAssetObjectPath(AssetNameKey);
		if (AssetPath != nullptr && AssetPath->IsValid())
		{
			TArray<TSharedRef<FStreamableHandle>> HandleList;
			if (StreamableManager->GetActiveHandles(*AssetPath, HandleList))
			{
				StreamableManager->Unload(*AssetPath);  // 这才是真正卸载资源
			}
		}
	}
	```

	#### 完整的生命周期对比

	| 操作 | 映射表内存 | 资源（UObject）内存 |
	|---|---|---|
	| `InitAssetNameMappingByPath` | ✅ 分配（加载短名→路径字典） | ❌ 不变（资源未加载） |
	| `LoadSyncAssetObject / RequestAsyncLoad` | ❌ 不变 | ✅ 资源加载进内存 |
	| `ClearAssetNameMappingByPath` | ✅ 释放（字典内存回收） | ❌ **资源仍在内存中** |
	| `UnloadAssetObject` | ❌ 不变 | ✅ 资源从 StreamableManager 释放 |
	| GC 触发 | ❌ 不变 | ✅ 无引用的资源被 GC 回收 |

	#### 实际的资源卸载时机

	退出玩法时，资源真正被释放需要满足以下条件之一：

	1. **主动调用 `UnloadAssetObject`**：在玩法退出逻辑中逐一卸载已加载的资源
	2. **`FStreamableHandle` 超出作用域**：如果加载时使用的 Handle 被释放（`bManageActiveHandle = false` 且 Handle 析构），StreamableManager 会释放对资源的引用
	3. **等待 GC**：资源引用计数归零后，下次 GC 时才真正回收内存

	> **注意**：如果先调用了 `ClearAssetNameMappingByPath` 清除了映射表，再想调用 `UnloadAssetObject` 就会失败，因为 `GetAssetObjectPath` 找不到短名对应的路径了。所以正确的退出顺序应该是：**先卸载资源，再清除映射表**，或者在清除映射表之前记录好需要卸载的长路径列表。

