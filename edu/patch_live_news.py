from pathlib import Path

p = Path('edu/news.html')
s = p.read_text(encoding='utf-8')

if 'LIVE_KIDS_NEWS_PATCH_V3' in s:
    print('already patched')
    raise SystemExit

# Page title
s = s.replace('<title>네팔 대홍수와 기후위기 - 뉴스 기사로 살펴보기</title>', '<title>오늘의 어린이 뉴스</title>')

# Existing static footer -> live-news source footer
footer_start = s.find('<footer>')
footer_end = s.find('</footer>', footer_start)
if footer_start >= 0 and footer_end >= 0:
    footer = '''<footer>
    <b>기사 출처</b><br>
    각 기사에 표시된 <b>언론사 이름</b>을 출처로 표시하며, 기사별 <b>원문 링크</b>를 통해 원문을 확인할 수 있습니다.<br>
    <b>사진 출처</b><br>
    실시간 기사에 사용되는 사진은 해당 기사의 원문 페이지에서 확인할 수 있습니다.<br>
    <span>※ 뉴스 내용은 원문 기사를 바탕으로 어린이가 읽기 쉽게 정리한 것입니다.</span>
  </footer>'''
    s = s[:footer_start] + footer + s[footer_end + len('</footer>'):]

# Neutral wording for live news
s = s.replace('const AI_MARK = "[이 기사는 AI로 요약했음. by 양지윤 선생님]";', 'const AI_MARK = "[어린이가 이해하기 쉽도록 간단히 정리한 뉴스입니다.]";')
s = s.replace('놀랍거나 안타까웠던 점, 궁금한 점을 써 보세요. 기후위기를 늦추기 위해 우리가 할 수 있는 일도 좋습니다.', '놀랍거나 궁금했던 점, 기사에서 새롭게 알게 된 점을 써 보세요.')
s = s.replace('T("네팔 대홍수와 기후위기", M + PAD, y + 72', 'T("오늘의 어린이 뉴스", M + PAD, y + 72')
s = s.replace('T("뉴스 기사로 살펴보기", M + PAD, y + 110', 'T("쉽게 읽고 생각해 보는 뉴스", M + PAD, y + 110')
s = s.replace('const file = "네팔대홍수_카드뉴스"', 'const file = "오늘의어린이뉴스_카드뉴스"')
s = s.replace('T("기사 출처 : 서울신문(2026.8.27) · 아시아경제(2026.8.28) · 연합뉴스(2026.9.1) · MBC 뉴스(2026.9.2)",', 'T("기사 출처 : 각 기사에 표시된 언론사와 원문 링크를 확인하세요.",')
s = s.replace('T("본문은 원 기사를 AI가 요약한 것입니다. 사진은 각 카드에 적힌 출처를 따르며, 학교 수업 목적으로만 이용해 주세요.",', 'T("기사 내용은 원문을 바탕으로 어린이가 읽기 쉽게 정리했습니다. 자세한 내용은 원문을 확인하세요.",')

# Add a generic image for live articles if PHOTO exists and does not already have live.
photo_pos = s.find('const PHOTO =')
if photo_pos >= 0 and 'live:' not in s[photo_pos:s.find('};', photo_pos)+2]:
    photo_end = s.find('\n};', photo_pos)
    if photo_end >= 0:
        photo_insert = '''
  live: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#E3F0F8"/><rect x="70" y="70" width="660" height="360" rx="28" fill="#FFFFFF"/><circle cx="180" cy="175" r="58" fill="#1E6F9F"/><path d="M155 175h50M180 150v50" stroke="#fff" stroke-width="12" stroke-linecap="round"/><rect x="280" y="135" width="330" height="28" rx="14" fill="#B7CDDD"/><rect x="280" y="190" width="260" height="24" rx="12" fill="#D7E4EE"/><rect x="280" y="240" width="300" height="24" rx="12" fill="#D7E4EE"/><text x="400" y="350" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="700" fill="#12506F">오늘의 어린이 뉴스</text></svg>')'''
        s = s[:photo_end] + photo_insert + s[photo_end:]

loader = r'''<script>
/* LIVE_KIDS_NEWS_PATCH_V3 */
async function loadLiveKidsNews(){
  try{
    const r = await fetch("./news-data.json?t=" + Date.now(), {cache:"no-store"});
    if(!r.ok) throw new Error("news-data.json " + r.status);
    const data = await r.json();
    if(!Array.isArray(data.articles) || !data.articles.length) return;
    const live = data.articles.slice(0,4).map((a,i)=>({
      id:a.id || ("live-"+(i+1)),
      figs:[{k:"live",cap:"실시간으로 선별된 어린이 뉴스",cr:"자세한 내용은 기사 원문을 확인하세요."}],
      tabTitle:a.tabTitle || a.title || "최신 뉴스",
      tabSub:(a.date || "")+" · "+(a.source || "뉴스"),
      kicker:a.kicker || "🔥 오늘의 어린이 뉴스",
      headline:a.title || "최신 뉴스",
      date:a.date || "",
      source:a.source || "뉴스",
      facts:Array.isArray(a.facts)?a.facts:["최신 뉴스","어린이가 읽기 쉽도록 선별한 기사"],
      paras:Array.isArray(a.paras)&&a.paras.length?a.paras:[a.summary || "최신 뉴스입니다."],
      url:a.url || ""
    }));
    ARTICLES.splice(0,ARTICLES.length,...live);
    current=0;
    buildTabs();
    select(0);
    refreshTabs();
  }catch(e){console.warn("실시간 뉴스 로드 실패. 기존 기사로 표시합니다.",e);}
}
window.addEventListener("load",loadLiveKidsNews);
</script>
'''
s = s.rstrip() + '\n' + loader
p.write_text(s, encoding='utf-8')
print('patched', p)
