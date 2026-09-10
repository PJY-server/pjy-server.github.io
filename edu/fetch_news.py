import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

FEEDS = [
    ("뉴시스", "https://nwww.newsis.com/RSS/sokbo.xml"),
    ("뉴시스 국제", "https://nwww.newsis.com/RSS/international.xml"),
    ("경향신문 과학·환경", "https://www.khan.co.kr/rss/rssdata/science_news.xml"),
    ("경향신문 국제", "https://www.khan.co.kr/rss/rssdata/kh_world.xml"),
    ("아이뉴스24 IT", "https://www.inews24.com/rss/news_it.xml"),
    ("아이뉴스24 생활", "https://www.inews24.com/rss/news_life.xml"),
]

BAD = re.compile(
    r"성폭력|살인|시신|참수|잔혹|피살|흉기|자살|마약|도박|음주운전|성범죄|납치|테러|총격|성착취|불법촬영|폭행|사망자|범죄",
    re.I,
)
GOOD = re.compile(
    r"과학|우주|AI|인공지능|로봇|환경|기후|빙하|에너지|바다|동물|생태|교육|학교|청소년|어린이|건강|날씨|재난|세계|국제|기술|발명|경제|생활|역사|문화|스포츠",
    re.I,
)
WORLD = re.compile(r"국제|세계|미국|중국|일본|유럽|아시아|외국|우주|NASA", re.I)
KOREA = re.compile(r"한국|국내|서울|대한민국|교육|학교|청소년|우리나라", re.I)
SCIENCE = re.compile(r"과학|환경|기후|AI|인공지능|로봇|우주|에너지|바다|동물|생태|기술|발명", re.I)


def clean(x):
    x = re.sub(r"<script[\s\S]*?</script>", " ", x or "", flags=re.I)
    x = re.sub(r"<style[\s\S]*?</style>", " ", x or "", flags=re.I)
    x = re.sub(r"<[^>]+>", " ", x or "")
    x = re.sub(r"&nbsp;|&#160;", " ", x or "", flags=re.I)
    x = re.sub(r"\s+", " ", x or "")
    return x.strip()


def parse_date(x):
    if not x:
        return None
    try:
        dt = parsedate_to_datetime(x)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def text_from_item(item, tag):
    value = item.findtext(tag)
    if value:
        return clean(value)
    return ""


def make_paragraphs(text):
    text = clean(text)
    if not text:
        return []

    # RSS descriptions can contain an image caption followed by the actual article excerpt.
    text = re.sub(r"^(사진|이미지|자료사진|사진=|자료=)[^가-힣A-Za-z0-9]{0,5}", "", text)

    # Keep a useful article excerpt instead of dumping an entire article into the page.
    if len(text) > 1200:
        text = text[:1197].rstrip() + "…"

    sentences = re.split(r"(?<=[.!?다요죠])\s+", text)
    sentences = [s.strip() for s in sentences if s.strip()]
    if len(sentences) >= 2:
        mid = max(1, len(sentences) // 2)
        return [" ".join(sentences[:mid]), " ".join(sentences[mid:])]
    return [text]


def fetch(name, url):
    req = urllib.request.Request(url, headers={"User-Agent": "PJY-Edu-News/1.1"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = r.read()
    root = ET.fromstring(data)
    out = []
    for item in root.findall(".//item")[:80]:
        title = text_from_item(item, "title")
        link = (item.findtext("link") or "").strip()

        # Different publishers put their RSS article excerpt in different fields.
        desc = text_from_item(item, "description")
        if not desc:
            desc = text_from_item(item, "{http://purl.org/rss/1.0/modules/content/}encoded")
        if not desc:
            desc = text_from_item(item, "{http://purl.org/dc/elements/1.1/}description")

        dt = parse_date(
            item.findtext("pubDate")
            or item.findtext("{http://purl.org/dc/elements/1.1/}date")
        )
        if title and link:
            out.append({"title": title, "link": link, "summary": desc, "source": name, "dt": dt})
    return out


items = []
for name, url in FEEDS:
    try:
        items += fetch(name, url)
    except Exception as e:
        print("feed failed:", name, e)

now = datetime.now(timezone.utc)
seen = set()
ranked = []

for x in items:
    key = re.sub(r"\s+", " ", x["title"]).lower()
    if key in seen:
        continue
    seen.add(key)

    text = x["title"] + " " + x["summary"]
    if BAD.search(text):
        continue

    age_hours = max(0, (now - (x["dt"] or now)).total_seconds() / 3600)
    freshness = max(0, 72 - age_hours) / 72 * 70
    educational = 30 if GOOD.search(text) else 5
    score = freshness + educational
    ranked.append((score, x))

ranked.sort(key=lambda z: z[0], reverse=True)

slots = [
    ("🔥 지금 뜨는 뉴스", None),
    ("🌱 과학·환경", SCIENCE),
    ("🌎 세계", WORLD),
    ("🇰🇷 우리나라", KOREA),
]

chosen = []
for label, pattern in slots:
    for score, x in ranked:
        if x in chosen:
            continue
        text = x["title"] + " " + x["summary"]
        if pattern is None or pattern.search(text):
            chosen.append(x)
            break

for score, x in ranked:
    if len(chosen) >= 4:
        break
    if x not in chosen:
        chosen.append(x)

articles = []
for i, x in enumerate(chosen[:4]):
    dt = x["dt"].astimezone() if x["dt"] else now.astimezone()
    summary = clean(x["summary"])
    paras = make_paragraphs(summary)
    if not paras:
        paras = ["이 기사는 RSS에서 기사 요약문을 제공하지 않습니다. 아래 원문 링크에서 기사 내용을 확인할 수 있습니다."]
        summary = paras[0]

    facts = [
        "최신 뉴스",
        "어린이가 읽기 쉽도록 선별한 기사",
        "자세한 내용은 기사 원문에서 확인",
    ]

    articles.append(
        {
            "id": "live-" + str(i + 1),
            "tabTitle": x["title"][:55],
            "kicker": slots[i][0],
            "title": x["title"],
            "date": dt.strftime("%Y.%m.%d %H:%M"),
            "source": x["source"],
            "summary": summary,
            "paras": paras,
            "facts": facts,
            "url": x["link"],
        }
    )

with open("edu/news-data.json", "w", encoding="utf-8") as f:
    json.dump(
        {"updatedAt": now.isoformat(), "articles": articles},
        f,
        ensure_ascii=False,
        indent=2,
    )

print("wrote", len(articles), "articles")
