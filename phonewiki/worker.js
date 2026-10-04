// PhoneWiki API Worker (어드민 화면: pjy-server.github.io/phonewiki/admin.html)
// Secret: ADMIN_PASSWORD, TOKEN_SECRET  |  KV 바인딩: PHONES
// 비밀번호는 코드에 적지 않고 Cloudflare Secret 으로만 저장합니다.

const enc = new TextEncoder();
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
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
    const origin = env.APP_ORIGIN || 'https://pjy-server.github.io';
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-max-age': '86400',
      vary: 'origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let res;
    try {
      res = await handle(req, env, origin);
    } catch (e) {
      console.error(e);
      res = json({ error: '서버 설정 오류예요. KV 연결과 Secret을 확인해 주세요' }, 500);
    }
    const h = new Headers(res.headers);
    for (const k in cors) h.set(k, cors[k]);
    return new Response(res.body, { status: res.status, headers: h });
  },
};

async function handle(req, env, origin) {
  const p = new URL(req.url).pathname;
  const m = req.method;

  // 공개 목록 (도감 페이지가 읽어가는 용도)
  if (p === '/api/phones' && m === 'GET') {
    return new Response((await env.PHONES.get('phones')) || '[]', {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60' },
    });
  }

  // 처음 한 번: 도감 페이지의 seed.json 을 KV 로 불러오기 (목록이 비어 있을 때만)
  if (p === '/api/seed' && m === 'POST') {
    if (!(await authed(req, env))) return json({ error: '로그인이 필요해요' }, 401);
    if (JSON.parse((await env.PHONES.get('phones')) || '[]').length) return json({ error: '이미 기기가 있어서 불러오지 않았어요' }, 409);
    const r = await fetch(origin + '/phonewiki/seed.json');
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
}
