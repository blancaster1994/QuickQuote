// In-app confirmation dialog. Replaces window.confirm() in places where the
// surrounding UI is part of QuickQuote — native confirm dialogs feel out of
// place in an Electron shell and can't be styled.

import type { ReactNode } from 'react';
import { Modal, ModalActions } from '../StatusComponents';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: ReactNode;
  /** Defaults to "Confirm". */
  confirmLabel?: string;
  /** Tone for the confirm button. Defaults to 'primary'. */
  confirmKind?: 'primary' | 'loss';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  confirmKind = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <Modal title={title} onClose={onCancel}>
      {body != null && (
        <div style={{ fontSize: 13, color: 'var(--body)', lineHeight: 1.5 }}>
          {body}
        </div>
      )}
      <ModalActions
        onCancel={onCancel}
        onConfirm={onConfirm}
        confirmLabel={confirmLabel}
        confirmKind={confirmKind}
      />
    </Modal>
  );
}
