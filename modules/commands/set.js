module.exports.config = {
  name: "set",
  version: "1.0.0",
  hasPermssion: 3,
  credits: "Nhanz",
  description: "Cập nhật cookie Free Fire cho bot",
  commandCategory: "Admin",
  usages: "/set cookie1=value1; cookie2=value2",
  cooldowns: 3
};

module.exports.run = async function({ api, event, args }) {
  const { threadID, messageID, senderID } = event;

  if (!global.config.ADMINBOT || !global.config.ADMINBOT.includes(String(senderID))) {
    return api.sendMessage("Lệnh này chỉ dành cho admin bot.", threadID, messageID);
  }

  const input = args.join(" ").trim().replace(/^\/?set\s+/i, "");
  if (!input) {
    return api.sendMessage("Dùng đúng định dạng:\n/set key1=value1; key2=value2", threadID, messageID);
  }

  const cookies = {};
  for (const part of input.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key && value) cookies[key] = value;
  }

  const count = Object.keys(cookies).length;
  if (!count) {
    return api.sendMessage("Cookie không hợp lệ. Mỗi mục cần có dạng key=value.", threadID, messageID);
  }

  try {
    const file = `${__dirname}/../../ffcookies.json`;
    await require("fs-extra").outputJson(file, cookies, { spaces: 2, mode: 0o600 });
    await require("fs-extra").chmod(file, 0o600);
    return api.sendMessage(`Đã lưu ${count} cookie Free Fire vào bot.\nHãy thử lại bằng /check [UID].`, threadID, messageID);
  } catch (error) {
    return api.sendMessage("Không thể lưu cookie. Vui lòng thử lại.", threadID, messageID);
  }
};
