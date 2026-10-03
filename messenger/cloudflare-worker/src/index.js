const ALLOWED_ORIGINS = new Set(["https://pjy-server.github.io","http://localhost:8788","http://127.0.0.1:8788"]);
const SESSION_DAYS = 30;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function json(data,status=200,headers={}) { return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8",...headers}}); }
function fail(message,status=400) { return json({error:message},status); }
function cors(request) {
  const origin=request.headers.get("Origin")||"";
  const h=new Headers({"Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization","Access-Control-Max-Age":"86400","Vary":"Origin"});
  if(ALLOWED_ORIGINS.has(origin)) h.set("Access-Control-Allow-Origin",origin);
  return h;
}
function withCors(response,headers) { const out=new Response(response.body,response); headers.forEach((v,k)=>out.headers.set(k,v)); return out; }
async function readJson(request) { try{return await request.json()}catch{return null} }
function randomToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join(""); }
async function sha256(value) { const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)); return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join(""); }
async function passwordHash(password,saltHex) {
  const salt=saltHex?Uint8Array.from(saltHex.match(/.{2}/g),x=>parseInt(x,16)):crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:100000,hash:"SHA-256"},key,256);
  const hex=v=>Array.from(new Uint8Array(v),b=>b.toString(16).padStart(2,"0")).join("");
  return {salt:hex(salt),hash:hex(bits)};
}
function usernameOk(n) { return /^[a-zA-Z0-9_]{3,20}$/.test(n); }
function cleanUser(r) { return {id:r.id,username:r.username,display_name:r.display_name,status:r.status,last_seen:r.last_seen,is_admin:!!r.is_admin,created_at:r.created_at}; }
async function requireUser(request,env) {
  const a=request.headers.get("Authorization")||"", token=a.startsWith("Bearer ")?a.slice(7).trim():"";
  if(!token)return null;
  const r=await env.DB.prepare("SELECT u.id,u.username,u.display_name,u.status,u.last_seen,u.is_admin,u.created_at,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?").bind(await sha256(token)).first();
  if(!r||r.expires_at<=new Date().toISOString())return null;
  await env.DB.prepare("UPDATE users SET status='online',last_seen=? WHERE id=?").bind(new Date().toISOString(),r.id).run();
  return cleanUser(r);
}
async function isMember(env,roomId,userId) { return !!(await env.DB.prepare("SELECT 1 FROM chat_members WHERE room_id=? AND user_id=?").bind(roomId,userId).first()); }
async function requireAdmin(request,env) { const user=await requireUser(request,env); if(!user)return {error:fail("로그인이 필요합니다.",401)}; if(!user.is_admin)return {error:fail("관리자 권한이 필요합니다.",403)}; return {user}; }
async function newSession(env,userId) {
  const token=randomToken(),now=new Date(),expires=new Date(now.getTime()+SESSION_DAYS*86400000).toISOString();
  await env.DB.prepare("INSERT INTO sessions(id,user_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),userId,await sha256(token),now.toISOString(),expires).run();
  return token;
}

export default {
 async fetch(request,env) {
  const headers=cors(request),origin=request.headers.get("Origin")||"";
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(origin&&!ALLOWED_ORIGINS.has(origin))return withCors(fail("허용되지 않은 출처입니다.",403),headers);
  try {
   const url=new URL(request.url),path=url.pathname.replace(/\/+$/,"")||"/",method=request.method;
   if(path==="/health"&&method==="GET")return withCors(json({ok:true,service:"FriendsChat Cloudflare API"}),headers);

   if(path==="/auth/signup"&&method==="POST") {
    const b=await readJson(request); if(!b)return withCors(fail("요청 형식이 올바르지 않습니다."),headers);
    const username=String(b.username||"").trim(),display=String(b.displayName||b.display_name||b.username||"").trim(),password=String(b.password||"");
    if(!usernameOk(username))return withCors(fail("아이디는 영문, 숫자, 밑줄로 3~20자여야 합니다."),headers);
    if(display.length<1||display.length>40)return withCors(fail("닉네임은 1~40자로 입력하세요."),headers);
    if(password.length<8||password.length>128)return withCors(fail("비밀번호는 8~128자로 입력하세요."),headers);
    if(await env.DB.prepare("SELECT 1 FROM users WHERE username=? COLLATE NOCASE").bind(username).first())return withCors(fail("이미 사용 중인 아이디입니다.",409),headers);
    const ph=await passwordHash(password),id=crypto.randomUUID(),now=new Date().toISOString();
    await env.DB.prepare("INSERT INTO users(id,username,display_name,password_salt,password_hash,status,is_admin,created_at,last_seen) VALUES(?,?,?,?,?,'online',0,?,?)").bind(id,username,display,ph.salt,ph.hash,now,now).run();
    const token=await newSession(env,id),user=await env.DB.prepare("SELECT id,username,display_name,status,last_seen,is_admin,created_at FROM users WHERE id=?").bind(id).first();
    return withCors(json({user:cleanUser(user),token},201),headers);
   }

   if(path==="/auth/login"&&method==="POST") {
    const b=await readJson(request),username=String(b?.username||"").trim(),password=String(b?.password||"");
    if(!username||!password)return withCors(fail("아이디와 비밀번호를 입력하세요."),headers);
    const u=await env.DB.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").bind(username).first();
    if(!u)return withCors(fail("아이디 또는 비밀번호가 올바르지 않습니다.",401),headers);
    const ph=await passwordHash(password,u.password_salt);
    if(ph.hash!==u.password_hash)return withCors(fail("아이디 또는 비밀번호가 올바르지 않습니다.",401),headers);
    const now=new Date().toISOString(); await env.DB.prepare("UPDATE users SET status='online',last_seen=? WHERE id=?").bind(now,u.id).run();
    const token=await newSession(env,u.id),safe=await env.DB.prepare("SELECT id,username,display_name,status,last_seen,is_admin,created_at FROM users WHERE id=?").bind(u.id).first();
    return withCors(json({user:cleanUser(safe),token}),headers);
   }

   if(path==="/auth/me"&&method==="GET") { const user=await requireUser(request,env); return withCors(user?json({user}):fail("로그인이 필요합니다.",401),headers); }
   if(path==="/auth/logout"&&method==="POST") {
    const a=request.headers.get("Authorization")||"",token=a.startsWith("Bearer ")?a.slice(7).trim():"";
    if(token){const hash=await sha256(token),s=await env.DB.prepare("SELECT user_id FROM sessions WHERE token_hash=?").bind(hash).first();await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(hash).run();if(s)await env.DB.prepare("UPDATE users SET status='offline',last_seen=? WHERE id=?").bind(new Date().toISOString(),s.user_id).run();}
    return withCors(json({ok:true}),headers);
   }

   const current=await requireUser(request,env);
   if(!current)return withCors(fail("로그인이 필요합니다.",401),headers);

   if(path==="/profile"&&method==="PATCH") {
    const b=await readJson(request),display=String(b?.display_name||b?.displayName||"").trim();
    if(display.length<1||display.length>40)return withCors(fail("닉네임은 1~40자로 입력하세요."),headers);
    await env.DB.prepare("UPDATE users SET display_name=?,last_seen=? WHERE id=?").bind(display,new Date().toISOString(),current.id).run();
    return withCors(json({user:{...current,display_name:display}}),headers);
   }
   if(path==="/users"&&method==="GET") {
    const q=String(url.searchParams.get("q")||"").trim().slice(0,40);
    const rows=q?await env.DB.prepare("SELECT id,username,display_name,status,last_seen,is_admin,created_at FROM users WHERE id<>? AND (username LIKE ? OR display_name LIKE ?) ORDER BY display_name LIMIT 100").bind(current.id,"%"+q+"%","%"+q+"%").all():await env.DB.prepare("SELECT id,username,display_name,status,last_seen,is_admin,created_at FROM users WHERE id<>? ORDER BY display_name LIMIT 100").bind(current.id).all();
    return withCors(json({users:(rows.results||[]).map(cleanUser)}),headers);
   }
   if(path==="/friends"&&method==="GET") {
    const rows=await env.DB.prepare("SELECT u.id,u.username,u.display_name,u.status,u.last_seen,u.is_admin,u.created_at FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_a=? THEN f.user_b ELSE f.user_a END WHERE f.user_a=? OR f.user_b=? ORDER BY u.display_name").bind(current.id,current.id,current.id).all();
    return withCors(json({friends:(rows.results||[]).map(cleanUser)}),headers);
   }
   if(path==="/friends"&&method==="POST") {
    const b=await readJson(request),username=String(b?.username||"").trim(),friend=await env.DB.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE").bind(username).first();
    if(!friend)return withCors(fail("해당 아이디의 회원을 찾을 수 없습니다.",404),headers);
    if(friend.id===current.id)return withCors(fail("자기 자신은 친구로 추가할 수 없습니다."),headers);
    const [a,c]=[current.id,friend.id].sort();await env.DB.prepare("INSERT OR IGNORE INTO friendships(user_a,user_b,created_at) VALUES(?,?,?)").bind(a,c,new Date().toISOString()).run();
    return withCors(json({ok:true}),headers);
   }
   if(path==="/rooms"&&method==="GET") {
    const rows=await env.DB.prepare("SELECT r.id,r.name,r.is_group,r.created_by,r.created_at,(SELECT m.content FROM messages m WHERE m.room_id=r.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) AS last_message,(SELECT m.created_at FROM messages m WHERE m.room_id=r.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) AS last_message_at FROM chat_rooms r JOIN chat_members cm ON cm.room_id=r.id WHERE cm.user_id=? ORDER BY COALESCE(last_message_at,r.created_at) DESC").bind(current.id).all();
    const rooms=[];for(const r of rows.results||[]){const m=await env.DB.prepare("SELECT u.id,u.username,u.display_name,u.status FROM chat_members cm JOIN users u ON u.id=cm.user_id WHERE cm.room_id=? ORDER BY u.display_name").bind(r.id).all();rooms.push({...r,is_group:!!r.is_group,members:m.results||[]});}
    return withCors(json({rooms}),headers);
   }
   if(path==="/rooms"&&method==="POST") {
    const b=await readJson(request),name=String(b?.name||"").trim().slice(0,80),names=Array.isArray(b?.usernames)?b.usernames.map(x=>String(x).trim()).filter(Boolean):[];
    const unique=[...new Set([current.username,...names])];if(unique.length<2)return withCors(fail("대화 상대를 한 명 이상 선택하세요."),headers);if(unique.length>50)return withCors(fail("대화방 참가자는 최대 50명입니다."),headers);
    const marks=unique.map(()=>"?").join(","),found=await env.DB.prepare("SELECT id,username FROM users WHERE username COLLATE NOCASE IN ("+marks+")").bind(...unique).all();
    if((found.results||[]).length!==unique.length)return withCors(fail("존재하지 않는 회원이 포함되어 있습니다."),headers);
    const group=unique.length>2||!!b?.is_group,id=crypto.randomUUID(),roomName=group?(name||"단체 채팅"):(name||""),now=new Date().toISOString();
    await env.DB.prepare("INSERT INTO chat_rooms(id,name,is_group,created_by,created_at) VALUES(?,?,?,?,?)").bind(id,roomName,group?1:0,current.id,now).run();
    await env.DB.batch(found.results.map(u=>env.DB.prepare("INSERT INTO chat_members(room_id,user_id,joined_at) VALUES(?,?,?)").bind(id,u.id,now)));
    return withCors(json({room:{id,name:roomName,is_group:group,created_by:current.id,created_at:now}},201),headers);
   }
   const mm=path.match(/^\/rooms\/([^/]+)\/messages$/);
   if(mm&&method==="GET") {
    const room=mm[1];if(!(await isMember(env,room,current.id)))return withCors(fail("이 대화방에 접근할 수 없습니다.",403),headers);
    const limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit")||50)));
    const rows=await env.DB.prepare("SELECT m.id,m.room_id,m.sender_id,u.username AS sender_username,u.display_name AS sender_name,m.content,m.message_type,m.created_at,m.edited_at,m.deleted_at FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.room_id=? ORDER BY m.created_at DESC LIMIT ?").bind(room,limit).all();
    const msgs=(rows.results||[]).reverse(),ids=msgs.map(m=>m.id),by={};
    if(ids.length){const marks=ids.map(()=>"?").join(","),fs=await env.DB.prepare("SELECT id,message_id,file_name,mime_type,size_bytes,created_at FROM file_attachments WHERE message_id IN ("+marks+")").bind(...ids).all();for(const f of fs.results||[])(by[f.message_id] ||= []).push(f);}
    return withCors(json({messages:msgs.map(m=>({...m,files:by[m.id]||[]}))}),headers);
   }
   if(mm&&method==="POST") {
    const room=mm[1];if(!(await isMember(env,room,current.id)))return withCors(fail("이 대화방에 접근할 수 없습니다.",403),headers);
    const b=await readJson(request),content=String(b?.content||"").trim();if(!content)return withCors(fail("메시지를 입력하세요."),headers);if(content.length>MAX_MESSAGE_LENGTH)return withCors(fail("메시지는 최대 5000자입니다."),headers);
    const id=crypto.randomUUID(),now=new Date().toISOString();await env.DB.prepare("INSERT INTO messages(id,room_id,sender_id,content,message_type,created_at) VALUES(?,?,?,?,?,?)").bind(id,room,current.id,content,"text",now).run();
    return withCors(json({message:{id,room_id:room,sender_id:current.id,sender_username:current.username,sender_name:current.display_name,content,message_type:"text",created_at:now,files:[]}},201),headers);
   }
   const read=path.match(/^\/rooms\/([^/]+)\/read$/);
   if(read&&method==="POST") {
    const room=read[1];if(!(await isMember(env,room,current.id)))return withCors(fail("이 대화방에 접근할 수 없습니다.",403),headers);
    await env.DB.prepare("INSERT OR IGNORE INTO message_reads(message_id,user_id,read_at) SELECT id,?,? FROM messages WHERE room_id=? AND sender_id<>? AND deleted_at IS NULL").bind(current.id,new Date().toISOString(),room,current.id).run();
    return withCors(json({ok:true}),headers);
   }
   const up=path.match(/^\/rooms\/([^/]+)\/files$/);
   if(up&&method==="POST") {
    const room=up[1];if(!(await isMember(env,room,current.id)))return withCors(fail("이 대화방에 접근할 수 없습니다.",403),headers);if(!env.FILES)return withCors(fail("R2 파일 저장소가 설정되지 않았습니다.",503),headers);
    const form=await request.formData(),file=form.get("file"),messageId=String(form.get("message_id")||"");
    if(!(file instanceof File))return withCors(fail("파일을 선택하세요."),headers);if(file.size>MAX_UPLOAD_BYTES)return withCors(fail("파일은 20MB 이하만 업로드할 수 있습니다."),headers);
    if(messageId&&!await env.DB.prepare("SELECT id FROM messages WHERE id=? AND room_id=? AND sender_id=?").bind(messageId,room,current.id).first())return withCors(fail("첨부할 메시지를 찾을 수 없습니다."),headers);
    const id=crypto.randomUUID(),name=file.name.replace(/[\r\n"]/g,"_").slice(0,180)||"file",key=room+"/"+id,mime=file.type||"application/octet-stream";
    await env.FILES.put(key,file.stream(),{httpMetadata:{contentType:mime},customMetadata:{originalName:name}});
    await env.DB.prepare("INSERT INTO file_attachments(id,room_id,message_id,uploader_id,object_key,file_name,mime_type,size_bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,room,messageId||null,current.id,key,name,mime,file.size,new Date().toISOString()).run();
    return withCors(json({file:{id,room_id:room,message_id:messageId||null,file_name:name,mime_type:mime,size_bytes:file.size}},201),headers);
   }
   const fm=path.match(/^\/files\/([^/]+)$/);
   if(fm&&method==="GET") {
    const f=await env.DB.prepare("SELECT * FROM file_attachments WHERE id=?").bind(fm[1]).first();if(!f||!(await isMember(env,f.room_id,current.id)))return withCors(fail("파일을 찾을 수 없습니다.",404),headers);
    const obj=await env.FILES.get(f.object_key);if(!obj)return withCors(fail("파일이 존재하지 않습니다.",404),headers);
    const h=new Headers({"Content-Type":f.mime_type||"application/octet-stream","Content-Length":String(f.size_bytes),"Content-Disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(f.file_name),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"});headers.forEach((v,k)=>h.set(k,v));return new Response(obj.body,{headers:h});
   }
   if(path==="/admin/users"&&method==="GET") {
    const a=await requireAdmin(request,env);if(a.error)return withCors(a.error,headers);
    const rows=await env.DB.prepare("SELECT id,username,display_name,status,last_seen,is_admin,created_at FROM users ORDER BY created_at DESC LIMIT 500").all();return withCors(json({users:(rows.results||[]).map(cleanUser)}),headers);
   }
   const adm=path.match(/^\/admin\/users\/([^/]+)\/admin$/);
   if(adm&&method==="PATCH") {
    const a=await requireAdmin(request,env);if(a.error)return withCors(a.error,headers);const b=await readJson(request),target=await env.DB.prepare("SELECT id FROM users WHERE id=?").bind(adm[1]).first();
    if(!target)return withCors(fail("회원을 찾을 수 없습니다.",404),headers);if(target.id===a.user.id)return withCors(fail("자기 자신의 관리자 권한은 여기서 변경할 수 없습니다."),headers);
    await env.DB.prepare("UPDATE users SET is_admin=? WHERE id=?").bind(b?.is_admin?1:0,target.id).run();return withCors(json({ok:true}),headers);
   }
   return withCors(fail("존재하지 않는 API 경로입니다.",404),headers);
  } catch(e) {
   return withCors(json({error:"서버 오류가 발생했습니다.",detail:String(e?.message||e)},500),headers);
  }
 }
};