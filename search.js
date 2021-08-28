const puppeteer = require('puppeteer');
const path = require('path');
const chalk = require('chalk');
const fs = require('fs');
const sqlite3 = require("sqlite3").verbose();
const moment = require("moment-timezone");
const randomUseragent = require('random-useragent');

process.setMaxListeners(0);

let headless = false;

const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36";

// process.on("unhandledRejection", (reason, p) => {
//   //console.warn("Unhandled Rejection at: Promise", p, "reason:", reason);
// });


(async () => {
  
  const browser = await puppeteer.launch({
    devtools: true,
    headless: headless,
    handleSIGINT: false,
    ignoreHTTPSErrors: true,
    args: [
      '--user-agent=' + userAgent
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = await browser.newPage();
  await page.setUserAgent(userAgent);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    request.continue();
  });

  await page.goto('https://www.google.co.id/',{
    waitUntil: 'networkidle2',
    timeout: 0
  });

  await page.waitForSelector("input[role='combobox']");

  await page.click("input[role='combobox']");

  await page.keyboard.type("apa itu covid?");

  await page.keyboard.press("Enter");

  let answer = "";

  try {
    await page.waitForSelector(".wTz7Vd");

    answer = await page.evaluate(()=>{
        return document.querySelectorAll(".wTz7Vd")[0].innerText;
    });

    if(!answer) {
      answer = await page.evaluate(()=>{
        return document.querySelectorAll(".VwiC3b")[0].innerText;
      });
    }

  } catch (err) {
    
  }

  console.log(answer);
  
  // await browser.close();
})();