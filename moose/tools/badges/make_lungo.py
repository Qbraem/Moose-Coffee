import os
from playwright.sync_api import sync_playwright
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","..","public","photos","lungo.jpg")
svg='''<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1125" viewBox="0 0 900 1125">
<defs>
<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F6FA3"/><stop offset="1" stop-color="#4C8FBF"/></linearGradient>
<linearGradient id="tab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1F5483"/><stop offset="1" stop-color="#173F66"/></linearGradient>
<linearGradient id="cup" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#D9CDB0"/><stop offset=".28" stop-color="#FFF8E6"/><stop offset=".72" stop-color="#F3E9CF"/><stop offset="1" stop-color="#C4B793"/></linearGradient>
<linearGradient id="sau" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4ECD8"/><stop offset="1" stop-color="#CFC3A6"/></linearGradient>
<filter id="b"><feGaussianBlur stdDeviation="14"/></filter><filter id="s"><feGaussianBlur stdDeviation="5"/></filter>
<filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 .05 0 0 0 0 .03 0 0 0 0 0 3 0 0 0 -1.35"/></filter>
<filter id="gl" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 .96 0 0 0 0 .85 -3 0 0 0 1.5"/></filter>
<radialGradient id="v" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#0a1a2a" stop-opacity=".35"/></radialGradient>
</defs>
<rect width="900" height="1125" fill="url(#wall)"/><rect y="500" width="900" height="625" fill="url(#tab)"/><rect y="498" width="900" height="3" fill="#000" opacity=".12"/>
<g fill="none" stroke="#FFF7E2" stroke-width="22" stroke-linecap="round" opacity=".55" filter="url(#s)"><path d="M390 440 q-34 -70 0 -140 t0 -140"/><path d="M460 430 q-34 -80 0 -160 t0 -160"/><path d="M530 440 q-30 -66 0 -130 t0 -130"/></g>
<ellipse cx="470" cy="905" rx="360" ry="46" fill="#000" opacity=".35" filter="url(#b)"/>
<ellipse cx="450" cy="842" rx="340" ry="64" fill="url(#sau)"/><ellipse cx="450" cy="826" rx="340" ry="64" fill="#FBF3DC"/><ellipse cx="450" cy="826" rx="222" ry="34" fill="#E6D9BA"/>
<path d="M296 460 H604 L576 750 Q568 810 516 810 H384 Q332 810 324 750 Z" fill="url(#cup)"/>
<path d="M598 500 q100 -4 100 76 t-112 80" fill="none" stroke="url(#cup)" stroke-width="38" stroke-linecap="round"/>
<ellipse cx="450" cy="460" rx="154" ry="40" fill="#FFF8E6"/><ellipse cx="450" cy="462" rx="136" ry="32" fill="#4A2616"/><ellipse cx="450" cy="466" rx="120" ry="24" fill="#8A5530"/><ellipse cx="410" cy="460" rx="40" ry="8" fill="#E8C79A" opacity=".55"/>
<path d="M322 520 Q330 660 346 750" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="14" stroke-linecap="round"/>
<g transform="translate(150 930) rotate(-4)"><rect width="190" height="36" rx="3" fill="#D58A3A"/><rect y="24" width="190" height="12" fill="#000" opacity=".12"/></g>
<g transform="translate(560 1030) rotate(2)"><rect width="250" height="48" rx="3" fill="#1F6B4A"/><path d="M42 24 l22 -12 l22 12 l-22 6Z" fill="#F4D35E"/><rect x="108" y="16" width="110" height="5" fill="#F4D35E"/><rect x="108" y="28" width="90" height="5" fill="#F4D35E"/></g>
<g fill="#4A2A1A"><ellipse cx="170" cy="1040" rx="30" ry="20" transform="rotate(-20 170 1040)"/><ellipse cx="740" cy="930" rx="30" ry="20" transform="rotate(18 740 930)"/><ellipse cx="540" cy="1080" rx="28" ry="18" transform="rotate(-8 540 1080)"/></g>
<g stroke="#1E100A" stroke-width="4" stroke-linecap="round" fill="none"><path d="M148 1040 q18 -6 44 0"/><path d="M718 930 q18 -6 44 0"/><path d="M520 1080 q18 -6 42 0"/></g>
<rect width="900" height="1125" fill="url(#v)"/>
<rect width="900" height="1125" filter="url(#g)" opacity=".3" style="mix-blend-mode:multiply"/><rect width="900" height="1125" filter="url(#gl)" opacity=".18" style="mix-blend-mode:screen"/>
</svg>'''
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":900,"height":1125})
    pg.set_content('<body style="margin:0">'+svg); pg.screenshot(path=OUT,type="jpeg",quality=82); b.close()
print(os.path.getsize(OUT))
