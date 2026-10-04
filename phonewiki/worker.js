// 스마트폰 도감 어드민 Worker
// Secret: ADMIN_PASSWORD, TOKEN_SECRET  |  KV 바인딩: PHONES
// 비밀번호는 코드에 적지 않고 `wrangler secret put` 으로만 저장합니다.

const enc = new TextEncoder();
const H = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...H },
  });

const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

// 길이와 상관없이 같은 시간에 비교 (HMAC 후 XOR)
async function same(secret, a, b) {
  const [x, y] = await Promise.all([sign(secret, a), sign(secret, b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

async function authed(req, env) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const [exp, sig] = t.split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  return same(env.TOKEN_SECRET, sig, await sign(env.TOKEN_SECRET, exp));
}

const KEYS = ['brand', 'cat', 'name', 'date', 'camera', 'weight', 'size', 'display', 'chip'];
function clean(b) {
  if (!b || typeof b !== 'object') return null;
  const o = {};
  for (const k of KEYS) o[k] = String(b[k] ?? '').trim().slice(0, 120);
  if (!['S', 'A'].includes(o.brand) || !['p', 't', 'o'].includes(o.cat)) return null;
  if (!o.name || !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(o.date)) return null;
  o.weight = Number(b.weight);
  if (!(o.weight >= 0 && o.weight < 10000)) return null;
  return o;
}

export default {
  async fetch(req, env) {
    const p = new URL(req.url).pathname;
    const m = req.method;

    if (p === '/admin' && m === 'GET') {
      const n = crypto.randomUUID();
      return new Response(page(n), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy':
            "default-src 'none'; script-src 'nonce-" + n + "'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          'cache-control': 'no-store',
          ...H,
        },
      });
    }

    // 공개 목록 (도감 페이지가 읽어가는 용도)
    if (p === '/api/phones' && m === 'GET') {
      const d = await env.PHONES.get('phones');
      return new Response(d || '[]', {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'access-control-allow-origin': env.APP_ORIGIN || 'https://pjy-server.github.io',
          'cache-control': 'public, max-age=60',
          ...H,
        },
      });
    }

    // 처음 한 번: 도감 페이지의 seed.json 을 KV 로 불러오기 (목록이 비어 있을 때만)
    if (p === '/api/seed' && m === 'POST') {
      if (!(await authed(req, env))) return json({ error: '로그인이 필요해요' }, 401);
      if (JSON.parse((await env.PHONES.get('phones')) || '[]').length) return json({ error: '이미 기기가 있어서 불러오지 않았어요' }, 409);
      const r = await fetch((env.APP_ORIGIN || 'https://pjy-server.github.io') + '/phonewiki/seed.json');
      if (!r.ok) return json({ error: '기본 데이터를 가져오지 못했어요' }, 502);
      const items = (await r.json()).map(clean).filter(Boolean).map((o) => ({ ...o, id: crypto.randomUUID() }));
      await env.PHONES.put('phones', JSON.stringify(items));
      return json({ ok: true, count: items.length });
    }

    if (p === '/api/login' && m === 'POST') {
      const k = 'rl:' + (req.headers.get('cf-connecting-ip') || 'x');
      const n = Number((await env.PHONES.get(k)) || 0);
      if (n >= 5) return json({ error: '시도가 너무 많아요. 10분 뒤에 다시 해 주세요' }, 429);
      const b = await req.json().catch(() => ({}));
      if (typeof b.password === 'string' && (await same(env.TOKEN_SECRET, b.password, env.ADMIN_PASSWORD))) {
        await env.PHONES.delete(k);
        const exp = String(Date.now() + 12 * 3600e3);
        return json({ token: exp + '.' + (await sign(env.TOKEN_SECRET, exp)) });
      }
      await env.PHONES.put(k, String(n + 1), { expirationTtl: 600 });
      return json({ error: '비밀번호가 맞지 않아요' }, 401);
    }

    if (p.startsWith('/api/phones') && m !== 'GET') {
      if (!(await authed(req, env))) return json({ error: '로그인이 필요해요' }, 401);
      const id = p.split('/')[3];
      const list = JSON.parse((await env.PHONES.get('phones')) || '[]');
      if (m === 'POST' && !id) {
        const o = clean(await req.json().catch(() => null));
        if (!o) return json({ error: '입력값을 확인해 주세요 (이름, 출시일 YYYY-MM-DD, 무게)' }, 400);
        o.id = crypto.randomUUID();
        list.push(o);
        await env.PHONES.put('phones', JSON.stringify(list));
        return json(o, 201);
      }
      const i = list.findIndex((x) => x.id === id);
      if (i < 0) return json({ error: '기기를 찾을 수 없어요' }, 404);
      if (m === 'PUT') {
        const o = clean(await req.json().catch(() => null));
        if (!o) return json({ error: '입력값을 확인해 주세요 (이름, 출시일 YYYY-MM-DD, 무게)' }, 400);
        o.id = id;
        list[i] = o;
      } else if (m === 'DELETE') list.splice(i, 1);
      else return json({ error: '지원하지 않는 요청이에요' }, 405);
      await env.PHONES.put('phones', JSON.stringify(list));
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  },
};

function page(n) {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>도감 어드민</title>
<style>
body{margin:0;font-family:-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;background:#f5f6f8;color:#1b1f27}
.w{max-width:640px;margin:0 auto;padding:18px 14px}
input,select{display:block;width:100%;margin:0 0 8px;padding:11px;border:1px solid #cfd4dc;border-radius:9px;font-size:15px}
button{padding:9px 14px;margin:0 6px 6px 0;border:0;border-radius:9px;background:#2563eb;color:#fff;font-size:14px;cursor:pointer}
table{width:100%;border-collapse:collapse;background:#fff}td{padding:9px;border-bottom:1px solid #e3e6ec;font-size:14px}
#msg{color:#047857;min-height:20px}
</style></head><body><div class="w">
<h1>도감 어드민</h1>
<div id="lg"><input id="pw" type="password" placeholder="비밀번호" autocomplete="current-password"><button id="in">로그인</button></div>
<div id="ap" style="display:none"><button id="out">로그아웃</button><button id="sd">기본 데이터 불러오기</button><div id="fm" style="margin-top:10px"></div><p id="msg"></p><table id="tb"></table></div>
</div>
<script nonce="${n}">
const $=i=>document.getElementById(i);
const F=[['name','이름'],['date','출시일 (YYYY-MM-DD)'],['camera','카메라'],['weight','무게 (g)'],['size','크기 (mm)'],['display','화면'],['chip','칩']];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let T=sessionStorage.getItem('t')||'',L=[],E='';
$('fm').innerHTML='<select id="f_brand"><option value="S">갤럭시</option><option value="A">아이폰·애플</option></select><select id="f_cat"><option value="p">폰</option><option value="t">태블릿</option><option value="o">웨어러블·기타</option></select>'+F.map(f=>'<input id="f_'+f[0]+'" placeholder="'+f[1]+'">').join('')+'<button id="sv">저장</button><button id="nw">새로 작성</button>';
const say=t=>{$('msg').textContent=t};
const reset=()=>{E='';F.forEach(f=>$('f_'+f[0]).value='')};
function show(){const ok=!!T;$('lg').style.display=ok?'none':'block';$('ap').style.display=ok?'block':'none';if(ok)load()}
async function api(p,m,b){
  const r=await fetch(p,{method:m||'GET',headers:{'content-type':'application/json',authorization:'Bearer '+T},body:b?JSON.stringify(b):undefined});
  const d=await r.json().catch(()=>({}));
  if(r.status===401&&p!=='/api/login'){T='';sessionStorage.removeItem('t');show()}
  if(!r.ok)throw new Error(d.error||'요청에 실패했어요');
  return d}
async function load(){try{L=await api('/api/phones');draw()}catch(e){say(e.message)}}
function draw(){$('tb').innerHTML=L.map(x=>'<tr><td>'+esc(x.name)+'<br><small>'+esc(x.date)+'</small></td><td><button data-e="'+esc(x.id)+'">수정</button><button data-d="'+esc(x.id)+'">삭제</button></td></tr>').join('')||'<tr><td>등록된 기기가 없어요. 위 양식으로 추가해 보세요.</td></tr>'}
$('tb').onclick=async e=>{const d=e.target.dataset;
  if(d.e){const x=L.find(y=>y.id===d.e);E=x.id;$('f_brand').value=x.brand;$('f_cat').value=x.cat;F.forEach(f=>$('f_'+f[0]).value=x[f[0]]);say('"'+x.name+'" 수정 중이에요')}
  if(d.d&&confirm('삭제할까요?')){try{await api('/api/phones/'+d.d,'DELETE');say('삭제했어요');await load()}catch(er){say(er.message)}}};
$('sv').onclick=async()=>{const b={brand:$('f_brand').value,cat:$('f_cat').value};F.forEach(f=>b[f[0]]=$('f_'+f[0]).value);
  try{await api(E?'/api/phones/'+E:'/api/phones',E?'PUT':'POST',b);say(E?'수정했어요':'추가했어요');reset();await load()}catch(er){say(er.message)}};
$('nw').onclick=()=>{reset();say('')};
$('in').onclick=async()=>{try{const d=await api('/api/login','POST',{password:$('pw').value});T=d.token;sessionStorage.setItem('t',T);$('pw').value='';show()}catch(er){alert(er.message)}};
$('sd').onclick=async()=>{try{const d=await api('/api/seed','POST');say(d.count+'개를 불러왔어요');await load()}catch(er){say(er.message)}};
$('out').onclick=()=>{T='';sessionStorage.removeItem('t');show()};
show();
</script></body></html>`;
}
