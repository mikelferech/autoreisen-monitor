import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({locale:'es-ES',viewport:{width:1360,height:960}});
const page=await context.newPage();
await fs.mkdir('artifacts',{recursive:true});
const responses=[];
page.on('response',r=>{const u=r.url();if(/booking-channel|booking|dispo\./i.test(u)&&responses.length<120)responses.push({status:r.status(),url:u.slice(0,250)});});
try{
  await page.goto('https://www.hoteldunasclub.es/reservar.html',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(6500);
  await page.locator('button.fn-disableAll.fn-confirm').first().click({timeout:5000}).catch(()=>{});
  await page.locator('.sta-popoffer-air_backmask').first().click({timeout:2000}).catch(()=>{});
  await page.waitForTimeout(800);
  await page.locator('#ocupsBox').click({timeout:8000,force:true});
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'añadir un adulto'}).last().click({timeout:5000,force:true});
  const guestText=(await page.locator('#ocupsBox').innerText()).trim();
  await page.locator('#td-search-guests-00').click({timeout:5000,force:true});
  await page.locator('#boxDate').click({timeout:8000,force:true});
  const nextButtons=await page.locator('button').evaluateAll(nodes=>nodes.filter(n=>!n.getAttribute('aria-label')||!/\d+ (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre),? \d{4}/i.test(n.getAttribute('aria-label'))).slice(0,90).map(n=>({html:n.outerHTML.slice(0,260),label:n.getAttribute('aria-label')})));
  console.log('CALENDAR',JSON.stringify({guestText,nextButtons},null,2));
  await page.getByRole('button',{name:/jueves 10 diciembre, 2026/i}).first().click({timeout:6000,force:true});
  await page.getByRole('button',{name:/jueves 17 diciembre, 2026/i}).first().click({timeout:6000,force:true});
  console.log('SELECTED',JSON.stringify({text:(await page.locator('#boxDate').innerText()).slice(0,300),guestText:(await page.locator('#ocupsBox').innerText()).slice(0,300)}));
  await page.locator('#td-search-00').click({timeout:6000,force:true});
  await page.waitForTimeout(10000);
  console.log('RESULT',JSON.stringify({url:page.url(),pages:context.pages().map(p=>({url:p.url()})),body:(await page.locator('body').innerText()).slice(0,14000),responses:responses.slice(-50)},null,2));
  for(let i=0;i<context.pages().length;i++){
    const p=context.pages()[i];
    await p.screenshot({path:'artifacts/quote-'+i+'.png',fullPage:true}).catch(()=>{});
    await fs.writeFile('artifacts/quote-'+i+'.html',await p.content(),'utf8').catch(()=>{});
    if(i>0)console.log('EXTRA PAGE',i,p.url(),(await p.locator('body').innerText().catch(()=>'' )).slice(0,9500));
  }
}catch(e){console.log('ERROR',String(e?.stack||e));await page.screenshot({path:'artifacts/error.png',fullPage:true}).catch(()=>{});}
await browser.close();