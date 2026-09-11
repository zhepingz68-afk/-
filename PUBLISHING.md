# 公開手順

## GitHub Pages

1. GitHubで新しい **public** リポジトリを作る。
2. このフォルダの中身をリポジトリのルートにアップロードする。
3. `config.js` に Supabase の `url` と `anonKey` を入れる。
4. GitHub の Settings → Pages で GitHub Actions を公開元にする。
5. `main` ブランチへ push すると `pages.yml` が実行され、GitHub Pages に公開される。

GitHub Pages はリポジトリの静的ファイルをサイトとして公開できます。

## Supabase

1. Supabaseでプロジェクトを作る。
2. SQL Editorで `stats.sql` を実行する。
3. Project URL と anon key を `config.js` に入れる。
4. 公開サイトを開いて、右側の「プレイ統計」を確認する。

注意：`service_role` キーは `config.js` に入れないでください。ブラウザに公開されるコードには匿名公開キーだけを使います。
