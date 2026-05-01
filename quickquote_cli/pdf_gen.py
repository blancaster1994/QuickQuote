"""PDF rendering via Microsoft Word COM (docx2pdf).

Pipeline: build a .docx from the template (via the existing generate_proposal
path), then hand it to Word for PDF export. Word itself renders the PDF, so
output is pixel-perfect with what a user would get from File → Save As PDF
inside Word. Requires Microsoft Word installed on the host — all CES machines
have it.
"""
from __future__ import annotations
import os

from docx2pdf import convert


def convert_docx_to_pdf(docx_path: str, pdf_path: str) -> str:
    """Convert a .docx to PDF via Word COM. Returns the output path.

    Both paths must be absolute. The output directory must already exist.
    Raises if Word isn't installed or the input doesn't exist.
    """
    if not os.path.isabs(docx_path) or not os.path.isabs(pdf_path):
        raise ValueError("convert_docx_to_pdf requires absolute paths")
    if not os.path.exists(docx_path):
        raise FileNotFoundError(docx_path)
    out_dir = os.path.dirname(pdf_path)
    if not os.path.isdir(out_dir):
        raise FileNotFoundError(f"output dir does not exist: {out_dir}")

    convert(docx_path, pdf_path)

    if not os.path.exists(pdf_path):
        raise RuntimeError(
            "docx2pdf reported success but the PDF wasn't written. "
            "Is Microsoft Word installed and licensed on this machine?"
        )
    return pdf_path
