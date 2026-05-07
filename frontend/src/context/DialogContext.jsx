/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const resolverRef = useRef(null);
  const [dialog, setDialog] = useState(null);
  const [inputValue, setInputValue] = useState('');

  const closeDialog = useCallback((result) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    setInputValue('');
    resolver?.(result);
  }, []);

  const openDialog = useCallback((options) => {
    return new Promise(resolve => {
      resolverRef.current?.(null);
      resolverRef.current = resolve;
      setInputValue(options.defaultValue ?? '');
      setDialog(options);
    });
  }, []);

  const confirm = useCallback((options) => openDialog({
    type: 'confirm',
    icon: 'bi-exclamation-triangle',
    confirmLabel: '확인',
    cancelLabel: '취소',
    confirmVariant: 'danger',
    ...options,
  }), [openDialog]);

  const prompt = useCallback((options) => openDialog({
    type: 'prompt',
    icon: 'bi-pencil-square',
    confirmLabel: '확인',
    cancelLabel: '취소',
    confirmVariant: 'danger',
    ...options,
  }), [openDialog]);

  const alert = useCallback((options) => openDialog({
    type: 'alert',
    icon: 'bi-info-circle',
    confirmLabel: '확인',
    confirmVariant: 'info',
    hideCancel: true,
    ...options,
  }), [openDialog]);

  const handleConfirm = useCallback(() => {
    if (!dialog) return;
    closeDialog(dialog.type === 'prompt' ? inputValue : true);
  }, [closeDialog, dialog, inputValue]);

  const handleCancel = useCallback(() => {
    if (!dialog) return;
    closeDialog(dialog.type === 'confirm' ? false : null);
  }, [closeDialog, dialog]);

  const value = useMemo(() => ({ alert, confirm, prompt }), [alert, confirm, prompt]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      <ConfirmDialog
        show={Boolean(dialog)}
        title={dialog?.title}
        message={dialog?.message}
        detail={dialog?.detail}
        icon={dialog?.icon}
        confirmLabel={dialog?.confirmLabel}
        cancelLabel={dialog?.cancelLabel}
        confirmVariant={dialog?.confirmVariant}
        hideCancel={dialog?.hideCancel}
        requiredText={dialog?.requiredText}
        inputLabel={dialog?.inputLabel}
        inputValue={inputValue}
        inputPlaceholder={dialog?.inputPlaceholder}
        onInputChange={setInputValue}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog는 DialogProvider 안에서만 사용할 수 있습니다.');
  }
  return context;
}
