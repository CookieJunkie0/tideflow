const { io } = require("socket.io-client");
const fs = require('fs');
const { SocksProxyAgent } = require('socks-proxy-agent');
const axios = require('axios-https-proxy-fix');
const { setupAccount, sleep, randomInt, getAccountData, getCaptchaToken } = require('./utils.js');
const { ethers } = require("ethers");
const { resolve } = require("path");
require('dotenv').config({ path: './.env' });

const STARTUP_WAIT = JSON.parse(process.env.STARTUP_WAIT);
const BUY_WAIT = JSON.parse(process.env.BUY_WAIT);
const GAME_WAIT = JSON.parse(process.env.GAME_WAIT);
const TRADES = JSON.parse(process.env.TRADES);
const TRADES_DELAY = JSON.parse(process.env.TRADES_DELAY);

async function startCycle(accounts) {
  try {
      accounts.map(async account => { 

        await sleep(randomInt(STARTUP_WAIT[0], STARTUP_WAIT[1]) * 1000);
        
        while(true) {
          const captchaToken = await getCaptchaToken(account.proxy);
          const socket = io("wss://api.thegame.tideflow.com/game", { autoConnect: true, query: {captchaToken: captchaToken.token, gameMode: "play-vs-opponent"}, path: `/socket.io`, auth: { token: account.token }, agent: new SocksProxyAgent(account.proxy) });
          let gameId = null;

          socket.on('initial-data', (data) => {
            gameId = data.sessionId;

            console.log(`${new Date().toLocaleTimeString()} ${account.wallet.address} | Started new game - ID: ${gameId}`);
          })
          
          const endgame = new Promise(resolve => {
            socket.on('disconnect', async (reason) => {
              await sleep(randomInt(GAME_WAIT[0], GAME_WAIT[1]) * 1000);
              resolve("end")
            });
          });

          socket.on('error', (err) => {
            console.log(`${new Date().toLocaleTimeString()} ${account.wallet.address} | Socket error - ${err}`);
          });

          socket.on('remaining-time', async (time) => {
            if(time === 0) {

              await sleep(randomInt(BUY_WAIT[0], BUY_WAIT[1]));
              const trades = randomInt(TRADES[0], TRADES[1])

              for(let i = 0; i < trades; i++) {
                console.log(`${new Date().toLocaleTimeString()} ${account.wallet.address} | Trading ${i+1}/${trades}`);
                socket.emit("buy", gameId)
                await sleep(randomInt(TRADES_DELAY[0], TRADES_DELAY[1]) * 1000);
                socket.emit("sell", gameId)
              }

              console.log(`${new Date().toLocaleTimeString()} ${account.wallet.address} | Made ${trades} trades`);
            }
          });

          socket.on('match-ended', async (data) => {
            console.log(`${new Date().toLocaleTimeString()} ${account.wallet.address} | Game ended! Result: ${data.result}, shells collected: ${data.points}`);
            const accountData = await getAccountData(account.instance, account.token);
            if(accountData.success) {
              console.log(`${new Date().toLocaleTimeString()} ${account.wallet.address} | Total shells: ${accountData.data.score}`);
            }
          });

          socket.connect()

          await endgame;
        }
      })
  } catch(e) {console.log(e); return {success: false, err: e}}
}

async function main() {
  const wallets = fs.readFileSync('wallets.txt').toString().split('\n');
  const proxies = process.env.PROXY || fs.readFileSync('proxy.txt').toString().split('\n');

  const accounts = [];
  for (let i = 0; i < wallets.length; i++) {
    const proxy = typeof(proxies) === 'string' ? proxies : proxies.length == wallets.length ? proxies[i] : proxies[randomInt(0, proxies.length-1)];
    const wallet = wallets[i];
    const account = await setupAccount(new ethers.Wallet(wallet), proxy);
    if(!account.success) { console.log(`Failed to setup account for ${wallet}: ${account.err}`); continue }

    console.log(`Successfully setup account ${i+1}/${wallets.length} for ${wallet}`);
    accounts.push(account);
  }

  startCycle(accounts);
}

main()
