"""Path + placeholder constants for the QuickQuote DOCX/PDF generator.

Resolves the bundled Templates/ directory in two modes:
  * dev — running from the repo, Templates/ sits at <repo>/Templates/
  * packaged — electron-builder bundles Templates/ under
    process.resourcesPath; the Electron side spawns the CLI with cwd set
    to the parent of quickquote_cli/, so the same relative lookup wins.

Mirror of QuickProp's quickprop/paths.py, trimmed: no migration code, no
identity dirs, no per-user data paths — those don't apply to the CLI.
"""
from __future__ import annotations

import os


def _templates_dir() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        # Dev (repo root): <repo>/quickquote_cli/ -> <repo>/Templates/
        os.path.join(os.path.dirname(here), 'Templates'),
        # Packaged: spawned with cwd = parent of quickquote_cli/, so the
        # repo-root layout above also covers process.resourcesPath/Templates/.
    ]
    for c in candidates:
        if os.path.isdir(c):
            return c
    return candidates[0]


TEMPLATES_DIR = _templates_dir()
TEMPLATE_CONSULTING = os.path.join(TEMPLATES_DIR, 'template.docx')
TEMPLATE_STRUCTURAL = os.path.join(TEMPLATES_DIR, 'template_structural_rates.docx')


def template_path_for(rate_table: str) -> str:
    """Pick consulting vs structural template based on the rate hint.

    Mirrors how QuickProp/quickprop/api.py picks the template based on
    proposal.rateTable. Anything that smells "structural" wins the
    structural template; everything else falls back to consulting.
    """
    hint = (rate_table or '').lower()
    if 'struct' in hint:
        return TEMPLATE_STRUCTURAL
    return TEMPLATE_CONSULTING


# Placeholder tokens used by the Word templates. Mirrors QuickProp's
# quickprop/paths.py PLACEHOLDERS dict — keep in sync with the .docx
# template files.
PLACEHOLDERS = {
    'date':                   '{{DATE}}',
    'project_name':           '{{PROJECT_NAME}}',
    'project_address':        '{{PROJECT_ADDRESS}}',
    'project_city_state_zip': '{{PROJECT_CITY_STATE_ZIP}}',
    'client_name':            '{{CLIENT_NAME}}',
    'client_contact':         '{{CLIENT_CONTACT}}',
    'client_address':         '{{CLIENT_ADDRESS}}',
    'client_city':            '{{CLIENT_CITY_STATE_ZIP}}',
    'scope_title':            '{{SCOPE_TITLE}}',
    'scope_of_work':          '{{SCOPE_OF_WORK}}',
    'fee':                    '{{FEE}}',
    'signer_name':            '{{SIGNER_NAME}}',
    'signer_title':           '{{SIGNER_TITLE}}',
}
