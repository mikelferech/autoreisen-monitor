import {acceptCookies,daysBetween,isoNow,money,selectOptionContaining,snapshot,waitNetwork} from './lib.mjs';

function dateParts(value){
  const date=new Date(value);
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return {
    day:String(date.getDate()).padStart(2,'0'),
    monthYear:`${months[date.getMonth()]}-${date.getFullYear()}`,
    time:`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
  };
}

async function waitForVerification(page){
  for(let i=0;i<12;i++){
    const text=(await page.locator('body').innerText().catch(()=>''));
    if(!/please wait|verifying|un momento|request is being verified/i.test(text))return;
    await page.waitForTimeout(2500);
  }
}

async function submitSearchForm(page,config){
  const form=page.locator('form[action*="tarifas-flota.php" i]').first();
  await form.waitFor({state:'visible',timeout:30000});
  let selects=form.locator('select');
  const count=await selects.count();
  if(count<8)throw new Error(`AutoReisen: el formulario tiene ${count} desplegables; se esperaban al menos 8.`);

  const pickup=dateParts(config.pickupAt);
  const dropoff=dateParts(config.dropoffAt);

  await selectOptionContaining(selects.nth(0),config.pickup);
  await page.waitForTimeout(1000);

  // La web puede reconstruir el formulario después de elegir oficina.
  const currentForm=page.locator('form[action*="tarifas-flota.php" i]').first();
  selects=currentForm.locator('select');
  await selectOptionContaining(selects.nth(1),'Misma Oficina');
  await page.waitForTimeout(600);

  await selectOptionContaining(selects.nth(2),pickup.day);
  await selectOptionContaining(selects.nth(3),pickup.monthYear);
  await selectOptionContaining(selects.nth(4),pickup.time);
  await selectOptionContaining(selects.nth(5),dropoff.day);
  await selectOptionContaining(selects.nth(6),dropoff.monthYear);
  await selectOptionContaining(selects.nth(7),dropoff.time);

  await snapshot(page,'autoreisen-formulario-completado');
  await currentForm.evaluate(formElement=>formElement.submit());
  await page.waitForTimeout(5000);

  // Algunas variantes muestran un paso intermedio con “Continuar”.
  const continueButton=page.getByRole('button',{name:/continuar/i}).first();
  const continueLink=page.getByRole('link',{name:/continuar/i}).first();
  if(await continueButton.isVisible().catch(()=>false))await continueButton.click({force:true}).catch(()=>{});
  else if(await continueLink.isVisible().catch(()=>false))await continueLink.click({force:true}).catch(()=>{});

  await page.waitForTimeout(5000);
  await waitNetwork(page);
}

function extractVehiclePrice(text,config){
  const lines=String(text).split(/\n+/).map(line=>line.trim()).filter(Boolean);
  const pattern=new RegExp(`(?:grupo\\s*)?${config.group}\\s*[-–:]?\\s*${config.model}|${config.model}`,'i');
  const index=lines.findIndex(line=>pattern.test(line));
  if(index<0)return null;

  const context=lines.slice(Math.max(0,index-3),index+14).join(' ');
  const prices=money(context).filter(value=>value>=30&&value<=1000);
  const preferred=prices.filter(value=>value>=100&&value<=300);
  const total=(preferred.length?Math.min(...preferred):prices[0])||0;
  if(!total)return null;
  return {total,context};
}

export async function monitorAutoReisen(browser,config){
  const context=await browser.newContext({
    locale:'es-ES',
    timezoneId:'Atlantic/Canary',
    viewport:{width:1440,height:1100},
    userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
  });
  const page=await context.newPage();
  try{
    await page.goto(process.env.AUTOREISEN_SEARCH_URL||config.searchUrl,{waitUntil:'domcontentloaded',timeout:90000});
    await waitForVerification(page);
    await acceptCookies(page);
    await waitNetwork(page);
    await snapshot(page,'autoreisen-inicio');

    let text=await page.locator('body').innerText();
    let result=extractVehiclePrice(text,config);
    if(!result){
      await submitSearchForm(page,config);
      text=await page.locator('body').innerText();
      result=extractVehiclePrice(text,config);
    }

    await snapshot(page,'autoreisen-resultados');
    if(!result)throw new Error(`No se encontró el precio del grupo ${config.group} / ${config.model}. El formulario sí se ejecutó; revisa autoreisen-resultados.png y .html.`);

    const days=daysBetween(config.pickupAt,config.dropoffAt);
    return {
      source:'AutoReisen web · GitHub Actions + Playwright',
      checkedAt:isoNow(),
      price:result.total,
      total:result.total,
      pricePerDay:result.total/days,
      availability:/no disponible|agotado|sold out/i.test(result.context)?'No disponible':'Disponible',
      group:config.group,
      model:config.model,
      pickupAt:config.pickupAt,
      dropoffAt:config.dropoffAt
    };
  }finally{
    await context.close();
  }
}
