import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'es-ES'});
const urls = ['https://www.hoteldunasclub.es/reservar.html','https://www.hoteldunasclub.es/'];
await fs.mkdir('artifacts',{recursive:true});
for(const [i,url] of urls.entries()){
  try {
    const network=[];
    page.on('response',r=>{const u=r.url(); if(/booking|keytel|hotel|availab|reserve|reserva/i.test(u) && network.length<100) network.push({status:r.status(),url:u.slice(0,350)});});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
    await page.waitForTimeout(5000);
    let elements=await page.locator('input,select,button,iframe,form,a[href*="reser"]').evaluateAll(nodes=>nodes.slice(0,90).map(n=>({tag:n.tagName,outer:n.outerHTML.slice(0,350)}))).catch(()=>[]);
    console.log('PAGE',i,JSON.stringify({url:page.url(),frames:page.frames().map(f=>f.url()).slice(0,25),elements,body:(await page.locator('body').innerText().catch(()=>'' )).slice(0,2200),network:network.slice(-75)},null,2));
    await page.screenshot({path:'artifacts/dunas-'+i+'.png',fullPage:true}).catch(()=>{});
    await fs.writeFile('artifacts/dunas-'+i+'.html',await page.content(),'utf8').catch(()=>{});
    const reserve=page.getByRole('link',{name:/reservar|buscar disponibilidad/i}).first();
    if(await reserve.isVisible().catch(()=>false)){
      await reserve.click({timeout:5000}).catch(()=>{});
      await page.waitForTimeout(5500);
      console.log('AFTER RESERVAR',JSON.stringify({url:page.url(),frames:page.frames().map(f=>f.url()),elements:await page.locator('input,select,button,iframe').evaluateAll(nodes=>nodes.slice(0,80).map(n=>({tag:n.tagName,outer:n.outerHTML.slice(0,400)}))).catch(()=>[]),body:(await page.locator('body').innerText().catch(()=>'' )).slice(0,4500)},null,2));
      await page.screenshot({path:'artifacts/dunas-reservar-'+i+'.png',fullPage:true}).catch(()=>{});
    }
  }catch(e){ console.log('ERROR PAGE',i,String(e?.message||e));}
}
await browser.close();
