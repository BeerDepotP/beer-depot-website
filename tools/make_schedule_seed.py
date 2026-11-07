"""Builds netlify/lib/schedule-seed.json: the November 2026 schedule copied from the owner's paper wall calendar.
The real site uses it once, the first time the Schedule tab is used (before anything is saved).
Paper notes: "Day Ty" = Ty's day shift -> 8:30-4. "PM <name>" = evening shift -> 12-8 Mon-Thu, 12-9 Fri. Other shifts use the times written."""
import json, pathlib
root = pathlib.Path(__file__).parent.parent
P = {"Ty":"owner","Jo":"pe-jo","Dave":"pe-dave","Gayle":"pe-gayle","Scott":"pe-scott","Heather":"pe-heather","Deb":"pe-deb","Logan":"pe-logan"}
DAYT = ("08:30","16:00")
def pm(d): return ("12:00","21:00") if d in (5,) else ("12:00","20:00")   # d = weekday number, Fri = 5
def t(a): h,m=a.split(":"); return f"{int(h):02d}:{m}"
S = {}  # date -> list of (name,start,end,note)
def add(day, name, start, end, note=""):
    S.setdefault(f"2026-11-{day:02d}", []).append((name, t(start), t(end), note))
import datetime
def wd(day): return (datetime.date(2026,11,day).weekday()+1) % 7   # Sun=0..Sat=6
def dayty(day): add(day,"Ty",*DAYT)
def PM(day,name): add(day,name,*pm(wd(day)))
# week 1
add(1,"Jo","8:30","16:00")
for d,pmn,extra in [(2,"Dave",None),(3,"Scott",("Gayle","16:00","19:00")),(4,"Scott",("Heather","16:00","19:00")),(5,"Scott",("Jo","16:00","19:00","Calendar says: PM Jo 4-7, Scott")),(6,"Scott",("Jo","16:00","20:00"))]:
    dayty(d); PM(d,pmn)
    if extra: add(d,*extra)
add(7,"Ty","9:00","15:00"); add(7,"Gayle","13:00","19:00"); add(7,"Scott","15:00","21:00")
# week 2
add(8,"Dave","8:30","16:00")
for d,pmn,extra in [(9,"Dave",None),(10,"Scott",("Gayle","16:00","19:00")),(11,"Scott",("Heather","16:00","19:00")),(12,"Scott",("Jo","16:00","19:00"))]:
    dayty(d); PM(d,pmn)
    if extra: add(d,*extra)
dayty(13); add(13,"Heather","16:00","20:00"); add(13,"Deb","16:00","21:00","Blue pen edits on calendar: check times")
add(14,"Ty","9:00","15:00"); add(14,"Deb","13:00","19:00"); add(14,"Jo","15:00","19:00")
# week 3
add(15,"Heather","8:30","16:00"); add(15,"Logan","11:00","15:00")
for d,pmn,extra in [(16,"Dave",None),(17,"Scott",("Gayle","16:00","19:00")),(18,"Scott",("Heather","16:00","19:00")),(19,"Scott",("Jo","16:00","19:00"))]:
    dayty(d); PM(d,pmn)
    if extra: add(d,*extra)
dayty(20); add(20,"Deb","16:00","20:00"); PM(20,"Scott")
add(21,"Dave","9:00","15:00"); add(21,"Deb","11:00","19:00"); add(21,"Scott","15:00","21:00")
# week 4
add(22,"Dave","8:30","16:00")
dayty(23); PM(23,"Dave")
dayty(24); PM(24,"Scott"); add(24,"Gayle","16:00","19:00")
dayty(25); PM(25,"Dave"); PM(25,"Scott")
dayty(27); add(27,"Jo","16:00","20:00","Calendar has no time for Jo"); add(27,"Scott","15:00","21:00")
add(28,"Ty","9:00","15:00"); add(28,"Gayle","13:00","19:00"); add(28,"Scott","15:00","19:00")
# week 5
add(29,"Jo","8:30","16:00")
dayty(30); PM(30,"Dave")
shifts, n = {}, 0
for date in sorted(S):
    rows=[]
    for name,s,e,note in sorted(S[date], key=lambda x:(x[1],x[2])):
        n+=1; rows.append({"id":f"n{n}","who":P[name],"start":s,"end":e,"note":note})
    shifts[date]=rows
out = {"ownerName":"Ty","people":[{"id":v,"name":k} for k,v in P.items() if v!="owner"],"shifts":shifts}
(root/"netlify/lib/schedule-seed.json").write_text(json.dumps(out,indent=1))
print(n,"shifts",len(shifts),"days")
