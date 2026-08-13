# -*- coding: utf-8 -*-
from pathlib import Path

from common import write_site
from data_a import CALCS_A
from data_b import CALCS_B
from data_c import CALCS_C
from data_d import CALCS_D
from data_e import CALCS_E
from data_f import CALCS_F
from data_g import CALCS_G

CALCS = CALCS_A + CALCS_B + CALCS_C + CALCS_D + CALCS_E + CALCS_F + CALCS_G

# notice-страницы остаются по своему URL, но ничего не вычисляют: калькулятор
# снят с публикации. В каталог и sitemap они не попадают.
PAGES = 100          # всего генерируемых страниц-разделов
CALCULATORS = 99     # из них с работающим расчётом
assert len(CALCS) == PAGES, "Ожидалось %d страниц, получено %d" % (PAGES, len(CALCS))
real = [c for c in CALCS if not c.get("notice")]
assert len(real) == CALCULATORS, "Ожидалось %d калькуляторов, получено %d" % (CALCULATORS, len(real))
slugs = [c["slug"] for c in CALCS]
assert len(set(slugs)) == PAGES, "Дубли slug: %s" % [s for s in slugs if slugs.count(s) > 1]

for c in CALCS:
    if c.get("notice"):
        assert "fields" not in c and "js" not in c, \
            "%s помечен notice, но содержит форму или расчёт" % c["slug"]
    else:
        assert c.get("fields") and c.get("js"), \
            "%s не notice, но без полей или расчёта" % c["slug"]

known = set(slugs)
for c in CALCS:
    missing = [s for s in c.get("related", []) if s not in known]
    assert not missing, "У %s ссылки на несуществующие слаги: %s" % (c["slug"], missing)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
write_site(CALCS, str(PROJECT_ROOT))
