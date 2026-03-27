from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

GRADE_POINT_STORAGE_SCALE = Decimal("0.0001")
DISPLAY_SCALE = Decimal("0.001")


def to_decimal(value: Decimal | str | int | float) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def quantize_storage(value: Decimal) -> Decimal:
    return value.quantize(GRADE_POINT_STORAGE_SCALE, rounding=ROUND_HALF_UP)


def quantize_display(value: Decimal) -> Decimal:
    return value.quantize(DISPLAY_SCALE, rounding=ROUND_HALF_UP)
