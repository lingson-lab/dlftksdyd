(function(root){
function build(X,groups,month,excludeTest){
 const total=groups.reduce((n,g)=>n+g.knownTotal,0),unknown=groups.reduce((n,g)=>n+g.unknownCount,0);
 const data=[['동호수별 부과금액'],['수강시작월',month,'999·9999동',excludeTest?'제외':'포함'],[],['동호수','시설 / 이용권','회원명','등록 인원','시설별 부과금액','G.TOTAL (세대 총 부과금액)']];
 const merges=[];
 for(const g of groups){const start=data.length;g.rows.forEach((r,i)=>data.push([`${r.dong}동 ${r.ho}호`,r.facility,r.members.join(' · '),r.count,r.amount===null?'요금 확인 필요':r.amount,i===0?(g.total===null?'요금 확인 필요':g.total):null]));if(g.rows.length>1)merges.push({s:{r:start,c:5},e:{r:data.length-1,c:5}});}
 const last=data.length;
 data.push(['요금 확정 합계','','','','',total],[],['락커 집계',groups.lockerAudit?.tradeFallback?'수강시작일 없는 락커 '+groups.lockerAudit.tradeFallback+'건을 거래월로 대체':'수강시작월 기준'],['요금 확인 필요',`${unknown}건 / 미확정 요금은 합계 제외`],['계산 기준','G.TOTAL은 같은 동호수의 시설별 요금 합계. 미확정 요금이 있으면 세대 총액도 확인 필요.'],['참고','등록 인원별 적용요금이며 RAW 실제 결제금액 합계가 아닙니다.']);
 const ws=X.utils.aoa_to_sheet(data);ws['!cols']=[{wch:20},{wch:24},{wch:48},{wch:12},{wch:22},{wch:30}];ws['!merges']=merges;
 if(last>4)ws['!autofilter']={ref:`A4:E${last}`};
 for(let row=5;row<=last+1;row++)for(const col of ['E','F'])if(ws[col+row]?.t==='n')ws[col+row].z='#,##0"원"';
 const book=X.utils.book_new();X.utils.book_append_sheet(book,ws,'동호수별 부과금액');return book;
}
const api={build};root.BillingExport=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
