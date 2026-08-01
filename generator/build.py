# -*- coding: utf-8 -*-
from pathlib import Path

from common import write_site
from data_a import CALCS_A
from data_b import CALCS_B
from data_c import CALCS_C
from data_d import CALCS_D

CALCS = CALCS_A + CALCS_B + CALCS_C + CALCS_D
assert len(CALCS) == 35, "Ожидалось 35 калькуляторов, получено %d" % len(CALCS)
slugs = [c["slug"] for c in CALCS]
assert len(set(slugs)) == 35, "Дубли slug!"

PROJECT_ROOT = Path(__file__).resolve().parent.parent
write_site(CALCS, str(PROJECT_ROOT))
