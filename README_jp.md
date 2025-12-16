# 🎵 Discord音楽ボット

**🌐 Language: [English](README.md) | [Indonesia](README_ID.md) | [日本語](README_jp.md)**

---

Lavalinkを搭載した高品質な音声ストリーミング対応の機能豊富なDiscord音楽ボット。美しいインタラクティブプレイヤーパネルを備えたBoogieボットにインスパイアされています！

## ✨ 特徴

### 🎶 コア音楽機能
- 🎵 YouTubeから音楽再生（検索または直接URL）
- 📋 シャッフル機能付きキューシステム
- 🔁 ループモード（トラック/キュー/オフ）
- 🔊 音量コントロール（0-100%）
- ⏯️ 一時停止、再開、スキップ、停止
- 📊 リアルタイムプログレスバー付きNow Playing
- 🎧 ボイスチャンネルに滞在（自動退出なし）

### 🎛️ インタラクティブプレイヤーパネル（Boogieスタイル）
- **リアルタイムプログレスバー** - 10秒ごとに現在の位置を表示して更新
- **ライブキューカウント** - 曲が追加されると即座に更新
- **コントロールボタン:**
  - ⏮️ トラックを再開
  - ⏸️/▶️ 一時停止/再開（動的アイコン）
  - ⏭️ スキップ
  - ⏹️ 停止
  - 🔀 シャッフル
  - 🔉/🔊 音量下げ/上げ
  - 🔁 ループ（アクティブ時に色変更）
  - ❤️ お気に入り
  - 📋 キューを表示

### 📀 ドロップダウンメニュー
- **キュートラックを表示** - キュー内の最大25トラックを閲覧
- **その他の機能:**
  - 📍 位置へシーク（説明）
  - 🎵 詳細なNow Playing情報
  - 🗑️ キューをクリア
  - 🔄 トラックを再開
  - 📊 プレイヤー統計

### 🧹 クリーンなチャット体験
- すべてのボットメッセージは5秒後に自動削除
- プレイヤーパネルは永続的に維持（インプレース編集）
- チャットの散乱なし！

## 📋 スラッシュコマンド

| コマンド | 説明 |
|---------|-------------|
| `/play <query>` | YouTubeから曲を再生 |
| `/skip` | 現在の曲をスキップ |
| `/stop` | 再生を停止しキューをクリア |
| `/pause` | 曲を一時停止 |
| `/resume` | 曲を再開 |
| `/queue` | 曲のキューを表示 |
| `/nowplaying` | 現在再生中の曲の情報を表示 |
| `/volume <0-100>` | 音量を設定 |
| `/shuffle` | キューをシャッフル |
| `/loop <mode>` | ループ: off / track / queue |
| `/join` | ボイスチャンネルに参加して滞在 |
| `/leave` | ボイスチャンネルから退出 |

## 🎮 プレイヤーパネルプレビュー

```
🎧 Music Player
─────────────────────────────────
Song Title

Author: Artist Name
Requested by: Username

▬▬▬▬▬🔘▬▬▬▬▬▬
`1:45` / `4:31`

🎶 Queue: 3 tracks remaining • Volume: 80% • ▶️ Playing
─────────────────────────────────
[⏮️] [⏸️] [⏭️] [⏹️] [🔀]
[🔉] [🔊] [🔁] [❤️] [📋]
[📀 View Queue Tracks (3)      ▼]
[⚡ More Features...           ▼]
```

## 🚀 Railwayへのデプロイ

### ステップ1: Lavalinkサーバーをデプロイ

1. [Railway Lavalink Template](https://railway.com/template/lavalink)を開く
2. **Deploy Now**をクリック
3. 環境変数を設定:
   - `PASSWORD`: 認証用パスワード（例: `mysecretpassword`）
4. デプロイ完了を待つ
5. Lavalinkサービスの**内部ホスト名**を控える（形式: `lavalink.railway.internal`）

### ステップ2: Discordボットをデプロイ

1. このリポジトリをフォークまたはGitHubにプッシュ
2. Railwayで**New Project** → **Deploy from GitHub repo**を作成
3. このリポジトリを選択
4. 環境変数を設定:

```
DISCORD_TOKEN=your_discord_bot_token
LAVALINK_HOST=lavalink.railway.internal:2333
LAVALINK_PASSWORD=mysecretpassword
LAVALINK_SECURE=false
```

> **注**: `lavalink.railway.internal`をLavalinkサービスの内部ホスト名に置き換えてください。

5. デプロイ！

### ステップ3: YouTubeプラグインを設定（重要！）

「この動画はログインが必要です」や「サインインしてください」エラーを修正するために、**Lavalink**サービスにこれらの環境変数を追加:

**YouTube再生に必須:**
```
PLUGINS_YOUTUBE_ENABLED=true
PLUGINS_YOUTUBE_REMOTECIPHER_ENABLED=true
PLUGINS_YOUTUBE_REMOTECIPHER_URL=https://cipher.kikkia.dev/
PLUGINS_YOUTUBE_CLIENTS_0=WEB
PLUGINS_YOUTUBE_CLIENTS_1=MWEB
PLUGINS_YOUTUBE_CLIENTS_2=TVHTML5EMBEDDED
```

**推奨されるオプション - OAuth設定:**
```
PLUGINS_YOUTUBE_OAUTH_ENABLED=true
```

リフレッシュトークンなしでOAuthを初めて有効にする場合:
1. Lavalinkログでデバイスコードを確認（例: `XXX-XXX-XXX`）
2. https://www.google.com/device にアクセス
3. コードを入力し**使い捨てGoogleアカウント**でログイン（メインアカウントは使用不可！）
4. ログからリフレッシュトークンをコピー
5. これを追加: `PLUGINS_YOUTUBE_OAUTH_REFRESHTOKEN=1//...`

> ⚠️ **警告:** OAuthにメインのGoogleアカウントを絶対に使用しないでください。新しい/使い捨てアカウントを作成してください！

### ステップ4: Discordボットを設定

1. [Discord Developer Portal](https://discord.com/developers/applications)を開く
2. 新しいアプリケーションを作成または既存のものを使用
3. **Bot**セクションでトークンをコピーし`DISCORD_TOKEN`に貼り付け
4. インテントを有効化:
   - ✅ SERVER MEMBERS INTENT
   - ✅ MESSAGE CONTENT INTENT
5. **OAuth2 → URL Generator**で:
   - スコープ: `bot`, `applications.commands`
   - 権限: `Connect`, `Speak`, `Send Messages`, `Embed Links`, `Manage Messages`
6. URLをコピーしボットをサーバーに招待

## 🖥️ ローカル開発

### 前提条件
- Node.js 18+
- Java 17+ （Lavalink用）
- Lavalinkサーバー稼働中

### セットアップ

1. リポジトリをクローン
```bash
git clone <your-repo-url>
cd Discord-Music
```

2. 依存関係をインストール
```bash
npm install
```

3. `.env.example`を`.env`にコピーし値を入力
```bash
cp .env.example .env
```

4. Lavalinkサーバーを実行（別ターミナルで）
```bash
java -jar Lavalink.jar
```

5. ボットを実行
```bash
npm start
```

## 📁 プロジェクト構造

```
Discord-Music/
├── index.js          # プレイヤーパネル搭載のメインボットファイル
├── package.json      # 依存関係
├── .env              # 環境変数（コミットしないでください！）
├── .env.example      # 環境変数テンプレート
├── .gitignore        # Git無視ルール
├── README.md         # 英語ドキュメント
├── README_ID.md      # インドネシア語ドキュメント
└── README_jp.md      # 日本語ドキュメント
```

## ⚙️ Lavalink設定（オプション）

独自のLavalinkサーバーを実行する場合、`application.yml`ファイルを作成:

```yaml
server:
  port: 2333
  address: 0.0.0.0

lavalink:
  plugins:
    - dependency: "dev.lavalink.youtube:youtube-plugin:1.5.0"
      snapshot: false
  server:
    password: "youshallnotpass"
    sources:
      youtube: true
      bandcamp: true
      soundcloud: true
      twitch: true
      vimeo: true
      http: true
      local: false

logging:
  level:
    root: INFO
    lavalink: INFO
```

## 🔧 トラブルシューティング

### ボットがLavalinkに接続できない
- Lavalinkサーバーが実行中であることを確認
- `LAVALINK_HOST`と`LAVALINK_PASSWORD`が正しいことを確認
- Railwayでは公開URLではなく**内部URL**を使用

### 曲が再生されない / 「サインインしてください」エラー
- これはYouTubeによる自動化アクセスブロックの一般的な問題
- **解決策1:** リモート暗号を有効化: `PLUGINS_YOUTUBE_REMOTECIPHER_URL=https://cipher.kikkia.dev/`
- **解決策2:** 使い捨てGoogleアカウントでOAuthを設定（上記ステップ3参照）
- **解決策3:** 異なるクライアントを試す: `WEB`, `MWEB`, `TVHTML5EMBEDDED`
- 詳細なエラーについてはLavalinkログを確認

### コマンドが表示されない
- 数分待ってください、Discordはスラッシュコマンドをキャッシュします
- ボットが`applications.commands`権限を持っていることを確認

### メッセージが自動削除されない
- ボットが`Manage Messages`権限を持っていることを確認

### プレイヤーパネルが更新されない
- プレイヤーは再生中10秒ごとに更新
- 音楽が一時停止されると更新も一時停止

## 🆕 新着情報

### v2.1 - YouTube OAuthとリモート暗号（2025年12月）
- 🔐 YouTube認証のOAuthサポート（「サインインしてください」エラーを回避）
- 🔧 リモート暗号サーバー統合（署名抽出問題を修正）
- 📝 詳細なセットアップ手順でドキュメントを更新
- 🎵 より信頼性の高いYouTube再生

### v2.0 - インタラクティブプレイヤーパネル
- ✨ ボタン付きBoogieスタイルインタラクティブプレイヤー
- 📊 リアルタイムプログレスバー（10秒ごとに更新）
- 🔘 すべての再生機能用コントロールボタン
- 📀 キューと追加機能用ドロップダウンメニュー
- 🧹 5秒後のメッセージ自動削除
- 🔄 インプレースプレイヤー編集（「メッセージ削除」通知なし）
- 📋 ライブキューカウント更新

## 📄 ライセンス

ISC

## 🤝 貢献

プルリクエスト歓迎！大きな変更については、まずissueを開いてください。

---

Discord音楽愛好家のために❤️で作られました
