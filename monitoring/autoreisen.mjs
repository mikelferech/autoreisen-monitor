import {acceptCookies,clickFirst,daysBetween,fillFirst,isoNow,money,snapshot,waitNetwork} from './lib.mjs';

function dateParts(value){const d=new Date(value);return {date:value.slice(0,10),day:String(d.getDate()).padStart(2,'0'),month:String(d.getMonth()+1).padStart(2,'0'),year:String(d.getFullYear()),hour:String(d.getHours()).padStart(2,'0'),minute:String(d.getMinutes()).padStart(2,'0')};}
async function fillAutoReisenForm(page,cfg){
  const pick=dateParts(cfg.pickupAt),drop=dateParts(cfg.dropoffAt);
  await fillFirst(page,[page.getByLabel(/recogida|pickup/i).first(),'input[name*="pickup" i]'],cfg.pickup);
  await fillFirst(page,[page.getByLabel(/devolución|devolucion|drop.?off|return/i).first(),'input[name*="drop" i],input[name*="return" i]'],cfg.dropoff);
  const dateInputs=page.locator('input[type="date"]');if(await dateInputs.count()>=2){await dateInputs.nth(0).fill(pick.date).catch(()=>{});await dateInputs.nth(1).fill(drop.date).catch(()=>{});}
  await fillFirst(page,['input[name*="pickupDate" i],input[id*="pickupDate" i]'],pick.date);
  await fillFirst(page,['input[name*="returnDate" i],input[id*="returnDate" i],input[name*="dropoffDate" i]'],drop.date);
  const timeInputs=page.locator('input[type="time"]');if(await timeInputs.count()>=2){await timeInputs.nth(0).fill(`${pick.hour}:${pick.minute}`).catch(()=>{});await timeInputs.nth(1).fill(`${drop.hour}:${drop.minute}`).catch(()=>{});}
  await clickFirst(page,[page.getByRole('button',{name:/buscar|consultar|ver precios|continuar|new quote/i}).first(),page.locator('button[type="submit"],input[type="submit"]').first()]);
}
export async function monitorAutoReisen(browser,config){
  const context=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1440,height:1100}});const page=await context.newPage();
  try{
    await page.goto(process.env.AUTOREISEN_SEARCH_URL||config.searchUrl,{waitUntil:'domcontentloaded',timeout:90000});await acceptCookies(page);await waitNetwork(page);
    if(await page.getByText(/please wait|verifying|un momento/i).first().isVisible().catch(()=>false)){await page.waitForTimeout(12000);}
    let text=await page.locator('body').innerText();
    if(!new RegExp(`grupo\\s*${config.group}|${config.model}`,'i').test(text)){await fillAutoReisenForm(page,config);await page.waitForTimeout(7000);await waitNetwork(page);text=await page.locator('body').innerText();}
    await snapshot(page,'autoreisen-resultados');
    const lines=text.split(/\n+/).map(x=>x.trim()).filter(Boolean);let index=lines.findIndex(x=>new RegExp(`grupo\\s*${config.group}\\b|${config.model}`,'i').test(x));
    const relevant=(index>=0?lines.slice(Math.max(0,index-4),index+24):lines).join(' ');const prices=money(relevant);
    const total=prices.find(v=>v>30)||0;if(!total)throw new Error(`No se encontró el precio del grupo ${config.group} / ${config.model}. Revisa la captura de la ejecución.`);
    const days=daysBetween(config.pickupAt,config.dropoffAt);
    return {source:'AutoReisen web · GitHub Actions + Playwright',checkedAt:isoNow(),price:total,total,pricePerDay:total/days,availability:/no disponible|agotado|sold out/i.test(relevant)?'No disponible':'Disponible',group:config.group,model:config.model,pickupAt:config.pickupAt,dropoffAt:config.dropoffAt};
  }finally{await context.close();}
}
