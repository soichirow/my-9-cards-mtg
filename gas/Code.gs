/**
 * 私を作ったマジック9枚 — シェアログ記録用 Google Apps Script
 *
 * 【使い方】
 * 1. Google スプレッドシートを新規作成
 * 2. 拡張機能 → Apps Script を開く
 * 3. このコードを Code.gs に貼り付け
 * 4. デプロイ → 新しいデプロイ → ウェブアプリ
 *    - 実行するユーザー: 自分
 *    - アクセスできるユーザー: 全員
 * 5. デプロイ URL を app.js の GAS_ENDPOINT にセット
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // ヘッダーがなければ作成
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["日時", "言語", "プラットフォーム", "カード名"]);
    }

    var timestamp = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
    var lang = data.lang || "unknown";
    var platform = data.platform || "unknown";
    var cards = (data.cards || []).join(", ");

    sheet.appendRow([timestamp, lang, platform, cards]);

    return ContentService.createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput("Share logger is running.")
    .setMimeType(ContentService.MimeType.TEXT);
}
