const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const moment = require('moment-timezone');
const { createCanvas, loadImage, registerFont } = require('canvas');

const FIND_API = 'https://congdong.ff.garena.vn/league-score-api/player/find-match';
const MATCH_API = 'https://congdong.ff.garena.vn/league-score-api/match';
const VN_OFFSET_SECONDS = 7 * 60 * 60;
const sessions = new Map();
const SESSION_TTL = 6 * 60 * 60 * 1000;
let fontsRegistered = false;

function loadEnvFile() {
  for (const name of ['.env.local', '.env']) {
    const file = path.resolve(__dirname, '..', name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
    break;
  }
}
loadEnvFile();

function normalizeCookies(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  const items = Array.isArray(value) ? value : Object.entries(value).map(([key, value]) => ({ key, value }));
  return items.filter(item => item && item.key && item.value != null).map(item => `${item.key}=${item.value}`).join('; ');
}

function readLocalCookies() {
  const candidates = ['ffcookies.json', 'ff-cookie.json'];
  for (const name of candidates) {
    const file = path.resolve(__dirname, '..', name);
    if (fs.existsSync(file)) return normalizeCookies(fs.readJsonSync(file));
  }
  return '';
}

async function readUpstashCookies() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return '';
  try {
    const { data } = await axios.post(`${url.replace(/\/$/, '')}/pipeline`, [
      ['GET', 'ff:cookies']
    ], {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000
    });
    const result = Array.isArray(data) ? data[0] && data[0].result : data && data.result;
    return normalizeCookies(result);
  } catch (error) {
    return '';
  }
}

async function getCookieHeader() {
  let header = readLocalCookies() || normalizeCookies(process.env.FF_COOKIES);
  if (!header) header = await readUpstashCookies();
  if (!header) {
    throw new Error('Chưa có cookie Free Fire. Đặt biến FF_COOKIES hoặc tạo file ffcookies.json.');
  }
  return header;
}

function apiHeaders(cookieHeader) {
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Origin: 'https://congdong.ff.garena.vn',
    Referer: 'https://congdong.ff.garena.vn/tinh-diem',
    Cookie: cookieHeader
  };
}

function parseDate(value) {
  const date = moment.tz(String(value || '').trim(), 'DD/MM/YYYY', true, 'Asia/Ho_Chi_Minh');
  if (!date.isValid()) throw new Error('Ngày không hợp lệ. Dùng DD/MM/YYYY, ví dụ 23/08/2026.');
  return date;
}

function formatVNTime(timestamp) {
  return moment(Number(timestamp) * 1000).tz('Asia/Ho_Chi_Minh').format('HH:mm:ss DD/MM/YYYY');
}

function getFreeFireEpoch(date, hours = 0, minutes = 0) {
  const [year, month, day] = date.format('YYYY-MM-DD').split('-').map(Number);
  return Date.UTC(year, month - 1, day, hours, minutes, 0) / 1000 - 25200;
}

async function findMatches(uid, dateText, sessionKey) {
  const date = dateText ? parseDate(dateText) : moment.tz('Asia/Ho_Chi_Minh').startOf('day');
  const startTime = getFreeFireEpoch(date);
  const endTime = getFreeFireEpoch(date, 23, 59);
  const cookieHeader = await getCookieHeader();
  const response = await axios.post(FIND_API, {
    accountId: String(uid).trim(),
    startTime,
    endTime
  }, {
    headers: apiHeaders(cookieHeader),
    timeout: 20000,
    validateStatus: () => true
  });

  if (response.status !== 200) {
    throw new Error(`Lỗi tìm trận HTTP ${response.status}. Cookie Free Fire có thể đã hết hạn.`);
  }

  const matches = (response.data.matches || []).map((match, index) => ({
    number: index + 1,
    id: String(match.id),
    startTime: match.startTime,
    timeText: match.startTime ? formatVNTime(match.startTime) : 'Không rõ'
  }));

  const session = {
    uid: String(uid),
    date: date.format('DD/MM/YYYY'),
    matches,
    savedAt: Date.now()
  };
  saveSession(sessionKey || uid, session);
  return session;
}

async function fetchMatchRanks(matchId) {
  const cookieHeader = await getCookieHeader();
  const response = await axios.post(MATCH_API, { matchId: String(matchId) }, {
    headers: apiHeaders(cookieHeader),
    timeout: 20000,
    validateStatus: () => true
  });
  if (response.status !== 200) return null;
  return response.data.match && response.data.match.ranks || [];
}

async function calculateLeaderboard(matchIds) {
  if (!matchIds.length) throw new Error('Vui lòng chọn ít nhất một trận.');
  const allTeams = new Map();
  const failedMatches = [];

  for (const matchId of matchIds) {
    let ranks;
    try {
      ranks = await fetchMatchRanks(matchId);
    } catch (error) {
      ranks = null;
    }
    if (!ranks) {
      failedMatches.push(String(matchId));
      continue;
    }

    ranks.forEach((teamResult, rankIndex) => {
      const members = (teamResult.accountNames || []).map(String);
      if (!members.length) return;
      const memberSet = new Set(members);
      let matchedTeamId;

      for (const [teamId, team] of allTeams.entries()) {
        const overlap = members.filter(member => team.players.has(member)).length;
        if (overlap >= 2) {
          matchedTeamId = teamId;
          break;
        }
      }

      if (!matchedTeamId) {
        matchedTeamId = `team_${allTeams.size}_${members[0]}_${Math.random().toString(36).slice(2)}`;
        allTeams.set(matchedTeamId, { points: 0, kills: 0, matches: 0, booyah: 0, players: new Map() });
      }

      const team = allTeams.get(matchedTeamId);
      team.points += Number(teamResult.score || 0);
      team.kills += Number(teamResult.kill || 0);
      team.matches += 1;
      if (rankIndex === 0) team.booyah += 1;

      members.forEach(member => {
        team.players.set(member, (team.players.get(member) || 0) + 1);
      });
    });
  }

  const leaderboard = [...allTeams.values()].map(team => {
    let bestPlayer = '';
    let bestCount = -1;
    for (const [member, count] of team.players.entries()) {
      if (count > bestCount) {
        bestPlayer = member;
        bestCount = count;
      }
    }
    return {
      team_name: bestPlayer,
      points: team.points,
      kills: team.kills,
      booyah: team.booyah,
      matches: team.matches,
      members: [...team.players.keys()].join(' / ')
    };
  }).sort((first, second) => second.points - first.points || second.kills - first.kills || second.matches - first.matches);

  return {
    leaderboard: leaderboard.slice(0, 12),
    totalMatches: matchIds.length,
    failedMatches
  };
}

function saveSession(key, session) {
  sessions.set(String(key), session);
  const timer = setTimeout(() => sessions.delete(String(key)), SESSION_TTL);
  if (timer.unref) timer.unref();
}

function getSession(key) {
  const session = sessions.get(String(key));
  if (!session || Date.now() - session.savedAt > SESSION_TTL) return null;
  return session;
}

function registerFonts() {
  if (fontsRegistered) return;
  const candidates = [
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf'
  ];
  candidates.forEach(file => {
    if (fs.existsSync(file)) registerFont(file, { family: 'WarriorsSans', weight: 'bold', style: path.basename(file).includes('Italic') ? 'italic' : 'normal' });
  });
  fontsRegistered = true;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function truncateText(ctx, text, maxWidth) {
  text = String(text || '-');
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (text.length && ctx.measureText(`${text}...`).width > maxWidth) text = text.slice(0, -1);
  return `${text}...`;
}

function coverImage(image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  return { sourceX, sourceY, sourceWidth, sourceHeight };
}

async function generatePoster(teams, gameLabels, dateText, outputPath) {
  registerFonts();
  const width = 1280;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, '#120006');
  background.addColorStop(.55, '#26040f');
  background.addColorStop(1, '#170322');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const glows = [
    [190, 130, 380, 'rgba(220,38,38,.30)'],
    [1085, 105, 330, 'rgba(124,58,237,.24)'],
    [650, 720, 450, 'rgba(190,18,60,.28)']
  ];
  glows.forEach(([x, y, radius, color]) => {
    const glow = ctx.createRadialGradient(x, y, 10, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  });

  for (let index = 0; index < 70; index += 1) {
    const x = (index * 137 + 43) % (width - 25) + 15;
    const y = (index * 277 + 71) % (height - 25) + 15;
    ctx.globalAlpha = .18 + (index % 7) / 25;
    ctx.fillStyle = index % 6 === 0 ? '#fbbf24' : index % 3 === 0 ? '#c4b5fd' : '#fecdd3';
    ctx.beginPath();
    ctx.arc(x, y, index % 5 === 0 ? 2.4 : 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(239,68,68,.85)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(455, 36); ctx.lineTo(825, 36); ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(248,113,113,.9)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold italic 66px WarriorsSans, Liberation Sans, Arial';
  ctx.fillText('BẢNG XẾP HẠNG', width / 2, 104);

  ctx.shadowColor = 'rgba(239,68,68,.8)';
  ctx.fillStyle = '#fca5a5';
  ctx.font = 'bold 27px WarriorsSans, Liberation Sans, Arial';
  ctx.fillText('W A R R I O R S   C U S T O M', width / 2, 145);
  ctx.shadowBlur = 0;

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,.65)';
  ctx.font = 'bold 15px WarriorsSans, Liberation Sans, Arial';
  ctx.fillText('BATTLE IN STYLE', width - 32, 44);

  const mapFiles = ['bermuda.jpg', 'kalahari.jpg', 'purgatory.jpg', 'alpine.jpg'];
  const mapDirectory = path.resolve(__dirname, '..', 'modules', 'commands', 'cache', 'maps');
  for (let index = 0; index < 4; index += 1) {
    const x = 34;
    const y = 176 + index * 107;
    const boxWidth = 340;
    const boxHeight = 96;
    ctx.save();
    roundRect(ctx, x, y, boxWidth, boxHeight, 14);
    ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    ctx.fillRect(x, y, boxWidth, boxHeight);
    try {
      const mapImage = await loadImage(path.join(mapDirectory, mapFiles[index]));
      const source = coverImage(mapImage, x, y, boxWidth, boxHeight);
      ctx.globalAlpha = .58;
      ctx.drawImage(mapImage, source.sourceX, source.sourceY, source.sourceWidth, source.sourceHeight, x, y, boxWidth, boxHeight);
      ctx.globalAlpha = 1;
    } catch (error) {}
    const overlay = ctx.createLinearGradient(x, y, x + boxWidth, y);
    overlay.addColorStop(0, 'rgba(0,0,0,.88)');
    overlay.addColorStop(.45, 'rgba(0,0,0,.42)');
    overlay.addColorStop(1, 'rgba(69,10,10,.48)');
    ctx.fillStyle = overlay;
    ctx.fillRect(x, y, boxWidth, boxHeight);
    ctx.restore();

    ctx.strokeStyle = 'rgba(248,113,113,.42)';
    ctx.lineWidth = 2;
    roundRect(ctx, x + 1, y + 1, boxWidth - 2, boxHeight - 2, 14);
    ctx.stroke();

    const label = gameLabels[index] || `GAME ${index + 1}`;
    ctx.font = 'bold 17px WarriorsSans, Liberation Sans, Arial';
    const labelWidth = ctx.measureText(label).width + 18;
    ctx.fillStyle = 'rgba(0,0,0,.75)';
    roundRect(ctx, x + 14, y + 31, labelWidth, 33, 9);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x + 23, y + 54);
  }

  const tableX = 410;
  const tableY = 168;
  const tableWidth = 838;
  const rowHeight = 35;
  const headerHeight = 43;
  const tableHeight = headerHeight + rowHeight * 12;
  ctx.fillStyle = 'rgba(0,0,0,.42)';
  roundRect(ctx, tableX - 4, tableY - 4, tableWidth + 8, tableHeight + 8, 19);
  ctx.fill();

  const headerGradient = ctx.createLinearGradient(tableX, tableY, tableX + tableWidth, tableY);
  headerGradient.addColorStop(0, '#7f1d1d');
  headerGradient.addColorStop(1, '#991b1b');
  ctx.fillStyle = headerGradient;
  roundRect(ctx, tableX, tableY, tableWidth, headerHeight, 16);
  ctx.fill();
  ctx.fillRect(tableX, tableY + 22, tableWidth, headerHeight - 22);

  ctx.textBaseline = 'middle';
  ctx.font = 'bold 19px WarriorsSans, Liberation Sans, Arial';
  ctx.fillStyle = '#fee2e2';
  ctx.textAlign = 'left'; ctx.fillText('TEAM NAME', tableX + 76, tableY + headerHeight / 2);
  ctx.textAlign = 'center'; ctx.fillText('ELIMS', tableX + 600, tableY + headerHeight / 2);
  ctx.fillText('BOOYAH', tableX + 693, tableY + headerHeight / 2);
  ctx.fillText('PTS', tableX + 772, tableY + headerHeight / 2);

  const displayTeams = teams.slice(0, 12);
  while (displayTeams.length < 12) displayTeams.push(null);

  displayTeams.forEach((team, index) => {
    const y = tableY + headerHeight + index * rowHeight;
    const isFirst = index === 0;
    ctx.fillStyle = isFirst ? '#78350f' : index % 2 === 0 ? 'rgba(30,0,5,.90)' : 'rgba(12,0,4,.94)';
    ctx.fillRect(tableX, y, tableWidth, rowHeight);
    if (isFirst) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(tableX, y, 4, rowHeight);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tableX, y + rowHeight); ctx.lineTo(tableX + tableWidth, y + rowHeight); ctx.stroke();

    const badgeY = y + rowHeight / 2;
    ctx.fillStyle = isFirst ? '#f59e0b' : 'rgba(69,10,10,.88)';
    roundRect(ctx, tableX + 15, badgeY - 12, 33, 24, 7);
    ctx.fill();
    ctx.font = 'bold 15px WarriorsSans, Liberation Sans, Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = isFirst ? '#7f1d1d' : '#fca5a5';
    ctx.fillText(`#${index + 1}`, tableX + 32, badgeY + 1);

    ctx.textAlign = 'left';
    ctx.font = `bold ${isFirst ? 18 : 17}px WarriorsSans, Liberation Sans, Arial`;
    ctx.fillStyle = isFirst ? '#fef3c7' : 'rgba(255,255,255,.93)';
    ctx.fillText(truncateText(ctx, team ? team.team_name : '-', 480), tableX + 60, badgeY + 1);

    ctx.textAlign = 'center';
    ctx.font = 'bold 17px WarriorsSans, Liberation Sans, Arial';
    ctx.fillText(team ? String(team.kills) : '', tableX + 600, badgeY + 1);
    ctx.fillStyle = isFirst ? '#ffffff' : '#e9d5ff';
    ctx.fillText(team ? String(team.booyah) : '', tableX + 693, badgeY + 1);
    ctx.fillStyle = isFirst ? '#fde68a' : '#ffffff';
    ctx.fillText(team ? String(team.points) : '', tableX + 772, badgeY + 1);
  });

  ctx.strokeStyle = 'rgba(248,113,113,.42)';
  ctx.lineWidth = 2;
  roundRect(ctx, tableX, tableY, tableWidth - 1, tableHeight - 1, 16);
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'right';
  ctx.font = 'bold 15px WarriorsSans, Liberation Sans, Arial';
  ctx.fillStyle = 'rgba(255,255,255,.82)';
  ctx.fillText(dateText || '', width - 34, 654);
  ctx.font = 'bold 19px WarriorsSans, Liberation Sans, Arial';
  ctx.fillStyle = '#fca5a5';
  ctx.fillText('WARRIORS CUSTOM', width - 34, 682);

  ctx.strokeStyle = 'rgba(239,68,68,.9)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(520, 688); ctx.lineTo(760, 688); ctx.stroke();
  ctx.save();
  ctx.translate(640, 688);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(-6, -6, 12, 12);
  ctx.restore();

  fs.outputFileSync(outputPath, canvas.toBuffer('image/jpeg', { quality: .82 }));
  return outputPath;
}

module.exports = {
  getCookieHeader,
  findMatches,
  calculateLeaderboard,
  generatePoster,
  saveSession,
  getSession
};
