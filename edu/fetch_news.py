import json, re, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

FEEDS = [("뉴시스", "https://nwww.newsis.com/RSS/sokbo.xml"), ("뉴시스 국제", "https://nwww.newsis.com/RSS/international.xml"), ("경향신문 과학·환경", "https://www.khan.co.kr/rss/rssdata/science_news.xml"), ("경향신문 국제", "https://www.khan.co.kr/rss/rssdata/kh_world.xml"), ("아이뉴스24 IT", "https://www.inews24.com/rss/news_it.xml"), ("아이뉴스24 생활", "https://www.inews24.com/rss/news_life.xml")]
BAD = re.compile(r"성폭력|살인|시신|참수|잔혹|피살|흉기|자살|마약|도박|음주운전|성범죄|납치|테러|총격|성착취|불법촬영", re.I)
GOOD = re.compile(r"과학|우주|AI|인공지능|로봇|환경|기후|빙하|에너지|바다|동물|생태|교육|학교|청소년|어린이|건강|날씨|재난|세계|국제|기술|발명|경제|생활|역사", re.I)
def clean(x): return re.sub(r"<[^>]+>", "", x or "").replace("&nbsp;", " ").strip()
def parse_date(x):
    if not x: return None
    try: return parsedate_to_datetime(x).astimezone(timezone.utc)
    except Exception: return None
def fetch(name,url):
    req=urllib.request.Request(url,headers={"User-Agent":"PJY-Edu-News/1.0"})
    with urllib.request.urlopen(req,timeout=20) as r: data=r.read()
    root=ET.fromstring(data); out=[]
    for item in root.findall('.//item')[:50]:
        title=clean(item.findtext('title')); link=(item.findtext('link') or '').strip(); desc=clean(item.findtext('description')); dt=parse_date(item.findtext('pubDate') or item.findtext('{http://purl.org/dc/elements/1.1/}date'))
        if title and link: out.append({'title':title,'link':link,'summary':desc,'source':name,'dt':dt})
    return out
items=[]
for name,url in FEEDS:
    try: items += fetch(name,url)
    except Exception as e: print('feed failed:',name,e)
now=datetime.now(timezone.utc); seen=set(); ranked=[]
for x in items:
    key=re.sub(r'\s+',' ',x['title']).lower()
    if key in seen: continue
    seen.add(key); text=x['title']+' '+x['summary']
    if BAD.search(text): continue
    age=max(0,(now-(x['dt'] or now)).total_seconds()/3600); freshness=max(0,48-age)/48*60; kid=30 if GOOD.search(text) else 8
    ranked.append((freshness+kid,x))
ranked.sort(key=lambda z:z[0],reverse=True)
slots=[("🔥 지금 뜨는 뉴스",None),("🌱 과학·환경",GOOD),("🌎 세계",re.compile(r"국제|세계|미국|중국|일본|유럽|아시아|외국",re.I)),("🇰🇷 우리나라",re.compile(r"한국|국내|서울|대한민국|교육|학교|청소년",re.I))]
chosen=[]
for label,pat in slots:
    for score,x in ranked:
        if x in chosen: continue
        if pat is None or pat.search(x['title']+' '+x['summary']): chosen.append(x); break
for score,x in ranked:
    if len(chosen)>=4: break
    if x not in chosen: chosen.append(x)
articles=[]
for i,x in enumerate(chosen[:4]):
    dt=x['dt'].astimezone() if x['dt'] else now.astimezone(); summary=re.sub(r'\s+',' ',x['summary']).strip()
    if len(summary)>500: summary=summary[:497]+'…'
    articles.append({'id':'live-'+str(i+1),'tabTitle':x['title'][:45],'kicker':slots[i][0],'title':x['title'],'date':dt.strftime('%Y.%m.%d %H:%M'),'source':x['source'],'summary':summary,'paras':[summary or '최신 뉴스입니다.'],'facts':['최신 기사','어린이가 읽기 쉽도록 선별','원문 링크로 확인 가능'],'url':x['link']})
with open('edu/news-data.json','w',encoding='utf-8') as f: json.dump({'updatedAt':now.isoformat(),'articles':articles},f,ensure_ascii=False,indent=2)
print('wrote',len(articles),'articles')
