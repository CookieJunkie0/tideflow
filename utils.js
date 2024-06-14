const axios = require('axios-https-proxy-fix');
const { HttpsProxyAgent } = require('https-proxy-agent');
const crypto = require('crypto');
const ethers = require('ethers');
const { io } = require("socket.io-client");
require('dotenv').config({ path: './.env' });

const CAPTCHA_API = process.env.CAPTCHA_API;

async function createCaptchaTask(proxy) {
    try {
        const proxyParts = proxy.split('://')[1].split('@');
        const proxyAuth = proxyParts[0].split(':');
        const proxyHost = proxyParts[1].split(':');
        const res = await axios.post("https://api.capmonster.cloud/createTask", {
            task: {
                "type":"RecaptchaV2Task",
                "websiteURL":"https://game.tideflow.com/",
                "websiteKey":"6LfKuvgpAAAAAIj02KFZ583LqaSsXki6-CMNDKMc",
                "proxyType":"socks5",
                "proxyAddress":proxyHost[0],
                "proxyPort":proxyHost[1],
                "proxyLogin":proxyAuth[0],
                "proxyPassword":proxyAuth[1],
                "userAgent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36"
            },
            "clientKey": CAPTCHA_API,
        })

        return {success: true, task: res.data.taskId}
    } catch(e) {return {success: false, err: e}}
}

async function getCaptchaToken(proxy) {
    try {
        const task = await createCaptchaTask(proxy);
        if(!task.success) { return {success: false, err: task.err} }

        let i = 0;
        while(i < 10) {
            await sleep(10000);
            const res = await axios.post("https://api.capmonster.cloud/getTaskResult", {
                clientKey: CAPTCHA_API,
                taskId: task.task
            });

            if(res.data.status === 'ready') { return {success: true, token: res.data.solution.gRecaptchaResponse} } else if(res.data.errorId > 0) { return {success: false, err: res.data.errorDescription} }
            i++;
        }

        return {success: false, err: 'Captcha timeout'}
    } catch(e) {return {success: false, err: e}}
}

function getAxiosInstance(proxy) {
    return axios.create({
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36',
            'Origin': 'https://thegame.tideflow.com',
            'Referer': 'https://thegame.tideflow.com/',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'authority': 'api.thegame.tideflow.com'
        },
        httpsAgent: new HttpsProxyAgent(proxy)
    });
}

async function auth(instance, wallet) {
    try {
        const message = `Tideflow Game Login: ${crypto.randomBytes(7).toString('hex').slice(0, 13)}`;
        const signature = await wallet.signMessage(message);

        const res = await instance.post('https://api.thegame.tideflow.com/auth/login-web3', {address: wallet.address, message, signature});
        return {success: true, token: res.data.access_token}
    } catch(e) {return {success: false, err: e}}
}

async function setupAccount(wallet, proxy) {
    try {
        const axiosInstance = getAxiosInstance(proxy);
        const token = await auth(axiosInstance, wallet);
        if(!token.success) { return {success: false, err: token.err} }

        const socket = io("wss://api.thegame.tideflow.com/game", { autoConnect: false, path: '/socket.io', auth: { token: token.token }, agent: new HttpsProxyAgent(proxy) });

        return {success: true, socket, instance: axiosInstance, wallet, token: token.token, proxy}
    } catch(e) {return {success: false, err: e}}
}

async function getAccountData(instance, token) {
    try {
        const res = await instance.get('https://api.thegame.tideflow.com/game-season/2/leaderboard/me', {headers: {Authorization: `Bearer ${token}`}});

        return {success: true, data: res.data.you}
    } catch(e) {return {success: false, err: e}}
}

const randomInt = (min, max) => { 
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { getAxiosInstance, setupAccount, sleep, randomInt, getAccountData, getCaptchaToken }
