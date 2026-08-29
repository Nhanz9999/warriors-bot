const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
  name: "check",
  version: "3.0.0",
  hasPermssion: 0,
  credits: "Nhanz",
  description: "Tìm trận Free Fire & tính BXH nhanh",
  commandCategory: "Game",
  usages: "/check | /check 1.2.3.4 | /check 1.2.3.4 28/08/2026 | /check [UID] 28/08/2026",
  cooldowns: 5
};

const DEFAULT_UID = "7092432162";

module.exports.run = async function({ api, event, args }) {
  const { threadID, messageID, senderID } = event;

  // Tách ngày (dd/mm/yyyy) khỏi args
  let dateText;
  const nonDateArgs = args.filter(arg => {
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(arg.trim())) {
      dateText = arg.trim();
      return false;
    }
    return true;
  });

  // Tách UID (số >= 6 chữ số) khỏi args
  let uid = DEFAULT_UID;
  const selectArgs = nonDateArgs.filter(arg => {
    if (/^\d{6,}$/.test(arg.trim())) {
      uid = arg.trim();
      return false;
    }
    return true;
  });

  const joined = selectArgs.join(" ").trim().toLowerCase();
  const selection = parseSelection(joined);
  const wantAll = !selectArgs.length || /^(all|\*|0)$/i.test(joined);

  // Trường hợp 1: chọn trận cụ thể (1.2.3.4), có thể kèm ngày → tính BXH
  if (selection && selection.length) {
    api.sendMessage(`⏳ Đang tìm trận và tính BXH (${selection.join(".")}), vui lòng đợi...`, threadID, messageID);
    try {
      // Luôn tìm trận theo ngày (nếu có) hoặc hôm nay để cập nhật session đúng ngày
      const result = await global.ffbot.findMatches(uid, dateText || undefined, senderID);
      if (!result.matches.length) {
        return api.sendMessage(`Không tìm thấy trận nào ngày ${result.date} cho UID ${uid}.`, threadID, messageID);
      }
      return await handleSelection(api, threadID, messageID, senderID, selection, false);
    } catch (error) {
      return api.sendMessage(`Lỗi: ${error.message}`, threadID, messageID);
    }
  }

  // Trường hợp 2: /check hoặc /check all → tìm + tính toàn bộ trận
  if (wantAll) {
    api.sendMessage("⏳ Đang tìm trận và tính BXH toàn bộ trận trong ngày, vui lòng đợi...", threadID, messageID);
    try {
      const result = await global.ffbot.findMatches(uid, dateText || undefined, senderID);
      if (!result.matches.length) {
        return api.sendMessage(`Không tìm thấy trận nào ngày ${result.date} cho UID ${uid}.`, threadID, messageID);
      }
      const allNumbers = result.matches.map(match => Number(match.number));
      return handleSelection(api, threadID, messageID, senderID, allNumbers, false);
    } catch (error) {
      return api.sendMessage(`Lỗi: ${error.message}`, threadID, messageID);
    }
  }

  // Trường hợp 3: /check [UID] + (ngày) → hiển thị danh sách trận
  api.sendMessage("Đang tìm trận Free Fire...", threadID, messageID);
  try {
    const result = await global.ffbot.findMatches(uid, dateText || undefined, senderID);
    if (!result.matches.length) {
      return api.sendMessage(`Không tìm thấy trận nào ngày ${result.date} cho UID ${uid}.`, threadID, messageID);
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
  if (!/\d/.test(text)) return null;
  const numbers = (text.match(/\d+/g) || []).map(Number);
  if (!numbers.length) return null;
  // Số >= 6 chữ số → là UID, không phải chọn trận
  if (numbers.some(number => number >= 100000)) return null;
  return [...new Set(numbers)].sort((first, second) => first - second);
}

async function handleSelection(api, threadID, messageID, senderID, selected, showWaiting) {
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

  if (showWaiting) {
    api.sendMessage(`⏳ Đang tính bảng xếp hạng ${selected.length} trận, vui lòng đợi...`, threadID, messageID);
  }

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
