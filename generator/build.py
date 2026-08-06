# -*- coding: utf-8 -*-
from pathlib import Path

from common import write_site
from data_a import CALCS_A
from data_b import CALCS_B
from data_c import CALCS_C
from data_d import CALCS_D
from data_e import CALCS_E
from data_f import CALCS_F

CALCS = CALCS_A + CALCS_B + CALCS_C + CALCS_D + CALCS_E + CALCS_F
COUNT = 80
assert len(CALCS) == COUNT, "Ожидалось %d калькуляторов, получено %d" % (COUNT, len(CALCS))
slugs = [c["slug"] for c in CALCS]
assert len(set(slugs)) == COUNT, "Дубли slug: %s" % [s for s in slugs if slugs.count(s) > 1]

known = set(slugs)
for c in CALCS:
    missing = [s for s in c.get("related", []) if s not in known]
    assert not missing, "У %s ссылки на несуществующие слаги: %s" % (c["slug"], missing)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
write_site(CALCS, str(PROJECT_ROOT))
