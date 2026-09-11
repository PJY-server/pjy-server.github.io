from pathlib import Path
import re

p = Path('edu/news.html')
s = p.read_text(encoding='utf-8')

for marker in ('/* LIVE_KIDS_NEWS_PATCH_V4 */', '/* LIVE_KIDS_NEWS_PATCH_V3 */'):
    pos = s.find(marker)
    if pos >= 0:
        start = s.rfind('<script', 0, pos)
        end0 = s.find('</script>', pos)
        if start >= 0 and end0 >= 0:
            s = s[:start] + s[end0 + len('</script>'):]
        break

s = s.replace('<title>네팔 대홍수와 기후위기 - 뉴스 기사로 살펴보기</title>', '<title>오늘의 뉴스</title>')
s = s.replace('<title>오늘의 어린이 뉴스</title>', '<title>오늘의 뉴스</title>')

footer_start = s.find('<footer>')
footer_end = s.find('</footer>', footer_start)
if footer_start >= 0 and footer_end >= 0:
    footer = '''<footer>
    <b>기사 출처</b><br>
    각 기사에 표시된 <b>언론사 이름</b>과 <b>원문 링크</b>를 통해 기사 출처를 확인할 수 있습니다.<br>
    <b>사진 출처</b><br>
    실시간 기사에 사용되는 사진은 해당 기사의 원문 페이지에서 확인할 수 있습니다.<br>
    <span>※ 뉴스 내용은 RSS로 제공된 기사 내용을 바탕으로 문장만 자연스럽게 다듬어 표시합니다.</span>
  </footer>'''
    s = s[:footer_start] + footer + s[footer_end + len('</footer>'):]

s = s.replace('const AI_MARK = "[어린이가 이해하기 쉽도록 간단히 정리한 뉴스입니다.]";', 'const AI_MARK = "[기사 원문을 바탕으로 문장만 자연스럽게 다듬었습니다.]";')
s = s.replace('const AI_MARK = "[이 기사는 AI로 요약했음. by 양지윤 선생님]";', 'const AI_MARK = "[기사 원문을 바탕으로 문장만 자연스럽게 다듬었습니다.]";')
s = s.replace('T("오늘의 어린이 뉴스", M + PAD, y + 72', 'T("오늘의 뉴스", M + PAD, y + 72')
s = s.replace('T("쉽게 읽고 생각해 보는 뉴스", M + PAD, y + 110', 'T("최신 뉴스를 읽고 생각해 보는 뉴스", M + PAD, y + 110')
s = s.replace('const file = "오늘의어린이뉴스_카드뉴스"', 'const file = "오늘의뉴스_카드뉴스"')
s = s.replace('T("기사 내용은 원문을 바탕으로 어린이가 읽기 쉽게 정리했습니다. 자세한 내용은 원문을 확인하세요.",', 'T("기사 내용은 원문을 바탕으로 문장만 자연스럽게 다듬었습니다. 자세한 내용은 원문을 확인하세요.",')

ui_css = '''<style id="live-news-ui-v4">
/* LIVE_KIDS_NEWS_UI_V4 */
.tabs{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:10px;
  margin:16px 0 0;
  padding:0 0 4px;
  overflow:visible;
}
.tab{
  min-width:0;
  width:100%;
  min-height:76px;
  display:flex;
  align-items:flex-start;
  gap:10px;
  padding:12px 13px;
  border-radius:14px;
  transform:none;
}
.tab:hover,.tab[aria-selected="true"]{transform:translateY(-1px)}
.tab > span:nth-child(2){min-width:0;flex:1}
.tab-t{
  display:block;
  font-size:14px;
  line-height:1.4;
  letter-spacing:-.025em;
  white-space:normal;
  overflow:visible;
  text-overflow:clip;
  word-break:keep-all;
  overflow-wrap:anywhere;
}
.tab-s{
  display:block;
  margin-top:4px;
  line-height:1.35;
  white-space:normal;
}
.tab .done{margin-left:0;flex:none}
.headline{
  white-space:normal;
  overflow:visible;
  text-overflow:clip;
  word-break:keep-all;
  overflow-wrap:anywhere;
  text-wrap:pretty;
}
@media (max-width:900px){
  .tabs{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .tab{min-height:82px;padding:11px 10px}
  .tab-t{font-size:13.5px}
}
@media (max-width:520px){
  .tabs{grid-template-columns:1fr}
  .tab{min-height:0}
  .headline{font-size:clamp(22px,6.2vw,29px);line-height:1.38}
}
</style>
'''

s = re.sub(r'<style id="live-news-ui-v4">.*?</style>', '', s, count=1, flags=re.S)

loader = '''<script>
/* LIVE_KIDS_NEWS_PATCH_V4 */
async function loadLiveKidsNews(){
  try{
    const r = await fetch("./news-data.json?t=" + Date.now(), {cache:"no-store"});
    if(!r.ok) throw new Error("news-data.json " + r.status);
    const data = await r.json();
    if(!Array.isArray(data.articles) || !data.articles.length) return;
    const live = data.articles.slice(0,7).map((a,i)=>({
      id:a.id || ("live-"+(i+1)),
      figs:[{k:"live",cap:"실시간 뉴스",cr:"자세한 내용은 기사 원문을 확인하세요."}],
      tabTitle:a.tabTitle || a.title || "최신 뉴스",
      tabSub:(a.date || "")+" · "+(a.source || "뉴스"),
      kicker:a.kicker || "📰 오늘의 뉴스",
      headline:a.title || "최신 뉴스",
      date:a.date || "",
      source:a.source || "뉴스",
      facts:Array.isArray(a.facts)?a.facts:["최신 뉴스","자세한 내용은 기사 원문을 확인하세요."],
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

s = s.rstrip() + '\n' + ui_css + loader
p.write_text(s, encoding='utf-8')
print('patched', p)
