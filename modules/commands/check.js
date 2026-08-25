module.exports.config = {
  name: "check",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Nhanz",
  description: "Tìm các trận Free Fire trong ngày",
  commandCategory: "Game",
  usages: "/check [UID] [DD/MM/YYYY]",
  cooldowns: 5
};

module.exports.run = async function({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const uid = args[0];
  const dateText = args[1];

  if (!uid || !/^\d+$/.test(uid)) {
    return api.sendMessage("Dùng đúng định dạng:\n/check [UID]\n/check [UID] [DD/MM/YYYY]", threadID, messageID);
  }

  api.sendMessage("Đang tìm trận Free Fire...", threadID, messageID);
  try {
    const result = await global.ffbot.findMatches(uid, dateText, senderID);
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
      "Nhập: /bxh 1.3.5"
    ];
    return api.sendMessage(lines.join("\n"), threadID, messageID);
  } catch (error) {
    return api.sendMessage(`Lỗi: ${error.message}`, threadID, messageID);
  }
};
