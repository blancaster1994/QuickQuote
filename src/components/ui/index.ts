// Unified UI component layer. New screens should pull from here so the app
// stays visually consistent. Existing screens are being migrated incrementally.

export { Button, IconButton } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize, IconButtonProps } from './Button';
export { ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogProps } from './ConfirmDialog';
// Modal/ModalActions still live in StatusComponents for now; re-export so
// callers can do `import { Modal } from '../ui'` and not care about the
// historical location.
export { Modal, ModalActions } from '../StatusComponents';
