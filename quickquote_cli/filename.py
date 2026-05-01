"""Filename sanitization and collision-free path generation."""
import os
import re

_ILLEGAL_CHARS = re.compile(r'[\\/*?:"<>|]')


def safe_name(name: str) -> str:
    """Strip characters that are illegal in Windows filenames."""
    return _ILLEGAL_CHARS.sub("_", name).strip()


def unique_path(directory: str, base: str, ext: str) -> str:
    """Return a path that doesn't collide with an existing file.

    Tries '<base>.<ext>' first, then '<base> (1).<ext>', '<base> (2).<ext>', etc.
    Does NOT create the file — just returns the path.
    """
    path = os.path.join(directory, f"{base}.{ext}")
    counter = 1
    while os.path.exists(path):
        path = os.path.join(directory, f"{base} ({counter}).{ext}")
        counter += 1
    return path
