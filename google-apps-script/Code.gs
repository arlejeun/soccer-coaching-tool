/**
 * U10 Sub Manager — Google Sheets backend
 *
 * Setup:
 * 1. Create a new Google Spreadsheet
 * 2. Extensions → Apps Script → paste this file → Save
 * 3. Run setupSheet() once (authorize when prompted)
 * 4. Edit setApiSecret() with a long random string, run it once, then redeploy
 * 5. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Copy the Web app URL + use the same secret in the coaching app
 */

const ROSTER_SHEET = "Roster";
const COACHING_SHEET = "Coaching";
const SETTINGS_SHEET = "Settings";
const GAMES_SHEET = "Games";
const API_SECRET_KEY = "API_SECRET";
const MAX_CELL_CHARS = 49000;

/**
 * Run once: replace the string below with a long random secret (16+ chars),
 * then Run → setApiSecret. Use the same value in the coaching app.
 * Remove or obfuscate the literal before sharing this script file.
 */
function setApiSecret() {
  setApiSecretValue("REPLACE_WITH_A_LONG_RANDOM_SECRET");
}

function setApiSecretValue(secret) {
  if (!secret || String(secret).length < 16) {
    throw new Error("Secret must be at least 16 characters");
  }
  PropertiesService.getScriptProperties().setProperty(API_SECRET_KEY, String(secret));
  Logger.log("API secret saved. Redeploy the web app if already deployed.");
}

function authorizeRequest(e, body) {
  var expected = PropertiesService.getScriptProperties().getProperty(API_SECRET_KEY);
  if (!expected) {
    throw new Error("API secret not configured — run setApiSecret() first");
  }
  var provided = (body && body.secret) || (e && e.parameter && e.parameter.secret);
  return provided && provided === expected;
}

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let roster = ss.getSheetByName(ROSTER_SHEET);
  if (!roster) roster = ss.insertSheet(ROSTER_SHEET);
  roster.clear();
  roster.getRange(1, 1, 1, 6).setValues([
    ["id", "number", "name", "birthYear", "primaryPosition", "secondaryPosition"],
  ]);
  const rosterData = [
    ["p1", 24, "Noah Bergsten", 2016, "MID", ""],
    ["p2", 1, "Sullivan Dew", 2017, "GK", "DEF"],
    ["p3", 10, "Austin Dowd", 2017, "ST", ""],
    ["p4", 6, "Waylon Fogleman", 2017, "DEF", "GK"],
    ["p5", 5, "Aiden Forster", 2016, "DEF", ""],
    ["p6", 14, "Bryce Henthorn", 2018, "MID", ""],
    ["p7", 8, "Téo Lejeune", 2018, "MID", ""],
    ["p8", 15, "Silas Miller", 2017, "ST", "GK"],
    ["p9", 34, "Carson Newton", 2017, "DEF", ""],
    ["p10", 18, "Whitley Stark", 2017, "MID", ""],
    ["p11", 7, "James Taylor", 2017, "ST", ""],
  ];
  roster.getRange(2, 1, rosterData.length, 6).setValues(rosterData);

  let coaching = ss.getSheetByName(COACHING_SHEET);
  if (!coaching) coaching = ss.insertSheet(COACHING_SHEET);
  coaching.clear();
  coaching.getRange(1, 1, 1, 5).setValues([
    ["playerId", "practice", "performance", "behavior", "notes"],
  ]);

  let settings = ss.getSheetByName(SETTINGS_SHEET);
  if (!settings) settings = ss.insertSheet(SETTINGS_SHEET);
  settings.clear();
  settings.getRange(1, 1, 2, 2).setValues([
    ["key", "value"],
    ["meritInfluence", 50],
  ]);

  ensureGamesSheet_();

  SpreadsheetApp.flush();
}

function doGet(e) {
  try {
    if (!authorizeRequest(e, null)) {
      return jsonResponse({ ok: false, error: "Unauthorized" });
    }
    return jsonResponse(loadAll());
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!authorizeRequest(e, body)) {
      return jsonResponse({ ok: false, error: "Unauthorized" });
    }
    if (body.action === "saveRoster") {
      writeRoster(body.players || []);
    } else if (body.action === "saveCoaching") {
      writeCoaching(body.profiles || {});
      if (body.meritInfluence !== undefined) {
        writeSetting("meritInfluence", body.meritInfluence);
      }
    } else if (body.action === "saveGameDay") {
      writeGameDayState(body.gameDayState || null);
    } else if (body.action === "saveAll") {
      writeRoster(body.players || []);
      writeCoaching(body.profiles || {});
      if (body.meritInfluence !== undefined) {
        writeSetting("meritInfluence", body.meritInfluence);
      }
      if (body.gameDayState !== undefined) {
        writeGameDayState(body.gameDayState || null);
      }
    } else {
      return jsonResponse({ ok: false, error: "Unknown action" });
    }
    return jsonResponse({ ok: true, data: loadAll() });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function loadAll() {
  return {
    players: readRoster(),
    coachingProfiles: readCoaching(),
    meritInfluence: readSettingNumber("meritInfluence", 50),
    gameDayState: readGameDayState(),
  };
}

function readGameDayState() {
  var fromGames = readGameDayStateFromGamesSheet_();
  if (fromGames) return fromGames;

  // Legacy: everything in one Settings cell (breaks once multiple plans exceed ~50k chars).
  var raw = readSettingRaw("gameDayState", "");
  if (!raw) return null;
  try {
    return JSON.parse(String(raw));
  } catch (err) {
    return null;
  }
}

function writeGameDayState(state) {
  if (!state) {
    clearGamesSheet_();
    writeSetting("activeGameId", "");
    writeSetting("subRules", "");
    writeSetting("gameDayState", "");
    return;
  }

  writeGamesToSheet_(state);
  writeSetting("activeGameId", state.activeGameId || "");
  writeSetting("subRules", JSON.stringify(state.subRules || []));
  // Clear legacy blob so we don't keep a huge cell around.
  writeSetting("gameDayState", "");
}

function ensureGamesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GAMES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(GAMES_SHEET);
  }
  var header = sheet.getRange(1, 1, 1, 8).getValues()[0];
  if (String(header[0]) !== "id") {
    sheet.clear();
    sheet.getRange(1, 1, 1, 8).setValues([
      [
        "id",
        "name",
        "opponent",
        "when",
        "updatedAt",
        "gameSettings",
        "availability",
        "plan",
      ],
    ]);
  }
  return sheet;
}

function clearGamesSheet_() {
  var sheet = ensureGamesSheet_();
  var last = sheet.getLastRow();
  if (last > 1) {
    sheet.getRange(2, 1, last - 1, 8).clearContent();
  }
}

function assertCellSize_(label, text) {
  var s = text == null ? "" : String(text);
  if (s.length > MAX_CELL_CHARS) {
    throw new Error(
      label +
        " is too large for Google Sheets (" +
        s.length +
        " chars; max ~" +
        MAX_CELL_CHARS +
        "). Remove a game or simplify the plan."
    );
  }
  return s;
}

function writeGamesToSheet_(state) {
  var sheet = ensureGamesSheet_();
  var games = state.games || [];
  clearGamesSheet_();
  if (games.length === 0) return;

  var rows = games.map(function (g) {
    var settingsJson = assertCellSize_(
      "Settings for " + (g.name || g.id),
      JSON.stringify(g.gameSettings || {})
    );
    var availabilityJson = assertCellSize_(
      "Availability for " + (g.name || g.id),
      JSON.stringify(g.gameDayAvailability || {})
    );
    var planJson = assertCellSize_(
      "Plan for " + (g.name || g.id),
      g.plan ? JSON.stringify(g.plan) : ""
    );
    return [
      g.id || "",
      g.name || "",
      g.opponent || "",
      g.when || "",
      g.updatedAt || "",
      settingsJson,
      availabilityJson,
      planJson,
    ];
  });
  sheet.getRange(2, 1, rows.length, 8).setValues(rows);
}

function parseJsonCell_(value, fallback) {
  if (value === "" || value === null || value === undefined) return fallback;
  // Already parsed (rare) — keep as-is.
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch (err) {
    return fallback;
  }
}

function readGameDayStateFromGamesSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GAMES_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return null;

  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return null;
  var headers = rows[0].map(String);
  var games = [];

  rows.slice(1).forEach(function (row) {
    if (!row[0]) return;
    var obj = {};
    headers.forEach(function (h, i) {
      obj[h] = row[i];
    });
    games.push({
      id: String(obj.id),
      name: String(obj.name || obj.id),
      opponent: obj.opponent ? String(obj.opponent) : undefined,
      when: obj.when ? String(obj.when) : undefined,
      updatedAt: obj.updatedAt ? String(obj.updatedAt) : new Date(0).toISOString(),
      gameSettings: parseJsonCell_(obj.gameSettings, {}),
      gameDayAvailability: parseJsonCell_(obj.availability, {}),
      plan: parseJsonCell_(obj.plan, null),
    });
  });

  if (games.length === 0) return null;

  var activeGameId = String(readSettingRaw("activeGameId", "") || "");
  if (!activeGameId || !games.some(function (g) { return g.id === activeGameId; })) {
    activeGameId = games[0].id;
  }

  var subRules = parseJsonCell_(readSettingRaw("subRules", ""), []);
  var updatedAt = games.reduce(function (max, g) {
    return g.updatedAt > max ? g.updatedAt : max;
  }, games[0].updatedAt);

  return {
    updatedAt: updatedAt,
    activeGameId: activeGameId,
    games: games,
    subRules: subRules,
  };
}

function readRoster() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ROSTER_SHEET);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(String);
  return rows.slice(1).filter(function (row) {
    return row[0];
  }).map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) {
      obj[h] = row[i];
    });
    return {
      id: String(obj.id),
      number: Number(obj.number),
      name: String(obj.name),
      birthYear: Number(obj.birthYear),
      primaryPosition: String(obj.primaryPosition || "MID"),
      secondaryPosition: obj.secondaryPosition ? String(obj.secondaryPosition) : undefined,
    };
  });
}

function writeRoster(players) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ROSTER_SHEET);
  if (!sheet) throw new Error("Roster sheet missing — run setupSheet()");
  sheet.clear();
  sheet.getRange(1, 1, 1, 6).setValues([
    ["id", "number", "name", "birthYear", "primaryPosition", "secondaryPosition"],
  ]);
  if (players.length === 0) return;
  const rows = players.map(function (p) {
    return [
      p.id,
      p.number,
      p.name,
      p.birthYear,
      p.primaryPosition,
      p.secondaryPosition || "",
    ];
  });
  sheet.getRange(2, 1, rows.length, 6).setValues(rows);
}

function readCoaching() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COACHING_SHEET);
  if (!sheet) return {};
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return {};
  const headers = rows[0].map(String);
  const profiles = {};
  rows.slice(1).forEach(function (row) {
    if (!row[0]) return;
    const obj = {};
    headers.forEach(function (h, i) {
      obj[h] = row[i];
    });
    const practice = Number(obj.practice) || 3;
    const legacyEffort = obj.effort !== undefined && obj.effort !== "";
    const hasPerformance = obj.performance !== undefined && obj.performance !== "";
    var performance = hasPerformance ? Number(obj.performance) || 3 : 3;
    var practiceOut = practice;
    // Legacy: practice + effort → average into practice; performance defaults to 3
    if (legacyEffort && !hasPerformance) {
      practiceOut = Math.round((practice + (Number(obj.effort) || 3)) / 2) || 3;
      performance = 3;
    }
    profiles[String(obj.playerId || row[0])] = {
      practice: practiceOut,
      performance: performance,
      behavior: Number(obj.behavior) || 3,
      notes: obj.notes ? String(obj.notes) : undefined,
    };
  });
  return profiles;
}

function writeCoaching(profiles) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COACHING_SHEET);
  if (!sheet) throw new Error("Coaching sheet missing — run setupSheet()");
  sheet.clear();
  sheet.getRange(1, 1, 1, 5).setValues([
    ["playerId", "practice", "performance", "behavior", "notes"],
  ]);
  const ids = Object.keys(profiles);
  if (ids.length === 0) return;
  const rows = ids.map(function (id) {
    const p = profiles[id];
    return [
      id,
      p.practice != null ? p.practice : 3,
      p.performance != null ? p.performance : 3,
      p.behavior != null ? p.behavior : 3,
      p.notes || "",
    ];
  });
  sheet.getRange(2, 1, rows.length, 5).setValues(rows);
}

function readSettingRaw(key, defaultValue) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_SHEET);
  if (!sheet) return defaultValue;
  const rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === key) {
      var value = rows[i][1];
      if (value === "" || value === null || value === undefined) return defaultValue;
      return value;
    }
  }
  return defaultValue;
}

function readSettingNumber(key, defaultValue) {
  var value = readSettingRaw(key, defaultValue);
  var num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

function writeSetting(key, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_SHEET);
  if (!sheet) throw new Error("Settings sheet missing — run setupSheet()");
  const rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
