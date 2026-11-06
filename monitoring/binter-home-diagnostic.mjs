import {chromium} from 'playwright';
const url='https://www.bintercanarias.com/es';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({locale:'es-ES',viewport:{width:1440,height:900}});
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForTimeout(3500);
 const text=String(await page.locator('body').innerText().catch(()=>'' ));
 const blocked=/sorry,? you have been blocked|unable to access bintercanarias.com|cloudflare ray id/i.test(text);
 const form=/Buscar vuelos|Origen|Destino|Pasajeros/i.test(text);
 console.log('[binter-home-diagnostic]',JSON.stringify({url:page.url(),httpStatus:response?.status(),blocked,form,excerpt:text.slice(0,1300)}));
 if(blocked)console.log('[binter-home-diagnostic] BLOCKED: GitHub Actions cannot read /es either.');
 else console.log('[binter-home-diagnostic] HOME_ACCESS: homepage accessible; form needs inspecting.');
}finally{await browser.close();}