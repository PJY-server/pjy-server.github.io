from pathlib import Path
import re

p=Path('edu/news.html')
s=p.read_text(encoding='utf-8')
if 'LIVE_KIDS_NEWS_PATCH_V1' in s:
    print('already patched')
    raise SystemExit

start=s.find('const tabsEl = document.getElementById("tabs");')
end=s.find('function refreshTabs(){', start)
if start < 0 or end < 0:
    raise SystemExit('tab setup not found')

new_tabs='''const tabsEl = document.getElementById("tabs");\nconst panelEl = document.getElementById("panel");\n\nfunction buildTabs(){\n  tabsEl.innerHTML = "";\n  ARTICLES.forEach((a,i)=>{\n    const b = document.createElement("button");\n    b.className = "tab";\n    b.type = "button";\n    b.setAttribute("role","tab");\n    b.id = "tab-" + a.id;\n    b.setAttribute("aria-controls","panel-" + a.id);\n    b.innerHTML = '<span class="pg" aria-hidden="true">' + (i + 1) + "</span>" + '<span><span class="tab-t">' + a.tabTitle + "</span>" + '<span class="tab-s">' + a.tabSub + "</span></span>" + '<span class="done" aria-hidden="true">✓</span>';\n    b.addEventListener("click", ()=>select(i));\n    b.addEventListener("keydown", e=>{\n      if(e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;\n      e.preventDefault();\n      const n = (i + (e.key === "ArrowRight" ? 1 : ARTICLES.length - 1)) % ARTICLES.length;\n      select(n); tabsEl.children[n].focus();\n    });\n    tabsEl.appendChild(b);\n  });\n}\nbuildTabs();\n\n'''
s=s[:start]+new_tabs+s[end:]

loader=r'''\n\n/* LIVE_KIDS_NEWS_PATCH_V1 */\nasync function loadLiveKidsNews(){\n  try{\n    const r=await fetch("news-data.json?t="+Date.now(),{cache:"no-store"});\n    if(!r.ok) throw new Error("news-data.json "+r.status);\n    const data=await r.json();\n    if(!Array.isArray(data.articles)||!data.articles.length) return;\n    const live=data.articles.slice(0,4).map((a,i)=>({\n      id:a.id||("live-"+(i+1)),\n      figs:[{k:"p1",cap:"실시간으로 선별된 어린이 뉴스",cr:"기사 원문 링크는 각 기사 출처를 확인하세요."}],\n      tabTitle:a.tabTitle||a.title||"최신 뉴스",\n      tabSub:(a.date||"")+" · "+(a.source||"뉴스"),\n      kicker:a.kicker||"🔥 오늘의 어린이 뉴스",\n      headline:a.title||"최신 뉴스",\n      date:a.date||"",\n      source:a.source||"뉴스",\n      facts:Array.isArray(a.facts)?a.facts:[],\n      paras:Array.isArray(a.paras)&&a.paras.length?a.paras:[a.summary||"최신 뉴스입니다."],\n      url:a.url||""\n    }));\n    ARTICLES.splice(0,ARTICLES.length,...live);\n    current=0;\n    buildTabs();\n    select(0);\n    refreshTabs();\n  }catch(e){ console.warn("실시간 뉴스 로드 실패. 기존 기사로 표시합니다.",e); }\n}\nwindow.addEventListener("load",loadLiveKidsNews);\n'''
# Append after the final script content. This file historically ends at a script close.
s=s.rstrip()+loader+'\n'
p.write_text(s,encoding='utf-8')
print('patched',p)
