// Existing Round 1 journey on an isolated browser learner; test records remain in the dev database.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const [url,out] = process.argv.slice(2);
await fs.mkdir(out,{recursive:true});
const result={schema:'socrates/ce-browser-readback/v1',url,started:new Date().toISOString(),screenshots:[],checks:[],state:'AWAITING_BROWSER'};
let browser;
try {
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(url,{waitUntil:'networkidle',timeout:30000});
 const start=page.getByRole('button',{name:/開始討論/}).first();
 await start.click({timeout:15000});
 await page.getByTestId('conversation-room').waitFor({timeout:30000});
 await page.getByTestId('avatar-stage').filter({has:page.locator('canvas')}).waitFor({timeout:30000});
 await page.waitForFunction(()=>document.querySelector('[data-testid="avatar-stage"]')?.getAttribute('data-render-status')==='ready',{},{timeout:45000});
 result.checks.push('REAL_GLB_RENDERER_READY');
 await page.waitForTimeout(1800);
 result.authority='ISOLATED_LOCAL_BROWSER';
 await page.screenshot({path:path.join(out,'desktop-portrait.png')});result.screenshots.push('desktop-portrait.png');
 await page.getByRole('button',{name:'展開歷史側欄',exact:true}).click();
 await page.getByRole('button',{name:'展開對話側欄',exact:true}).click();
 if(!await page.locator('#ce-history').isVisible() || !await page.locator('#ce-transcript').isVisible())throw new Error('DRAWER_VISIBILITY_READBACK');
 result.checks.push('TWO_INDEPENDENT_DRAWERS');
 await page.screenshot({path:path.join(out,'desktop-drawers.png')});result.screenshots.push('desktop-drawers.png');
 await page.getByRole('button',{name:'三槓選單',exact:true}).click();
 if(!await page.getByRole('navigation',{name:'聊天室選單'}).isVisible())throw new Error('MENU_VISIBILITY_READBACK');
 result.checks.push('HAMBURGER_MENU');
 await page.screenshot({path:path.join(out,'desktop-menu.png')});result.screenshots.push('desktop-menu.png');
 await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});await page.waitForTimeout(800);
 await page.screenshot({path:path.join(out,'mobile-portrait.png')});result.screenshots.push('mobile-portrait.png');
 result.checks.push('MOBILE_LAYOUT_CAPTURED');result.page_errors=errors;result.state=errors.length ? 'AWAITING_BROWSER_REPAIR' : 'PASS';
} catch(e) {result.state='AWAITING_BROWSER_RECEIPT';result.detail=String(e)}
finally {if(browser)await browser.close();await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2));}
console.log(JSON.stringify(result));
