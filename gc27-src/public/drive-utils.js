export function driveUploadFileName(originalName='',requestedName='',fallbackDate=''){
  const original=String(originalName||'').trim();
  const date=fallbackDate||new Date().toISOString().slice(0,10);
  let name=String(requestedName||original||`ticket-${date}`).trim();
  if(!name)name=`ticket-${date}`;
  const originalExt=(original.match(/(\.[^./\\]{1,12})$/)||[])[1]||'';
  const requestedHasExt=/\.[^./\\]{1,12}$/.test(name);
  if(originalExt&&!requestedHasExt)name+=originalExt;
  return name;
}

export function buildDriveUploadMetadata({originalName='',requestedName='',mimeType='application/octet-stream',parentId='root',fallbackDate=''}={}){
  const metadata={
    name:driveUploadFileName(originalName,requestedName,fallbackDate),
    mimeType:mimeType||'application/octet-stream'
  };
  if(parentId)metadata.parents=[parentId];
  return metadata;
}
