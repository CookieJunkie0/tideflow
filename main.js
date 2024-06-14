const { io } = require("socket.io-client");
const fs = require('fs');
const axios = require('axios-https-proxy-fix');
const { setupAccount, sleep, randomInt, getAccountData, getCaptchaToken } = require('./utils.js');
const { ethers } = require("ethers");
require('dotenv').config({ path: './.env' });

const STARTUP_WAIT = JSON.parse(process.env.STARTUP_WAIT);
const BUY_WAIT = JSON.parse(process.env.BUY_WAIT);
const GAME_WAIT = JSON.parse(process.env.GAME_WAIT);

async function startCycle(accounts) {
  try {
      for(const account of accounts) {
        const socket = account.socket;
        let gameId = null;

        socket.on('connect', async () => {
          console.log(`${new Date().toLocaleTimeString()} ${account.wallet.address} | Connected to socket - ${socket.id}`);
          // await sleep(randomInt(STARTUP_WAIT[0], STARTUP_WAIT[1]) * 1000);
          const captchaToken = await getCaptchaToken(account.proxy);
          socket.emit("play-vs-opponent", {
            token: captchaToken.token
          })
        });

        socket.on('initial-data', (data) => {
          gameId = data.sessionId;

          console.log(`${new Date().toLocaleTimeString()} ${account.wallet.address} | Started new game - ID: ${gameId}`);
        })

        socket.on('disconnect', (reason) => {
          console.log(`${new Date().toLocaleTimeString()} ${account.wallet.address} | Disconnected from socket, reason: ${reason}`);
          socket.connect();
        });

        socket.on('error', (err) => {
          console.log(`${new Date().toLocaleTimeString()} ${account.wallet.address} | Socket error - ${err}`);
        });

        socket.on('remaining-time', async (time) => {

          if(time === 0) {
            await sleep(randomInt(BUY_WAIT[0], BUY_WAIT[1]));
            socket.emit("buy", gameId)
          }
        });

        socket.on('match-ended', async (data) => {
          console.log(`${new Date().toLocaleTimeString()} ${account.wallet.address} | Game ended! Result: ${data.result}, shells collected: ${data.points}`);
          const accountData = await getAccountData(account.instance, account.token);
          if(accountData.success) {
            console.log(`${new Date().toLocaleTimeString()} ${account.wallet.address} | Total shells: ${accountData.data.score}`);
          }
          // await sleep(randomInt(GAME_WAIT[0], GAME_WAIT[1]) * 1000);

          const captchaToken = await getCaptchaToken(account.proxy);
          socket.emit("play-vs-opponent", {
            token: captchaToken.token
          })
        });


        socket.connect()
      }
  } catch(e) {return {success: false, err: e}}
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
