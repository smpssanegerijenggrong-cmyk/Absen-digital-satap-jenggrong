import QRCode from 'qrcode';

export type CardStudent={name:string;nis:string;nisn?:string;gender?:string;className:string;token:string};
export const escapeXML=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
function nameLines(name:string){
 const words=name.trim().split(/\s+/);const lines:string[]=[''];
 for(const word of words){const i=lines.length-1;if(lines[i]&&lines[i].length+word.length+1>27&&lines.length<3)lines.push(word);else lines[i]+=(lines[i]?' ':'')+word;}
 return lines;
}
export async function createCardSVG(student:CardStudent,side:'front'|'back',artwork:string,logo?:string){
 const x=side==='front'?77:809;
 const schoolLogo=logo?(side==='front'?`<rect x="8" y="22" width="207" height="249" rx="14" fill="#063967"/><image href="${escapeXML(logo)}" x="19" y="31" width="183" height="228" preserveAspectRatio="xMidYMid meet"/>`:`<rect x="112" y="741" width="135" height="150" rx="6" fill="#fafafa"/><image href="${escapeXML(logo)}" x="119" y="745" width="120" height="143" preserveAspectRatio="xMidYMid meet"/>`):'';
 const base=`<svg xmlns="http://www.w3.org/2000/svg" width="540" height="856" viewBox="0 0 654 986" preserveAspectRatio="none"><defs><clipPath id="card-edge"><rect width="654" height="986" rx="37"/></clipPath></defs><g clip-path="url(#card-edge)"><image href="${escapeXML(artwork)}" x="-${x}" y="-11" width="1536" height="1024"/>${schoolLogo}`;
 if(side==='front'){
  const lines=nameLines(student.name);
  const name=lines.map((line,i)=>`<text x="327" y="${671+i*25}" text-anchor="middle" font-family="Arial,sans-serif" font-size="23" font-weight="700" fill="#082657"${line.length>30?' textLength="440" lengthAdjust="spacingAndGlyphs"':''}>${escapeXML(line)}</text>`).join('');
  const details=[`NIPD: ${student.nis}`,`NISN: ${student.nisn||'—'}`,`Kelas: ${student.className}  ·  ${student.gender==='L'?'Laki-laki':student.gender==='P'?'Perempuan':'Jenis kelamin belum diisi'}`];
  return base+`<rect x="102" y="649" width="450" height="165" rx="5" fill="#fafafa"/>${name}${details.map((line,i)=>`<text x="327" y="${743+i*27}" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="#10243e"${line.length>36?' textLength="430" lengthAdjust="spacingAndGlyphs"':''}>${escapeXML(line)}</text>`).join('')}</g></svg>`;
 }
 // Replace the entire reference QR, including its quiet zone, with the student's token.
 const qr=await QRCode.toString('SANJARA:'+student.token,{type:'svg',margin:4,errorCorrectionLevel:'M',color:{dark:'#000000',light:'#ffffff'}});
 const positionedQR=qr.replace('<svg ', '<svg x="125" y="235" width="410" height="410" ');
 const identifier=student.nisn?`NISN: ${student.nisn}`:`NIPD: ${student.nis}`;
 return base+`<rect x="124" y="234" width="412" height="412" fill="white"/>${positionedQR}<rect x="156" y="674" width="358" height="53" fill="#fafafa"/><text x="327" y="710" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="#081d40"${identifier.length>24?' textLength="345" lengthAdjust="spacingAndGlyphs"':''}>${escapeXML(identifier)}</text></g></svg>`;
}
