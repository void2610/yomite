# Unity 7 Alpha 調査レポート — 2026年11月27日時点

## Summary（結論を先に）

**噂は事実です。Unity 7 alpha は実在し、公開されています。**

- Unity は **2026年7月21日、Unite Seoul 2026 で Unity 7 を正式発表**しました（公式ブログ／プレスリリース）。
- **公開 alpha は 2026年10月5日に開始**しました（Unity Discussions 公式アナウンス）。クローズドではなく **public alpha** です。
- 正式名称は **Unity 7.0**、内部バージョン文字列は **7000.0** 系で、ビルド表記は `7000.0.0aXX` です。**2026年11月27日に公式 Alpha ページをライブ確認した時点の最新版は Unity 7000.0.0a22** でした（verified live）。
- 入手方法は **Unity Hub の Pre-releases／公式 Alpha ページからの Install／手動インストーラ（Windows、Windows ARM64、macOS ARM64、Linux）** です。Pro/Enterprise 限定ではありません。Unity 7 追加利用規約（2026年10月6日公開）では Evaluation Version（評価版）として「広く継続的に」使えること、30日／単独ユーザー制限を外すこと、商用利用も可とされています。ただし **無保証（as is）で、データ損失を含むバグがあり得る**ことが明記されています。
- Unity 自身が alpha について **「本番利用は推奨しない。プロジェクト互換性をテストするための最初のバージョン」** と明言しています（CoreCLR 公式アップデート、後述）。
- 正式版の計画は **2026年12月に early beta／Preview、2027年Q1（公式製品ページでは “early 2027”）にフルリリース**。正確な日付は公式に提示されていません。
- **6000.3.10f1（Unity 6.3 LTS）で開発中のプロジェクトは、今すぐ Unity 7 alpha に上げるべきではありません**（詳細は §7）。6.3 LTS のサポートは **2027年12月まで**あります。

> 注意すべき宣伝と実態のズレ：Unity は「No Major Breaking Changes（大きな破壊的変更なし）」を掲げますが、公式 FAQ 自身が「obsolete API のエラー化、パッケージのエンジン統合、プラットフォーム最小要件の引き上げ、非推奨機能の削除はある」と認めており、alpha の実態では **Mono 完全撤廃、Built-in Render Pipeline の実質終了（開くと真っ黒に描画）、BinaryFormatter 廃止**など、プロジェクトによっては無視できない変更があります。「再構築不要」と「変更ゼロ」は別物です。

---

## Findings

### 1. Unity 7 alpha の存在・名称・バージョン・アクセス方法【確認済み】

| 項目 | 確認内容 |
|---|---|
| 存在 | 実在。公式発表＋公開 alpha ビルド＋公式マニュアル（7000.0）が存在 |
| 正式名称 | **Unity 7 / Unity 7.0**。マニュアル表記は “Unity 7.0 (7000.0) Alpha” |
| バージョン文字列 | **7000.0.0a22** が最新（2026-11-27 ライブ確認）。それ以前に a20 が 2026年11月19日リリースと第三者記事が記録 |
| 発表日 | **2026年7月21日**、Unite Seoul 2026 基調講演（公式ブログ同日付、プレスリリースは 7月20日付表記） |
| Alpha 開始日 | **2026年10月5日**（Unity Discussions 公式スレッド、10:39am 投稿） |
| アクセス | **Public alpha**。Unity Hub の “Pre-releases”、公式 Alpha ページ。手動インストールも可 |
| 対象プラン | Pro/Enterprise 限定の記述は公式ソースに **なし**。評価版規約で広範なアクセスを明記 |
| Cadence | alpha は **週2回**リリース（従来の隔週1回から変更）。問題があればスキップする場合あり（公式スレッド） |

出典：
- Unity Discussions “Unity 7.0 Alpha is now available”, 2026-10-05 — https://discussions.unity.com/t/unity-7-0-alpha-is-now-available/1738310 （index/open で確認）
- Unity Editor Alpha Releases — https://unity.com/releases/editor/alpha （**2026-11-27 verified live**：見出し “Unity 7000.0.0a22”、手動インストーラ Linux / macOS ARM64 / Windows ARM64 / Windows、「Alpha を使う前にプロジェクトをバックアップせよ」の注意書き）
- Unity 7.0 Alpha User Manual — https://docs.unity.com/en-us/engine/7000.0/manual （“Unity 7.0 is an alpha release. More information about its new features and how to upgrade … will be published when Unity 7.0 exits beta.”）
- Unity 7 Additional Terms, Published 6 October 2026 — https://unity.com/legal/unity7-terms-of-service/software

補足（用語の揺れ）：12月のマイルストーンを、Seoul 公式ブログは “Unity 7 Preview launches in December”、プレスリリースは “early Beta testing in December” と呼び方が異なります。同一の12月フェーズを指すと読むのが自然ですが、公式に用語は統一されていません。

### 2. バージョニング：Unity 6 / 6000.x の後

- Unity 6 世代は内部バージョン **6000.x**。流れは公式／報道の一致として：**6.0 LTS（2024年10月）→ 6.3 LTS（2025年12月4日）→ 6.4（2026年3月）→ 6.5（2026年6月）→ 6.6（2026年9月1日、Unity 6 最後の Supported/Update リリース）→ 6.7 LTS（2026年後半予定、現在 public beta、6000.7.0b 系）→ Unity 7.0（7000.0）**。
- **Unity 6.3 LTS のサポートは 2027年12月まで**（Enterprise/Industry はさらに1年）。Unity 6.0 LTS は 2026年10月で標準サポート終了。出典：Unity 6 Releases & Support — https://unity.com/releases/unity-6/support （検索経由）／ Unity 6.3 LTS 発表ブログ（2025-12-04）— https://unity.com/blog/unity-6-3-lts-is-now-available
- **6.7 LTS が「最後の Mono ベース／最後の Unity 6 リリース」**と位置付けられています（June 2026 CoreCLR アップデートを引く第三者まとめ複数で一致。一次スレッド本文は本調査では引用経由でのみ確認）。
- 「Unity 7」は単なるリブランドでも、まったくの新規エンジンでもありません。公式の定義は **「Unity 6 ラインの直接の継続（direct continuation）」で、基盤技術は 6.x の各リリースで段階的に先行出荷・実績検証してきたもの**。製品ページ FAQ：「Unity 7 is the next major version … built on a new foundation we've been delivering incrementally across the Unity 6.x releases」。Game Developer 誌への Adam Smith（SVP Product）の説明でも、CoreCLR や Surface Cache GI など基盤要素は「Unity 6 の中で shipped and production-verified されてから Unity 7 に入る」とされています。
  - 出典：https://unity.com/releases/unity-7 ／ https://www.gamedeveloper.com/programming/unity-unveils-unity-7-roadmap-with-update-path-that-won-t-break-your-build
- 命名の経緯（第三者情報）：初期の CoreCLR 関連資料ではこの移行先は **「Unity 6.8」**と呼ばれていたものが、後に **7.0** になった、と複数の第三者記事が指摘しています（例：Tamamini、GuardingPearSoftware）。公式一次ソースでこの改名を明示した文書は本調査では確認できていません → §「未確認」参照。

### 3. 主要新機能・変更点

重要：**「Unity 7 で発表された機能」と「alpha に実際に入っている機能」は大きく異なります。** alpha の中核はほぼ CoreCLR 化のみで、目玉機能の多くは 6.7 LTS 側か、7.0 リリース／7.x サイクル向けのロードマップです。

#### 3a. Alpha に実際に入っているもの（リリース／公式アップデートで確認）

- **CoreCLR Editor（Mono なし）**：初の CoreCLR 駆動 Editor。ただし **言語／API はまだ C# 9、.NET Standard 2.1 のまま**。出典：CoreCLR, Scripting, and .NET Update, October 2026（Unity Discussions 公式）を全文引用した GameFromScratch（2026-10-06）— https://gamefromscratch.com/unity-7-alpha-released/
- **Domain Reload の廃止 → Code Reload / ALC（AssemblyLoadContext）リロード**：変更されたコードだけをリロード。公式スタッフ回答：「domain reloads are gone. They have been replaced by code reloads and ALC reloading.」（alpha スレッド、2026-10-06）
- **CoreCLR Desktop Player の非実験化への移行作業**、および **全プラットフォームの更新版 IL2CPP への段階移行**（6.7 の実験的 iOS プレイヤーが起点。各プラットフォーム準備ができた順に公開）。
- **MSBuild 統合の作業中**：プロジェクト定義／コンパイルワークフローを MSBuild 標準化（IDE 統合、増分コンパイル）。

#### 3b. 発表済みだが alpha には未搭載／時期未定のもの

- **.NET 10 ＋ C# 14**：7.0 ライフサイクル中に提供予定だが、公式が **「We cannot commit to a public date yet（公表できる日付を約束できない）」** と明言。Seoul 発表時点の「Unity 7 で .NET 10 / C# 14 にフルアクセス」より後退しています。
- **パフォーマンス改善**：初の supported 7.0 の目標は **Unity 6.7 LTS との機能・安定性の parity（同等）** で、性能改善は **次の 7.x LTS** が焦点（公式アップデート）。
- **ECS for All**：GameObject がそのまま Entity になる構想。ただし公式スタッフが alpha スレッドで **「Hierarchy without SubScenes（Unified Authoring の中核）は 7.0 には入らない」「ECS for All は進行中で、単一リリースで完成するものではない」** と回答。Tokyo（2026-11-17）では「Unity 7.0 で Entity データを Inspector で表示・編集できる」と紹介。出典：https://unity.com/blog/unite-tokyo-2026-keynote-recap
- **Method Reload**：メソッド単位で実行中にコード変更を反映、IL2CPP デバイスへも再ビルドなしで反映（Tokyo ロードマップデッキの解説、第三者分析経由）。

#### 3c. グラフィックス（多くは 6.7 LTS が主戦場）

- **Surface Cache GI（SCGI）**：URP 向けリアルタイム GI（ベイク不要、動的ジオメトリ対応）。**6.7 alpha でプレビュー可能、6.7 LTS で広く利用可能**になるもので、Unity 7 専用機能ではありません。Screen Space Reflections、Ground Truth Ambient Occlusion (GTAO) も同様。出典：Seoul 公式ブログ — https://unity.com/blog/unite-seoul-keynote-2026-recap
- **Unity Graphics Kernel (UGK)**：DX12 / Vulkan / Metal への新しいグラフィックス基盤層。基盤は 6.7 で敷き、完成は Unity 7。Atrio サンプルでレイ トレーシング有効時 GPU 性能 **+62%超**（Unity 自身のデモ値、Tokyo 公式ブログ／公式 Instagram 2026-11-23）。
- **Unity Neural / Neural Texture Compression (NTC)**：Sentis ベースのオンデバイス推論。NTC は **6.7 LTS で実験機能、Unity 7 で正式版予定**。Atrio でテクスチャメモリ約30%削減（Tokyo 公式ブログ。Seoul 時点では「50%超」とも紹介されており、数値はデモ条件依存）。
- **シェーダービルド最大90%高速化（Fast Build Profile、6.7）**、DXC 対応、WebGPU は 6.6 で production-ready。
- アップスケーラ：ロードマップデッキでは STP（デフォルト）、DLSS 4.5、FSR 2–4、MetalFX が列挙（第三者分析経由、デッキ自体は https://unity.com/roadmap リンク）。

#### 3d. その他

- **AI / ワークフロー**：**Unity CLI と Unity MCP サーバーは全員に無料・サブスクリプションなし**で提供（Seoul 公式）。CLI 1.0 は Tokyo 時点で GA、Claude Code / Codex / Google Antigravity / Grok 向け公式プラグイン。**Unity Pipeline API は beta（申込制）、GA は 2027年予定**。これらは Unity 6 以降でも動くものが多く、7 専用ではありません。
- **2D**：カスタマイズ可能な 2D グラフィックス、Physics Core 2D（Box2D v3、多スレッド）、RenderSprite API、2D プロファイラは **主に 6.7 LTS**。Unity 7 側は Tilemap／SpriteShape の高速レンダリング API、高レベル 2D キャラアニメーション等がロードマップ（デッキ分析経由）。
- **UI**：UI Toolkit の Scene ビュー オーサリング、キーフレームアニメーション、USS エフェクト、UI Profiler は **6.7 LTS ロードマップ**。Unity 7 alpha 固有の UI 目玉は一次ソースで確認できず。
- **マルチプレイヤー**：Unity 7 alpha 固有の目玉機能は一次ソースで **確認できず**（Relay の直接接続試行など通常のパッケージ更新はリリースノート集約サイトに見えるのみ）。
- **プラットフォーム／iOS・macOS**：Editor は Windows / macOS ARM64 / Linux / Windows ARM64 で提供。iOS は IL2CPP 前提で、更新版 IL2CPP（.NET 10 BCL 化）へ段階移行中。6.7 の実験的 iOS CoreCLR 系プレイヤーが前段。alpha 時点で iOS 向けに「完成した」新基盤とは公式は言っていません。

### 4. 破壊的変更・アップグレードパス・既知の問題

公式 FAQ の整理（https://unity.com/releases/unity-7）：あるのは「obsolete API のエラー化、パッケージのエンジン統合、プラットフォーム最小要件の引き上げ、非推奨機能の削除」。ない（はずの）ものは「プロジェクトの再構築やコードベースの書き直しを強いる変更」。alpha 期に Discussions で planned breaking changes スレッドを公開し続けるとしています。

alpha のリリースノート／公式アップグレード資料をまとめた第三者検証記事（VerveCode、2026-11-21、7000.0.0a20 のマニュアル／ノートに基づく — https://vervecode.dev/en/unity/unity-7-upgrade/）が挙げる具体的リスク ※一次資料の要約であり、最終仕様は beta 終了後に公開される公式 Upgrade Guide で要再確認：

- **Built-in Render Pipeline（BIRP）：7.0 alpha で開くと画面が真っ黒になり、エラーバナー表示、Surface Shader 無効**。対策は **6.7 のうちに URP へ変換**すること。公式のレンダーパイプライン戦略（https://unity.com/topics/render-pipelines-strategy-for-2026）でも BIRP は **6.5 で非推奨開始、少なくとも 6.7 LTS ライフサイクルまでは利用可、最終削除バージョンは未定**。HDRP は **メンテナンスのみ・新機能なし**、開発の主軸は URP。
- **静的状態が残る**：Code Reload／Play Mode の Reload Scene only により、static フィールド／static イベントが前回 Play の値を保持し得る。`RuntimeInitializeOnLoadMethod` や（6.6以降）`[AutoStaticsCleanup]` でのリセットが必要。
- **BinaryFormatter はサポート終了**：セーブデータは JsonUtility 等へ移行が必要。旧セーブの変換は別途必要。
- **`String.GetHashCode` が実行間で安定しなくなる、浮動小数点結果が Mono と微妙に異なる**（CoreCLR 化に伴う挙動差。Tamamini の分析が公式アップグレードガイドを引用）。
- **`Environment.Exit()` は CoreCLR で `PlatformNotSupportedException`** → `Application.Quit()` へ。
- **`AppDomain` / `Assembly.Location` / `Assembly.LoadFile` 系 API がそのままでは動かない** → `CurrentAssemblies` 等の Unity 提供 API へ（6.5以降で利用可）。
- **`DEVELOPMENT_BUILD` / `UNITY_64` シンボルが定義されなくなる**（7.0 alpha）：`#if` 内コードが無言で消える。
- **.NET Standard 2.1 でビルドされていないプラグイン DLL が読み込めない可能性**。CoreCLR は .NET Standard API 互換レベル のみ。
- エンコーディング：CoreCLR は既定で ASCII／Unicode のみ登録。日本語等のコードページ（例：Shift_JIS 系を扱う場合も同様の考え方）を読む場合は `Encoding.RegisterProvider(CodePagesEncodingProvider.Instance)` が必要、とガイドが注意（同記事が引用。Big5 の例で説明）。
- リリースノート集約（unityreleases.com、公式ノートの再構成、第三者）では a16 で **Mono ベース Android プレイヤーのサポート削除**、a21 時点で Scripting Runtime／Serialization／TextMeshPro の **Blocker 級 known issues（クラッシュ系）** が記録されています。alpha の不安定さの具体例として扱ってください（一次ノート全文は本調査では集約サイト経由）。
- **アップグレード手順（公式マニュアル方針として同記事が要約）**：メジャーバージョンを1つずつ上げる。2022 LTS → Unity 6 → Unity 7。途中で **6.3 で URP Compatibility Mode（Render Graph 化）**、**6.7 で URP 変換＋Project Auditor の “Migrate to CoreCLR” チェック**が実質的な関門。Project Auditor は Unity 6 に統合済みで、互換性問題を事前に洗い出せます（Seoul 公式ブログでも案内）。なお **Unity 7.0 の公式 Upgrade Guide の完全版は「beta 終了後」に公開予定**とマニュアルが述べており、現時点では未確定情報が多い状態です。

パッケージ互換性：Seoul 時点で Unity は **Asset Store 人気パッケージ68本の互換性テスト済み（順次追加）**と発表。ただし alpha スレッド／第三者分析では「ファーストパーティ パッケージと .NET 互換レベルはまだ固まっていない」という指摘があり、**Localization パッケージを含む個別パッケージの 7.0 alpha での動作は、本調査では一次ソースで確認できませんでした**（7000.0 向けドキュメント自体は存在）。

### 5. リリースタイムライン

| フェーズ | 公式に述べられた時期 | 状態（2026-11-27） |
|---|---|---|
| 発表 | 2026年7月21日（Unite Seoul） | 済 |
| Public alpha | 2026年10月5日開始、**週2ビルド** | 進行中、最新 a22 |
| Early beta / Preview | **2026年12月**（日付の特定なし） | 未開始 |
| フルリリース | **2027年Q1 / “early 2027”**（正確な日付なし） | 未 |
| .NET 10 / C# 14 搭載 | 7.0 ライフサイクル中、**日付は約束できない**と公式明言 | 未定 |
| 性能最適化 | 次の **7.x LTS** が焦点（その LTS の日付も未発表） | 未定 |
| Unity 7.0 自体が LTS かどうか | **公式に LTS とは述べられていない**（「supported release of Unity 7.0」という表現のみ） | 未確認 |
| 並行ライン：Unity 6.7 LTS | 2026年末／Q4 予定と再確認（Tokyo）。正確な日付はロードマップデッキにもなし | beta 中 |

出典：プレスリリース https://unity.com/news/unity-7-roadmap-revealed-at-unite-seoul ／ 製品ページ https://unity.com/releases/unity-7 ／ Tokyo 分析 https://indietooling.com/posts/unity-6-7-lts-unity-7-roadmap （2026-11-26）
※上記以外の日付（例：「beta は12月◯日」「正式版は3月」）を断言する情報は、確認した範囲では **公式発表ではありません**。

### 6. コミュニティ／報道の反応

- **Game Developer**（2026-07）：「won't break your build」を軸に好意的に報道。基盤を 6.x で先行検証する戦略を評価。https://www.gamedeveloper.com/programming/unity-unveils-unity-7-roadmap-with-update-path-that-won-t-break-your-build
- **GamesIndustry.biz**（2026-07、GameDev.net 経由で言及）：beta 12月／Q1 2027 リリースを報道。
- **80 Level**（2026-07-22）：「Unity 7 Revealed, Building On Unity 6 Without Breaking Changes」。https://80.lv/articles/unity-7-has-been-announced
- **GameFromScratch**（2026-10-06）：alpha リリースを報じつつ「初期 alpha は範囲が限定的。CoreCLR の恩恵（新 C#）はまだ先」と冷静な評価。
- **コミュニティの受け止め（alpha スレッド）**：期待と同時に「ECS for All はどこへ？」「.NET 互換レベルはまだ Standard のままか」といった質問が並び、スタッフが火消し／補足に回っている様子が見えます。Tokyo ロードマップ分析（IndieTooling、2026-11-26）は「今後6か月以内に出荷するなら Unity 6 に留まれ。2D なら 6.7 LTS が狙い目」と実務的な結論を出しています。
- 公式 SNS：Unity 公式 Instagram が 2026-11-09 に「The steps to Unity 7（6.6 → 6.7 LTS → Unity 7 Preview → Unity 7 Release）」、2026-11-23 に UGK 紹介リールを投稿（index 経由で確認）。

### 7. Relevance：「今アップグレードすべきか」— 6000.3.10f1 / 2D・cozy / カスタムUI / Localization / iOS 前提での評価

**結論：本番プロジェクトは 6000.3（Unity 6.3 LTS）のまま維持。Unity 7 alpha は別コピーでの互換性テスト専用に留めるのが、証拠に基づく推奨です。**

理由：
1. **急ぐ理由がない**：6.3 LTS は **2027年12月までサポート**。iOS のストア要件対応などのパッチも LTS ラインで受けられます。
2. **alpha は Unity 自身が本番非推奨**：評価版規約でも「未テストのコード、データ損失の可能性、無保証」と明記。Blocker 級クラッシュの known issues も残っています。
3. **このプロジェクト類型への直接の利益が alpha にはほぼない**：2D／UI の改善の主戦場は **6.7 LTS**（カスタム 2D ライト、Physics Core 2D、UI Toolkit オーサリング等）であり、Unity 7 alpha の中身は CoreCLR 化が中心。3D 向けの SCGI／UGK／NTC も cozy 2D には恩恵が薄いと考えられます。
4. **固有のリスク箇所が複数ある**：
   - カスタム UI：UI Toolkit／uGUI の API 変更は alpha ノートにも散見され（第三者集約経由）、検証コストがかかる。
   - **Localization パッケージ：7.0 alpha での動作は一次ソースで未確認**。必ずクローンで、ロケール切替・Addressables 連携・フォントまで通しテストが必要。
   - iOS：IL2CPP の基盤移行（.NET 10 BCL 化）が進行中で、プラットフォームごとに移行時期が異なる段階。実機ビルド＋Xcode アーカイブまでの確認なしに本線化は危険。
   - セーブ／永続化に BinaryFormatter や GetHashCode の安定性へ依存するコードがある場合、CoreCLR で静かに壊れる類型に該当。
   - もし Built-in Render Pipeline を使っている場合は特に注意：7 alpha では描画が真っ黒になります。URP ならこの問題は回避できますが、Render Graph 前提など 6.x 側の前提条件を先に満たす必要があります（プロジェクトのパイプラインは本調査では未確認）。
5. **推奨アクション（今できる準備）**：
   - 本線は 6.3 LTS のパッチ更新のみ。次の本線候補は **6.7 LTS（2026年末予定）**として評価する。
   - Unity 6 の **Project Auditor（Migrate to CoreCLR / Upgrade チェック）**を現プロジェクトで一度回し、static 状態・BinaryFormatter・AppDomain 系の洗い出しだけ先に済ませる。
   - プロジェクトの **複製（ブランチ）でだけ** a22 以降／12月 beta を開き、(a) 起動・タイトル→ゲームプレイ一周、(b) Localization の全ロケール表示、(c) カスタム UI の主要画面、(d) iOS 実機ビルド、の4点スモークテストを行う。
   - 正式な移行判断は **Unity 7.0 の正式版＋公式 Upgrade Guide（beta 終了後公開予定）が出てから**。さらに慎重を期すなら「次の 7.x LTS」まで待つ選択肢も公式ロードマップ上は合理的です（性能改善もそこが焦点と明言されています）。

---

## Could not verify / Rumor only（未確認・噂レベル）

以下は一次ソースで確認できなかった、または第三者情報のみの項目です。断定しないでください。

- **Localization パッケージ（com.unity.localization）の Unity 7.0 alpha での互換性・移行パス**：7000.0 ドキュメントの存在と、6.7 系で「localization module」化の動きを示すノート断片（集約サイト経由）はあるが、7 alpha での動作保証を述べた公式発表は未確認。
- **「Unity 6.8 が Unity 7 に改名された」説**：複数の第三者記事が述べるが、改名を明示した Unity 公式文書は未確認。
- **alpha 初ビルドの細部**：開始「10月5日」は公式スレッドで確認。一部第三者は「a7 が10月6日」などビルド単位の日付を挙げるが、ビルドごとの正確な日付は公式 alpha ページの現行表示（最新 a22）以外は未検証。また集約サイトには a23 で修正、という記述も見えるが、公式ページの最新表示は a22 でした（2026-11-27 ライブ確認を優先）。
- **マルチプレイヤー／Netcode の Unity 7 固有の新機能**：一次ソースで確認できず。
- **Unity 7 の価格・ライセンス条件の変更**：ロードマップ／発表の範囲では言及なし。変更があるという噂も確認できず。
- **性能数値の一般化**：UGK +62%、ECS デモ 24.5→58.4 FPS、NTC 約30%（／50%超）などはすべて **Unity 自身の特定サンプル・特定ハードウェアでのデモ値**であり、一般プロジェクトでの再現を保証するものではありません。
- **「Unity 7 は Unreal Engine 6 より約1年早い」等の競合比較**：一部メディア（TechTimes 等）のフレーミングであり、Unity 公式の主張ではありません。
- 12月 beta の **正確な開始日**、Q1 2027 の **正確なリリース日**、**7.0 が LTS 扱いになるか**：いずれも公式未発表。

なお、本調査で「Unity 7 は存在しない／フェイク」という方向の情報は一切見つかりませんでした。噂の出所として考えられる混同は、(a) 12月の “Preview” と “early beta” の呼称の揺れ、(b) 旧呼称「6.8」時代の CoreCLR 記事、(c) 6.7 alpha/beta に先行搭載された SCGI 等を「Unity 7 の機能」と紹介する二次情報、あたりです。

---

## Sources

一次ソース（Unity 公式）— 2026-11-27 閲覧：
1. Unity Editor Alpha Releases（**verified live**、最新 7000.0.0a22）— https://unity.com/releases/editor/alpha
2. Unity Discussions: Unity 7.0 Alpha is now available, 2026-10-05 — https://discussions.unity.com/t/unity-7-0-alpha-is-now-available/1738310
3. Unity 7 製品ページ（FAQ 含む）— https://unity.com/releases/unity-7
4. Unite Seoul 2026 Keynote Recap, 2026-07-21 — https://unity.com/blog/unite-seoul-keynote-2026-recap
5. プレスリリース: Unity 7 Roadmap Revealed at Unite Seoul, 2026-07-20/21 — https://unity.com/news/unity-7-roadmap-revealed-at-unite-seoul
6. Unite Tokyo 2026 Keynote Recap, 2026-11-17 — https://unity.com/blog/unite-tokyo-2026-keynote-recap
7. Unity 7.0 Alpha User Manual (7000.0) — https://docs.unity.com/en-us/engine/7000.0/manual
8. Unity 7 Additional Terms, 2026-10-06 — https://unity.com/legal/unity7-terms-of-service/software
9. Unity 6 Releases & Support（6.3 LTS は 2027年12月まで）— https://unity.com/releases/unity-6/support
10. Unity 6.3 LTS is Now Available, 2025-12-04 — https://unity.com/blog/unity-6-3-lts-is-now-available
11. Render Pipelines strategy for 2026 — https://unity.com/topics/render-pipelines-strategy-for-2026

二次ソース（報道・分析）：
12. GameFromScratch: Unity 7 Alpha Released, 2026-10-06（公式 CoreCLR アップデート全文引用）— https://gamefromscratch.com/unity-7-alpha-released/
13. IndieTooling: What ships in Unity 6.7 LTS, and what waits for Unity 7, 2026-11-26（Tokyo ロードマップデッキ分析）— https://indietooling.com/posts/unity-6-7-lts-unity-7-roadmap
14. VerveCode: Preparing for Unity 7, 2026-11-21（a20 マニュアル／ノートに基づく移行検証）— https://vervecode.dev/en/unity/unity-7-upgrade/
15. Game Developer: Unity unveils Unity 7 roadmap…, 2026-07 — https://www.gamedeveloper.com/programming/unity-unveils-unity-7-roadmap-with-update-path-that-won-t-break-your-build
16. 80 Level: Unity 7 Revealed…, 2026-07-22 — https://80.lv/articles/unity-7-has-been-announced
17. unityreleases.com（公式リリースノートの第三者集約、a16/a21 の known issues 参照用）— https://unityreleases.com/releases/7000.0.0a21

作業メモ：notes/sources.md
