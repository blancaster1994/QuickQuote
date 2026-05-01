"""Fee number/word formatting and billing-sentence construction."""

_ONES  = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
          "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
          "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
_TENS  = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy",
          "Eighty", "Ninety"]


def number_to_words(n: int) -> str:
    """Convert a non-negative integer to English words in title case.

    Supports values from 0 to 999,999,999.
    Examples: 4000 -> 'Four Thousand', 10475 -> 'Ten Thousand Four Hundred Seventy-Five'
    """
    if n == 0:
        return "Zero"
    if n < 0:
        return "Negative " + number_to_words(-n)

    def _chunk(num: int) -> str:
        if num == 0:
            return ""
        if num < 20:
            return _ONES[num]
        if num < 100:
            rest = _ONES[num % 10]
            return _TENS[num // 10] + ("-" + rest if rest else "")
        rest = _chunk(num % 100)
        return _ONES[num // 100] + " Hundred" + (" " + rest if rest else "")

    parts: list[str] = []
    for divisor, label in ((1_000_000, " Million"), (1_000, " Thousand"), (1, "")):
        group = n // divisor
        n %= divisor
        if group:
            parts.append(_chunk(group) + label)
    return " ".join(parts)


def format_fee_for_doc(raw: str) -> str:
    """Convert a raw fee string to 'Words ($Number)' for the Word document.

    '4,000'    -> 'Four Thousand ($4,000)'
    '10475'    -> 'Ten Thousand Four Hundred Seventy-Five ($10,475)'
    '4500.50'  -> 'Four Thousand Five Hundred ($4,500.50)'
    Non-numeric or empty -> returned unchanged.
    """
    cleaned = raw.replace(",", "").replace(" ", "").strip()
    if not cleaned:
        return raw
    try:
        value = float(cleaned)
    except ValueError:
        return raw
    # Standard round-half-up (avoids banker's rounding on int(value) when .5).
    rounded = int(value + 0.5) if value >= 0 else int(value - 0.5)
    words = number_to_words(rounded)
    if value == int(value):
        formatted = f"${int(value):,}"
    else:
        formatted = f"${value:,.2f}"
    return f"{words} ({formatted})"


def build_fee_text(fee_raw: str, billing_type: str, nte: bool) -> str:
    """Return the complete fee sentence for the given billing mode."""
    if billing_type == "tm":
        base = ("Fees for these services shall be billed on a time and material "
                "basis in accordance with the attached schedule of professional "
                "services")
        if nte and fee_raw.strip():
            formatted_fee = format_fee_for_doc(fee_raw)
            return (base + ' up to a \u201cNot-to-Exceed\u201d amount of '
                    + formatted_fee + ' dollars.')
        else:
            return base + "."
    # Fixed fee (original behavior)
    formatted_fee = format_fee_for_doc(fee_raw)
    return ("The fee for these services shall be a fixed fee price of "
            + formatted_fee + " dollars. Additional work above the scope "
            "referenced above will be billed on an hourly basis in "
            "accordance with the attached schedule of professional services.")
