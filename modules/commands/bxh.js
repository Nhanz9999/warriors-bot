const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
  name: "bxh",
  version: "2.0.0",
  hasPermssion: 0,
  credits: "Nhanz",
  description: "Tính bảng xếp hạng từ các trận đã check",
  commandCategory: "Game",
  usages: "/bxh 1.3.5",
  cooldowns: 8
};

module.exports.run = async function({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const selected = [...new Set((args.join(" ").match(/\d+/g) || []).map(Number))];
  if (!selected.length) {
    return api.sendMessage("Dùng đúng định dạng:\n/bxh 1.3.5\nhoặc /bxh 1,3,5", threadID, messageID);
  }

  const session = global.ffbot.getSession(senderID);
  if (!session) {
    return api.sendMessage("Bạn chưa check trận nào. Hãy dùng /check [UID] trước.", threadID, messageID);
  }

  const available = new Map(session.matches.map(match => [Number(match.number), match.id]));
  const invalid = selected.filter(number => !available.has(number));
  if (invalid.length) {
    const allNumbers = [...available.keys()].sort((first, second) => first - second).join(", ") || "không có";
    return api.sendMessage(`Trận không tồn tại: ${invalid.join(", ")}.\nCác trận có sẵn: ${allNumbers}.`, threadID, messageID);
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
        `WARRIORS CUSTOM — BXH ${session.date}`,
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
};

function failedNote(failedMatches) {
  return failedMatches && failedMatches.length ? `Bỏ qua trận lỗi: ${failedMatches.join(", ")}` : "";
}
