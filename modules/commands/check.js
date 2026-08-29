const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
  name: "check",
  version: "2.0.0",
  hasPermssion: 0,
  credits: "Nhanz",
  description: "Tìm trận Free Fire & tính BXH nhanh",
  commandCategory: "Game",
  usages: "/check | /check [UID] | /check 1.2.3.4",
  cooldowns: 5
};

const DEFAULT_UID = "7092432162";

module.exports.run = async function({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const joined = args.join(" ").trim();

  // Nếu có pattern chọn trận kiểu 1.2.3.4 / 1,2,3,4 / 1 2 3 4 → tính BXH luôn
  const selection = parseSelection(joined);
  if (selection && selection.length) {
    return handleSelection(api, threadID, messageID, senderID, joined, selection);
  }

  // Ngược lại: tìm trận (mặc định UID 7092432162, hôm nay)
  let uid = DEFAULT_UID;
  let dateText;
  if (args.length && /^\d{6,}$/.test(args[0])) {
    uid = args[0];
    if (args[1] && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(args[1])) dateText = args[1];
  } else if (args.length && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(args[0])) {
    dateText = args[0];
  }

  const wantAll = !args.length || /^(all|\*|0)$/i.test(args.join(" ").trim());

  api.sendMessage("Đang tìm trận Free Fire...", threadID, messageID);
  try {
    const result = await global.ffbot.findMatches(uid, dateText, senderID);
    if (!result.matches.length) {
      return api.sendMessage(`Không tìm thấy trận nào ngày ${result.date} cho UID ${uid}.`, threadID, messageID);
    }

    // /check (không args) hoặc /check all → tự tính toàn bộ trận trong ngày
    if (wantAll) {
      const allNumbers = result.matches.map(match => Number(match.number));
      return handleSelection(api, threadID, messageID, senderID, allNumbers.join("."), allNumbers);
    }

    const lines = [
      `WARRIORS CUSTOM — ${result.date}`,
      `UID: ${uid}`,
      `Tổng số trận: ${result.matches.length}`,
      "",
      ...result.matches.map(match => `${match.number}. ${match.timeText} | ID ${match.id}`),
      "",
      "Nhập: /check 1.3.5 để tính nhanh các trận đó",
      "Hoặc: /check all để tính toàn bộ"
    ];
    return api.sendMessage(lines.join("\n"), threadID, messageID);
  } catch (error) {
    return api.sendMessage(`Lỗi: ${error.message}`, threadID, messageID);
  }
};

function parseSelection(text) {
  if (!text) return null;
  const numbers = (text.match(/\d+/g) || []).map(Number);
  if (!numbers.length) return null;
  // Nếu có số >= 6 chữ số → đây là UID chứ không phải chọn trận
  if (numbers.some(number => number >= 100000)) return null;
  return [...new Set(numbers)].sort((first, second) => first - second);
}

async function handleSelection(api, threadID, messageID, senderID, rawText, selected) {
  const session = global.ffbot.getSession(senderID);
  if (!session) {
    return api.sendMessage("Bạn chưa có dữ liệu trận. Gõ /check để tìm trận của UID 7092432162 trước.", threadID, messageID);
  }

  const available = new Map(session.matches.map(match => [Number(match.number), match.id]));
  const invalid = selected.filter(number => !available.has(number));
  if (invalid.length) {
    const allNumbers = [...available.keys()].sort((first, second) => first - second).join(", ") || "không có";
    return api.sendMessage(`Trận không tồn tại: ${invalid.join(", ")}.\nCác trận có sẵn: ${allNumbers}.\nGõ /check để tìm lại trận.`, threadID, messageID);
  }

  api.sendMessage(`Đang tính bảng xếp hạng ${selected.length} trận, vui lòng đợi...`, threadID, messageID);
  let outputFile;
  try {
    const selectedIds = selected.map(number => available.get(number));
    const result = await global.ffbot.calculateLeaderboard(selectedIds);
    if (!result.leaderboard.length) throw new Error("Không có dữ liệu xếp hạng từ các trận đã chọn.");

    outputFile = path.join(__dirname, "cache", `warriors-bxh-${senderID}-${Date.now()}.jpg`);
    await global.ffbot.generatePoster(
      result.leaderboard,
      selected.map(number => `GAME ${number}`),
      session.date,
      outputFile
    );

    const shortNote = failedNote(result.failedMatches);
    return api.sendMessage({
      body: [
        `WARRIORS CUSTOM — BXH ${session.date} (${selected.join(".")})`,
        shortNote
      ].filter(Boolean).join("\n"),
      attachment: fs.createReadStream(outputFile)
    }, threadID, async () => {
      await fs.remove(outputFile).catch(() => {});
    }, messageID);
  } catch (error) {
    if (outputFile) await fs.remove(outputFile).catch(() => {});
    return api.sendMessage(`Lỗi: ${error.message}`, threadID, messageID);
  }
}

function failedNote(failedMatches) {
  return failedMatches && failedMatches.length ? `Bỏ qua trận lỗi: ${failedMatches.join(", ")}` : "";
}
