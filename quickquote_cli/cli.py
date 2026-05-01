"""CLI entry point — spawned by Electron via child_process.spawn.

Reads a JSON payload from stdin (or --input-file), generates a .docx (or
.pdf), and prints one JSON line on stdout with the output path. Errors go
to stdout as JSON too (with `ok: false`) and exit non-zero.

Designed so the CLI is the single source of truth for DOCX/PDF rendering;
the Electron side only marshals data. Pattern mirrors PM Quoting App's
quoting_cli/cli.py.

Input shape (Electron builds this from a proposal + signer lookup):

  {
    "format": "docx" | "pdf",
    "rate_table": "consulting" | "structural",
    "output_dir": "<absolute path to per-project subfolder>",
    "output_filename": "<safe-name> - Proposal v<N>.docx",
    "values": {
       "date": "...", "project_name": "...", "project_address": "...",
       "project_city_state_zip": "...", "client_name": "...",
       "client_contact": "...", "client_address": "...",
       "client_city": "...",  // {{CLIENT_CITY_STATE_ZIP}} placeholder
       "scope_title": "...", "scope_of_work": "...",
       "signer_name": "...", "signer_title": "..."
    },
    "section1_fee": "<numeric string or empty>",
    "section1_billing_type": "fixed" | "tm",
    "section1_nte": false,
    "extra_sections": [
       [title, scope, fee, billing_type, nte_flag], ...
    ]
  }

Output shape:

  { "ok": true,  "path": "<absolute path>", "filename": "<basename>" }
  { "ok": false, "error": "<message>" }
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile

# Make package-relative imports work when invoked as `py -m quickquote_cli.cli`
# AND when invoked directly. Adding the parent folder lets `from
# quickquote_cli.foo import x` resolve in either case.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from quickquote_cli.docx_gen import generate_proposal  # type: ignore
from quickquote_cli.paths import template_path_for      # type: ignore


def _emit_error(msg: str) -> int:
    print(json.dumps({'ok': False, 'error': msg}))
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description='QuickQuote proposal generator')
    parser.add_argument('--input-file', help='JSON payload path. If omitted, read from stdin.')
    args = parser.parse_args()

    raw = (open(args.input_file, 'r', encoding='utf-8').read()
           if args.input_file else sys.stdin.read())
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        return _emit_error(f'Invalid JSON input: {e}')

    fmt = (payload.get('format') or 'docx').lower()
    rate_table = payload.get('rate_table') or 'consulting'
    out_dir = payload.get('output_dir')
    out_name = payload.get('output_filename')

    if not out_dir:
        return _emit_error('output_dir is required')
    os.makedirs(out_dir, exist_ok=True)

    template = template_path_for(rate_table)
    if not os.path.exists(template):
        return _emit_error(f'Template file not found: {template}')

    values = payload.get('values') or {}
    section1_fee = payload.get('section1_fee', '')
    section1_bt = payload.get('section1_billing_type', 'fixed')
    section1_nte = bool(payload.get('section1_nte', False))
    extras_raw = payload.get('extra_sections') or []
    extras = [tuple(e) for e in extras_raw]

    try:
        if fmt == 'docx':
            out_path = generate_proposal(
                values, out_dir, template_path=template,
                section1_fee=str(section1_fee),
                section1_billing_type=section1_bt,
                section1_nte=section1_nte,
                extra_sections=extras,
                output_filename=out_name,
            )
        elif fmt == 'pdf':
            from quickquote_cli.pdf_gen import convert_docx_to_pdf  # type: ignore
            tmp_dir = tempfile.mkdtemp(prefix='quickquote_pdf_')
            try:
                tmp_docx = generate_proposal(
                    values, tmp_dir, template_path=template,
                    section1_fee=str(section1_fee),
                    section1_billing_type=section1_bt,
                    section1_nte=section1_nte,
                    extra_sections=extras,
                )
                if out_name:
                    target = os.path.join(out_dir, out_name)
                else:
                    target = os.path.join(out_dir, 'proposal.pdf')
                if os.path.exists(target):
                    try:
                        os.remove(target)
                    except OSError:
                        # Word might have it open — fall back to a unique name.
                        from quickquote_cli.filename import unique_path
                        stem, ext = os.path.splitext(os.path.basename(target))
                        target = unique_path(out_dir, stem, ext.lstrip('.'))
                out_path = convert_docx_to_pdf(tmp_docx, target)
            finally:
                shutil.rmtree(tmp_dir, ignore_errors=True)
        else:
            return _emit_error(f'Unknown format: {fmt}')
    except Exception as e:  # noqa: BLE001 — surface anything to caller
        return _emit_error(f'{type(e).__name__}: {e}')

    print(json.dumps({
        'ok': True,
        'path': out_path,
        'filename': os.path.basename(out_path),
    }))
    return 0


if __name__ == '__main__':
    sys.exit(main())
