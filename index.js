const { spawn } = require("child_process");
const { readFileSync } = require("fs-extra");
const http = require("http");
const axios = require("axios");
const semver = require("semver");
const logger = require("./utils/log");
const express = require('express');
const path = require('path');
const chalk = require('chalkercli');
const chalk1 = require('chalk');
const CFonts = require('cfonts');
const app = express();
const port = process.env.PORT || 8080;
const moment = require("moment-timezone");

var gio = moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss || D/MM/YYYY");
var thu = moment.tz('Asia/Ho_Chi_Minh').format('dddd');
if (thu == 'Sunday') thu = '𝐂𝐡𝐮̉ 𝐍𝐡𝐚̣̂𝐭'
if (thu == 'Monday') thu = '𝐓𝐡𝐮̛́ 𝐇𝐚𝐢'
if (thu == 'Tuesday') thu = '𝐓𝐡𝐮̛́ 𝐁𝐚'
if (thu == 'Wednesday') thu = '𝐓𝐡𝐮̛́ 𝐓𝐮̛'
if (thu == "Thursday") thu = '𝐓𝐡𝐮̛́ 𝐍𝐚̆𝐦'
if (thu == 'Friday') thu = '𝐓𝐡𝐮̛́ 𝐒𝐚́𝐮'
if (thu == 'Saturday') thu = '𝐓𝐡𝐮̛́ 𝐁𝐚̉𝐲'

console.log('ㅤㅤㅤㅤ            𝐇𝐨̂𝐦 𝐧𝐚𝐲 𝐥𝐚̀:' +  thu,'𝐂𝐡𝐮́𝐜 𝐛𝐚̣𝐧 𝐜𝐨́ 𝐦𝐨̣̂𝐭 𝐧𝐠à𝐲 𝐯𝐮𝐢 𝐯𝐞̉\n' )

// Collect bot logs for /logs endpoint
const botLogs = [];
const maxLogs = 200;

function addLog(msg) {
    const ts = new Date().toISOString();
    botLogs.push(`[${ts}] ${msg}`);
    if (botLogs.length > maxLogs) botLogs.shift();
}

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, '/index.html'));
});

app.get('/health', function(req, res) {
    res.json({ status: 'ok', bot: 'WARRIORS Bot', time: new Date().toISOString(), uptime: process.uptime() });
});

app.get('/logs', function(req, res) {
    res.type('text/plain').send(botLogs.join('\n'));
});

app.listen(port, () => {
    addLog(`Server started on port ${port}`);
    console.log('𝐌𝐚́𝐲 𝐜𝐡𝐮̉ 𝐛𝐚̆́𝐭 𝐝𝐚̂̀𝐮 𝐭𝐚̣𝐢 http://localhost:' + port,"𝐯𝐚̀𝐨 𝐥𝐮́𝐜:" + gio);
});

logger("𝐋𝐢𝐞̂𝐧 𝐡𝐞̣̂ 𝐅𝐚𝐜𝐞𝐛𝐨𝐨𝐤: https://www.facebook.com/TatsuYTB", "𝐅𝐚𝐜𝐞𝐛𝐨𝐨𝐤");

function startBot(message) {
    (message) ? logger(message, "BOT ĐANG KHỞI ĐỘNG") : "";
    addLog(message || "Starting bot...");

    const child = spawn("node", ["--trace-warnings", "--async-stack-traces", "main.js"], {
        cwd: __dirname,
        stdio: ["pipe", "pipe", "pipe", "ipc"],
        shell: false
    });

    child.stdout.on('data', (data) => {
        const msg = data.toString();
        console.log(msg);
        addLog(msg.trim());
    });

    child.stderr.on('data', (data) => {
        const msg = data.toString();
        console.error(msg);
        addLog('[ERROR] ' + msg.trim());
    });

    child.on('message', (msg) => {
        addLog('[IPC] ' + JSON.stringify(msg));
    });

    child.on("close", (codeExit) => {
        addLog(`Bot process exited with code: ${codeExit}`);
        var x = 'codeExit'.replace('codeExit', codeExit);
        if (codeExit == 1) return startBot("BOT RESTARTING!!!");
        else if (x.indexOf(2) == 0) {
            setTimeout(() => {
                startBot("Bot has been activated please wait a moment!!!");
            }, parseInt(x.replace(2, '')) * 1000);
        }
        else {
            addLog("Bot exited with code " + codeExit + ", restarting in 10s...");
            setTimeout(() => startBot("BOT RESTARTING after exit!"), 10000);
        }
    });

    child.on("error", function (error) {
        logger("An error occurred: " + JSON.stringify(error), "[ Starting ]");
        addLog('[ERROR] Spawn error: ' + JSON.stringify(error));
    });
}

setTimeout(async function () {
    addLog('Loading source code...');
    logger('𝐁𝐚̆́𝐭 𝐝𝐚̂̀𝐮 𝐥𝐨𝐚𝐝 𝐬𝐨𝐮𝐫𝐜𝐞 𝐜𝐨𝐝𝐞', 'LOAD');
    startBot();
}, 70);
