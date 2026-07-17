const SHEET_NAME = "KidsGo заявки";
const HEADERS = [
  "Дата",
  "Статус",
  "Имя родителя",
  "Телефон",
  "Город",
  "Имя ребенка",
  "Адрес дома",
  "Дом lat",
  "Дом lng",
  "Адрес школы/сада/секции",
  "Школа lat",
  "Школа lng",
  "Направление",
  "Начало занятий",
  "Окончание занятий",
  "Кол-во детей",
  "Комментарий",
  "ID заявки",
];

function doPost(event) {
  const sheet = getLeadsSheet();
  const data = JSON.parse(event.postData.contents || "{}");

  sheet.appendRow([
    data.createdAt || new Date().toISOString(),
    data.status || "Новая",
    data.parentName || "",
    data.phone || "",
    data.district || "",
    data.childName || "",
    data.homeAddress || "",
    data.homeLat || "",
    data.homeLng || "",
    data.schoolAddress || "",
    data.schoolLat || "",
    data.schoolLng || "",
    data.direction || "",
    data.startTime || "",
    data.endTime || "",
    data.childrenCount || "",
    data.comment || "",
    data.id || "",
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getLeadsSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }

  return sheet;
}
