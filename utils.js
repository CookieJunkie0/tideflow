const axios = require('axios-https-proxy-fix');
const { SocksProxyAgent } = require('socks-proxy-agent');
const crypto = require('crypto');
const ethers = require('ethers');
const { io } = require("socket.io-client");

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
        httpsAgent: new SocksProxyAgent(proxy)
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

        const socket = io("wss://api.thegame.tideflow.com/game", { autoConnect: false, path: '/socket.io', auth: { token: token.token }, agent: new SocksProxyAgent(proxy) });

        return {success: true, socket, instance: axiosInstance, wallet, token: token.token}
    } catch(e) {return {success: false, err: e}}
}

async function getAccountData(instance, token) {
    try {
        const res = await instance.get('https://api.thegame.tideflow.com/auth/me', {headers: {Authorization: `Bearer ${token}`}});

        return {success: true, data: res.data}
    } catch(e) {return {success: false, err: e}}
}

const randomInt = (min, max) => { 
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { getAxiosInstance, setupAccount, sleep, randomInt, getAccountData }