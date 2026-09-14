(function(root){
const clean=v=>String(v??'').normalize('NFKC').trim();
const compact=v=>clean(v).replace(/\s+/g,'');
const unit=v=>clean(v).replace(/[동호]/g,'').replace(/^0+(?=\d)/,'').replace(/\.0$/,'');
const money=v=>Number(clean(v).replace(/,/g,''))||0;
const date=v=>{ if(typeof v==='number'){const d=new Date(Math.round((v-25569)*86400000));return d.toISOString().slice(0,10)}const m=clean(v).match(/(20\d{2})\D?(\d{1,2})\D?(\d{1,2})/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:'';};
const names=['헬스 1개월','스크린타석 1개월','골프 기본 1개월','5회 무료 중복'];
function category(v){const s=compact(v);return s==='헬스▶1개월'?'health':s==='골프▶스크린타석▶1개월'?'screen':s==='골프▶기본▶1개월'?'golf':s==='헬스▶세대당5회무료▶1개월'?'free':/^헬스▶(?:5회권|5회)(?:▶.*)?$/.test(s)?'five':'';}
function parseGrid(grid){
 const hi=grid.findIndex(r=>r.some(v=>compact(v)==='회원명')&&r.some(v=>compact(v)==='등록명'));
 if(hi<0)throw Error('회원명·등록명 머리글을 찾지 못했어요. 매출 거래 내역 파일인지 확인해 주세요.');
 const head=grid[hi].map(compact); const ix=n=>head.indexOf(n);
 for(const n of ['동','호수','회원명','등록명','거래종류','수강시작일'])if(ix(n)<0)throw Error(`필수 열이 없어요: ${n}`);
 const rows=[];let skipped=0;
 for(let i=hi+1;i<grid.length;i++){const a=grid[i];const get=n=>a[ix(n)];const fallbackProduct=lockerTitle({subCategory:get('수강소분류'),majorCategory:get('수강대분류')});if((!clean(get('등록명'))&&!fallbackProduct)||/합\s*계/.test(clean(get('등록명')))){skipped++;continue;}
  rows.push({line:i+1,dong:unit(get('동')),ho:unit(get('호수')),name:clean(get('회원명')),member:clean(get('회원번호')),product:clean(get('등록명'))||fallbackProduct,subCategory:clean(get('수강소분류')),majorCategory:clean(get('수강대분류')),transactionDate:date(get('거래일시')), type:clean(get('거래종류')),status:clean(get('거래구분')),start:date(get('수강시작일')),end:date(get('수강종료일')),receipt:clean(get('영수증번호')),original:clean(get('원거래번호')),serial:clean(get('일련번호')),amount:ix('실매출액')>=0?[0,1,2].reduce((n,k)=>n+money(a[ix('실매출액')+k]),0):0});
 }if(!rows.length)throw Error('집계할 거래 내역이 없어요.');return {rows,skipped};
}
function analyze(rows,opt={}){
 const month=opt.month||'',excludeTest=opt.excludeTest!==false;
 const stats={raw:rows.length,test:0,refunds:0,cancel:0,voided:0,unknown:0,missing:0,dedup:0,selected:0};
 // Refunds are linked across the entire file, before applying the start-month filter.
 const refunds=rows.filter(r=>r.type==='환불');const sales=rows.filter(r=>r.type==='매출');const refunded=new Set(),review=[];
 for(const r of refunds){let match=sales.filter(s=>r.original&&s.receipt===r.original&&s.product===r.product&&(!r.member||s.member===r.member));
  if(match.length===1){const s=match[0];const total=refunds.filter(q=>q.original===s.receipt&&q.product===s.product&&(!q.member||q.member===s.member)).reduce((n,q)=>n+Math.abs(q.amount),0);if(s.amount>0&&total>=s.amount)refunded.add(s);else review.push({...r,reason:'부분 환불 또는 금액 확인 필요 · 원등록 유지'});}
  else review.push({...r,reason:'환불 원등록 연결 불가 · 확인 필요'});
 }
 const maps={health:new Map(),screen:new Map(),golf:new Map(),free:new Map(),five:new Map()};const unknown=new Map();const missing=[];
 for(const r of rows){if(month&&r.start.slice(0,7)!==month)continue;
 if(excludeTest&&['999','9999'].includes(r.dong)){stats.test++;continue;}
 if(r.type==='환불'){stats.refunds++;continue;}if(r.type!=='매출'||/취소/.test(r.status)){stats.cancel++;continue;}
 if(refunded.has(r)){stats.voided++;continue;}
 const c=category(r.product);if(!c){stats.unknown++;unknown.set(r.product,(unknown.get(r.product)||0)+1);continue;}
 if(!r.dong||!r.ho||!r.name||!r.start){stats.missing++;missing.push({...r,reason:'동·호수·회원명·수강시작일 확인 필요'});continue;}
 stats.selected++;const key=r.dong+'|'+r.ho;const id=r.member?'id:'+r.member:'name:'+compact(r.name);const m=maps[c];if(!m.has(key))m.set(key,{key,dong:r.dong,ho:r.ho,members:new Map()});const h=m.get(key);
 if(h.members.has(id)){stats.dedup++;h.members.get(id).registrations.push(r);}else h.members.set(id,{id,name:r.name,member:r.member,registrations:[r]});
 }
 const sort=(a,b)=>Number(a.dong)-Number(b.dong)||Number(a.ho)-Number(b.ho)||a.key.localeCompare(b.key);
 const groups={};for(const c of ['health','screen','golf','five'])groups[c]=[...maps[c].values()].map(h=>({...h,members:[...h.members.values()],count:h.members.size})).sort(sort);
 groups.free=[...maps.free.values()].map(h=>({...h,
 members:[...h.members.values()].map(m=>({...m,role:'5회 무료'})),
 count:h.members.size,freeDuplicate:h.members.size>=2
 })).sort(sort);
 return {sourceRows:rows,options:opt,groups,stats,unknown:[...unknown].map(([product,count])=>({product,count})),review:review.filter(r=>(!month||r.start.slice(0,7)===month)&&(!excludeTest||!['999','9999'].includes(r.dong))).concat(missing),months:[...new Set(rows.map(r=>r.start.slice(0,7)).filter(Boolean))].sort().reverse()};
}
const householdRates={health:{2:22000,3:30000,4:38000},screen:{2:30000,3:38000,4:46000},golf:{2:22000,3:30000,4:38000}};
function householdFee(category,count){return householdRates[category]?.[count]??null;}
function billingRows(result){return ['health','screen','golf'].flatMap((category,i)=>result.groups[category].filter(h=>h.count>=2).map(h=>({category,facility:names[i],dong:h.dong,ho:h.ho,count:h.count,members:h.members.map(m=>m.name),amount:householdFee(category,h.count)}))).sort((a,b)=>Number(a.dong)-Number(b.dong)||Number(a.ho)-Number(b.ho)||a.facility.localeCompare(b.facility,'ko'));}
function baseBillingGroups(result){
 const map=new Map();
 for(const r of billingRows(result)){const key=r.dong+'|'+r.ho;if(!map.has(key))map.set(key,{dong:r.dong,ho:r.ho,rows:[],knownTotal:0,unknownCount:0,total:null});const g=map.get(key);g.rows.push(r);if(r.amount===null)g.unknownCount++;else g.knownTotal+=r.amount;}
 return [...map.values()].map(g=>({...g,total:g.unknownCount?null:g.knownTotal}));
}
const lockerNames=new Set(['골프락커','헬스락커(남자)','헬스락커(여자)','헬스신발장(남자)','헬스신발장(여자)']);
function lockerTitle(r){
 const matches=new Set();
 for(const value of [r.product,r.subCategory,r.majorCategory]){
  const s=compact(value);if(lockerNames.has(s))matches.add(s);
  for(const part of s.split(/[▶>]/))if(lockerNames.has(part))matches.add(part);
 }
 return matches.size===1?[...matches][0]:'';
}
function billingGroups(result){
 const groups=baseBillingGroups(result),raw=result.sourceRows||[],opt=result.options||{},month=opt.month||'';
 const homes=new Map(groups.map(g=>[g.dong+'|'+g.ho,g]));
 const audit={matched:0,included:0,tradeFallback:0,issues:[]};
 const candidates=raw.filter(r=>lockerTitle(r));
 const sales=candidates.filter(r=>r.type==='매출'&&!/취소/.test(r.status));
 const buckets=new Map();
 function issue(r,reason){audit.issues.push({dong:r.dong,ho:r.ho,name:r.name,product:r.product,reason});}
 for(const r of raw){
  const title=lockerTitle(r);
  if(!title){if([r.product,r.subCategory,r.majorCategory].some(s=>/락커|락카|신발장/.test(s||'')))issue(r,'지정된 5개 명칭과 일치하지 않거나 분류가 서로 다름');continue;}
  audit.matched++;
  if(!homes.has(r.dong+'|'+r.ho)){issue(r,'선택월의 다인원 부과 대상 동호수가 아님');continue;}
  if(/취소/.test(r.status)||!['매출','환불'].includes(r.type)){issue(r,'취소 또는 매출·환불 이외 거래');continue;}
  let anchor=r;
  if(r.type==='환불'&&r.original){
   const linked=sales.filter(s=>s.receipt===r.original&&lockerTitle(s)===title&&s.dong===r.dong&&s.ho===r.ho&&(!r.member||r.member===s.member));
   if(linked.length===1)anchor=linked[0];
   else {issue(r,'환불 원매출 연결 불가: 자동 합산에서 제외');continue;}
  }
  const fallback=!anchor.start&&opt.lockerTradeFallback;
  const period=anchor.start||(fallback?anchor.transactionDate:'');
  if(!period){issue(r,'수강시작일 없음'+(anchor.transactionDate?' (거래월 대체 옵션을 켜면 집계 가능)':' · 거래일도 없음'));continue;}
  if(month&&period.slice(0,7)!==month){issue(r,'선택월과 집계월이 다름: '+period.slice(0,7));continue;}
  if(r.amount===null||!Number.isFinite(r.amount)){issue(r,'실매출액 금액을 확인할 수 없음');continue;}
  const key=r.dong+'|'+r.ho+'|'+title;
  if(!buckets.has(key))buckets.set(key,{home:homes.get(r.dong+'|'+r.ho),title,amount:0,members:new Map(),refund:false});
  const b=buckets.get(key);b.amount+=r.type==='환불'?-Math.abs(r.amount):r.amount;b.refund||=r.type==='환불';
  if(r.name)b.members.set(r.member||r.name,r.name);
  audit.included++;if(fallback)audit.tradeFallback++;
 }
 for(const b of buckets.values()){
  if(b.refund&&Math.abs(b.amount)<0.000001)continue;
  b.home.rows.push({category:'locker',facility:b.title,dong:b.home.dong,ho:b.home.ho,count:b.members.size,members:[...b.members.values()],amount:b.amount});
  b.home.knownTotal+=b.amount;
 }
 for(const g of groups)g.total=g.unknownCount?null:g.knownTotal;
 groups.lockerAudit=audit;return groups;
}

const api={lockerTitle,billingGroups,billingRows,parseGrid,analyze,category,names,householdFee};if(typeof module!=='undefined')module.exports=api;root.HouseholdCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
