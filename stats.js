(() => {
  "use strict";

  window.refreshStats = async function refreshStats() {
    const body = document.getElementById("statsBody");
    const status = document.getElementById("statsStatus");
    const cfg = window.ENERGY_BATTLE_SUPABASE || {};

    if (!cfg.url || !cfg.anonKey) {
      status.textContent = "Supabase設定前：ゲームは遊べますが、オンライン統計はまだ有効ではありません。";
      return;
    }

    try {
      const response = await fetch(`${cfg.url}/rest/v1/rpc/get_game_stats`, {
        method: "POST",
        headers: {
          "apikey": cfg.anonKey,
          "Content-Type": "application/json",
        },
        body: "{}",
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`HTTP ${response.status}: ${detail}`);
      }

      const data = await response.json();
      const names = {
        easy: "かんたん",
        normal: "ふつう",
        hard: "むずかしい",
        oni: "鬼",
      };

      body.innerHTML = "";
      for (const row of data || []) {
        const tr = document.createElement("tr");
        const td0 = document.createElement("td");
        const td1 = document.createElement("td");
        const td2 = document.createElement("td");
        const td3 = document.createElement("td");
        td0.textContent = names[row.difficulty] || row.difficulty;
        td1.textContent = Number(row.players || 0).toLocaleString("ja-JP");
        td2.textContent = Number(row.wins || 0).toLocaleString("ja-JP");
        td3.textContent = Number(row.losses || 0).toLocaleString("ja-JP");
        tr.append(td0, td1, td2, td3);
        body.appendChild(tr);
      }

      status.textContent = "オンライン統計を更新しました。";
    } catch (error) {
      console.warn("統計の取得に失敗しました", error);
      status.textContent = "統計の取得に失敗しました。設定を確認してください。";
    }
  };

  window.addEventListener("DOMContentLoaded", () => {
    window.refreshStats();
  });
})();
