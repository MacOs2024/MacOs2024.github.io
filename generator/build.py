# -*- coding: utf-8 -*-
from pathlib import Path

from common import write_site
from data_a import CALCS_A
from data_b import CALCS_B
from data_c import CALCS_C
from data_d import CALCS_D
from data_e import CALCS_E

CALCS = CALCS_A + CALCS_B + CALCS_C + CALCS_D + CALCS_E
assert len(CALCS) == 50, "Ожидалось 50 калькуляторов, получено %d" % len(CALCS)
slugs = [c["slug"] for c in CALCS]
assert len(set(slugs)) == 50, "Дубли slug!"

PROJECT_ROOT = Path(__file__).resolve().parent.parent
write_site(CALCS, str(PROJECT_ROOT))
