#!/usr/bin/env python3
"""Genereert de Moose-badges als PNG (public/badges/<id>.png).
Gebruik: python3 tools/badges/make_badges.py [id ...]
Vereist Playwright met Chromium en het lettertype Bricolage Grotesque (zelfde als het Moose-logo)."""
import json, os, sys, math, random
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "public", "badges")
FONT = os.environ.get("MOOSE_FONT", "/mnt/skills/examples/canvas-design/canvas-fonts/BricolageGrotesque-Bold.ttf")
W, H = 520, 624
CREAM, PINE, BUTTER, TOMATO = "#FBF3DC", "#17402E", "#F4D35E", "#E4452A"

SHAPES = {  # pad, banner (y, breedte), titel (basislijn, max breedte), horizon
  "shield": dict(d="M44 62Q260 22 476 62L476 362Q476 506 260 602Q44 506 44 362Z", ty=166, tw=316, by=512, bw=230, hz=398),
  "pent":   dict(d="M46 100L260 30L474 100L474 412L260 598L46 412Z", ty=186, tw=316, by=484, bw=236, hz=398),
  "oval":   dict(d="M260 22A222 290 0 1 1 259.9 22Z", ty=196, tw=262, by=538, bw=236, hz=398),
  "tab":    dict(d="M104 40H416Q480 40 480 104V520Q480 584 416 584H104Q40 584 40 520V104Q40 40 104 40Z", ty=158, tw=340, by=530, bw=290, hz=398),
}

# ---------- tekenbouwstenen ----------
def moose(cx, cy, s, col=CREAM, hole=PINE):
    return f'<g transform="translate({cx-60*s} {cy-50*s}) scale({s})"><use href="#moose" width="120" height="100" style="color:{col};--hole:{hole}"/></g>'

def bean(x, y, r=1.0, rot=0, col="#4A2A1A", hi="#7A4A2E"):
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({r})"><ellipse cx="3" cy="7" rx="17" ry="11" fill="#000" opacity=".28" filter="url(#blur3)"/>'
            f'<ellipse rx="17" ry="11" fill="{col}"/><ellipse rx="17" ry="11" fill="url(#beanhi)"/>'
            f'<path d="M-15 0Q-5 -4 0 0T15 0" fill="none" stroke="#1E100A" stroke-width="2.4" stroke-linecap="round"/></g>')

def stars(pts, col=CREAM, op=.9):
    out = ""
    for x, y, r in pts:
        out += f'<path transform="translate({x} {y}) scale({r})" d="M0 -10Q1 -1 10 0Q1 1 0 10Q-1 1 -10 0Q-1 -1 0 -10Z" fill="{col}" opacity="{op}"/>'
    return out

def sun(cx, cy, r, col="#FBE7A6", halo="#FFF3C4"):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r*2.1}" fill="url(#halo)"/><circle cx="{cx}" cy="{cy}" r="{r*1.22}" fill="none" stroke="{col}" stroke-width="3" opacity=".55"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{col}"/><circle cx="{cx-r*.25}" cy="{cy-r*.25}" r="{r*.7}" fill="{halo}" opacity=".5"/>')

def mountains(hz, c1, c2, shift=0, big=1.0):
    p1 = f"M-20 {hz} L60 {hz-90*big} L110 {hz-50*big} L180 {hz-150*big} L250 {hz-70*big} L300 {hz-120*big} L380 {hz-60*big} L450 {hz-130*big} L560 {hz-40*big} L560 {hz} Z"
    p2 = f"M-20 {hz} L40 {hz-40*big} L120 {hz-80*big} L200 {hz-30*big} L290 {hz-60*big} L370 {hz-24*big} L470 {hz-70*big} L560 {hz-20*big} L560 {hz} Z"
    caps = f'<path d="M180 {hz-150*big} L158 {hz-112*big} L174 {hz-120*big} L186 {hz-104*big} L198 {hz-122*big} L212 {hz-112*big} Z" fill="{CREAM}" opacity=".85"/>'
    return f'<g transform="translate({shift} 0)"><path d="{p1}" fill="{c1}"/>{caps}<path d="{p2}" fill="{c2}"/></g>'

def pines(xs, base, hs, col, op=1):
    out = ""
    for x, h in zip(xs, hs):
        w = h * .42
        out += (f'<g opacity="{op}"><rect x="{x-2.5}" y="{base-6}" width="5" height="8" fill="{col}"/>'
                + "".join(f'<path d="M{x} {base-h+i*h*.26} L{x-w*(.55+i*.17)} {base-h*.16-(2-i)*h*.0+ (i-2)*0 - (2-i)*h*.22+h*.0} L{x+w*(.55+i*.17)} {base-h*.16-(2-i)*h*.22} Z" fill="{col}"/>' for i in range(3)) + '</g>')
    return out

def lake(hz, col, n=6, cx=260, w0=300):
    out = ""
    for i in range(n):
        w = w0 * (1 - i * .13); y = hz + 14 + i * 13
        out += f'<rect x="{cx-w/2}" y="{y}" width="{w}" height="6" rx="3" fill="{col}" opacity="{.9-i*.1}"/>'
    return out

def cup(cx, by, s=1.0, latte=True, steam=True, tone="#5A3220"):
    g = f'<g transform="translate({cx} {by}) scale({s})">'
    g += '<ellipse cx="6" cy="14" rx="150" ry="22" fill="#000" opacity=".30" filter="url(#blur6)"/>'
    g += '<ellipse cx="0" cy="4" rx="132" ry="22" fill="url(#saucer)"/><ellipse cx="0" cy="0" rx="132" ry="21" fill="#F7EEDA"/><ellipse cx="0" cy="-1" rx="86" ry="12" fill="#E7DABB"/>'
    g += '<path d="M-84 -112 H84 L72 -26 Q66 -4 40 -4 H-40 Q-66 -4 -72 -26 Z" fill="url(#cupbody)"/>'
    g += '<path d="M82 -98 q46 -2 46 36 t-52 36" fill="none" stroke="url(#cupbody)" stroke-width="15" stroke-linecap="round"/>'
    g += '<ellipse cx="0" cy="-112" rx="84" ry="16" fill="#FFF8E6"/>'
    g += f'<ellipse cx="0" cy="-111" rx="72" ry="12.5" fill="{tone}"/>'
    if latte:
        g += '<path d="M0 -100 C-26 -112 -22 -124 0 -118 C22 -124 26 -112 0 -100Z" fill="#F1DDBA" opacity=".95" transform="translate(0 4) scale(.92 .5)"/>'
    g += '<path d="M-70 -100 Q-66 -50 -52 -20" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="7" stroke-linecap="round"/>'
    if steam:
        g += '<g fill="none" stroke="#FFF7E2" stroke-width="7" stroke-linecap="round" opacity=".75" filter="url(#blur2)"><path d="M-28 -136 q-16 -22 0 -44 t0 -44"/><path d="M6 -140 q-16 -24 0 -48 t0 -48"/><path d="M40 -136 q-14 -20 0 -40 t0 -40"/></g>'
    return g + '</g>'

def pumpkin(cx, by, s=1.0, face=False, col1="#F08A24", col2="#C45A14"):
    g = f'<g transform="translate({cx} {by}) scale({s})">'
    g += '<ellipse cx="6" cy="10" rx="108" ry="16" fill="#000" opacity=".3" filter="url(#blur6)"/>'
    for dx, rx, c in ((-52, 56, col2), (52, 56, col2), (-26, 56, col1), (26, 56, col1), (0, 50, col1)):
        g += f'<ellipse cx="{dx}" cy="-62" rx="{rx*.62 if abs(dx)<30 else rx*.55}" ry="62" fill="{c}"/>'
    g += '<ellipse cx="0" cy="-62" rx="100" ry="64" fill="url(#pumpshade)"/>'
    g += f'<path d="M-6 -118 Q-4 -140 12 -150 L22 -142 Q10 -136 12 -118Z" fill="#5C4A22"/><path d="M14 -128 q40 -26 56 4 q-22 -6 -46 6Z" fill="#6E8B3D"/>'
    if face:
        g += f'<path d="M-44 -78 l14 -22 l14 22Z M16 -78 l14 -22 l14 22Z" fill="#2A1408"/><path d="M-42 -44 q42 34 84 0 l-10 -8 l-10 10 l-12 -10 l-12 10 l-10 -10Z" fill="#2A1408"/>'
    return g + '</g>'

def flame(cx, by, s=1.0):
    return (f'<g transform="translate({cx} {by}) scale({s})"><ellipse cx="0" cy="6" rx="70" ry="12" fill="#000" opacity=".3" filter="url(#blur6)"/>'
            '<path d="M0 -180 C14 -134 64 -112 64 -62 A64 64 0 0 1 -64 -62 C-64 -92 -42 -108 -34 -142 C-22 -120 -8 -124 0 -180Z" fill="#F7A324"/>'
            '<path d="M0 -130 C10 -104 40 -92 40 -60 A40 40 0 0 1 -40 -60 C-40 -80 -24 -90 -18 -110 C-10 -98 -4 -102 0 -130Z" fill="#FFE08A"/></g>')

def star5(cx, cy, r, col="#FBE7A6", rot=0):
    pts = []
    for i in range(10):
        a = math.radians(-90 + rot + i * 36); rr = r if i % 2 == 0 else r * .46
        pts.append(f"{cx+rr*math.cos(a):.1f},{cy+rr*math.sin(a):.1f}")
    return f'<polygon points="{" ".join(pts)}" fill="{col}" stroke="{col}" stroke-width="4" stroke-linejoin="round"/>'

def cabin(cx, by, s=1.0):
    g = f'<g transform="translate({cx} {by}) scale({s})"><ellipse cx="0" cy="8" rx="130" ry="14" fill="#000" opacity=".3" filter="url(#blur6)"/>'
    g += '<rect x="-80" y="-100" width="160" height="100" fill="#8A4B2A"/>' + "".join(f'<rect x="-80" y="{-100+i*20}" width="160" height="3" fill="#6E3A20" opacity=".7"/>' for i in range(1, 5))
    g += '<path d="M-104 -96 L0 -176 L104 -96 Z" fill="#B3503A"/><path d="M-104 -96 L0 -176 L104 -96" fill="none" stroke="#FBF3DC" stroke-width="5" stroke-linejoin="round"/>'
    g += '<rect x="44" y="-168" width="20" height="40" fill="#6E3A20"/><rect x="-24" y="-64" width="48" height="64" rx="3" fill="#2A1A10"/><rect x="-60" y="-80" width="30" height="30" fill="#FFD66B"/><rect x="-60" y="-80" width="30" height="30" fill="url(#halo)" opacity=".9"/><path d="M-45 -80 V-50 M-60 -65 H-30" stroke="#6E3A20" stroke-width="3"/>'
    g += '<path d="M44 -176 q-10 -22 4 -40 q6 18 18 8" fill="none" stroke="#FFF7E2" stroke-width="6" stroke-linecap="round" opacity=".65" filter="url(#blur2)"/>'
    return g + '</g>'

def tree(cx, by, s=1.0, lights=True):
    g = f'<g transform="translate({cx} {by}) scale({s})"><ellipse cx="0" cy="8" rx="90" ry="12" fill="#000" opacity=".3" filter="url(#blur6)"/><rect x="-10" y="-26" width="20" height="30" fill="#6E3A20"/>'
    for i, (w, y) in enumerate(((100, -26), (80, -86), (58, -140))):
        g += f'<path d="M0 {y-84} L{w} {y} L-{w} {y}Z" fill="{["#1F6B45","#2A7D52","#38925F"][i]}"/>'
    if lights:
        for x, y, c in ((-36, -40, TOMATO), (30, -52, BUTTER), (-8, -100, BUTTER), (22, -104, TOMATO), (0, -150, CREAM), (-60, -20, BUTTER), (58, -18, TOMATO)):
            g += f'<circle cx="{x}" cy="{y}" r="6" fill="{c}"/><circle cx="{x}" cy="{y}" r="12" fill="{c}" opacity=".25"/>'
    g += star5(0, -240, 24, BUTTER)
    return g + '</g>'

def firework(cx, cy, r, col):
    g = f'<g transform="translate({cx} {cy})">'
    for i in range(12):
        a = math.radians(i * 30)
        g += f'<path d="M{math.cos(a)*r*.38:.1f} {math.sin(a)*r*.38:.1f} L{math.cos(a)*r:.1f} {math.sin(a)*r:.1f}" stroke="{col}" stroke-width="7" stroke-linecap="round"/><circle cx="{math.cos(a)*r*1.12:.1f}" cy="{math.sin(a)*r*1.12:.1f}" r="4.5" fill="{col}"/>'
    return g + f'<circle r="{r*.22}" fill="{col}"/></g>'

def tag(cx, by, s=1.0):
    return (f'<g transform="translate({cx} {by}) scale({s}) rotate(-12)"><ellipse cx="6" cy="6" rx="110" ry="14" fill="#000" opacity=".3" filter="url(#blur6)"/>'
            f'<path d="M-90 -150 H40 L120 -70 Q130 -58 120 -46 L50 24 Q40 34 28 24 L-90 -94Z" fill="{CREAM}"/><path d="M-90 -150 H40 L120 -70 Q130 -58 120 -46 L50 24 Q40 34 28 24 L-90 -94Z" fill="url(#cupbody)" opacity=".5"/>'
            f'<circle cx="-62" cy="-122" r="12" fill="#141416"/><path d="M-62 -122 Q-110 -170 -150 -140" fill="none" stroke="{CREAM}" stroke-width="5" stroke-linecap="round"/>'
            f'<text x="-4" y="-62" font-size="86" fill="{TOMATO}" text-anchor="middle" transform="rotate(45 -4 -76)" style="font-family:Moose;font-weight:700">%</text></g>')

def egg(cx, by, s, c1, c2, rot=0):
    return (f'<g transform="translate({cx} {by}) rotate({rot}) scale({s})"><ellipse cx="4" cy="6" rx="62" ry="10" fill="#000" opacity=".28" filter="url(#blur3)"/>'
            f'<path d="M0 -150 C44 -150 66 -92 66 -54 A66 56 0 0 1 -66 -54 C-66 -92 -44 -150 0 -150Z" fill="{c1}"/><path d="M-66 -66 l16 -14 l16 14 l16 -14 l16 14 l16 -14 l16 14 l16 -14 l16 14 l16 -14 v22 l-16 14 l-16 -14 l-16 14 l-16 -14 l-16 14 l-16 -14 l-16 14 l-16 -14 l-16 14Z" fill="{c2}"/><path d="M-40 -110 Q-50 -80 -48 -60" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="7" stroke-linecap="round"/></g>')

def flower(cx, cy, r, c1, c2):
    g = f'<g transform="translate({cx} {cy})">'
    for i in range(6):
        a = i * 60
        g += f'<ellipse rx="{r*.42}" ry="{r*.68}" cy="{-r*.62}" transform="rotate({a})" fill="{c1}"/>'
    return g + f'<circle r="{r*.3}" fill="{c2}"/></g>'

def heart(cx, by, s, col="#E4452A"):
    return (f'<g transform="translate({cx} {by}) scale({s})"><ellipse cx="4" cy="8" rx="80" ry="12" fill="#000" opacity=".28" filter="url(#blur6)"/>'
            f'<path d="M0 -4 C-110 -76 -80 -150 -36 -150 C-16 -150 -4 -138 0 -124 C4 -138 16 -150 36 -150 C80 -150 110 -76 0 -4Z" fill="{col}"/><path d="M-52 -126 q-24 12 -20 40" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="8" stroke-linecap="round"/></g>')

def mitre(cx, by, s):
    return (f'<g transform="translate({cx} {by}) scale({s})"><ellipse cx="4" cy="8" rx="84" ry="12" fill="#000" opacity=".3" filter="url(#blur6)"/>'
            '<path d="M-74 0 L-58 -128 Q0 -208 58 -128 L74 0Z" fill="#E4452A"/><path d="M-74 0 L-58 -128 Q0 -208 58 -128 L74 0Z" fill="url(#pumpshade)" opacity=".6"/>'
            f'<rect x="-8" y="-150" width="16" height="108" rx="3" fill="{BUTTER}"/><rect x="-36" y="-110" width="72" height="16" rx="3" fill="{BUTTER}"/><rect x="-76" y="-20" width="152" height="20" rx="4" fill="{BUTTER}"/></g>')

def snowflake(cx, cy, r, col=CREAM):
    g = f'<g transform="translate({cx} {cy})" stroke="{col}" stroke-width="9" stroke-linecap="round" fill="none">'
    for i in range(3):
        g += f'<g transform="rotate({i*60})"><path d="M0 {-r} V{r}"/><path d="M-{r*.22} {-r*.74} L0 {-r*.52} L{r*.22} {-r*.74} M-{r*.22} {r*.74} L0 {r*.52} L{r*.22} {r*.74}" stroke-width="7"/></g>'
    return g + '</g>'

def leafmaple(cx, by, s, c1="#D9691E", c2="#A3401A", rot=0):
    return (f'<g transform="translate({cx} {by}) rotate({rot}) scale({s})"><path d="M0 -150 L22 -108 L56 -122 L46 -78 L84 -70 L58 -44 L74 -10 L30 -22 L2 20 L-2 20 L-30 -22 L-74 -10 L-58 -44 L-84 -70 L-46 -78 L-56 -122 L-22 -108Z" fill="{c1}"/>'
            f'<path d="M0 -140 V30 M0 -90 L-34 -110 M0 -90 L34 -110 M0 -56 L-48 -62 M0 -56 L48 -62" stroke="{c2}" stroke-width="5" stroke-linecap="round" fill="none"/></g>')

def laurel(cx, cy, r, col=CREAM):
    g = f'<g transform="translate({cx} {cy})" fill="{col}">'
    for side in (-1, 1):
        for i in range(9):
            a = math.radians(-100 + i * 17)
            x, y = side * r * math.cos(a) * .98, -r * math.sin(a) * -1
            g += f'<ellipse cx="{side*r*math.sin(math.radians(i*17+8)):.1f}" cy="{-r*math.cos(math.radians(i*17+8)):.1f}" rx="7" ry="15" transform="rotate({side*(i*17+8+ (-28))} {side*r*math.sin(math.radians(i*17+8)):.1f} {-r*math.cos(math.radians(i*17+8)):.1f})" opacity=".92"/>'
    return g + '</g>'

# ---------- badge-definities ----------
# sky=(boven, onder), gnd=(boven, onder), hero = functie die svg teruggeeft
def scene_moose(sky, gnd, sun_col, tier, night=False):
    hz = 398
    s = ""
    if night:
        s += stars([(120, 230, .9), (400, 250, 1.1), (330, 200, .7), (170, 190, .6), (440, 330, .6), (86, 320, .7)])
        s += f'<circle cx="388" cy="236" r="46" fill="#F1E7C6"/><circle cx="404" cy="226" r="42" fill="{sky[0]}" opacity=".0"/>'
    else:
        s += sun(150 if tier != 4 else 392, 262, 40, sun_col)
    s += mountains(hz, gnd[0], gnd[1], 0, 1.0 if tier in (1, 3, 4) else .7)
    return s

BADGES = [
 dict(id="m1", t=["EERSTE", "SLOK"], l2="1 KOFFIE", kick="MOOSE COFFEE", shape="oval", sky=("#F1944A", "#F9CF8A"), gnd=("#C4481F", "#8E2E15"), rim=CREAM,
      art=lambda: sun(260, 330, 54, "#FFE7A8") + lake(398, "#F7C98C", 4) + cup(260, 470, .92) + bean(116, 506, 1, -20) + bean(402, 520, .9, 24)),
 dict(id="m10", t=["JONGE", "ELAND"], l2="10 KOFFIES", kick="MOOSE COFFEE", shape="shield", sky=("#2E8F84", "#9ED3BE"), gnd=("#1B5C58", "#123B3F"), rim=CREAM,
      art=lambda: sun(380, 270, 36, "#FFF0B8") + mountains(398, "#2B7C72", "#1B5C58", 0, .9) + pines([84, 118, 436, 470], 408, [96, 70, 88, 110], "#103A3B") + moose(260, 340, 1.78, CREAM, "#123B3F") + lake(404, "#2B7C72", 3) + bean(150, 484, .9, 14) + bean(380, 490, .8, -30)),
 dict(id="m20", t=["VASTE", "GAST"], l2="20 KOFFIES", kick="MOOSE COFFEE", shape="pent", sky=("#D2603F", "#F2AD7C"), gnd=("#862E24", "#5A1B1A"), rim=CREAM,
      art=lambda: sun(132, 280, 34, "#FFD9A0") + mountains(398, "#B8472F", "#862E24", 0, .8) + pines([86, 436, 472], 408, [70, 100, 78], "#4A1616") + moose(260, 336, 1.8, CREAM, "#5A1B1A") + cup(260, 462, .5) + bean(110, 470, .9, 20) + bean(424, 480, .8, -10)),
 dict(id="m50", t=["ELAND VAN", "HET HUIS"], l2="50 KOFFIES", kick="MOOSE COFFEE", shape="tab", sky=("#E1A93F", "#F6DB92"), gnd=("#3F5B3B", "#25392A"), rim=CREAM,
      art=lambda: sun(392, 266, 38, "#FFF1BE") + mountains(398, "#7F8F4D", "#3F5B3B", 0, 1.1) + pines([76, 112, 440, 472], 410, [110, 80, 100, 124], "#1F3324") + moose(260, 340, 1.88, CREAM, "#25392A") + stars([(110, 226, .7), (150, 190, .5), (420, 200, .5)], CREAM, .8) + lake(406, "#4F6A45", 3) + bean(144, 494, .9, -10) + bean(396, 496, .9, 30)),
 dict(id="m100", t=["LEGENDE VAN", "HET BOS"], l2="100 KOFFIES", kick="MOOSE COFFEE", shape="shield", sky=("#2D1E49", "#7D5392"), gnd=("#27163D", "#170C27"), rim=BUTTER, night=True,
      art=lambda: stars([(110, 214, .9), (160, 250, .6), (430, 220, 1.1), (350, 190, .7), (88, 316, .6), (450, 324, .7)], CREAM, .95) + f'<circle cx="260" cy="316" r="98" fill="url(#halo)"/><circle cx="260" cy="316" r="82" fill="#F1E3B2"/>' + mountains(398, "#4A3366", "#2B1944", 0, 1.1) + pines([84, 118, 440, 470], 410, [96, 70, 100, 120], "#150A24") + moose(260, 338, 1.9, BUTTER, "#27163D") + laurel(260, 404, 160, BUTTER) + bean(140, 492, .8, 20) + bean(390, 494, .8, -24)),
 dict(id="pumpkin", t=["PUMPKIN", "SPICE"], l2="SEIZOENSFAVORIET", kick="MOOSE COFFEE", shape="pent", sky=("#E0801F", "#F7C57A"), gnd=("#7A3412", "#4C1F0B"), rim=CREAM,
      art=lambda: sun(380, 270, 34, "#FFE9B0") + pumpkin(190, 470, .92) + cup(352, 468, .56, tone="#8A4A22") + leafmaple(120, 500, .22, "#C0521C", "#7A3412", -20) + bean(446, 486, .7, 10)),
 dict(id="all", t=["ALLES", "GEPROEFD"], l2="9 DRANKJES", kick="MOOSE COFFEE", shape="pent", sky=("#2D5E93", "#8DB6D6"), gnd=("#183456", "#0F2038"), rim=CREAM,
      art=lambda: sun(260, 312, 44, "#F6E7B8") + cup(260, 468, .74) + "".join(bean(260 + 148 * math.cos(math.radians(a)), 380 + 78 * math.sin(math.radians(a)) * 1.2, .9, a) for a in range(200, 345, 24))),
 dict(id="season", t=["SEIZOENS", "GAST"], l2="LIMITED", kick="MOOSE COFFEE", shape="tab", sky=("#D9A441", "#F3D58E"), gnd=("#6A4A1E", "#3E2A12"), rim=CREAM,
      art=lambda: sun(392, 270, 34, "#FFF0BC") + leafmaple(170, 470, .9, "#C0521C", "#7A3412", -12) + leafmaple(340, 480, .7, "#E3A02B", "#8E5B14", 20) + leafmaple(260, 330, .5, "#A3401A", "#5A2A10", 6) + bean(420, 500, .8, 20)),
 dict(id="streak5", t=["VIJF", "OP RIJ"], l2="5 DAGEN", kick="MOOSE COFFEE", shape="oval", sky=("#C9462B", "#F59A5E"), gnd=("#7A2418", "#4A1410"), rim=CREAM,
      art=lambda: flame(260, 470, 1.06) + "".join(bean(120 + i * 70, 506 + (i % 2) * 8, .8, i * 25 - 40) for i in range(5)) + stars([(120, 260, .8), (410, 280, .7)], "#FFE2A8")),
 dict(id="jury", t=["SMAAK", "JURY"], l2="6 BEOORDEELD", kick="MOOSE COFFEE", shape="shield", sky=("#D9A441", "#F6DD9A"), gnd=("#4A3A22", "#2E2314"), rim=CREAM,
      art=lambda: "".join(star5(260 + (i - 2) * 76, 250 + abs(i - 2) * 18, 32, "#FFF2C6", 0) for i in range(5)) + cup(260, 466, .78) + bean(120, 500, .8, 16) + bean(404, 504, .8, -14)),
 dict(id="early", t=["VROEGE", "VOGEL"], l2="VOOR 9 UUR", kick="MOOSE COFFEE", shape="pent", sky=("#3A8E96", "#F4C27B"), gnd=("#1E5560", "#143A44"), rim=CREAM,
      art=lambda: sun(260, 392, 78, "#FFE2A0") + lake(398, "#F4C27B", 5) + cup(260, 480, .62, steam=True) + stars([(120, 230, .8), (410, 220, 1), (330, 190, .6), (190, 190, .6)], CREAM, .9)),
 dict(id="cottage", t=["COTTAGE", "EXCLUSIVE"], l2="2026", kick="MOOSE COFFEE", shape="shield", sky=("#1C2E4A", "#5F7FA0"), gnd=("#143626", "#0C2218"), rim=BUTTER, night=True,
      art=lambda: stars([(110, 214, .9), (170, 250, .6), (420, 220, 1.1), (350, 190, .7), (88, 316, .6), (450, 310, .7)]) + f'<circle cx="392" cy="248" r="34" fill="#F1E7C6"/>' + pines([76, 112, 150, 440, 474], 410, [120, 150, 100, 140, 110], "#0B2016") + cabin(260, 440, .98) + lake(414, "#1E4A36", 2) + stars([(260, 168, .5)])),
 dict(id="halloween", t=["HAPPY", "HALLOWEEN"], l2="31 OKTOBER", kick="MOOSE COFFEE", shape="oval", sky=("#2D1B3F", "#8A4A7A"), gnd=("#1A0F24", "#0E0716"), rim=CREAM, night=True,
      art=lambda: f'<circle cx="260" cy="300" r="64" fill="#F1E3B2"/>' + stars([(110, 250, .7), (420, 240, .8)]) + pumpkin(260, 480, .82, face=True) + bean(110, 506, .7, 10)),
 dict(id="sint", t=["SINTER", "KLAAS"], l2="6 DECEMBER", kick="MOOSE COFFEE", shape="tab", sky=("#C9452E", "#F2A584"), gnd=("#6E1F1B", "#3F1010"), rim=CREAM,
      art=lambda: stars([(110, 230, .8), (410, 250, .8), (150, 300, .5)], "#FFE9B0") + mitre(260, 470, 1.02) + bean(120, 496, .8, 12) + bean(412, 500, .8, -18)),
 dict(id="thanks", t=["THANKS", "GIVING"], l2="NOVEMBER", kick="MOOSE COFFEE", shape="pent", sky=("#D9A441", "#F4D58C"), gnd=("#7A3A14", "#4A210B"), rim=CREAM,
      art=lambda: sun(390, 270, 36, "#FFF0BC") + pumpkin(260, 478, 1.0, col1="#EE8A1E", col2="#B84F12") + leafmaple(110, 490, .3, "#C0521C", "#7A3412", -18) + leafmaple(414, 494, .3, "#E3A02B", "#8E5B14", 18)),
 dict(id="blackfri", t=["BLACK", "FRIDAY"], l2="27 NOVEMBER", kick="MOOSE COFFEE", shape="shield", sky=("#26262B", "#4A4A54"), gnd=("#141416", "#08080A"), rim=CREAM,
      art=lambda: stars([(110, 240, .8), (420, 250, .9), (330, 200, .6)], "#FFD66B") + tag(274, 470, 1.0) + bean(112, 500, .8, 18, "#2A1A12", "#5A3A22") + bean(408, 504, .8, -20, "#2A1A12", "#5A3A22")),
 dict(id="xmas", t=["MERRY", "KERSTMIS"], l2="24 + 25 DEC", kick="MOOSE COFFEE", shape="shield", sky=("#1F5B3E", "#7DB591"), gnd=("#6C1F1D", "#3F1010"), rim=BUTTER,
      art=lambda: stars([(110, 240, .8), (420, 240, .9), (150, 300, .5), (390, 300, .5)], CREAM) + tree(260, 480, .98) + bean(110, 500, .8, 18) + bean(414, 504, .8, -20)),
 dict(id="nye", t=["OUD &", "NIEUW"], l2="31 DEC", kick="MOOSE COFFEE", shape="oval", sky=("#15244A", "#4D5FA3"), gnd=("#0E1632", "#070C1E"), rim=BUTTER, night=True,
      art=lambda: firework(260, 300, 78, BUTTER) + firework(120, 262, 40, "#F59A9A") + firework(410, 270, 46, "#9DD6F5") + lake(398, "#4D5FA3", 4) + cup(260, 488, .54)),
 dict(id="valentine", t=["VALENTIJN"], l2="14 FEBRUARI", kick="MOOSE COFFEE", shape="tab", sky=("#D85C6F", "#F6B3B3"), gnd=("#8A2038", "#5A1224"), rim=CREAM,
      art=lambda: stars([(110, 250, .8), (410, 240, .9), (150, 320, .5), (400, 320, .6)], "#FFE2E2") + heart(260, 474, 1.14) + bean(120, 496, .8, 16) + bean(408, 500, .8, -20)),
 dict(id="easter", t=["HAPPY", "PASEN"], l2="LENTE", kick="MOOSE COFFEE", shape="oval", sky=("#7FC0A0", "#E7E2A4"), gnd=("#4C8A4A", "#2F6035"), rim=CREAM,
      art=lambda: egg(180, 478, .88, "#F2A5B8", "#FBF3DC", -8) + egg(272, 484, 1.06, "#F4D35E", "#E4452A", 4) + egg(364, 478, .84, "#7FC0E8", "#FBF3DC", 10) + flower(120, 500, 28, CREAM, BUTTER) + flower(412, 506, 26, CREAM, BUTTER)),
 dict(id="spring", t=["EERSTE", "LENTEDAG"], l2="20 MAART", kick="MOOSE COFFEE", shape="pent", sky=("#8CCBB0", "#F2E6A6"), gnd=("#4C8A4A", "#2F6035"), rim=CREAM,
      art=lambda: sun(380, 270, 38, "#FFF2B8") + flower(170, 470, 52, "#F2A5B8", BUTTER) + flower(280, 486, 68, CREAM, BUTTER) + flower(392, 470, 48, "#F4D35E", "#E4452A") + mountains(398, "#74B08E", "#4C8A4A", 0, .6)),
 dict(id="summer", t=["EERSTE", "ZOMERDAG"], l2="21 JUNI", kick="MOOSE COFFEE", shape="oval", sky=("#F59A2B", "#FBD78A"), gnd=("#2E8F9C", "#1B5C70"), rim=CREAM,
      art=lambda: sun(260, 330, 76, "#FFF0B8") + lake(398, "#9FD8D8", 6) + cup(260, 506, .5, tone="#5A3220")),
 dict(id="autumn", t=["EERSTE", "HERFSTDAG"], l2="22 SEPTEMBER", kick="MOOSE COFFEE", shape="tab", sky=("#D9803A", "#F4C27B"), gnd=("#6E3A1A", "#43220F"), rim=CREAM,
      art=lambda: sun(392, 262, 34, "#FFF0BC") + leafmaple(150, 470, .92, "#C0521C", "#7A3412", -14) + leafmaple(300, 486, .74, "#E3A02B", "#8E5B14", 18) + leafmaple(400, 360, .4, "#A3401A", "#5A2A10", -30)),
 dict(id="winter", t=["EERSTE", "WINTERDAG"], l2="21 DECEMBER", kick="MOOSE COFFEE", shape="shield", sky=("#4E78A8", "#C9DDEE"), gnd=("#DDE9F3", "#A9C0D6"), rim=CREAM,
      art=lambda: stars([(110, 230, .7), (420, 240, .8)]) + mountains(398, "#8FB0D0", "#C2D6E8", 0, .9) + pines([84, 118, 440, 472], 410, [96, 70, 100, 120], "#2B4A66") + snowflake(260, 296, 74) + cup(260, 506, .5, tone="#5A3220")),
]

def sky_ground(b, sh):
    hz = sh["hz"]
    return (f'<rect x="0" y="0" width="{W}" height="{hz}" fill="url(#sky)"/><rect x="0" y="{hz}" width="{W}" height="{H-hz}" fill="url(#gnd)"/>')

def lum(h):
    h=h.lstrip("#"); r,g,bb=[int(h[i:i+2],16) for i in (0,2,4)]
    return (.299*r+.587*g+.114*bb)
DY={"m20":22,"m50":22,"nye":34,"jury":26,"xmas":30,"m10":10,"m100":10,"cottage":12,"spring":10}
def build_svg(b):
    sh = SHAPES[b["shape"]]; d = sh["d"]; hz = sh["hz"]; pid = b["id"]
    rim = b.get("rim", CREAM)
    t = b["t"]
    tsize_hint = 60
    # titel
    dark = lum(b["sky"][0]) > 118
    tcol = PINE if dark else CREAM
    kcol = PINE if dark else CREAM
    tspans = "".join(f'<text class="title" fill="{tcol}" data-g="{pid}" x="260" y="{sh["ty"] + i*1}" data-i="{i}">{x.replace("&","&amp;")}</text>' for i, x in enumerate(t))
    defs = f'''<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{b['sky'][0]}"/><stop offset="1" stop-color="{b['sky'][1]}"/></linearGradient>
<linearGradient id="gnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{b['gnd'][0]}"/><stop offset="1" stop-color="{b['gnd'][1]}"/></linearGradient>
<radialGradient id="halo"><stop offset="0" stop-color="#FFF6D2" stop-opacity=".85"/><stop offset="1" stop-color="#FFF6D2" stop-opacity="0"/></radialGradient>
<radialGradient id="beanhi" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="cupbody" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E4D8BC"/><stop offset=".3" stop-color="#FFF8E6"/><stop offset=".75" stop-color="#F4EAD0"/><stop offset="1" stop-color="#CDBF9F"/></linearGradient>
<linearGradient id="saucer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFC2A3"/><stop offset="1" stop-color="#A89A7A"/></linearGradient>
<radialGradient id="pumpshade" cx=".5" cy=".4" r=".65"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#3A1608" stop-opacity=".5"/></radialGradient>
<radialGradient id="vig" cx=".5" cy=".45" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#2A0F05" stop-opacity=".32"/></radialGradient>
<filter id="blur2"><feGaussianBlur stdDeviation="2"/></filter><filter id="blur3"><feGaussianBlur stdDeviation="3"/></filter><filter id="blur6" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="7"/></filter>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="12" stdDeviation="11" flood-color="#1b0d05" flood-opacity=".42"/></filter>
<filter id="grainD" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".95" numOctaves="3" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 .06  0 0 0 0 .03  0 0 0 0 0  3.2 0 0 0 -1.5"/></filter>
<filter id="grainL" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="21"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 .95  0 0 0 0 .8  -3.2 0 0 0 1.55"/></filter>
<filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".02 .9" numOctaves="2" seed="4"/><feColorMatrix type="matrix" values="0 0 0 0 .3  0 0 0 0 .2  0 0 0 0 .1  0 0 1.2 0 -.5"/></filter>
<clipPath id="outer"><path d="{d}"/></clipPath>
<clipPath id="inner"><path d="{d}" transform="translate(260 312) scale(.885) translate(-260 -312)"/></clipPath>
</defs>'''
    body = f'''<g filter="url(#shadow)"><path d="{d}" fill="{rim}" stroke="{rim}" stroke-width="10" stroke-linejoin="round"/></g>
<g clip-path="url(#outer)"><rect width="{W}" height="{H}" fill="{rim}"/><rect width="{W}" height="{H}" filter="url(#paper)" opacity=".5"/></g>
<g clip-path="url(#inner)">{sky_ground(b, sh)}<g transform="translate(0 {DY.get(b['id'],0)})">{b['art']()}</g><rect width="{W}" height="{H}" fill="url(#vig)"/></g>
<path d="{d}" transform="translate(260 312) scale(.885) translate(-260 -312)" fill="none" stroke="{rim}" stroke-width="2.6" stroke-opacity=".0"/>
<path d="{d}" transform="translate(260 312) scale(.84) translate(-260 -312)" fill="none" stroke="{rim}" stroke-width="2.4" stroke-opacity=".55" stroke-linejoin="round" stroke-dasharray="1 0"/>
<g class="type" data-pid="{pid}" data-ty="{sh['ty']}" data-tw="{sh['tw']}" data-by="{sh['by']}" data-bw="{sh['bw']}">
<text class="kick" x="260" y="0" fill="{kcol}" opacity=".8">{b['kick']}</text>
{tspans}
<g class="band"><rect class="bandbg" fill="{CREAM}"/><text class="lab" x="260" y="0" fill="{PINE}">{b['l2'].replace('&','&amp;')}</text></g>
</g>
<g clip-path="url(#outer)" style="mix-blend-mode:multiply"><rect width="{W}" height="{H}" filter="url(#grainD)" opacity=".22"/></g>
<g clip-path="url(#outer)" style="mix-blend-mode:screen"><rect width="{W}" height="{H}" filter="url(#grainL)" opacity=".16"/></g>'''
    return f'<svg id="b-{pid}" xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{defs}{body}</svg>'

MOOSE_SYMBOL = None

def html(items):
    sym = open(os.path.join(HERE, "..", "..", "public", "index.html"), encoding="utf8").read()
    i = sym.index('<symbol id="moose"'); j = sym.index("</symbol>", i) + 9
    symbol = f'<svg width="0" height="0" style="position:absolute"><defs>{sym[i:j]}</defs></svg>'
    css = '''@font-face{font-family:Moose;src:url("file://%s");font-weight:700}
html,body{margin:0;background:transparent}svg{display:block;margin:0}
text{font-family:Moose,sans-serif;font-weight:700;text-anchor:middle}
.title{letter-spacing:.012em}.kick{font-size:15px;letter-spacing:.3em}.lab{font-size:21px;letter-spacing:.2em}''' % FONT
    script = '''
function fit(){document.fonts.ready.then(()=>{
 for(const g of document.querySelectorAll('.type')){
  const ty=+g.dataset.ty,tw=+g.dataset.tw,by=+g.dataset.by,bw=+g.dataset.bw,T=[...g.querySelectorAll('.title')];
  let size=76;for(const t of T){t.style.fontSize='100px';const w=t.getBBox().width;size=Math.min(size,100*tw/w);}
  size=Math.max(34,Math.min(size,64));
  T.forEach((t,i)=>{t.style.fontSize=size+'px';t.setAttribute('y',ty+i*size*.98);});
  const k=g.querySelector('.kick');k.setAttribute('y',ty-size*.74-15);
  const lab=g.querySelector('.lab');lab.setAttribute('y',by+7.5);
  let w=lab.getBBox().width+44;w=Math.max(w,120);const r=g.querySelector('.bandbg');r.setAttribute('x',260-w/2);r.setAttribute('y',by-22);r.setAttribute('width',w);r.setAttribute('height',44);r.setAttribute('rx',22);
 }document.body.dataset.ready='1';});}
fit();'''
    return f'<!doctype html><meta charset="utf8"><style>{css}</style>{symbol}' + "".join(items) + f'<script>{script}</script>'

def main():
    only = sys.argv[1:]
    items = [b for b in BADGES if not only or b["id"] in only]
    os.makedirs(OUT, exist_ok=True)
    tmp = os.path.join(HERE, "_render.html")
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        for b in items:
            open(tmp, "w", encoding="utf8").write(html([build_svg(b)]))
            pg.goto("file://" + tmp); pg.wait_for_selector("body[data-ready='1']"); pg.wait_for_timeout(200)
            pg.locator("#b-" + b["id"]).screenshot(path=os.path.join(OUT, b["id"] + ".png"), omit_background=True)
        br.close()
    os.remove(tmp)
    print("klaar:", ", ".join(b["id"] for b in items))

if __name__ == "__main__":
    main()
