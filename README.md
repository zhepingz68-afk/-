# ENERGY BATTLE Web版

このフォルダは、ENERGY BATTLE をブラウザで公開するためのWeb版です。

## 1. ローカルで確認

このWeb版は静的ファイルなので、VS Code Live Serverなどで `index.html` を開けます。

## 2. GitHub Pagesで公開

GitHubに新しい公開リポジトリを作って、このフォルダの中身をアップロードします。
GitHub Pagesを有効にすると公開URLが発行されます。

GitHub Pagesはリポジトリ内の静的HTML/CSS/JavaScriptを公開できます。

## 3. オンライン統計

`stats.sql` を Supabase の SQL Editor で実行します。
その後、`config.js` に以下の2つを設定します。

- Supabase URL
- Supabase anon key

`service_role` キーは絶対にブラウザへ入れないでください。

このゲームはログインを要求せず、ブラウザごとにランダムな匿名IDを `localStorage` に保存します。
そのため「プレイ人数」は厳密な実人数ではなく、匿名ブラウザID単位の推定値です。

## 4. 統計の意味

- プレイ人数：その難易度で「ゲーム開始」を送信した匿名ブラウザIDのユニーク数
- 勝利：その難易度でゲームを勝利した回数
- 敗北：その難易度でゲームを敗北した回数

統計はクライアントから送信されるため、完全な不正防止ではありません。

## 5. クレジット

ゲーム内ホーム画面に「このゲームはChatGPTのサポートで制作しました。」と表示しています。
