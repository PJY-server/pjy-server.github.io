import json
import os
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

# 조선닷컴 RSSPlus + 동아일보 RSS + 어린이경제신문 RSS
FEEDS = [
    ("조선일보", "https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml"),
    ("조선일보 정치", "https://www.chosun.com/arc/outboundfeeds/rss/category/politics/?outputType=xml"),
    ("조선일보 경제", "https://www.chosun.com/arc/outboundfeeds/rss/category/economy/?outputType=xml"),
    ("조선일보 사회", "https://www.chosun.com/arc/outboundfeeds/rss/category/national/?outputType=xml"),
    ("조선일보 국제", "https://www.chosun.com/arc/outboundfeeds/rss/category/international/?outputType=xml"),
    ("조선일보 문화·라이프", "https://www.chosun.com/arc/outboundfeeds/rss/category/culture-life/?outputType=xml"),
    ("조선일보 스포츠", "https://www.chosun.com/arc/outboundfeeds/rss/category/sports/?outputType=xml"),
    ("동아일보", "https://rss.donga.com/total.xml"),
    ("동아일보 국제", "https://rss.donga.com/international.xml"),
    ("동아일보 의학·과학", "https://rss.donga.com/science.xml"),
    ("동아일보 문화·연예", "https://rss.donga.com/culture.xml"),
    ("동아일보 건강", "https://rss.donga.com/health.xml"),
    ("동아일보 여행·생활", "https://rss.donga.com/travel.xml"),
    ("동아일보 생활정보", "https://rss.donga.com/lifeinfo.xml"),
    ("동아일보 스포츠", "https://rss.donga.com/sports.xml"),
    ("어린이경제신문 전체기사", "https://www.econoi.com/rss/allArticle.xml"),
    ("어린이경제신문 인기기사", "https://www.econoi.com/rss/clickTop.xml"),
    ("어린이경제신문 이야기경제", "https://www.econoi.com/rss/S1N2.xml"),
    ("어린이경제신문 생생뉴스", "https://www.econoi.com/rss/S1N3.xml"),
    ("어린이경제신문 교육", "https://www.econoi.com/rss/S1N5.xml"),
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
ECONOMY = re.compile(r"경제|금융|증시|주식|기업|산업|무역|물가|부동산|돈|금리", re.I)
CULTURE_SPORTS = re.compile(r"문화|예술|영화|음악|공연|스포츠|축구|야구|농구|올림픽", re.I)


def clean_inline(x):
    x = re.sub(r"<script[\s\S]*?</script>", " ", x or "", flags=re.I)
    x = re.sub(r"<style[\s\S]*?</style>", " ", x or "", flags=re.I)
    x = re.sub(r"<[^>]+>", " ", x or "")
    x = re.sub(r"&nbsp;|&#160;", " ", x or "", flags=re.I)
    x = re.sub(r"\s+", " ", x or "")
    return x.strip()


def clean_content(x):
    """RSS 원문에 들어 있는 글자와 문단 구조를 최대한 보존한다."""
    x = x or ""
    x = re.sub(r"<script[\s\S]*?</script>", "", x, flags=re.I)
    x = re.sub(r"<style[\s\S]*?</style>", "", x, flags=re.I)
    x = re.sub(r"<(?:br|hr)\s*/?>", "\n", x, flags=re.I)
    x = re.sub(r"</(?:p|div|li|h[1-6]|section|article|blockquote)>\s*", "\n", x, flags=re.I)
    x = re.sub(r"<(?:p|div|li|h[1-6]|section|article|blockquote)(?:\s[^>]*)?>", "", x, flags=re.I)
    x = re.sub(r"<[^>]+>", " ", x)
    import html
    x = html.unescape(x)
    x = re.sub(r"[ \t\r]+", " ", x)
    x = re.sub(r"\n[ \t]+", "\n", x)
    x = re.sub(r"\n{3,}", "\n\n", x)
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


def text_from_item(item, tag, cleaner=clean_inline):
    """findtext 대신 모든 자식 텍스트를 합쳐 링크 안의 글자도 잃지 않는다."""
    node = item.find(tag)
    if node is None:
        return ""
    raw = "".join(node.itertext())
    return cleaner(raw) if cleaner else raw.strip()


def make_paragraphs(text):
    text = clean_content(text)
    if not text:
        return []
    paras = []
    for block in re.split(r"\n{2,}|\n", text):
        block = re.sub(r"\s+", " ", block).strip()
        if block:
            paras.append(block)
    return paras


def ai_polish(text):
    """내용·사실·순서는 유지하고 어색한 문장과 띄어쓰기만 AI로 다듬는다."""
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key or not text:
        return text

    source = text[:14000]
    payload = {
        "model": "gpt-5.6-luna",
        "input": [
            {
                "role": "system",
                "content": (
                    "너는 뉴스 편집자다. 주어진 뉴스 문장을 '문장 다듬기'만 한다. "
                    "새로운 사실, 숫자, 이름, 날짜, 인용, 주장, 예시를 절대 추가하지 마라. "
                    "원문의 정보와 순서를 그대로 유지하고, 어색한 연결, 문법, 띄어쓰기, "
                    "깨진 문장만 자연스러운 한국어로 고쳐라. 문장을 불필요하게 줄이거나 요약하지 마라. "
                    "원문에 없는 내용을 추측하지 마라. 결과에는 수정된 본문만 출력하라."
                ),
            },
            {
                "role": "user",
                "content": source,
            },
        ],
    }
    try:
        req = urllib.request.Request(
            "https://api.openai.com/v1/responses",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": "Bearer " + api_key,
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            result = json.loads(r.read().decode("utf-8"))

        output = result.get("output", [])
        parts = []
        for item in output:
            for part in item.get("content", []):
                if part.get("type") == "output_text" and part.get("text"):
                    parts.append(part["text"])
        polished = "\n".join(parts).strip()
        return polished if polished else text
    except Exception as e:
        print("AI polish failed:", e)
        return text


def fetch(name, url):
    req = urllib.request.Request(url, headers={"User-Agent": "PJY-Edu-News/1.7"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = r.read()
    root = ET.fromstring(data)
    out = []
    for item in root.findall(".//item")[:80]:
        title = text_from_item(item, "title")
        link = (item.findtext("link") or "").strip()

        content = text_from_item(
            item,
            "{http://purl.org/rss/1.0/modules/content/}encoded",
            clean_content,
        )
        if not content:
            content = text_from_item(
                item,
                "{http://purl.org/dc/elements/1.1/}description",
                clean_content,
            )
        if not content:
            content = text_from_item(item, "description", clean_content)

        dt = parse_date(
            item.findtext("pubDate")
            or item.findtext("{http://purl.org/dc/elements/1.1/}date")
        )
        if title and link:
            out.append({"title": title, "link": link, "content": content, "source": name, "dt": dt})
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

    text = x["title"] + " " + x["content"]
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
    ("💰 경제·생활", ECONOMY),
    ("🎭 문화·스포츠", CULTURE_SPORTS),
    ("📰 최신 뉴스", None),
]

chosen = []
for label, pattern in slots:
    for score, x in ranked:
        if x in chosen:
            continue
        text = x["title"] + " " + x["content"]
        if pattern is None or pattern.search(text):
            chosen.append(x)
            break

for score, x in ranked:
    if len(chosen) >= 7:
        break
    if x not in chosen:
        chosen.append(x)

articles = []
for i, x in enumerate(chosen[:7]):
    dt = x["dt"].astimezone() if x["dt"] else now.astimezone()
    content = clean_content(x["content"])

    polished = ai_polish(content)
    paras = make_paragraphs(polished)
    if not paras:
        paras = ["이 RSS는 기사 내용을 제공하지 않습니다. 아래 원문 링크에서 전체 기사를 확인할 수 있습니다."]

    facts = [
        "최신 뉴스",
        "RSS가 제공한 기사 내용을 바탕으로 문장만 자연스럽게 다듬음",
        "자세한 내용은 기사 원문에서 확인",
    ]

    articles.append(
        {
            "id": "live-" + str(i + 1),
            "tabTitle": x["title"],
            "kicker": slots[i][0],
            "title": x["title"],
            "date": dt.strftime("%Y.%m.%d %H:%M"),
            "source": x["source"],
            "content": polished,
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
