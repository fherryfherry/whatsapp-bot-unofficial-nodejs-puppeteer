const puppeteer = require('puppeteer');
const path = require('path');
const chalk = require('chalk');
const fs = require('fs');
const sqlite3 = require("sqlite3").verbose();
const moment = require("moment-timezone");
const randomUseragent = require('random-useragent');

process.setMaxListeners(0);

var current_contact = null;
let headless = true;

let subjectWords = ["honey","hone","naye","bro","ferry","fer"];
let lolWords = ["wkw","hehe","awko","awoko","wokw"];
let askWords = /apa itu|apa artinya|apakah manfaat|apakah arti|apa maksud dari|apa definisi/;

let lastSuggestionAnswer = [];

let adaptationMode = false;
let adaptionQuestion = null;
let adaptionToggle = false;
let chatFocusTimeout = null;

const stdin = process.stdin;
const max_midnight = 23;
const min_morning = 5;
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36";

const CREATE_TABLE_last_received_message = "CREATE TABLE IF NOT EXISTS last_received_message ( id INTEGER PRIMARY KEY AUTOINCREMENT, contact TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL)";
const CREATE_TABLE_last_sent_message = "CREATE TABLE IF NOT EXISTS last_sent_message ( id INTEGER PRIMARY KEY AUTOINCREMENT, contact TEXT NOT NULL, message TEXT NOT NULL, question TEXT NULL, created_at TEXT NOT NULL)";
const CREATE_TABLE_adaptations = "CREATE TABLE IF NOT EXISTS adaptation ( id INTEGER PRIMARY KEY AUTOINCREMENT, author TEXT NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL, created_at TEXT NOT NULL)";

process.on("unhandledRejection", (reason, p) => {
  console.warn("Unhandled Rejection at: Promise", p, "reason:", reason);
});

let db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the database.');
});

// Create table first
db.serialize(function() {
  db.run(CREATE_TABLE_last_received_message, function(err) {
    if (err) {
        console.log(err);
    } else {
        console.log('Table last received message has been created!');
    }
  });

  db.run(CREATE_TABLE_last_sent_message, function(err) {
    if (err) {
        console.log(err);
    } else {
        console.log('Table last sent message has been created!');
    }
  });

  db.run(CREATE_TABLE_adaptations, function(err) {
    if (err) {
        console.log(err);
    } else {
        console.log('Table adaptation has been created!');
    }
  });
});


(async () => {
  // const userAgent = randomUseragent.getRandom(function (ua) {
  //     return ["Firefox","Chrome","Edge"].indexOf(ua.browserName) >= 0 && parseFloat(ua.browserVersion) >= 60;
  // });
  
  print("UA = " + userAgent);

  const browser = await puppeteer.launch({
    devtools: false,
    headless: headless,
    userDataDir: path.resolve(__dirname, './tmp'),
    handleSIGINT: false,
    ignoreHTTPSErrors: true,
    args: [
      '--user-agent=' + userAgent,
      '--log-level=3', // fatal only
      '--start-maximized',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-infobars',
      '--disable-web-security',
      '--disable-site-isolation-trials',
      '--no-experiments',
      '--ignore-gpu-blacklist',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-default-apps',
      '--enable-features=NetworkService',
      '--disable-setuid-sandbox',
      '--no-sandbox'
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  print("Init new page");
  print("Time: " + moment().tz("Asia/Jakarta").format());

  const page = await browser.newPage();
  await page.setUserAgent(userAgent);
  // await page.setViewport({width: 1280, height: 728});
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    request.continue();
  });

  // close browser on exit
  process.on('SIGINT', () => 
  browser
    .close()
    .then(() => {
      closeDatabase();
      process.exit(0);
    })
    .catch(() => {
      closeDatabase();
      process.exit(0);
    })
)

print("Goto whatsApp");
await page.goto('https://web.whatsapp.com/',{
  waitUntil: 'networkidle2',
  timeout: 30000
});

await delay(2000);

var isLoggedIn = false;

try {
  await page.waitForFunction(
    'document.querySelector("body").innerText.includes("Keep your phone")'
  );
  isLoggedIn = true;
} catch (err) {
  isLoggedIn = false;
}

var qrCodeIsFound = 0;

if(isLoggedIn === false) {
  try {
    print("Waiting QRCode...");
    // Wait until qrCode loaded
    await page.waitForSelector("canvas");
    
    qrCodeIsFound = await page.evaluate(()=>{
      return document.querySelectorAll("canvas").length;
    });
  } catch (err) {
    print("Ok QRCode not found, maybe you have logged in!");
    page.screenshot({
      path: "error.png"
    });
  }
}

try {
  await qrCodeScreenshot(page, qrCodeIsFound);

  print("Bring page to front");
  page.bringToFront();
  
  // Wait until search bar shown
  await page.waitForSelector("#side [contenteditable]");
  
  // Find new message contact
  print("Listening incoming messages...");
  newMessageChecker(browser, page);

  // send Notif to ferry
  current_contact = await openContact(page, "Ferry Telkomsel", "I'm Up");
  await sendMessage(page, current_contact, "I'm Up");

  // Click use here if any
  checkAnotherUsed(page);

  // Current Contact
  while(true) {
    current_contact = await getCurrentContact(page);
    await delay(500);
  }

  // Check status sometime
  // await delay(3000);
  // while(true) {
  //   if(current_contact == null) {
  //     await viewStatus(page);
  //   }
  //   await delay(30000);
  // }
  
} catch (err) {
    print("Error="+err);
    closeDatabase();
    page.screenshot({
      path: "error.png"
    });
}
  
  
  // await browser.close();
})();

async function viewStatus(page)
{
  try {

    if(current_contact==null) await page.click("div[title='Status']");

    if(current_contact==null) await delay(500);

    if(current_contact==null) await page.waitForSelector("div.statusList");

    if(current_contact==null) {
      const statusItem = await page.$$("div.statusList span[title]");
      print("Total status = " + statusItem.length);

      if(current_contact == null && statusItem.length > 0) {
          await statusItem[0].click();
          await delay(3000);
          page.keyboard.press("Escape");
      }
    }
    
    page.click("span[data-testid='x-viewer']");

  } catch (err) {
    print("Vie status error = " + err);
    page.keyboard.press("Escape");
    page.keyboard.press("Escape");
  }
}

function closeDatabase()
{ 
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Close the database connection.');
  });
}

async function checkAnotherUsed(page)
{
  while(true) {    
    try {
      let isUsed = await page.evaluate(()=>{
        return document.querySelector("body").innerText.includes("WhatsApp is open on another");
      });
  
      if(isUsed) {
        await page.click("div[role='button']._2Zdgs");
      }
    } catch (err) {
      print("Something happen while check another used = " + err);
    }  
    await delay(3000);
  }
}

async function newMessageChecker(browser, page)
{
  while(true) {  

    const time = moment().tz("Asia/Jakarta").format("HH:mm:ss");
    
    print("Check new message " + time);
    let list_new = await getListNewMessageFrom(page);

    print("Total new message = " + list_new.length);
    
    if(list_new != null && list_new.length > 0) {
      // Bring page to front
      print("Bring page to front");
      page.bringToFront();
      for(let i =0; i< list_new.length; i++) {          
          if(list_new[i]) {
            print("New Message " + time +" From : " + list_new[i]);
            // Open contact
            await openContact(page, list_new[i]);
            // Check last message of this contact
            await lastMessageChecker(browser, page);
            await delay(5000);
          }          
      }
    } else {
      if(current_contact != null) {
        // Bring page to front
        print("Bring page to front");
        page.bringToFront();
        // Open contact
        await openContact(page, current_contact);
        // Check last message of this contact
        await lastMessageChecker(browser, page);               
      }
    }

    // Greeting
    if(time == "07:00:00") {
      // Open contact
      await openContact(page, "Tenaye");
      await sendMessage(page, "Tenaye", "Selamat pagi sayang, have a nice day, I love you! :*");
    } else if(time == "23:00:00") {
      // Open contact
      await openContact(page, "Tenaye");
      await sendMessage(page, "Tenaye", "Samat bobo sayang, have a nice dream, I love you! :*");
    } else if(time == "12:05:00") {
      // Open contact
      await openContact(page, "Tenaye");
      await sendMessage(page, "Tenaye", "Halu Naye jan kupas mamam ye, I love you! :*");
    }

    await delay(2000);
  }
}

async function lastMessageChecker(browser, page)
{
    // print("last message checker = " + contact);
    //#main div.message-in
    let contact = await getCurrentContact(page);
    const hour = parseInt(moment().tz("Asia/Jakarta").format("H"));

    if(contact != null) {

      let message = '';
      let msgId = '';
      let msgData = await page.evaluate(() => {

        let nodes = document.querySelectorAll('#main div.message-in');
        let el = nodes[nodes.length - 1];

        if (!el) {
          return '';
        }

        let id = el.getAttribute("data-id");

        let picNodes = el.querySelectorAll("img[src*='blob']");
        let isPicture = picNodes[picNodes.length - 1];

        if (isPicture) {
          return '';
        }

        // check if it is gif message
        let gifNodes = el.querySelectorAll("div[style*='background-image']");
        let isGif = gifNodes[gifNodes.length - 1];

        if (isGif) {
          return '';
        }

        // check if it is video message
        let vidNodes = el.querySelectorAll(".video-thumb");
        let isVideo = vidNodes[vidNodes.length - 1];

        if (isVideo) {
          return '';
        }

        // check if it is voice message
        let audioNodes = el.querySelectorAll("audio");
        let isAudio = audioNodes[audioNodes.length - 1];

        if (isAudio) {
          return '';
        }

        // check if it is emoji message
        let emojiNodes = el.querySelectorAll("div.selectable-text img.selectable-text");
        let isEmoji = emojiNodes[emojiNodes.length - 1];

        if (isEmoji) {
          return '';
        }

        // text message
        nodes = el.querySelectorAll('span.selectable-text');
        el = nodes[nodes.length - 1];

        return el ? [id, el.innerText] : [];
      });
      message = msgData ? msgData[1] : '';
      msgId = msgData ? msgData[0] : '';

      let data_received_msg = await dbFirst("select * from last_received_message where contact = ? order by id desc limit 1", [contact]);
      let last_received_msg_id = (data_received_msg) ? data_received_msg.message : '';
      if(message && msgId != last_received_msg_id) {   

          //insert last message
          dbInsert("insert into last_received_message (contact,message,created_at) values (?,?,?)",[contact, msgId, currentDateTime()]);

          print(contact + ": " + message);

          if(hour < max_midnight && hour > min_morning) {
            if(adaptionToggle === false) {
              print("BOT memeriksa kamus");
              let msg = message.toLowerCase().trim();
              if(subjectWords.indexOf(msg) >= 0) {
                print("BOT menduga ini adalah subject words");
                  await sendMessage(page, contact, "Iya");
              } else if(lolWords.indexOf(msg) >= 0) {
                print("BOT menduga ini adalah LOL words");
                  await sendMessage(page, contact, message);
              } else if(msg == "bot adaptation active") {   
                  if(contact) {
                    contact = contact.toLowerCase();            
                    if(contact && contact.includes("ferry")) {
                      print("BOT mengaktifkan mode adaptasi");
                      adaptationMode = true;
                      await sendMessage(page, contact, "Fitur adaptasi aktif");
                    } else {
                      print("BOT menolak perintah");
                      await sendMessage(page, contact, "Perintah ditolak");
                    }    
                  }                            
              } else if(msg == "bot adaptation inactive") {
                  print("BOT mematikan mode adaptasi");
                  adaptationMode = false;
                  await sendMessage(page, contact, "Fitur adaptasi mati");
              } else {
                let adaptAnswer = await dbFirst("select * from adaptation where question like ? limit 1",[message + '%']);
                if(adaptAnswer) {
                  print("BOT menemukan jawaban yang sesuai database");
                  await sendMessage(page, contact, adaptAnswer.answer);
                } else {
                  if(adaptationMode === true) {
                    if(contact.toLowerCase().includes("ferry")) {
                      print("BOT menanyakan jawabannya?");
  
                      if(askWords.test(msg)) {
                        await sendMessage(page, contact, "Umm sebentar...");
                        let suggestion = await searchGoogle(browser, message);
                        lastSuggestionAnswer[contact] = suggestion;
                        await sendMessage(page, contact, "Saya tidak tahu jawabannya, tapi saya sudah mencarinya jawabannya, apakah ini BENAR? " + suggestion);
                      } else {
                        await sendMessage(page, contact, "Maaf saya tidak tahu jawabannya, saya harus jawab apa?");
                      }
                      
                      adaptionQuestion = message;
                      adaptionToggle = true;
                    }                  
                  } else {
  
                    if(askWords.test(msg)) {
                      print("BOT mencoba mencari dgn Google, kata kunci = " + message);
                      await sendMessage(page, contact, "Umm sebentar...");
                      let suggestion = await searchGoogle(browser, message);
                      if(suggestion) {
                        await sendMessage(page, contact, "Ummm, apa ini yang kamu maksud? " + suggestion);
                      } else {
                        await sendMessage(page, contact, "Aduh aku belum bisa temukan jawabannya");
                      }                  
                    }
  
                    print("BOT tidak menemukan jawaban untuk = " + message); 
                  }
                }            
              }
            } else {
                if(askWords.test(adaptionQuestion.toLowerCase())) {
                  if(/benar|ya|yap|yup|iya|bener|betul/.test(message.toLowerCase().trim())) {
                    print("BOT menyimpan jawaban baru = " + lastSuggestionAnswer[contact]);
                    dbInsert("insert into adaptation (author,question, answer, created_at) values (?,?,?,?)",[contact,adaptionQuestion,lastSuggestionAnswer[contact], currentDateTime() ]);            
                    await sendMessage(page, contact, "Sipp!");  
                  } else {
                    await sendMessage(page, contact, "Baiklah, coba tanya yang lainnya ya");  
                  }                 
                } else {
                  print("BOT menyimpan jawaban baru = " + message);
                  dbInsert("insert into adaptation (author,question, answer, created_at) values (?,?,?,?)",[contact,adaptionQuestion,message, currentDateTime() ]);            
  
                  await sendMessage(page, contact, "Sipp!");             
                }
                
                adaptionQuestion = null;
                adaptionToggle = false;
            }
          } else {
            await sendMessage(page, contact, "Maaf saya sedang istirahat, hubungi kembali nanti ya");
          }        
      } else {
          // print("BOT Silent. Last message = " + last_received_msg);
      }
    }
    
    return true;
}

async function qrCodeScreenshot(page,qrCodeIsFound)
{
  if(qrCodeIsFound > 0) {
    while(qrCodeIsFound > 0) {      
        print("Screenshot QRCode");
        page.screenshot({
          path: "qrCode.png",
          clip: {
            x: 430,
            y: 130,
            width: 290,
            height: 300
          }
        });
  
        qrCodeIsFound = await page.evaluate(()=>{
          return document.querySelectorAll("canvas").length;
        });
  
        if(qrCodeIsFound > 0) {
          await delay(5000);
        }  
  
        // Check if reload qr code
        var btnQrCodeReload = false;
        btnQrCodeReload = await page.evaluate(()=>{ 
            return document.querySelectorAll("button[class='_2znac']").length > 0;
        });
        if(btnQrCodeReload === true) {
            await page.click("button[class='_2znac']");
        }
    }
  }
  return true;
}

async function getListNewMessageFrom(page)
{
  return await page.evaluate(()=>{
      var list_new = [];
      const contact_list = document.querySelectorAll("[data-testid]");
      for(let i = 0; i < contact_list.length; i++) {
          let node = contact_list[i].querySelector(".zoWT4");
          if(node) {
            var style = window.getComputedStyle(node);
            var fontWeight = style.getPropertyValue("font-weight");
            var contact_name = node.querySelector("span[title]").getAttribute("title");            
            if(fontWeight == 500 && contact_name != null) {
                list_new.push(contact_name);
            }
          }          
      }
      return list_new;
  });
}

async function clearSearch(page)
{
  // print("BOT membersihkan search bar");
  // // click to search bar
  // await page.click("#side .selectable-text");
  // // make sure it's empty    
  // await page.evaluate(() => document.execCommand( 'selectall', false, null ))
  // await page.keyboard.press("Backspace");
}

async function getCurrentContact(page)
{
  let result = '';
  try {
     await page.waitForSelector("#side div[aria-selected='true']");

     result = await page.evaluate(()=>{
      return document.querySelectorAll("#side div[aria-selected='true']")[0].querySelectorAll("span[title]")[0].innerText;
     });
     result = (result && typeof result == 'string') ? result : '';

  } catch(err) {
      return '';
  }

  return result;
}

async function openContact(page, contact_name)
{
  if(contact_name && current_contact != contact_name) {      
    print("Open contact = " + contact_name); 
    // clear search bar  
    await clearSearch(page);
    // click search bar 
    // await page.click("#side .selectable-text");
    // type contact name to search bar
    // await page.keyboard.type(contact_name);     
    print("BOT memastikan kontak muncul di sidebar");
    await page.waitForSelector("#side span[title*='"+contact_name+"']");

    print("BOT klik kontak");
    await page.click("#side span[title*='"+contact_name+"']"); 

    print("BOT menunggu 500ms"); 
    await delay(500);

    // fokus on input
    print("BOT Fokus pada input text");
    await page.focus("#main div[contenteditable]");

    await clearSearch(page);
  }

  return current_contact;
}

async function sendMessage(page, contact_name, message) 
{     
    let data_rec_msg = await dbFirst("select * from last_received_message where contact = ? order by id desc limit 1", [contact_name]);
    let question = (data_rec_msg) ? data_rec_msg.message : '';

    print("BOT mereset time focus");
    if(chatFocusTimeout) clearTimeout(chatFocusTimeout);
    
    await page.waitForSelector("#main div[contenteditable]");

    // type message
    print("Type message...");
    await page.keyboard.type("🤖: " + message);
    // Enter to send
    print("Enter...");
    await page.keyboard.press("Enter");

    // save to table
    if(contact_name && message) dbInsert("insert into last_sent_message (contact,message,question,created_at) values (?,?,?,?)",[ contact_name, message, question, currentDateTime() ]);

    print("BOT Said: " + message);

    // If user do not respond in 30s then current contact = null
    chatFocusTimeout = setTimeout(function() {
        // clear search bar
      // clearSearch(page);
      // current_contact = null;
      print("BOT idle");
    }, 20000);
    
    return true;
}

function currentDateTime()
{
  return moment().tz("Asia/Jakarta").format("yyyy-MM-dd HH:mm:ss");
}

function delay(time) {
	return new Promise(function(resolve) {
		setTimeout(resolve, time);
	})
}

function print(message, color = null) {
  color = (color == null) ? "green" : color;

  if (chalk[color]) {
    console.log(chalk[color](message) + '\n');
  } else {
    console.log(message + '\n');
  }

}

async function dbFirst(query, param) 
{
  return new Promise((resolve, reject)=>{
    db.all(query, param, (err, rows) => {
        if(err) {
          return reject(err);
        } else {
          resolve(rows[0]);
        }
    });
  });
}

async function dbAll(query, param) 
{
  return new Promise((resolve, reject)=>{
    db.all(query, param, (err, rows) => {
        if(err) {
          return reject(err);
        } else {
          resolve(rows);
        }
    });
  });
}

async function dbInsert(query, data) 
{
  return new Promise((resolve, reject)=>{
    db.run(query, data, (err) => {
        if(err) {
          return reject(err);
        } else {
          resolve(true);
        }
    });
  });
}

async function dbUpdate(query, data) 
{
  return new Promise((resolve, reject)=>{
    db.run(query, data, (err) => {
        if(err) {
          return reject(err);
        } else {
          resolve(true);
        }
    });
  });
}

async function searchGoogle(browser, keyword) {
  print("Open google");
  
  const gPage = await browser.newPage();
  await gPage.setUserAgent(userAgent);
  await gPage.setRequestInterception(true);
  gPage.on('request', (request) => {
    request.continue();
  });

  await gPage.goto('https://www.google.co.id/',{
    waitUntil: 'networkidle2',
    timeout: 0
  });

  await gPage.waitForSelector("input[role='combobox']");

  await gPage.click("input[role='combobox']");

  await gPage.keyboard.type(keyword);

  await gPage.keyboard.press("Enter");

  let answer = "";

  await delay(1300);

  await gPage.waitForSelector("#search");

  try {
    
    answer = await gPage.evaluate(()=>{
        let result = '';
        result = document.querySelectorAll("[data-attrid='wa:/description']")[0].innerText;
        return result;
    });

  } catch (err) {
    
  }

  try {
    
    if(!answer) {
      answer = await gPage.evaluate(()=>{
          let result = '';
          result = document.querySelectorAll("#search .g")[0].querySelectorAll("div[data-hveid]")[0].querySelectorAll("div")[0].querySelectorAll("div")[6].querySelectorAll("div")[0].innerText;
          return result;
      });
    }
  
  } catch (err) {
    
  }

  await delay(1500);

  gPage.close();

  return answer;
}